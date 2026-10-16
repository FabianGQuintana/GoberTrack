import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nativeToScVal, rpc, xdr } from '@stellar/stellar-sdk';
import {
  ErrorFormato,
  decodificarCantidadObras,
  decodificarHitos,
  decodificarObra,
  ledgerDeCursor,
  traducirEvento,
} from '../src/indexador/decodificar.ts';
import { PAGINAS_2, eventosReales, retval, simulacion } from './helpers/testnet.ts';

const MUNICIPIO = 'GCTYV7VGW23P4R3MF5YXHCIM6JWK3COGOYUBCKUZMDG7OVP6JT5SSNQ3';
const CONTRATISTA = 'GCDMFX7PNUVK3ISYSZ37SO4EIM2NJKBYSD6KGMDR6YKIABUMDH77VSNE';
const INSPECTOR = 'GDWCJEK5PDWPBKGOMJDXALNASP4LFLAKYO7EPRTD6LEAIFLYPL7HSHGV';
const VEEDOR = 'GDHICN4U7AZZTCLMJMGDPS6CCQD2HRSQ6AMMMCYVLK2NY5CPCOTHC7KI';
const TOKEN = 'CAKGWGZQI6XOF6XAP2BB2DM6DQP525ETKYDT5UHSYBF2XRA6JUITA2QK';

function traducido(i: number) {
  const r = traducirEvento(eventosReales()[i]!);
  assert.ok(r.ok, r.ok ? '' : r.motivo);
  return r.evento;
}

/** Evento sintético con topics/datos propios, copiando el resto de un evento real. */
function eventoA(topics: xdr.ScVal[], value: xdr.ScVal): rpc.Api.EventResponse {
  return { ...eventosReales()[0]!, topic: topics, value };
}
const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const u32 = (n: number) => nativeToScVal(n, { type: 'u32' });
type Entrada = xdr.ScMapEntry;
function entradasObra(): Entrada[] {
  const v = retval('simulate-ver_obra-1.json');
  assert.equal(v.type, 'scvMap');
  return v.type === 'scvMap' ? (v.map ?? []) : [];
}
const nombreClave = (e: Entrada) => (e.key.type === 'scvSymbol' ? e.key.sym.toString() : '');
const mapa = (o: Record<string, xdr.ScVal>) =>
  xdr.ScVal.scvMap(Object.entries(o).map(([k, v]) => new xdr.ScMapEntry({ key: sym(k), val: v })));

