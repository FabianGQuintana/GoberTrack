import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { parseEnv } from 'node:util';
import { leerConfig } from '../src/config.ts';
import { crearClienteRpc } from '../src/indexador/cliente.ts';
import { crearIndexador } from '../src/indexador/index.ts';
import { crearContexto, type Contexto } from './helpers/contexto.ts';
import { validarRespuesta, type RespuestaHttp } from './helpers/openapi.ts';
import { IDS_EVENTOS, espera, registroFalso } from './helpers/testnet.ts';

// Prueba EN VIVO contra el contrato desplegado en testnet. Solo corre con OPV_PRUEBA_TESTNET=1.
const vivo = process.env.OPV_PRUEBA_TESTNET === '1';

/** El RPC público está balanceado entre nodos con ventanas distintas: se reintenta un par de veces. */
async function conReintentos<T>(fn: () => Promise<T>, intentos = 4): Promise<T> {
  let ultimo: unknown;
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (err) {
      ultimo = err;
      await espera(1500 * (i + 1));
    }
  }
  throw ultimo;
}

describe('indexador contra testnet (en vivo)', { skip: vivo ? false : 'definí OPV_PRUEBA_TESTNET=1 para correr la prueba en vivo contra testnet' }, () => {
  let ctx: Contexto;
  const get = (url: string) => ctx.app.inject({ method: 'GET', url }) as Promise<RespuestaHttp>;

  before(async () => {
    const env = parseEnv(readFileSync(new URL('../testnet.env', import.meta.url), 'utf8'));
    const t = leerConfig(env).testnet!;
    ctx = await crearContexto();
    const cliente = crearClienteRpc({ rpcUrl: t.rpcUrl, contratoId: t.contratoId, redPassphrase: t.redPassphrase });
    const registro = registroFalso();
    const indexador = crearIndexador(
      ctx.db,
      { contratoId: t.contratoId, ledgerInicial: t.ledgerInicial, intervaloMs: t.intervaloMs },
      { cliente, registro },
    );
    await conReintentos(async () => {
      const r = await indexador.sincronizar();
      assert.equal(r.alDia, true);
    });
    assert.deepEqual(registro.de('error'), []);
  });
  after(() => ctx?.cerrar());

  it('GET /obras/1 cumple el esquema y refleja la corrida de humo', async () => {
    const obra = validarRespuesta('GET', '/obras/{id}', 200, await get('/obras/1')) as Record<string, unknown>;
    assert.equal(obra.id, 1);
    assert.equal(obra.cantidad_hitos, 4);
    assert.equal(BigInt(obra.fondeado as string) >= 400000000000n, true);
    assert.ok(Number(obra.hitos_pagados) >= 1);
  });

  it('GET /obras/1/hitos cumple el esquema y el hito 0 está Pagado', async () => {
    const hitos = validarRespuesta('GET', '/obras/{id}/hitos', 200, await get('/obras/1/hitos')) as {
      indice: number;
      estado: string;
      evidencia_hash: string;
    }[];
    assert.equal(hitos.length, 4);
    assert.equal(hitos[0]!.indice, 0);
    assert.equal(hitos[0]!.estado, 'Pagado');
    assert.equal(hitos[0]!.evidencia_hash, '5071abaf0534578c02f6cfee9396fb3e90ca2879c6259944d95367309772078a');
  });

  it('GET /obras/1/eventos contiene los 6 eventos de la corrida de humo (puede haber más)', async () => {
    const eventos = validarRespuesta('GET', '/obras/{id}/eventos', 200, await get('/obras/1/eventos')) as {
      id: string;
    }[];
    const ids = eventos.map((e) => e.id);
    for (const id of IDS_EVENTOS) assert.ok(ids.includes(id), `falta el evento ${id}`);
    assert.deepEqual(ids, [...ids].sort(), 'en orden ascendente');
  });

  it('GET /obras cumple el esquema', async () => {
    const lista = validarRespuesta('GET', '/obras', 200, await get('/obras')) as { id: number }[];
    assert.ok(lista.some((o) => o.id === 1));
  });
});
