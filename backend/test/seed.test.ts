import { StrKey } from '@stellar/stellar-sdk';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { sembrar } from '../src/seed/sembrar.ts';
import { crearContexto, multipart, PNG_MINIMO, type Contexto } from './helpers/contexto.ts';
import { validarRespuesta, type RespuestaHttp } from './helpers/openapi.ts';

interface ObraR {
  id: number;
  nombre: string;
  municipio: string;
  contratista: string;
  inspector: string;
  veedor: string;
  arbitro: string;
  token: string;
  monto_vigente: string;
  fondeado: string;
  pagado: string;
  saldo: string;
  periodo_objecion_seg: number;
  estado: string;
  cantidad_hitos: number;
  hitos_pagados: number;
}
interface HitoR {
  indice: number;
  estado: string;
  monto_vigente: string;
  evidencia_hash: string | null;
  momento_declaracion: string | null;
  fin_periodo_objecion: string | null;
  aprobo_inspector: boolean;
  aprobo_veedor: boolean;
  veedor_por_arbitro: boolean;
  objecion_usada: boolean;
  motivo_objecion_hash: string | null;
  pagable: boolean;
}
interface EventoR {
  id: string;
  tipo: string;
  hito: number | null;
  momento: string;
  datos: Record<string, unknown>;
}

const AHORA = new Date('2026-10-16T12:00:00Z');
const E7 = 10_000_000n;

