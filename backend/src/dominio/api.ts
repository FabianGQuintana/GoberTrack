import type { EventoFila, HitoFila, ObraFila } from '../db/repositorio.ts';
import type { EstadoObra, EventoApi, HitoApi, ObraApi } from './tipos.ts';

// Conversión de filas a respuestas de la API y campos calculados (openapi.yaml).

/**
 * 9999-12-31T23:59:59Z: el mayor momento que sigue siendo un `date-time` válido. El contrato calcula
 * el fin del período con saturating_add, así que cualquiera puede crear una obra con un
 * periodo_objecion enorme; el backend satura acá para no salir del rango de Date ni de los enteros
 * exactos de JS.
 */
export const MOMENTO_MAXIMO = 253_402_300_799;

/** Acota segundos Unix (momentos o duraciones) a [0, MOMENTO_MAXIMO]. */
export function acotarSegundos(segundos: number): number {
  if (Number.isNaN(segundos)) return 0;
  return Math.min(Math.max(segundos, 0), MOMENTO_MAXIMO);
}

/** Segundos Unix del ledger → ISO 8601 en UTC, sin milisegundos (los ledgers no los tienen). */
export function aIso(segundos: number): string {
  return new Date(acotarSegundos(segundos) * 1000).toISOString().replace('.000Z', 'Z');
}

function aIsoONull(segundos: number | null): string | null {
  return segundos === null ? null : aIso(segundos);
}

/** fondeado − pagado: fondos bloqueados en el contrato para esta obra. */
export function saldo(obra: Pick<ObraFila, 'fondeado' | 'pagado'>): bigint {
  return BigInt(obra.fondeado) - BigInt(obra.pagado);
}

/** Finalizada cuando todos los hitos están Pagado. */
export function estadoObra(obra: Pick<ObraFila, 'cantidad_hitos' | 'hitos_pagados'>): EstadoObra {
  return obra.hitos_pagados >= obra.cantidad_hitos ? 'Finalizada' : 'Activa';
}

/**
 * momento_declaracion + periodo_objecion, en segundos, saturado en MOMENTO_MAXIMO como el
 * saturating_add del contrato; null si el hito no tiene declaración.
 */
export function finPeriodo(hito: Pick<HitoFila, 'momento_declaracion'>, periodoSeg: number): number | null {
  if (hito.momento_declaracion === null) return null;
  return acotarSegundos(hito.momento_declaracion + periodoSeg);
}

/**
 * Ayuda para la interfaz, no la regla: estado Aprobado, período cumplido (ahora ≥ fin, la ventana
 * es semiabierta) y saldo de la obra ≥ monto_vigente del hito. La regla la aplica el contrato.
 */
export function esPagable(hito: HitoFila, obra: ObraFila, ahoraSeg: number): boolean {
  const fin = finPeriodo(hito, obra.periodo_objecion);
  return (
    hito.estado === 'Aprobado' &&
    fin !== null &&
    ahoraSeg >= fin &&
    saldo(obra) >= BigInt(hito.monto_vigente)
  );
}

export function obraApi(o: ObraFila): ObraApi {
  return {
    id: o.id,
    nombre: o.nombre,
    municipio: o.municipio,
    contratista: o.contratista,
    inspector: o.inspector,
    veedor: o.veedor,
    arbitro: o.arbitro,
    token: o.token,
    monto_original: o.monto_original,
    monto_vigente: o.monto_vigente,
    fondeado: o.fondeado,
    pagado: o.pagado,
    saldo: saldo(o).toString(),
    periodo_objecion_seg: o.periodo_objecion,
    estado: estadoObra(o),
    cantidad_hitos: o.cantidad_hitos,
    hitos_pagados: o.hitos_pagados,
    creada_en: aIso(o.creada_en),
  };
}

export function hitoApi(h: HitoFila, obra: ObraFila, ahoraSeg: number): HitoApi {
  return {
    obra_id: h.obra_id,
    indice: h.indice,
    descripcion: h.descripcion,
    monto_original: h.monto_original,
    monto_vigente: h.monto_vigente,
    estado: h.estado,
    evidencia_hash: h.evidencia_hash,
    momento_declaracion: aIsoONull(h.momento_declaracion),
    fin_periodo_objecion: aIsoONull(finPeriodo(h, obra.periodo_objecion)),
    aprobo_inspector: h.aprobo_inspector === 1,
    aprobo_veedor: h.aprobo_veedor === 1,
    veedor_por_arbitro: h.veedor_por_arbitro === 1,
    objecion_usada: h.objecion_usada === 1,
    motivo_objecion_hash: h.motivo_objecion_hash,
    momento_aprobacion_completa: aIsoONull(h.momento_aprobacion_completa),
    momento_pago: aIsoONull(h.momento_pago),
    pagable: esPagable(h, obra, ahoraSeg),
  };
}

export function eventoApi(e: EventoFila): EventoApi {
  return {
    id: e.id,
    tipo: e.tipo,
    obra_id: e.obra_id,
    hito: e.hito,
    ledger: e.ledger,
    momento: aIso(e.momento),
    tx_hash: e.tx_hash,
    datos: JSON.parse(e.datos) as Record<string, unknown>,
  };
}
