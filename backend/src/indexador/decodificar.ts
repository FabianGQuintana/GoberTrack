import { scValToNative, type rpc, type xdr } from '@stellar/stellar-sdk';
import { aIso, MOMENTO_MAXIMO } from '../dominio/api.ts';
import {
  ESTADOS_HITO,
  type EstadoHito,
  type EstadoObra,
  type EventoIndexado,
  type HitoContrato,
  type ObraContrato,
  type TipoEvento,
} from '../dominio/tipos.ts';

/*
 * Decodificación de lo que devuelve el contrato (interfaces/contract.md §1 y §4) a los tipos del
 * backend. Formato on-chain verificado contra testnet el 16/10/2026:
 * - structs y datos de eventos: ScMap con claves Symbol (nombres de campo);
 * - enums contracttype de variantes unitarias: Vec[Symbol("Variante")];
 * - Option vacío: Void; i128 y u64: enteros grandes; BytesN<32>: bytes; Address: strkey.
 * Ante un formato inesperado se lanza ErrorFormato: es mejor no indexar que indexar mal.
 */

export class ErrorFormato extends Error {}

type Nativo = Record<string, unknown>;

const STRKEY = /^[GC][A-Z2-7]{55}$/;
const U32_MAX = 4_294_967_295;

function campo(obj: Nativo, clave: string, contexto: string): unknown {
  if (!(clave in obj)) throw new ErrorFormato(`${contexto}: falta el campo ${clave}`);
  return obj[clave];
}

function u32(obj: Nativo, clave: string, ctx: string): number {
  const v = campo(obj, clave, ctx);
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > U32_MAX) {
    throw new ErrorFormato(`${ctx}: ${clave} no es u32`);
  }
  return v;
}

const MAXIMO_U64_SEGUNDOS = BigInt(MOMENTO_MAXIMO);

/**
 * u64 de tiempo (momento o duración, en segundos) como número de JS, saturado en MOMENTO_MAXIMO.
 * Cualquiera puede crear una obra con un periodo_objecion enorme (y el contrato satura el fin del
 * período en u64::MAX): esa obra se indexa con el valor acotado en vez de rechazarse.
 */
function u64Numero(v: unknown, clave: string, ctx: string): number {
  if (typeof v !== 'bigint' || v < 0n) throw new ErrorFormato(`${ctx}: ${clave} no es u64`);
  return Number(v > MAXIMO_U64_SEGUNDOS ? MAXIMO_U64_SEGUNDOS : v);
}

function u64(obj: Nativo, clave: string, ctx: string): number {
  return u64Numero(campo(obj, clave, ctx), clave, ctx);
}

function u64ONull(obj: Nativo, clave: string, ctx: string): number | null {
  const v = campo(obj, clave, ctx);
  return v === null ? null : u64Numero(v, clave, ctx);
}

function i128(obj: Nativo, clave: string, ctx: string): bigint {
  const v = campo(obj, clave, ctx);
  if (typeof v !== 'bigint') throw new ErrorFormato(`${ctx}: ${clave} no es i128`);
  return v;
}

function texto(obj: Nativo, clave: string, ctx: string): string {
  const v = campo(obj, clave, ctx);
  if (typeof v !== 'string') throw new ErrorFormato(`${ctx}: ${clave} no es texto`);
  return v;
}

function direccion(obj: Nativo, clave: string, ctx: string): string {
  const v = texto(obj, clave, ctx);
  if (!STRKEY.test(v)) throw new ErrorFormato(`${ctx}: ${clave} no es una dirección strkey`);
  return v;
}

function bool(obj: Nativo, clave: string, ctx: string): boolean {
  const v = campo(obj, clave, ctx);
  if (typeof v !== 'boolean') throw new ErrorFormato(`${ctx}: ${clave} no es bool`);
  return v;
}

function bytesAHex(v: unknown, clave: string, ctx: string): string {
  if (!(v instanceof Uint8Array) || v.length !== 32) {
    throw new ErrorFormato(`${ctx}: ${clave} no es BytesN<32>`);
  }
  return Buffer.from(v).toString('hex');
}

function hashONull(obj: Nativo, clave: string, ctx: string): string | null {
  const v = campo(obj, clave, ctx);
  return v === null ? null : bytesAHex(v, clave, ctx);
}

/** Enum contracttype de variantes unitarias: Vec[Symbol("Variante")]. */
function variante<T extends string>(v: unknown, permitidas: readonly T[], clave: string, ctx: string): T {
  if (Array.isArray(v) && v.length === 1 && permitidas.includes(v[0] as T)) return v[0] as T;
  throw new ErrorFormato(`${ctx}: ${clave} no es una variante de ${permitidas.join('/')}`);
}

