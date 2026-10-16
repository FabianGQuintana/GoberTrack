import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { guardarEvento, guardarHito, guardarObra } from '../src/db/repositorio.ts';
import { crearContexto, evento, hito, idEvento, obra, type Contexto } from './helpers/contexto.ts';
import { validarRespuesta, type RespuestaHttp } from './helpers/openapi.ts';

describe('API de obras: errores y eventos', () => {
  let ctx: Contexto;
  const get = (url: string) => ctx.app.inject({ method: 'GET', url }) as Promise<RespuestaHttp>;

  before(async () => {
    ctx = await crearContexto();
    guardarObra(ctx.db, obra({ id: 1 }));
    guardarObra(ctx.db, obra({ id: 2 }));
    guardarHito(ctx.db, 1, hito());
    // Se insertan desordenados a propósito: la API debe ordenar por id.
    guardarEvento(ctx.db, evento({ id: idEvento(4294971392n), tipo: 'HitoDeclarado', hito: 0, datos: { x: '1' } }));
    guardarEvento(ctx.db, evento({ id: idEvento(4294967296n), tipo: 'ObraCreada' }));
    guardarEvento(ctx.db, evento({ id: idEvento(4294971392n, 1), tipo: 'HitoAprobado', hito: 0 }));
    guardarEvento(ctx.db, evento({ id: idEvento(4294975488n), tipo: 'ObraFondeada', datos: { monto: '9007199254740993' } }));
    guardarEvento(ctx.db, evento({ id: idEvento(4294967297n), obra_id: 2, tipo: 'ObraCreada' }));
  });
  after(() => ctx.cerrar());

  const rutas = [
    ['/obras/{id}', (id: string) => `/obras/${id}`],
    ['/obras/{id}/hitos', (id: string) => `/obras/${id}/hitos`],
    ['/obras/{id}/eventos', (id: string) => `/obras/${id}/eventos`],
    ['/obras/{id}/alertas', (id: string) => `/obras/${id}/alertas`],
  ] as const;

  for (const [plantilla, url] of rutas) {
    for (const id of ['999', 'abc', '0', '-1', '1.5', '4294967296', '99999999999999999999']) {
      it(`404 ObraNoExiste en ${plantilla} con id ${id}`, async () => {
        const res = await get(url(id));
        const cuerpo = validarRespuesta('GET', plantilla, 404, res) as { error: { codigo: string } };
        assert.equal(cuerpo.error.codigo, 'ObraNoExiste');
      });
    }
  }

  it('GET /obras y GET /obras/{id} cumplen el esquema', async () => {
    const lista = validarRespuesta('GET', '/obras', 200, await get('/obras')) as { id: number }[];
    assert.deepEqual(lista.map((o) => o.id), [1, 2]);
    validarRespuesta('GET', '/obras/{id}', 200, await get('/obras/1'));
    validarRespuesta('GET', '/obras/{id}/hitos', 200, await get('/obras/1/hitos'));
  });

  it('/alertas devuelve []', async () => {
    const cuerpo = validarRespuesta('GET', '/obras/{id}/alertas', 200, await get('/obras/1/alertas'));
    assert.deepEqual(cuerpo, []);
  });

  describe('?desde=', () => {
    const ruta = '/obras/{id}/eventos';
    const ids = async (url: string) =>
      (validarRespuesta('GET', ruta, 200, await get(url)) as { id: string }[]).map((e) => e.id);
    const todos = [idEvento(4294967296n), idEvento(4294971392n), idEvento(4294971392n, 1), idEvento(4294975488n)];

    it('sin parámetro devuelve todos los de la obra en orden ascendente, sin mezclar obras', async () => {
      assert.deepEqual(await ids('/obras/1/eventos'), todos);
      assert.deepEqual(await ids('/obras/2/eventos'), [idEvento(4294967297n)]);
    });

    it('con desde=<id> devuelve solo los de id mayor', async () => {
      assert.deepEqual(await ids(`/obras/1/eventos?desde=${todos[0]}`), todos.slice(1));
      assert.deepEqual(await ids(`/obras/1/eventos?desde=${todos[1]}`), todos.slice(2));
      assert.deepEqual(await ids(`/obras/1/eventos?desde=${todos[2]}`), todos.slice(3));
    });

    it('con el último id devuelve []', async () => {
      assert.deepEqual(await ids(`/obras/1/eventos?desde=${todos[3]}`), []);
    });

    it('un desde que es id de otra obra no filtra eventos propios mayores y no los mezcla', async () => {
      assert.deepEqual(await ids(`/obras/1/eventos?desde=${idEvento(4294967297n)}`), todos.slice(1));
      assert.deepEqual(await ids(`/obras/2/eventos?desde=${idEvento(4294967296n)}`), [idEvento(4294967297n)]);
    });

    it('los eventos mantienen tipo, hito y datos', async () => {
      const lista = validarRespuesta('GET', ruta, 200, await get('/obras/1/eventos')) as {
        tipo: string;
        hito: number | null;
        datos: Record<string, unknown>;
        momento: string;
      }[];
      assert.deepEqual(lista.map((e) => e.tipo), ['ObraCreada', 'HitoDeclarado', 'HitoAprobado', 'ObraFondeada']);
      assert.equal(lista[1]!.hito, 0);
      assert.deepEqual(lista[3]!.datos, { monto: '9007199254740993' });
      assert.equal(lista[0]!.momento, '2023-11-14T22:13:20Z');
    });
  });

  it('CORS: preflight OPTIONS /obras desde http://localhost:3000 está permitido', async () => {
    const res = await ctx.app.inject({
      method: 'OPTIONS',
      url: '/obras',
      headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'GET' },
    });
    assert.ok(res.statusCode >= 200 && res.statusCode < 300, `status ${res.statusCode}`);
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:3000');
    assert.match(String(res.headers['access-control-allow-methods']), /GET/);
  });

  it('CORS: una respuesta GET lleva el origen permitido y uno ajeno no', async () => {
    const ok = await ctx.app.inject({ method: 'GET', url: '/obras', headers: { origin: 'http://localhost:3000' } });
    assert.equal(ok.headers['access-control-allow-origin'], 'http://localhost:3000');
    const ajeno = await ctx.app.inject({ method: 'GET', url: '/obras', headers: { origin: 'http://malo.example' } });
    assert.equal(ajeno.headers['access-control-allow-origin'], undefined);
  });
});
