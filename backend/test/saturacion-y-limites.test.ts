import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { nativeToScVal, xdr, type rpc } from '@stellar/stellar-sdk';
import { crearApp } from '../src/app.ts';
import { abrirDb } from '../src/db/conexion.ts';
import { acotarSegundos, aIso, MOMENTO_MAXIMO } from '../src/dominio/api.ts';
import { guardarEstadoIndexador, guardarHito, guardarObra, leerEstadoIndexador } from '../src/db/repositorio.ts';
import { decodificarHitos, decodificarObra, traducirEvento } from '../src/indexador/decodificar.ts';
import { CLAVES_ESTADO, crearIndexador, crearRelojLedger, MARGEN_RELOJ_MS } from '../src/indexador/index.ts';
import { crearContexto, hito, HASH, multipart, obra, PNG_MINIMO, type Contexto, type Multipart } from './helpers/contexto.ts';
import { validarRespuesta, type RespuestaHttp } from './helpers/openapi.ts';
import { CONTRATO_ID, LEDGER_INICIAL, PAGINAS_2, clienteFalso, eventosReales, registroFalso, retval } from './helpers/testnet.ts';

const U64_MAX = 2n ** 64n - 1n;
const FIN_ISO = '9999-12-31T23:59:59Z';
const u64 = (v: bigint) => nativeToScVal(v, { type: 'u64' });
const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const u32 = (n: number) => nativeToScVal(n, { type: 'u32' });
const mapa = (o: Record<string, xdr.ScVal>) =>
  xdr.ScVal.scvMap(Object.entries(o).map(([k, v]) => new xdr.ScMapEntry({ key: sym(k), val: v })));
const eventoA = (topics: xdr.ScVal[], value: xdr.ScVal): rpc.Api.EventResponse => ({
  ...eventosReales()[0]!,
  topic: topics,
  value,
});

/** Copia un ScVal mapa cambiando el valor de algunas claves. */
function conCampos(v: xdr.ScVal, cambios: Record<string, xdr.ScVal>): xdr.ScVal {
  assert.equal(v.type, 'scvMap');
  const entradas = (v.type === 'scvMap' ? (v.map ?? []) : []).map((e) => {
    const k = e.key.type === 'scvSymbol' ? e.key.sym.toString() : '';
    return new xdr.ScMapEntry({ key: e.key, val: k in cambios ? cambios[k]! : e.val });
  });
  return xdr.ScVal.scvMap(entradas);
}

const configIndexador = { contratoId: CONTRATO_ID, ledgerInicial: LEDGER_INICIAL, intervaloMs: 5, tamanoPagina: 2 };