function comoMapa(v: xdr.ScVal, ctx: string): Nativo {
  if (v.type !== 'scvMap') throw new ErrorFormato(`${ctx}: se esperaba un mapa y llegó ${v.type}`);
  return scValToNative(v) as Nativo;
}

// ---- Lecturas: cantidad_obras, ver_obra, ver_hitos ----

export function decodificarCantidadObras(v: xdr.ScVal): number {
  if (v.type !== 'scvU32') throw new ErrorFormato(`cantidad_obras: se esperaba u32 y llegó ${v.type}`);
  return scValToNative(v) as number;
}

/** Resultado de ver_obra. Devuelve aparte el `estado` del contrato (la API lo deriva de los hitos). */
export function decodificarObra(v: xdr.ScVal): { obra: ObraContrato; estado: EstadoObra } {
  const ctx = 'ver_obra';
  const o = comoMapa(v, ctx);
  return {
    obra: {
      id: u32(o, 'id', ctx),
      nombre: texto(o, 'nombre', ctx),
      municipio: direccion(o, 'municipio', ctx),
      contratista: direccion(o, 'contratista', ctx),
      inspector: direccion(o, 'inspector', ctx),
      veedor: direccion(o, 'veedor', ctx),
      arbitro: direccion(o, 'arbitro', ctx),
      token: direccion(o, 'token', ctx),
      monto_original: i128(o, 'monto_original', ctx),
      monto_vigente: i128(o, 'monto_vigente', ctx),
      fondeado: i128(o, 'fondeado', ctx),
      pagado: i128(o, 'pagado', ctx),
      periodo_objecion: u64(o, 'periodo_objecion', ctx),
      cantidad_hitos: u32(o, 'cantidad_hitos', ctx),
      creada_en: u64(o, 'creada_en', ctx),
    },
    estado: variante(campo(o, 'estado', ctx), ['Activa', 'Finalizada'] as const, 'estado', ctx),
  };
}

/** Resultado de ver_hitos: Vec<Hito>. */
export function decodificarHitos(v: xdr.ScVal): HitoContrato[] {
  if (v.type !== 'scvVec' || !v.vec) throw new ErrorFormato(`ver_hitos: se esperaba un vec y llegó ${v.type}`);
  return v.vec.map((elemento, i) => {
    const ctx = `ver_hitos[${i}]`;
    const h = comoMapa(elemento, ctx);
    return {
      indice: u32(h, 'indice', ctx),
      descripcion: texto(h, 'descripcion', ctx),
      monto_original: i128(h, 'monto_original', ctx),
      monto_vigente: i128(h, 'monto_vigente', ctx),
      estado: variante(campo(h, 'estado', ctx), ESTADOS_HITO, 'estado', ctx) as EstadoHito,
      evidencia_hash: hashONull(h, 'evidencia_hash', ctx),
      momento_declaracion: u64ONull(h, 'momento_declaracion', ctx),
      aprobo_inspector: bool(h, 'aprobo_inspector', ctx),
      aprobo_veedor: bool(h, 'aprobo_veedor', ctx),
      veedor_por_arbitro: bool(h, 'veedor_por_arbitro', ctx),
      objecion_usada: bool(h, 'objecion_usada', ctx),
      motivo_objecion_hash: hashONull(h, 'motivo_objecion_hash', ctx),
      momento_aprobacion_completa: u64ONull(h, 'momento_aprobacion_completa', ctx),
      momento_pago: u64ONull(h, 'momento_pago', ctx),
    };
  });
}

// ---- Eventos (contract.md §4) ----

/** Nombre corto on-chain (primer topic) → nombre legible de la API. */
const NOMBRES_EVENTO: Record<string, TipoEvento> = {
  creada: 'ObraCreada',
  fondeada: 'ObraFondeada',
  declarado: 'HitoDeclarado',
  aprobado: 'HitoAprobado',
  objetado: 'HitoObjetado',
  resuelta: 'ObjecionResuelta',
  pagado: 'PagoLiberado',
  adenda: 'AdendaRegistrada',
};

export function traducirNombreEvento(nombreCorto: string): TipoEvento | undefined {
  return Object.hasOwn(NOMBRES_EVENTO, nombreCorto) ? NOMBRES_EVENTO[nombreCorto] : undefined;
}

/**
 * Campos u64 de los datos que son momentos (se exponen en ISO 8601); el resto de los u64 va como
 * número. Todos saturan en MOMENTO_MAXIMO: un fin_periodo de u64::MAX sale "9999-12-31T23:59:59Z".
 */
const MOMENTOS_EN_DATOS = new Set(['fin_periodo']);

/**
 * Un valor de los datos de un evento al formato de la API (el mismo que usa el seed): montos i128
 * como string, hashes en hex, direcciones strkey, enums como el nombre de la variante, momentos en
 * ISO 8601 y el resto de los enteros como número.
 */