describe('traducirEvento con eventos reales de testnet', () => {
  it('los 6 eventos de la corrida de humo, en orden, con tipo/obra/hito/ledger', () => {
    const esperado = [
      ['ObraCreada', null, 5220088],
      ['ObraFondeada', null, 5220089],
      ['HitoDeclarado', 0, 5220090],
      ['HitoAprobado', 0, 5220094],
      ['HitoAprobado', 0, 5220096],
      ['PagoLiberado', 0, 5220112],
    ] as const;
    assert.equal(eventosReales().length, 6);
    esperado.forEach(([tipo, hito, ledger], i) => {
      const e = traducido(i);
      assert.equal(e.tipo, tipo);
      assert.equal(e.obra_id, 1);
      assert.equal(e.hito, hito);
      assert.equal(e.ledger, ledger);
      assert.equal(e.id, eventosReales()[i]!.id);
      assert.equal(e.tx_hash, eventosReales()[i]!.txHash);
      assert.match(e.tx_hash, /^[0-9a-f]{64}$/);
      assert.equal(e.momento, Math.floor(Date.parse(eventosReales()[i]!.ledgerClosedAt) / 1000));
    });
  });

  it('momento y tx_hash exactos', () => {
    assert.equal(traducido(0).momento, 1792124027);
    assert.equal(traducido(5).momento, 1792124147);
    assert.equal(traducido(0).tx_hash, 'c6b4920877292c4e19dc87745d2c75bb0dd74c0322a3d72cb87fd7e079cda982');
  });

  it('formato de datos: i128 string, hashes hex, strkey, periodo_objecion número', () => {
    assert.deepEqual(traducido(0).datos, {
      arbitro: MUNICIPIO,
      cantidad_hitos: 4,
      contratista: CONTRATISTA,
      inspector: INSPECTOR,
      monto_original: '400000000000',
      municipio: MUNICIPIO,
      nombre: 'Pavimentación calle Los Aromos',
      periodo_objecion: 60,
      token: TOKEN,
      veedor: VEEDOR,
    });
    assert.equal(typeof traducido(0).datos.periodo_objecion, 'number');
    assert.deepEqual(traducido(1).datos, { fondeado: '400000000000', monto: '400000000000' });
    assert.deepEqual(traducido(5).datos, { contratista: CONTRATISTA, monto: '100000000000', pagado: '100000000000' });
  });

  it('HitoDeclarado: evidencia_hash hex y fin_periodo en ISO (1792124097)', () => {
    const d = traducido(2).datos;
    assert.equal(d.evidencia_hash, '5071abaf0534578c02f6cfee9396fb3e90ca2879c6259944d95367309772078a');
    assert.equal(d.fin_periodo, '2026-10-16T04:14:57Z');
    assert.equal(Date.parse(d.fin_periodo as string) / 1000, 1792124097);
  });

  it('HitoAprobado: completo es booleano y firmante strkey', () => {
    assert.deepEqual(traducido(3).datos, { completo: false, firmante: INSPECTOR });
    assert.deepEqual(traducido(4).datos, { completo: true, firmante: VEEDOR });
  });

  it('los ids son los del RPC tal cual', () => {
    assert.deepEqual(
      [0, 1, 2, 3, 4, 5].map((i) => traducido(i).id),
      PAGINAS_2.flatMap((p) => p.respuesta.events.map((e: { id: string }) => e.id)),
    );
  });
});