describe('B1 · saturación de momentos', () => {
  it('acotarSegundos y aIso en los bordes', () => {
    assert.equal(MOMENTO_MAXIMO, 253402300799);
    assert.equal(acotarSegundos(0), 0);
    assert.equal(acotarSegundos(MOMENTO_MAXIMO), MOMENTO_MAXIMO);
    assert.equal(acotarSegundos(MOMENTO_MAXIMO + 1), MOMENTO_MAXIMO);
    assert.equal(acotarSegundos(-1), 0);
    assert.equal(acotarSegundos(-1e20), 0);
    assert.equal(acotarSegundos(Number.NaN), 0);
    assert.equal(acotarSegundos(Number.MAX_VALUE), MOMENTO_MAXIMO);
    assert.equal(acotarSegundos(Infinity), MOMENTO_MAXIMO);
    assert.equal(aIso(0), '1970-01-01T00:00:00Z');
    assert.equal(aIso(MOMENTO_MAXIMO), FIN_ISO);
    assert.equal(aIso(MOMENTO_MAXIMO + 1), FIN_ISO);
    assert.equal(aIso(-5), '1970-01-01T00:00:00Z');
    assert.equal(aIso(Number.NaN), '1970-01-01T00:00:00Z');
  });

  describe('a través de la API', () => {
    let ctx: Contexto;
    const get = (url: string) => ctx.app.inject({ method: 'GET', url }) as Promise<RespuestaHttp>;
    beforeEach(async () => {
      ctx = await crearContexto();
    });
    afterEach(() => ctx.cerrar());

    it('periodo_objecion 1e13 con hito Aprobado: 200 válidos, fin saturado, pagable false', async () => {
      guardarObra(ctx.db, obra({ id: 1, periodo_objecion: 1e13, fondeado: 1000n }));
      guardarHito(
        ctx.db,
        1,
        hito({ estado: 'Aprobado', evidencia_hash: HASH('1'), momento_declaracion: 1_700_000_000, aprobo_inspector: true, aprobo_veedor: true }),
      );
      const lista = validarRespuesta('GET', '/obras', 200, await get('/obras')) as unknown[];
      assert.equal(lista.length, 1);
      const o = validarRespuesta('GET', '/obras/{id}', 200, await get('/obras/1')) as { periodo_objecion_seg: number };
      assert.equal(o.periodo_objecion_seg, MOMENTO_MAXIMO);
      const hs = validarRespuesta('GET', '/obras/{id}/hitos', 200, await get('/obras/1/hitos')) as {
        fin_periodo_objecion: string;
        pagable: boolean;
      }[];
      assert.equal(hs[0]!.fin_periodo_objecion, FIN_ISO);
      assert.equal(hs[0]!.pagable, false);
    });

    it('periodo 2**53 y Number.MAX_VALUE: GET /obras 200 con periodo acotado', async () => {
      guardarObra(ctx.db, obra({ id: 1, periodo_objecion: 2 ** 53 }));
      guardarObra(ctx.db, obra({ id: 2, periodo_objecion: Number.MAX_VALUE }));
      const lista = validarRespuesta('GET', '/obras', 200, await get('/obras')) as { periodo_objecion_seg: number }[];
      assert.equal(lista.length, 2);
      for (const o of lista) assert.equal(o.periodo_objecion_seg, MOMENTO_MAXIMO);
    });

    it('momentos del hito enormes también se acotan', async () => {
      guardarObra(ctx.db, obra({ id: 1 }));
      guardarHito(ctx.db, 1, hito({ momento_declaracion: 1e300, momento_aprobacion_completa: 2 ** 60, momento_pago: Number.MAX_VALUE }));
      const hs = validarRespuesta('GET', '/obras/{id}/hitos', 200, await get('/obras/1/hitos')) as Record<string, unknown>[];
      assert.equal(hs[0]!.momento_declaracion, FIN_ISO);
      assert.equal(hs[0]!.momento_aprobacion_completa, FIN_ISO);
      assert.equal(hs[0]!.momento_pago, FIN_ISO);
    });

    it('una obra extrema junto a normales: el listado sigue entero', async () => {
      guardarObra(ctx.db, obra({ id: 1 }));
      guardarObra(ctx.db, obra({ id: 2, periodo_objecion: Number.MAX_VALUE, creada_en: 2 ** 60 }));
      guardarObra(ctx.db, obra({ id: 3 }));
      const lista = validarRespuesta('GET', '/obras', 200, await get('/obras')) as { id: number; periodo_objecion_seg: number }[];
      assert.deepEqual(lista.map((o) => o.id).sort(), [1, 2, 3]);
      assert.equal(lista.find((o) => o.id === 1)!.periodo_objecion_seg, 3600);
      assert.equal(lista.find((o) => o.id === 2)!.periodo_objecion_seg, MOMENTO_MAXIMO);
    });
  });

  describe('indexador', () => {
    it('decodificarObra con periodo_objecion u64::MAX → acotado', () => {
      const v = conCampos(retval('simulate-ver_obra-1.json'), { periodo_objecion: u64(U64_MAX), creada_en: u64(U64_MAX) });
      const { obra: o } = decodificarObra(v);
      assert.equal(o.periodo_objecion, 253402300799);
      assert.equal(o.creada_en, 253402300799);
    });

    it('decodificarHitos con momentos enormes → acotados', () => {
      const orig = retval('simulate-ver_hitos-1.json');
      assert.equal(orig.type, 'scvVec');
      const elementos = orig.type === 'scvVec' ? (orig.vec ?? []) : [];
      const nuevo = xdr.ScVal.scvVec(
        elementos.map((e) =>
          conCampos(e, {
            momento_declaracion: u64(U64_MAX),
            momento_aprobacion_completa: u64(2n ** 63n),
            momento_pago: u64(U64_MAX),
          }),
        ),
      );
      const hs = decodificarHitos(nuevo);
      assert.ok(hs.length > 0);
      for (const h of hs) {
        assert.equal(h.momento_declaracion, 253402300799);
        assert.equal(h.momento_aprobacion_completa, 253402300799);
        assert.equal(h.momento_pago, 253402300799);
      }
    });

    it('traducirEvento: HitoDeclarado con fin_periodo u64::MAX y ObraCreada con periodo u64::MAX', () => {
      const d = traducirEvento(eventoA([sym('declarado'), u32(1), u32(0)], mapa({ fin_periodo: u64(U64_MAX) })));
      assert.ok(d.ok);
      assert.equal(d.evento.tipo, 'HitoDeclarado');
      assert.equal(d.evento.datos.fin_periodo, FIN_ISO);
      const c = traducirEvento(eventoA([sym('creada'), u32(1)], mapa({ periodo_objecion: u64(U64_MAX) })));
      assert.ok(c.ok);
      assert.equal(c.evento.tipo, 'ObraCreada');
      assert.equal(c.evento.datos.periodo_objecion, 253402300799);
    });

    it('pasada completa con ver_obra de periodo u64::MAX: termina, obra acotada, GET /obras 200', async () => {
      const ctx = await crearContexto();
      try {
        const cliente = clienteFalso();
        const leerOriginal = cliente.leer.bind(cliente);
        cliente.leer = async (funcion, args) => {
          const l = await leerOriginal(funcion, args);
          return funcion === 'ver_obra' ? { ...l, valor: conCampos(l.valor, { periodo_objecion: u64(U64_MAX) }) } : l;
        };
        const registro = registroFalso();
        const r = await crearIndexador(ctx.db, configIndexador, { cliente, registro }).sincronizar();
        assert.equal(r.alDia, true);
        assert.deepEqual(r.obrasActualizadas, [1]);
        assert.equal(registro.de('error').length, 0);
        const fila = ctx.db.prepare('SELECT periodo_objecion FROM obras WHERE id = 1').get() as { periodo_objecion: number };
        assert.equal(fila.periodo_objecion, 253402300799);
        const res = (await ctx.app.inject({ method: 'GET', url: '/obras' })) as RespuestaHttp;
        const lista = validarRespuesta('GET', '/obras', 200, res) as { periodo_objecion_seg: number }[];
        assert.equal(lista.length, 1);
        assert.equal(lista[0]!.periodo_objecion_seg, 253402300799);
      } finally {
        await ctx.cerrar();
      }
    });
  });
});

