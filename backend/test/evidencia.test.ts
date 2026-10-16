import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { crearContexto, multipart, multipartSoloTexto, PDF_MINIMO, PNG_MINIMO, type Contexto } from './helpers/contexto.ts';
import { validarRespuesta, type RespuestaHttp } from './helpers/openapi.ts';

const SHA_PNG = '497790947d4666760ce38f3c00e852c71fdb66cae849bae8e9ede352719e1581';
const SHA_PDF = '5a838678058f6de375e8635b5f2fea47a4e5f07cb1a882a44b10f39abc6f34ff';
const MAX = 10 * 1024 * 1024;

interface EvidenciaResp {
  sha256: string;
  nombre_original: string;
  tamano_bytes: number;
  tipo_mime: string;
  url: string;
}
interface ErrorResp {
  error: { codigo: string; mensaje: string };
}

/** PNG de `tamano` bytes exactos: firma real + relleno. */
const pngDeTamano = (tamano: number) =>
  Buffer.concat([PNG_MINIMO.subarray(0, 8), Buffer.alloc(tamano - 8, 0x41)]);

describe('evidencia', () => {
  let ctx: Contexto;
  const subir = (m: { payload: Buffer; headers: Record<string, string> }) =>
    ctx.app.inject({ method: 'POST', url: '/evidencia', payload: m.payload, headers: m.headers }) as Promise<RespuestaHttp>;
  const subirArchivo = (nombre: string, mime: string, contenido: Buffer) =>
    subir(multipart('archivo', nombre, mime, contenido));
  const error = (status: number, res: RespuestaHttp) => (validarRespuesta('POST', '/evidencia', status, res) as ErrorResp).error;

  before(async () => {
    ctx = await crearContexto();
  });
  after(() => ctx.cerrar());

  it('los hashes hardcodeados coinciden con node:crypto', () => {
    assert.equal(createHash('sha256').update(PNG_MINIMO).digest('hex'), SHA_PNG);
    assert.equal(createHash('sha256').update(PDF_MINIMO).digest('hex'), SHA_PDF);
  });

  it('subida idempotente: dos POST dan 201, mismo sha256, url, archivo en disco y descarga idéntica', async () => {
    for (let i = 0; i < 2; i++) {
      const res = await subirArchivo('foto.png', 'image/png', PNG_MINIMO);
      const ev = validarRespuesta('POST', '/evidencia', 201, res) as EvidenciaResp;
      assert.equal(ev.sha256, SHA_PNG);
      assert.equal(ev.url, `/evidencia/${SHA_PNG}`);
      assert.equal(ev.tipo_mime, 'image/png');
      assert.equal(ev.tamano_bytes, PNG_MINIMO.length);
      assert.equal(ev.nombre_original, 'foto.png');
    }
    assert.deepEqual(await readFile(join(ctx.dirEvidencia, SHA_PNG)), PNG_MINIMO);
    assert.deepEqual((await readdir(ctx.dirEvidencia)).filter((f) => f.includes(SHA_PNG)), [SHA_PNG]);

    const res = (await ctx.app.inject({ method: 'GET', url: `/evidencia/${SHA_PNG}` })) as RespuestaHttp;
    validarRespuesta('GET', '/evidencia/{sha256}', 200, res);
    assert.equal(res.headers['content-type'], 'application/octet-stream');
    assert.deepEqual(res.rawPayload, PNG_MINIMO);
  });

  it('un PDF se acepta como application/pdf y se descarga igual', async () => {
    const ev = validarRespuesta('POST', '/evidencia', 201, await subirArchivo('plano.pdf', 'application/pdf', PDF_MINIMO)) as EvidenciaResp;
    assert.equal(ev.sha256, SHA_PDF);
    assert.equal(ev.tipo_mime, 'application/pdf');
    const res = (await ctx.app.inject({ method: 'GET', url: `/evidencia/${SHA_PDF}` })) as RespuestaHttp;
    validarRespuesta('GET', '/evidencia/{sha256}', 200, res);
    assert.deepEqual(res.rawPayload, PDF_MINIMO);
  });

  it('un JPEG (firma FF D8 FF) se acepta', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]);
    const ev = validarRespuesta('POST', '/evidencia', 201, await subirArchivo('f.jpg', 'image/jpeg', jpeg)) as EvidenciaResp;
    assert.equal(ev.tipo_mime, 'image/jpeg');
  });

  describe('tipo por firma de bytes', () => {
    it('texto → 415 TipoNoPermitido', async () => {
      const e = error(415, await subirArchivo('nota.txt', 'text/plain', Buffer.from('hola mundo')));
      assert.equal(e.codigo, 'TipoNoPermitido');
    });

    it('PNG enviado como x.txt / text/plain se acepta con tipo_mime image/png', async () => {
      const ev = validarRespuesta('POST', '/evidencia', 201, await subirArchivo('x.txt', 'text/plain', PNG_MINIMO)) as EvidenciaResp;
      assert.equal(ev.tipo_mime, 'image/png');
    });

    it('texto enviado como x.png / image/png se rechaza', async () => {
      const e = error(415, await subirArchivo('x.png', 'image/png', Buffer.from('no soy un png')));
      assert.equal(e.codigo, 'TipoNoPermitido');
    });

    it('firma PNG truncada se rechaza', async () => {
      error(415, await subirArchivo('x.png', 'image/png', PNG_MINIMO.subarray(0, 7)));
    });
  });

  describe('tamaño', () => {
    it('exactamente 10 MiB → 201', async () => {
      const grande = pngDeTamano(MAX);
      assert.equal(grande.length, 10_485_760);
      const ev = validarRespuesta('POST', '/evidencia', 201, await subirArchivo('g.png', 'image/png', grande)) as EvidenciaResp;
      assert.equal(ev.tamano_bytes, MAX);
      assert.equal(ev.sha256, createHash('sha256').update(grande).digest('hex'));
    });

    it('10 MiB + 1 → 413 ArchivoMuyGrande y no queda archivo', async () => {
      const grande = pngDeTamano(MAX + 1);
      const e = error(413, await subirArchivo('g.png', 'image/png', grande));
      assert.equal(e.codigo, 'ArchivoMuyGrande');
      const sha = createHash('sha256').update(grande).digest('hex');
      assert.ok(!(await readdir(ctx.dirEvidencia)).includes(sha));
    });
  });

  describe('otros rechazos', () => {
    it('multipart sin el campo archivo → 400 ArchivoFaltante', async () => {
      assert.equal(error(400, await subir(multipartSoloTexto('otro', 'x'))).codigo, 'ArchivoFaltante');
    });

    it('archivo en un campo con otro nombre → 400 ArchivoFaltante', async () => {
      const res = await subir(multipart('file', 'a.png', 'image/png', PNG_MINIMO));
      assert.equal(error(400, res).codigo, 'ArchivoFaltante');
    });

    it('archivo vacío → 400', async () => {
      error(400, await subirArchivo('v.png', 'image/png', Buffer.alloc(0)));
    });

    it('solicitud no multipart (JSON) → 415', async () => {
      const res = (await ctx.app.inject({
        method: 'POST',
        url: '/evidencia',
        payload: { archivo: 'x' },
      })) as RespuestaHttp;
      error(415, res);
    });

    it('solicitud sin cuerpo ni content-type → 415', async () => {
      error(415, (await ctx.app.inject({ method: 'POST', url: '/evidencia' })) as RespuestaHttp);
    });
  });

  describe('GET /evidencia/{sha256}', () => {
    for (const hash of ['f'.repeat(64), 'zz', 'A'.repeat(10), '../../etc/passwd'.replaceAll('/', '%2F')]) {
      it(`404 para ${hash}`, async () => {
        const res = (await ctx.app.inject({ method: 'GET', url: `/evidencia/${hash}` })) as RespuestaHttp;
        validarRespuesta('GET', '/evidencia/{sha256}', 404, res);
      });
    }
  });
});
