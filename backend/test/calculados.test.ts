import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { guardarHito, guardarObra } from '../src/db/repositorio.ts';
import type { EstadoHito } from '../src/dominio/tipos.ts';
import { crearContexto, hito, HASH, obra, type Contexto } from './helpers/contexto.ts';
import { validarRespuesta, type RespuestaHttp } from './helpers/openapi.ts';

interface ObraResp {
  saldo: string;
  fondeado: string;
  pagado: string;
  estado: string;
  hitos_pagados: number;
  cantidad_hitos: number;
}
interface HitoResp {
  indice: number;
  fin_periodo_objecion: string | null;
  momento_declaracion: string | null;
  pagable: boolean;
}

describe('campos calculados', () => {
  let ctx: Contexto;
  let ahoraMs = Date.UTC(2026, 9, 16);
  const get = (url: string) => ctx.app.inject({ method: 'GET', url }) as Promise<RespuestaHttp>;
  const obraApi = async (id: number) => validarRespuesta('GET', '/obras/{id}', 200, await get(`/obras/${id}`)) as ObraResp;
  const hitosApi = async (id: number) =>
    validarRespuesta('GET', '/obras/{id}/hitos', 200, await get(`/obras/${id}/hitos`)) as HitoResp[];

  before(async () => {
    ctx = await crearContexto(() => ahoraMs);
  });
  after(() => ctx.cerrar());

  const declarado = (indice: number, estado: EstadoHito, momento: number, monto = 500n) =>
    hito({ indice, estado, monto_original: monto, monto_vigente: monto, evidencia_hash: HASH('1'), momento_declaracion: momento });

  it('saldo = fondeado − pagado, con montos mayores a 2^53 como string exacto', async () => {
    const fondeado = 90_071_992_547_409_930_000n; // > 2^53
    const pagado = 12_345_678_901_234_567_891n;
    guardarObra(ctx.db, obra({ id: 10, fondeado, pagado, monto_original: fondeado, monto_vigente: fondeado }));
    guardarHito(ctx.db, 10, hito());
    const o = await obraApi(10);
    assert.equal(o.fondeado, fondeado.toString());
    assert.equal(o.pagado, pagado.toString());
    assert.equal(o.saldo, (fondeado - pagado).toString());
    assert.equal(o.saldo, '77726313646175362109');
  });

  it('hitos_pagados cuenta los Pagado y estado es Activa si falta alguno', async () => {
    guardarObra(ctx.db, obra({ id: 11, cantidad_hitos: 3 }));
    guardarHito(ctx.db, 11, hito({ indice: 0, estado: 'Pagado' }));
    guardarHito(ctx.db, 11, hito({ indice: 1, estado: 'Aprobado' }));
    guardarHito(ctx.db, 11, hito({ indice: 2, estado: 'Pagado' }));
    const o = await obraApi(11);
    assert.equal(o.hitos_pagados, 2);
    assert.equal(o.estado, 'Activa');
  });

  it('estado Finalizada solo cuando todos los hitos están Pagado', async () => {
    guardarObra(ctx.db, obra({ id: 12, cantidad_hitos: 2 }));
    guardarHito(ctx.db, 12, hito({ indice: 0, estado: 'Pagado' }));
    assert.equal((await obraApi(12)).estado, 'Activa'); // el segundo hito aún no está cargado
    guardarHito(ctx.db, 12, hito({ indice: 1, estado: 'Pagado' }));
    const o = await obraApi(12);
    assert.equal(o.hitos_pagados, 2);
    assert.equal(o.estado, 'Finalizada');
  });

  it('fin_periodo_objecion = momento_declaracion + periodo_objecion_seg; null sin declaración', async () => {
    guardarObra(ctx.db, obra({ id: 13, periodo_objecion: 172_800, cantidad_hitos: 2 }));
    guardarHito(ctx.db, 13, declarado(0, 'Evidencia', 1_700_000_000));
    guardarHito(ctx.db, 13, hito({ indice: 1 }));
    const [h0, h1] = await hitosApi(13);
    assert.equal(h0!.momento_declaracion, '2023-11-14T22:13:20Z');
    assert.equal(h0!.fin_periodo_objecion, '2023-11-16T22:13:20Z');
    assert.equal(h1!.fin_periodo_objecion, null);
    assert.equal(h1!.pagable, false);
  });

  describe('pagable', () => {
    const T = 1_700_000_000;
    const PERIODO = 3600;
    const FIN = T + PERIODO;

    before(() => {
      guardarObra(ctx.db, obra({ id: 20, periodo_objecion: PERIODO, fondeado: 1000n, cantidad_hitos: 5 }));
      guardarHito(ctx.db, 20, declarado(0, 'Aprobado', T, 500n));
      guardarHito(ctx.db, 20, declarado(1, 'Aprobado', T, 1000n)); // saldo == monto
      guardarHito(ctx.db, 20, declarado(2, 'Aprobado', T, 1001n)); // saldo < monto
      guardarHito(ctx.db, 20, declarado(3, 'Objetado', T, 500n));
      guardarHito(ctx.db, 20, declarado(4, 'Pagado', T, 500n));
    });

    const pagables = async (ms: number) => {
      ahoraMs = ms;
      return (await hitosApi(20)).map((h) => h.pagable);
    };

    it('Aprobado con ahora < fin → false', async () => {
      assert.deepEqual(await pagables(FIN * 1000 - 1000), [false, false, false, false, false]);
      assert.deepEqual(await pagables(FIN * 1000 - 1), [false, false, false, false, false]);
    });

    it('ahora == fin → true (ventana semiabierta); saldo < monto o estado distinto → false', async () => {
      assert.deepEqual(await pagables(FIN * 1000), [true, true, false, false, false]);
    });

    it('ahora > fin se mantiene igual', async () => {
      assert.deepEqual(await pagables((FIN + 86_400) * 1000), [true, true, false, false, false]);
    });

    it('el saldo descuenta lo ya pagado', async () => {
      guardarObra(ctx.db, obra({ id: 21, periodo_objecion: PERIODO, fondeado: 1000n, pagado: 600n }));
      guardarHito(ctx.db, 21, declarado(0, 'Aprobado', T, 400n)); // saldo 400 == monto
      guardarHito(ctx.db, 21, declarado(1, 'Aprobado', T, 401n));
      ahoraMs = (FIN + 1) * 1000;
      assert.deepEqual((await hitosApi(21)).map((h) => h.pagable), [true, false]);
    });
  });
});