describe('B2 · reloj del ledger', () => {
  let ctx: Contexto;
  beforeEach(async () => {
    ctx = await crearContexto();
  });
  afterEach(() => ctx.cerrar());

  const CIERRE = Number(PAGINAS_2.at(-1)!.respuesta.latestLedgerCloseTime);
  const sincronizar = (cliente = clienteFalso()) =>
    crearIndexador(ctx.db, configIndexador, { cliente, registro: registroFalso() }).sincronizar();

  it('tras sincronizar() queda ultimo_ledger_cierre y el reloj devuelve ese valor × 1000', async () => {
    await sincronizar();
    assert.equal(leerEstadoIndexador(ctx.db, CLAVES_ESTADO.ultimoCierre), String(CIERRE));
    assert.equal(crearRelojLedger(ctx.db, () => 123)(), CIERRE * 1000);
  });

  it('sin el dato devuelve el reloj de la máquina − MARGEN_RELOJ_MS', () => {
    assert.equal(MARGEN_RELOJ_MS, 10_000);
    assert.equal(crearRelojLedger(ctx.db, () => 5_000_000)(), 4_990_000);
    guardarEstadoIndexador(ctx.db, CLAVES_ESTADO.ultimoCierre, '0');
    assert.equal(crearRelojLedger(ctx.db, () => 5_000_000)(), 4_990_000);
    guardarEstadoIndexador(ctx.db, CLAVES_ESTADO.ultimoCierre, 'basura');
    assert.equal(crearRelojLedger(ctx.db, () => 5_000_000)(), 4_990_000);
  });

  it('no retrocede si la página trae un ultimoCierre menor, y avanza si es mayor', async () => {
    await sincronizar(); // la primera pasada inicializa la base (prepararBase borra el estado previo)
    guardarEstadoIndexador(ctx.db, CLAVES_ESTADO.ultimoCierre, String(CIERRE + 1000));
    await sincronizar();
    assert.equal(leerEstadoIndexador(ctx.db, CLAVES_ESTADO.ultimoCierre), String(CIERRE + 1000));
    const cliente = clienteFalso();
    const eventosOriginal = cliente.eventos.bind(cliente);
    cliente.eventos = async (p, l) => ({ ...(await eventosOriginal(p, l)), ultimoCierre: CIERRE + 5000 });
    await sincronizar(cliente);
    assert.equal(leerEstadoIndexador(ctx.db, CLAVES_ESTADO.ultimoCierre), String(CIERRE + 5000));
  });

  describe('de punta a punta con pagable', () => {
    const D = 1_700_000_000;
    const F = D + 3600;
    let maquinaMs: number;
    let app: Awaited<ReturnType<typeof crearApp>>;
    let db: ReturnType<typeof abrirDb>;

    beforeEach(async () => {
      maquinaMs = (F + 10) * 1000;
      db = abrirDb(':memory:');
      app = await crearApp({ db, dirEvidencia: ctx.dirEvidencia + '-b2', ahora: crearRelojLedger(db, () => maquinaMs) });
      guardarObra(db, obra({ id: 1, periodo_objecion: 3600, fondeado: 1000n }));
      guardarHito(
        db,
        1,
        hito({ estado: 'Aprobado', evidencia_hash: HASH('1'), momento_declaracion: D, aprobo_inspector: true, aprobo_veedor: true }),
      );
    });
    afterEach(async () => {
      await app.close();
      db.close();
    });

    const pagable = async () => {
      const res = (await app.inject({ method: 'GET', url: '/obras/1/hitos' })) as RespuestaHttp;
      return (validarRespuesta('GET', '/obras/{id}/hitos', 200, res) as { pagable: boolean }[])[0]!.pagable;
    };

    it('cierre = F−1 con la máquina en F+10 → false; cierre = F → true', async () => {
      guardarEstadoIndexador(db, CLAVES_ESTADO.ultimoCierre, String(F - 1));
      assert.equal(await pagable(), false);
      guardarEstadoIndexador(db, CLAVES_ESTADO.ultimoCierre, String(F));
      assert.equal(await pagable(), true);
    });

    it('sin cierre conocido usa la máquina menos el margen', async () => {
      assert.equal(await pagable(), true); // F+10−10 = F
      maquinaMs = (F + 9) * 1000; // → F−1
      assert.equal(await pagable(), false);
    });
  });
});