describe('traducirEvento: casos negativos y bordes', () => {
  const datos = mapa({ monto: nativeToScVal(5n, { type: 'i128' }) });

  it('nombre desconocido → ok:false', () => {
    const r = traducirEvento(eventoA([sym('inventado'), u32(1)], datos));
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.motivo, /desconocido/);
  });

  it('nombres heredados de Object.prototype no se traducen', () => {
    assert.equal(traducirEvento(eventoA([sym('constructor'), u32(1)], datos)).ok, false);
    assert.equal(traducirEvento(eventoA([sym('toString'), u32(1)], datos)).ok, false);
  });

  it('inSuccessfulContractCall false → ok:false', () => {
    assert.equal(traducirEvento({ ...eventosReales()[0]!, inSuccessfulContractCall: false }).ok, false);
  });

  it('topic de obra inválido (0, ausente, no u32) → ok:false', () => {
    assert.equal(traducirEvento(eventoA([sym('fondeada'), u32(0)], datos)).ok, false);
    assert.equal(traducirEvento(eventoA([sym('fondeada')], datos)).ok, false);
    assert.equal(traducirEvento(eventoA([sym('fondeada'), sym('x')], datos)).ok, false);
  });

  it('topic de hito no numérico → ok:false', () => {
    assert.equal(traducirEvento(eventoA([sym('declarado'), u32(1), sym('x')], datos)).ok, false);
  });

  it('datos que no son un mapa → ok:false', () => {
    assert.equal(traducirEvento(eventoA([sym('fondeada'), u32(1)], u32(7))).ok, false);
  });

  it('enum en datos (Vec[Symbol]) → string con el nombre de la variante', () => {
    const v = xdr.ScVal.scvVec([sym('Aceptar')]);
    const r = traducirEvento(eventoA([sym('resuelta'), u32(1), u32(0)], mapa({ resolucion: v })));
    assert.ok(r.ok);
    assert.equal(r.evento.tipo, 'ObjecionResuelta');
    assert.deepEqual(r.evento.datos, { resolucion: 'Aceptar' });
  });

  // Un formato no previsto en los datos no lanza: el evento queda como no legible (ok:false) para
  // que el indexador lo saltee con un aviso en vez de trabarse.
  const noLegible = (r: ReturnType<typeof traducirEvento>, patron: RegExp) => {
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.motivo, patron);
  };

  it('Vec que no es una variante de enum → ok:false', () => {
    const v = xdr.ScVal.scvVec([sym('A'), sym('B')]);
    noLegible(traducirEvento(eventoA([sym('resuelta'), u32(1), u32(0)], mapa({ x: v }))), /variante de enum/);
  });

  it('tipo de dato no previsto (void) → ok:false', () => {
    noLegible(traducirEvento(eventoA([sym('fondeada'), u32(1)], mapa({ x: xdr.ScVal.scvVoid() }))), /no previsto/);
  });

  it('clave de datos que no es Symbol → ok:false', () => {
    const m = xdr.ScVal.scvMap([new xdr.ScMapEntry({ key: u32(1), val: u32(2) })]);
    noLegible(traducirEvento(eventoA([sym('fondeada'), u32(1)], m)), /no Symbol/);
  });

  it('ledgerClosedAt inválido → ok:false', () => {
    noLegible(traducirEvento({ ...eventosReales()[0]!, ledgerClosedAt: 'ayer' }), /ledgerClosedAt/);
  });

  it('u64 que no entra en un número seguro → se acota a 9999-12-31T23:59:59Z (B1)', () => {
    const grande = nativeToScVal(2n ** 60n, { type: 'u64' });
    const r = traducirEvento(eventoA([sym('fondeada'), u32(1)], mapa({ periodo_objecion: grande })));
    assert.ok(r.ok);
    assert.deepEqual(r.evento.datos, { periodo_objecion: 253_402_300_799 });
  });
});

describe('ledgerDeCursor', () => {
  it('con los cursores reales de get-events-limite-2.json', () => {
    const cursores = PAGINAS_2.map((p) => p.respuesta.cursor as string);
    assert.deepEqual(cursores.map(ledgerDeCursor), [5220089, 5220094, 5220112, 5226834]);
  });

  it('el cursor sintético termina en -4294967295 y da el ledger siguiente al último consultado', () => {
    const sintetico = PAGINAS_2.at(-1)!.respuesta.cursor as string;
    assert.match(sintetico, /-4294967295$/);
    assert.equal(ledgerDeCursor(sintetico), 5226834);
  });

  it('ids de eventos reales y formatos inválidos', () => {
    assert.equal(ledgerDeCursor('0022420107242266624-0000000000'), 5220088);
    assert.equal(ledgerDeCursor('basura'), undefined);
    assert.equal(ledgerDeCursor('123'), undefined);
    assert.equal(ledgerDeCursor(''), undefined);
  });
});