function datoDeEvento(clave: string, v: xdr.ScVal, ctx: string): unknown {
  const nativo: unknown = scValToNative(v);
  switch (v.type) {
    case 'scvI128':
    case 'scvU128':
    case 'scvI64':
      return (nativo as bigint).toString();
    case 'scvU64':
      return MOMENTOS_EN_DATOS.has(clave) ? aIso(u64Numero(nativo, clave, ctx)) : u64Numero(nativo, clave, ctx);
    case 'scvBytes':
      return Buffer.from(nativo as Uint8Array).toString('hex');
    case 'scvVec':
      // Enum de variantes unitarias.
      if (Array.isArray(nativo) && nativo.length === 1 && typeof nativo[0] === 'string') return nativo[0];
      throw new ErrorFormato(`${ctx}: ${clave} es un vec que no es una variante de enum`);
    case 'scvU32':
    case 'scvI32':
    case 'scvBool':
    case 'scvString':
    case 'scvSymbol':
    case 'scvAddress':
      return nativo;
    default:
      throw new ErrorFormato(`${ctx}: ${clave} tiene un tipo no previsto (${v.type})`);
  }
}

export type ResultadoTraduccion =
  | { ok: true; evento: EventoIndexado }
  /** `obra`: la del topic si se pudo leer, para refrescar su estado aunque el evento se saltee (R5). */
  | { ok: false; motivo: string; obra?: number };

/** Obra del segundo topic, si es un u32 ≥ 1. */
function obraDeTopics(ev: rpc.Api.EventResponse): number | undefined {
  try {
    const obra: unknown = ev.topic[1] ? scValToNative(ev.topic[1]) : undefined;
    return typeof obra === 'number' && obra >= 1 ? obra : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Evento de getEvents (ya parseado por el SDK) → fila de la tabla eventos. Un evento que no se
 * puede leer (nombre desconocido o datos con un formato no previsto) devuelve `ok: false` y el
 * indexador lo saltea con un aviso: trabar todo el indexador por un evento sería peor, y el
 * estado igual sale de ver_obra/ver_hitos.
 */
export function traducirEvento(ev: rpc.Api.EventResponse): ResultadoTraduccion {
  let r: ResultadoTraduccion;
  try {
    r = traducir(ev);
  } catch (err) {
    if (!(err instanceof ErrorFormato)) throw err;
    r = { ok: false, motivo: err.message };
  }
  return r.ok ? r : { ...r, obra: obraDeTopics(ev) };
}

function traducir(ev: rpc.Api.EventResponse): ResultadoTraduccion {
  const ctx = `evento ${ev.id}`;
  if (!ev.inSuccessfulContractCall) return { ok: false, motivo: `${ctx}: no viene de una llamada exitosa` };
  const topics = ev.topic.map((t) => scValToNative(t) as unknown);
  const [nombre, obra, hito] = topics;
  const tipo = typeof nombre === 'string' ? traducirNombreEvento(nombre) : undefined;
  if (!tipo) return { ok: false, motivo: `${ctx}: nombre de evento desconocido (${String(nombre)})` };
  if (typeof obra !== 'number' || obra < 1) return { ok: false, motivo: `${ctx}: topic de obra inválido` };
  if (hito !== undefined && typeof hito !== 'number') {
    return { ok: false, motivo: `${ctx}: topic de hito inválido` };
  }
  if (ev.value.type !== 'scvMap') return { ok: false, motivo: `${ctx}: los datos no son un mapa` };

  const datos: Record<string, unknown> = {};
  for (const entrada of ev.value.map ?? []) {
    if (entrada.key.type !== 'scvSymbol') throw new ErrorFormato(`${ctx}: clave de datos no Symbol`);
    const clave = entrada.key.sym.toString();
    datos[clave] = datoDeEvento(clave, entrada.val, ctx);
  }

  const momento = Date.parse(ev.ledgerClosedAt);
  if (Number.isNaN(momento)) throw new ErrorFormato(`${ctx}: ledgerClosedAt inválido`);
  return {
    ok: true,
    evento: {
      id: ev.id,
      tipo,
      obra_id: obra,
      hito: hito ?? null,
      ledger: ev.ledger,
      momento: Math.floor(momento / 1000),
      tx_hash: ev.txHash,
      datos,
    },
  };
}

/** Ledger de un cursor o id de evento del RPC ("<TOID>-<índice>"; TOID = ledger << 32 | ...). */
export function ledgerDeCursor(cursor: string): number | undefined {
  const m = /^(\d{1,19})-\d+$/.exec(cursor);
  return m ? Number(BigInt(m[1]!) >> 32n) : undefined;
}