describe('B4/B5 y multipart', () => {
  let ctx: Contexto;
  beforeEach(async () => {
    ctx = await crearContexto();
  });
  afterEach(() => ctx.cerrar());

  const subir = (m: Multipart) =>
    ctx.app.inject({ method: 'POST', url: '/evidencia', payload: m.payload, headers: m.headers }) as Promise<RespuestaHttp>;
  const error = (status: number, res: RespuestaHttp) =>
    (validarRespuesta('POST', '/evidencia', status, res) as { error: { codigo: string; mensaje: string } }).error;

  const LIM = '----opvlim';
  const cabeceras = { 'content-type': `multipart/form-data; boundary=${LIM}` };
  const parteArchivo = (campo: string) =>
    `--${LIM}\r\nContent-Disposition: form-data; name="${campo}"; filename="a.png"\r\nContent-Type: image/png\r\n\r\nxx\r\n`;
  const parteTexto = (campo: string) => `--${LIM}\r\nContent-Disposition: form-data; name="${campo}"\r\n\r\nv\r\n`;
  const armar = (partes: string[]): Multipart => ({
    payload: Buffer.from(partes.join('') + `--${LIM}--\r\n`),
    headers: cabeceras,
  });

  it('B4: GET /evidencia/{sha256} trae X-Content-Type-Options: nosniff', async () => {
    const ev = validarRespuesta('POST', '/evidencia', 201, await subir(multipart('archivo', 'f.png', 'image/png', PNG_MINIMO))) as { url: string };
    const res = (await ctx.app.inject({ method: 'GET', url: ev.url })) as RespuestaHttp;
    validarRespuesta('GET', '/evidencia/{sha256}', 200, res);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });

  it('B5: 6 partes de archivo → 413 SolicitudMuyGrande en castellano', async () => {
    const e = error(413, await subir(armar(Array.from({ length: 6 }, () => parteArchivo('archivo')))));
    assert.equal(e.codigo, 'SolicitudMuyGrande');
    assert.match(e.mensaje, /archivo/);
    assert.doesNotMatch(e.mensaje, /Reached|limit/i);
  });

  it('B5: más de 20 campos de texto → 413 en castellano', async () => {
    const e = error(413, await subir(armar(Array.from({ length: 25 }, (_, i) => parteTexto('c' + i)))));
    assert.equal(e.codigo, 'SolicitudMuyGrande');
    assert.match(e.mensaje, /campos/);
    assert.doesNotMatch(e.mensaje, /Reached|limit/i);
  });

  it('B5: campo __proto__ → 400 "Nombre de campo no permitido"', async () => {
    const e = error(400, await subir(armar([parteTexto('__proto__')])));
    assert.equal(e.codigo, 'SolicitudInvalida');
    assert.match(e.mensaje, /Nombre de campo no permitido/);
  });

  it('Content-Length > 2 × 10 MiB con basura → 413 ArchivoMuyGrande; el mismo cuerpo de 1 KiB → 400', async () => {
    const grande = await subir({ payload: Buffer.alloc(2 * 10 * 1024 * 1024 + 1, 0x41), headers: cabeceras });
    assert.equal(error(413, grande).codigo, 'ArchivoMuyGrande');
    const chico = await subir({ payload: Buffer.alloc(1024, 0x41), headers: cabeceras });
    assert.equal(error(400, chico).codigo, 'SolicitudInvalida');
  });

  it('multipart mal formado: basura → 400 SolicitudInvalida (no 500)', async () => {
    const res = await subir({ payload: Buffer.from('esto no es multipart\r\nni cerca'), headers: cabeceras });
    assert.equal(error(400, res).codigo, 'SolicitudInvalida');
  });

  it('multipart cortado a mitad de una parte → 400', async () => {
    const completo = multipart('archivo', 'f.png', 'image/png', PNG_MINIMO);
    const cortado = completo.payload.subarray(0, completo.payload.length - 40);
    const res = await subir({ payload: cortado, headers: completo.headers });
    assert.equal(error(400, res).codigo, 'SolicitudInvalida');
  });
});