describe('decodificar lecturas del contrato (respuestas grabadas)', () => {
  it('cantidad_obras = 1', () => {
    assert.equal(decodificarCantidadObras(retval('simulate-cantidad_obras.json')), 1);
  });

  it('ver_obra(1): valores exactos', () => {
    const { obra, estado } = decodificarObra(retval('simulate-ver_obra-1.json'));
    assert.equal(estado, 'Activa');
    assert.deepEqual(obra, {
      id: 1,
      nombre: 'Pavimentación calle Los Aromos',
      municipio: MUNICIPIO,
      contratista: CONTRATISTA,
      inspector: INSPECTOR,
      veedor: VEEDOR,
      arbitro: MUNICIPIO,
      token: TOKEN,
      monto_original: 400000000000n,
      monto_vigente: 400000000000n,
      fondeado: 400000000000n,
      pagado: 100000000000n,
      periodo_objecion: 60,
      cantidad_hitos: 4,
      creada_en: 1792124027,
    });
    assert.equal(typeof obra.fondeado, 'bigint');
  });

  it('ver_hitos(1): [Pagado, Pendiente×3], Option vacío → null, hash hex, momentos en segundos', () => {
    const hitos = decodificarHitos(retval('simulate-ver_hitos-1.json'));
    assert.deepEqual(hitos.map((h) => h.estado), ['Pagado', 'Pendiente', 'Pendiente', 'Pendiente']);
    assert.deepEqual(hitos.map((h) => h.indice), [0, 1, 2, 3]);
    assert.deepEqual(hitos.map((h) => h.monto_vigente), [100000000000n, 150000000000n, 100000000000n, 50000000000n]);
    assert.deepEqual(hitos.map((h) => h.descripcion), [
      'Movimiento de suelo',
      'Base y sub-base',
      'Carpeta asfáltica',
      'Señalización y cordones',
    ]);
    const [h0, h1] = hitos;
    assert.equal(h0!.evidencia_hash, '5071abaf0534578c02f6cfee9396fb3e90ca2879c6259944d95367309772078a');
    assert.equal(h0!.momento_declaracion, 1792124037);
    assert.equal(h0!.momento_aprobacion_completa, 1792124067);
    assert.equal(h0!.momento_pago, 1792124147);
    assert.equal(h0!.aprobo_inspector, true);
    assert.equal(h0!.aprobo_veedor, true);
    assert.equal(h0!.veedor_por_arbitro, false);
    assert.equal(h0!.motivo_objecion_hash, null);
    assert.equal(h1!.evidencia_hash, null);
    assert.equal(h1!.momento_declaracion, null);
    assert.equal(h1!.momento_aprobacion_completa, null);
    assert.equal(h1!.momento_pago, null);
    assert.equal(h1!.aprobo_inspector, false);
  });

  it('la simulación de ver_obra(99) es un error del contrato (#1), no un retval', () => {
    const s = simulacion('simulate-ver_obra-99.json');
    assert.ok(rpc.Api.isSimulationError(s));
    assert.match(s.error, /Error\(Contract, #1\)/);
  });

  it('formato roto → ErrorFormato', () => {
    const u = nativeToScVal(7, { type: 'u32' });
    assert.throws(() => decodificarObra(u), ErrorFormato);
    assert.throws(() => decodificarHitos(u), ErrorFormato);
    assert.throws(() => decodificarCantidadObras(retval('simulate-ver_obra-1.json')), ErrorFormato);
    assert.throws(() => decodificarCantidadObras(nativeToScVal(7n, { type: 'u64' })), ErrorFormato);
  });

  it('mapa de obra al que le falta un campo, o con un tipo equivocado → ErrorFormato', () => {
    const entradas = entradasObra();
    const sin = xdr.ScVal.scvMap(entradas.filter((e) => nombreClave(e) !== 'pagado'));
    assert.throws(() => decodificarObra(sin), /falta el campo pagado/);
    const mal = xdr.ScVal.scvMap(
      entradas.map((e) =>
        nombreClave(e) === 'pagado' ? new xdr.ScMapEntry({ key: e.key, val: u32(5) }) : e,
      ),
    );
    assert.throws(() => decodificarObra(mal), ErrorFormato);
  });

  it('estado de obra con variante desconocida → ErrorFormato; hitos con elemento no mapa → ErrorFormato', () => {
    const entradas = entradasObra();
    const mal = xdr.ScVal.scvMap(
      entradas.map((e) =>
        nombreClave(e) === 'estado'
          ? new xdr.ScMapEntry({ key: e.key, val: xdr.ScVal.scvVec([sym('Rara')]) })
          : e,
      ),
    );
    assert.throws(() => decodificarObra(mal), ErrorFormato);
    assert.throws(() => decodificarHitos(xdr.ScVal.scvVec([u32(1)])), ErrorFormato);
  });
});