describe('datos simulados (seed)', () => {
  let ctx: Contexto;
  const get = (url: string) => ctx.app.inject({ method: 'GET', url }) as Promise<RespuestaHttp>;
  const obras: ObraR[] = [];
  const hitos = new Map<number, HitoR[]>();
  const eventos = new Map<number, EventoR[]>();
  let evidenciaPrevia = '';

  async function leerTodo() {
    obras.length = 0;
    hitos.clear();
    eventos.clear();
    obras.push(...(validarRespuesta('GET', '/obras', 200, await get('/obras')) as ObraR[]));
    for (const o of obras) {
      validarRespuesta('GET', '/obras/{id}', 200, await get(`/obras/${o.id}`));
      hitos.set(o.id, validarRespuesta('GET', '/obras/{id}/hitos', 200, await get(`/obras/${o.id}/hitos`)) as HitoR[]);
      eventos.set(o.id, validarRespuesta('GET', '/obras/{id}/eventos', 200, await get(`/obras/${o.id}/eventos`)) as EventoR[]);
      validarRespuesta('GET', '/obras/{id}/alertas', 200, await get(`/obras/${o.id}/alertas`));
    }
  }
  const hitosDe = (id: number) => hitos.get(id)!;
  const eventosDe = (id: number) => eventos.get(id)!;
  const obraDe = (id: number) => obras.find((o) => o.id === id)!;
  const totalEventos = () => [...eventos.values()].reduce((n, l) => n + l.length, 0);

  before(async () => {
    ctx = await crearContexto(() => AHORA.getTime());
    const sub = multipart('archivo', 'previa.png', 'image/png', PNG_MINIMO);
    const res = (await ctx.app.inject({ method: 'POST', url: '/evidencia', payload: sub.payload, headers: sub.headers })) as RespuestaHttp;
    evidenciaPrevia = (validarRespuesta('POST', '/evidencia', 201, res) as { sha256: string }).sha256;
    await sembrar(ctx.db, { dirEvidencia: ctx.dirEvidencia, ahora: AHORA });
    await leerTodo();
  });
  after(() => ctx.cerrar());

  it('hay 5 obras y 38 eventos; todas las respuestas cumplen el esquema', () => {
    assert.deepEqual(obras.map((o) => o.id), [1, 2, 3, 4, 5]);
    assert.equal(totalEventos(), 38);
  });

  it('obra 1: fondeo parcial, [Pagado, Objetado, Pendiente, Pendiente]', () => {
    const o = obraDe(1);
    assert.equal(o.nombre, 'Pavimentación calle Los Aromos');
    assert.equal(o.monto_vigente, String(40_000n * E7));
    assert.equal(o.fondeado, String(25_000n * E7));
    assert.equal(o.pagado, String(10_000n * E7));
    assert.equal(o.saldo, String(15_000n * E7));
    assert.ok(0n < BigInt(o.fondeado) && BigInt(o.fondeado) < BigInt(o.monto_vigente));
    assert.equal(o.periodo_objecion_seg, 60);
    assert.equal(o.estado, 'Activa');
    assert.equal(o.cantidad_hitos, 4);
    assert.equal(o.hitos_pagados, 1);
    const h = hitosDe(1);
    assert.deepEqual(h.map((x) => x.estado), ['Pagado', 'Objetado', 'Pendiente', 'Pendiente']);
    assert.deepEqual(h.map((x) => x.monto_vigente), [10_000n, 15_000n, 10_000n, 5_000n].map((n) => String(n * E7)));
    assert.equal(h[1]!.aprobo_inspector, true);
    assert.equal(h[1]!.aprobo_veedor, false);
    assert.equal(h[1]!.objecion_usada, true);
    assert.ok(h[1]!.motivo_objecion_hash);
    assert.deepEqual(eventosDe(1).map((e) => e.tipo), [
      'ObraCreada', 'ObraFondeada', 'HitoDeclarado', 'HitoAprobado', 'HitoAprobado',
      'PagoLiberado', 'ObraFondeada', 'HitoDeclarado', 'HitoAprobado', 'HitoObjetado',
    ]);
  });

  it('obra 2: sin fondos, hito 0 en Evidencia con una sola aprobación y período vigente', () => {
    const o = obraDe(2);
    assert.equal(o.nombre, 'Red de agua potable barrio Esperanza');
    assert.equal(o.fondeado, '0');
    assert.equal(o.cantidad_hitos, 3);
    assert.equal(o.periodo_objecion_seg, 72 * 3600);
    const h = hitosDe(2);
    assert.deepEqual(h.map((x) => x.estado), ['Evidencia', 'Pendiente', 'Pendiente']);
    assert.equal(h[0]!.aprobo_inspector, true);
    assert.equal(h[0]!.aprobo_veedor, false);
    assert.equal(Date.parse(h[0]!.momento_declaracion!), AHORA.getTime() - 3600_000);
    assert.ok(Date.parse(h[0]!.fin_periodo_objecion!) > AHORA.getTime());
    assert.ok(h.every((x) => !x.pagable));
  });

  it('obra 3: arbitraje y pagable true', () => {
    const o = obraDe(3);
    assert.equal(o.nombre, 'Refacción Escuela Primaria N° 512');
    const h = hitosDe(3);
    assert.deepEqual(h.map((x) => x.estado), ['Pagado', 'Aprobado']);
    assert.equal(h[1]!.veedor_por_arbitro, true);
    assert.equal(h[1]!.objecion_usada, true);
    assert.equal(h[1]!.pagable, true);
    assert.equal(o.saldo, String(6_000n * E7));
    assert.equal(o.saldo, h[1]!.monto_vigente);
    const ev = eventosDe(3);
    const resueltas = ev.filter((e) => e.tipo === 'ObjecionResuelta');
    assert.equal(resueltas.length, 2);
    assert.ok(resueltas.some((e) => e.datos.decision === 'Aceptar' && e.datos.estado === 'Pendiente'));
    assert.ok(resueltas.some((e) => e.datos.decision === 'Rechazar' && e.datos.estado === 'Aprobado'));
    const decl0 = ev.filter((e) => e.tipo === 'HitoDeclarado' && e.hito === 0).map((e) => e.datos.evidencia_hash);
    assert.equal(decl0.length, 2);
    assert.notEqual(decl0[0], decl0[1]);
  });

  it('obra 4: Finalizada, saldo 0, 2 hitos pagados', () => {
    const o = obraDe(4);
    assert.equal(o.nombre, 'Iluminación LED Plaza 25 de Mayo');
    assert.equal(o.estado, 'Finalizada');
    assert.equal(o.saldo, '0');
    assert.equal(o.hitos_pagados, 2);
    assert.deepEqual(hitosDe(4).map((x) => x.estado), ['Pagado', 'Pagado']);
  });

  it('obra 5: fondeada por el total, 4 hitos Pendiente, lista para declarar', () => {
    const o = obraDe(5);
    assert.equal(o.nombre, 'Demo: obra fondeada');
    assert.equal(o.cantidad_hitos, 4);
    assert.equal(o.fondeado, o.monto_vigente);
    assert.equal(o.fondeado, String(20_000n * E7));
    assert.equal(o.pagado, '0');
    assert.equal(o.saldo, o.monto_vigente);
    assert.equal(o.estado, 'Activa');
    const h = hitosDe(5);
    assert.deepEqual(h.map((x) => x.estado), ['Pendiente', 'Pendiente', 'Pendiente', 'Pendiente']);
    assert.ok(h.every((x) => x.evidencia_hash === null && !x.aprobo_inspector && !x.aprobo_veedor && !x.pagable));
    assert.deepEqual(eventosDe(5).map((e) => e.tipo), ['ObraCreada', 'ObraFondeada']);
  });

  it('direcciones strkey válidas, roles distintos, arbitro == municipio', () => {
    for (const o of obras) {
      for (const k of ['municipio', 'contratista', 'inspector', 'veedor', 'arbitro'] as const) {
        assert.ok(StrKey.isValidEd25519PublicKey(o[k]), `obra ${o.id} ${k}`);
      }
      assert.ok(StrKey.isValidContract(o.token), `obra ${o.id} token`);
      assert.equal(o.arbitro, o.municipio);
      assert.equal(new Set([o.municipio, o.contratista, o.inspector, o.veedor]).size, 4, `obra ${o.id} roles`);
    }
  });

  it('cada evidencia_hash y motivo_objecion_hash se descarga y su SHA-256 coincide', async () => {
    const hashes = new Set<string>();
    for (const id of [1, 2, 3, 4, 5]) {
      for (const h of hitosDe(id)) {
        if (h.evidencia_hash) hashes.add(h.evidencia_hash);
        if (h.motivo_objecion_hash) hashes.add(h.motivo_objecion_hash);
      }
    }
    assert.ok(hashes.size >= 6);
    for (const hash of hashes) {
      const res = await get(`/evidencia/${hash}`);
      validarRespuesta('GET', '/evidencia/{sha256}', 200, res);
      assert.equal(createHash('sha256').update(res.rawPayload).digest('hex'), hash);
    }
  });

  it('eventos: ids únicos y ordenados, ?desde= en la obra 1, coherencia con la obra', async () => {
    const todos = new Set<string>();
    for (const o of obras) {
      const ev = eventosDe(o.id);
      const ids = ev.map((e) => e.id);
      assert.deepEqual(ids, [...ids].sort());
      for (const id of ids) {
        assert.ok(!todos.has(id), `id repetido ${id}`);
        todos.add(id);
      }
      const ult = (tipo: string) => ev.filter((e) => e.tipo === tipo).at(-1);
      assert.equal(ult('ObraFondeada')?.datos.fondeado, o.fondeado === '0' ? undefined : o.fondeado, `obra ${o.id} fondeado`);
      const pago = ult('PagoLiberado');
      if (pago) assert.equal(pago.datos.pagado, o.pagado, `obra ${o.id} pagado`);
      else assert.equal(o.pagado, '0');
      for (const h of hitosDe(o.id)) {
        const d = ev.filter((e) => e.tipo === 'HitoDeclarado' && e.hito === h.indice).at(-1);
        assert.equal(d?.datos.evidencia_hash ?? null, h.evidencia_hash, `obra ${o.id} hito ${h.indice}`);
      }
    }
    const ev1 = eventosDe(1);
    const desde = validarRespuesta('GET', '/obras/{id}/eventos', 200, await get(`/obras/1/eventos?desde=${ev1[3]!.id}`)) as EventoR[];
    assert.deepEqual(desde.map((e) => e.id), ev1.slice(4).map((e) => e.id));
    const ultimo = validarRespuesta('GET', '/obras/{id}/eventos', 200, await get(`/obras/1/eventos?desde=${ev1.at(-1)!.id}`));
    assert.deepEqual(ultimo, []);
    assert.ok(ev1.every((e) => Date.parse(e.momento) < AHORA.getTime()));
  });

  it('sembrar dos veces deja el mismo resultado y conserva la evidencia subida antes', async () => {
    const antes = JSON.stringify([obras, [...hitos], [...eventos]]);
    await sembrar(ctx.db, { dirEvidencia: ctx.dirEvidencia, ahora: AHORA });
    await leerTodo();
    assert.equal(totalEventos(), 38);
    assert.equal(JSON.stringify([obras, [...hitos], [...eventos]]), antes);
    const res = await get(`/evidencia/${evidenciaPrevia}`);
    validarRespuesta('GET', '/evidencia/{sha256}', 200, res);
    assert.deepEqual(res.rawPayload, PNG_MINIMO);
    const fila = ctx.db.prepare('SELECT COUNT(*) AS n FROM evidencias WHERE sha256 = ?').get(evidenciaPrevia) as { n: number };
    assert.equal(fila.n, 1);
  });
});
