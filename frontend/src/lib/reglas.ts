// Qué acción puede firmar cada rol según el estado de la obra y del hito.
//
// Reproduce **exactamente** el orden de validación de interfaces/contract.md §3: en cada función se
// recorren los pasos en el mismo orden y se devuelve el primer error que aplicaría. Así el panel
// muestra el mismo error que devolvería el contrato. La regla la aplica el contrato; esto es una ayuda
// para la interfaz. Para los bordes del período, el panel pasa la hora del último ledger (o el reloj
// del navegador con márgenes; ver `margenObjecionMs` y `margenPagoMs`).

import type { Hito, Obra } from "./api/tipos";
import type { CodigoError } from "./errores";
import { ERRORES } from "./errores";
import { aUnidades } from "./montos";
import { NOMBRE_ROL, type Rol } from "./roles";

export const ACCIONES = [
  "fondear",
  "declarar_hito",
  "aprobar",
  "objetar",
  "resolver_objecion",
  "liberar_pago",
] as const;
export type Accion = (typeof ACCIONES)[number];
export type AccionHito = Exclude<Accion, "fondear">;

export type Motivo =
  /** Uno de los 15 errores del contrato. */
  | { tipo: "contrato"; codigo: CodigoError }
  /** `require_auth()` de una función de un solo rol firmada por otra cuenta: falla el host. */
  | { tipo: "autorizacion"; rolRequerido: Rol };

export type Resultado = { permitida: true } | { permitida: false; motivo: Motivo };

export interface Contexto {
  obra: Obra;
  /** Todos los hitos de la obra (en cualquier orden: se buscan por `indice`). */
  hitos: readonly Hito[];
  /** Roles de la dirección que firmaría (ver `rolesDe`). Vacío = sin rol. */
  roles: readonly Rol[];
  /** Milisegundos Unix: el momento del último ledger si se conoce, o el reloj del navegador. */
  ahora: number;
  /**
   * Margen para objetar (ms): se exige `ahora + margen < fin`. La transacción entra en un ledger
   * posterior al que se usó para evaluar, así que objetar en el último instante podría fallar.
   */
  margenObjecionMs?: number;
  /**
   * Margen para liberar el pago (ms): se exige `ahora − margen >= fin`. Sirve cuando `ahora` es el
   * reloj del navegador, que puede ir adelantado respecto del ledger.
   */
  margenPagoMs?: number;
}

const PERMITIDA: Resultado = { permitida: true };
const error = (codigo: CodigoError): Resultado => ({ permitida: false, motivo: { tipo: "contrato", codigo } });
const sinFirma = (rolRequerido: Rol): Resultado => ({
  permitida: false,
  motivo: { tipo: "autorizacion", rolRequerido },
});

function buscarHito(hitos: readonly Hito[], indice: number): Hito | undefined {
  return hitos.find((h) => h.indice === indice);
}

/** "Hito anterior OK": `hito == 0`, o el hito `hito − 1` está Aprobado o Pagado (contract.md §3). */
export function hitoAnteriorOk(hitos: readonly Hito[], indice: number): boolean {
  if (indice === 0) return true;
  const anterior = buscarHito(hitos, indice - 1);
  return anterior !== undefined && (anterior.estado === "Aprobado" || anterior.estado === "Pagado");
}

/**
 * Fin del período de objeción en ms: `momento_declaracion + periodo_objecion` (la definición del
 * contrato), o `fin_periodo_objecion` del backend si faltara el momento. null si no hay declaración.
 */
export function finPeriodo(hito: Hito, obra: Pick<Obra, "periodo_objecion_seg">): number | null {
  if (hito.momento_declaracion !== null) {
    return Date.parse(hito.momento_declaracion) + obra.periodo_objecion_seg * 1000;
  }
  return hito.fin_periodo_objecion !== null ? Date.parse(hito.fin_periodo_objecion) : null;
}

/** Ventana semiabierta [declaración, fin): se puede objetar si ahora < fin. */
export function dentroDelPeriodo(hito: Hito, obra: Obra, ahora: number): boolean {
  const fin = finPeriodo(hito, obra);
  return fin !== null && ahora < fin;
}

/** §3.2 `fondear(obra, monto)`. `monto` en unidades mínimas; null si lo escrito no es un monto. */
export function evaluarFondear(ctx: Contexto, monto: bigint | null): Resultado {
  const { obra, roles } = ctx;
  // 1. ObraNoExiste: la obra está cargada.
  // 2. obra.municipio.require_auth()
  if (!roles.includes("municipio")) return sinFirma("municipio");
  // 3. MontoInvalido si monto ≤ 0
  if (monto === null || monto <= 0n) return error("MontoInvalido");
  // 4. ExcedeMontoTotal si fondeado + monto > monto_vigente
  if (aUnidades(obra.fondeado) + monto > aUnidades(obra.monto_vigente)) return error("ExcedeMontoTotal");
  return PERMITIDA;
}

/** §3.3 `declarar_hito(obra, hito, evidencia_hash)`. */
export function evaluarDeclarar(ctx: Contexto, indice: number): Resultado {
  const { hitos, roles } = ctx;
  // 1. ObraNoExiste, HitoNoExiste
  const hito = buscarHito(hitos, indice);
  if (!hito) return error("HitoNoExiste");
  // 2. obra.contratista.require_auth()
  if (!roles.includes("contratista")) return sinFirma("contratista");
  // 3. HitoAnteriorPendiente
  if (!hitoAnteriorOk(hitos, indice)) return error("HitoAnteriorPendiente");
  // 4. EstadoInvalido si no está Pendiente
  if (hito.estado !== "Pendiente") return error("EstadoInvalido");
  return PERMITIDA;
}

/** §3.4 `aprobar(obra, hito, firmante)`, con `firmante` = la dirección conectada. */
export function evaluarAprobar(ctx: Contexto, indice: number): Resultado {
  const { hitos, roles } = ctx;
  // 1. ObraNoExiste, HitoNoExiste
  const hito = buscarHito(hitos, indice);
  if (!hito) return error("HitoNoExiste");
  // 2. NoAutorizado si firmante no es el inspector ni el veedor
  const esInspector = roles.includes("inspector");
  if (!esInspector && !roles.includes("veedor")) return error("NoAutorizado");
  // 3. firmante.require_auth(): firma la misma dirección que se pasa como firmante.
  // 4. HitoAnteriorPendiente
  if (!hitoAnteriorOk(hitos, indice)) return error("HitoAnteriorPendiente");
  // 5. Según el estado
  if (hito.estado === "Pagado") return error("YaPagado");
  if (hito.estado === "Objetado") return error("ObjecionAbierta");
  if (hito.estado === "Pendiente") return error("EstadoInvalido");
  // 6. YaDecidio (inspector y veedor nunca son la misma dirección: RolesDuplicados)
  if (esInspector ? hito.aprobo_inspector : hito.aprobo_veedor) return error("YaDecidio");
  return PERMITIDA;
}

/** §3.5 `objetar(obra, hito, motivo_hash)`. */
export function evaluarObjetar(ctx: Contexto, indice: number): Resultado {
  const { obra, hitos, roles, ahora } = ctx;
  // 1. ObraNoExiste, HitoNoExiste
  const hito = buscarHito(hitos, indice);
  if (!hito) return error("HitoNoExiste");
  // 2. obra.veedor.require_auth()
  if (!roles.includes("veedor")) return sinFirma("veedor");
  // 3. Según el estado
  if (hito.estado === "Pagado") return error("YaPagado");
  if (hito.estado === "Objetado") return error("ObjecionAbierta");
  if (hito.estado === "Pendiente") return error("EstadoInvalido");
  // 4. ObjecionYaUsada
  if (hito.objecion_usada) return error("ObjecionYaUsada");
  // 5. YaDecidio si aprobo_veedor
  if (hito.aprobo_veedor) return error("YaDecidio");
  // 6. FueraDePeriodo si ahora >= momento_declaracion + periodo_objecion
  if (!dentroDelPeriodo(hito, obra, ahora + (ctx.margenObjecionMs ?? 0))) return error("FueraDePeriodo");
  return PERMITIDA;
}

/** §3.6 `resolver_objecion(obra, hito, decision)`. La decisión no cambia la validación. */
export function evaluarResolver(ctx: Contexto, indice: number): Resultado {
  const { hitos, roles } = ctx;
  // 1. ObraNoExiste, HitoNoExiste
  const hito = buscarHito(hitos, indice);
  if (!hito) return error("HitoNoExiste");
  // 2. obra.arbitro.require_auth()
  if (!roles.includes("arbitro")) return sinFirma("arbitro");
  // 3. EstadoInvalido si no está Objetado
  if (hito.estado !== "Objetado") return error("EstadoInvalido");
  return PERMITIDA;
}

/** §3.7 `liberar_pago(obra, hito)`. Sin firma de rol: la puede llamar cualquiera. */
export function evaluarLiberarPago(ctx: Contexto, indice: number): Resultado {
  const { obra, hitos, ahora } = ctx;
  // 1. ObraNoExiste, HitoNoExiste
  const hito = buscarHito(hitos, indice);
  if (!hito) return error("HitoNoExiste");
  // 2. YaPagado
  if (hito.estado === "Pagado") return error("YaPagado");
  // 3. ObjecionAbierta
  if (hito.estado === "Objetado") return error("ObjecionAbierta");
  // 4. HitoAnteriorPendiente
  if (!hitoAnteriorOk(hitos, indice)) return error("HitoAnteriorPendiente");
  // 5. EstadoInvalido si no está Aprobado
  if (hito.estado !== "Aprobado") return error("EstadoInvalido");
  // 6. PeriodoNoCumplido si ahora < momento_declaracion + periodo_objecion
  const fin = finPeriodo(hito, obra);
  if (fin === null || ahora - (ctx.margenPagoMs ?? 0) < fin) return error("PeriodoNoCumplido");
  // 7. FondosInsuficientes si fondeado − pagado < monto_vigente
  if (aUnidades(obra.fondeado) - aUnidades(obra.pagado) < aUnidades(hito.monto_vigente)) {
    return error("FondosInsuficientes");
  }
  return PERMITIDA;
}

const EVALUADORES: Record<AccionHito, (ctx: Contexto, indice: number) => Resultado> = {
  declarar_hito: evaluarDeclarar,
  aprobar: evaluarAprobar,
  objetar: evaluarObjetar,
  resolver_objecion: evaluarResolver,
  liberar_pago: evaluarLiberarPago,
};

export function evaluarAccionHito(accion: AccionHito, ctx: Contexto, indice: number): Resultado {
  return EVALUADORES[accion](ctx, indice);
}

/** Las cinco acciones sobre un hito, evaluadas para la misma dirección y el mismo momento. */
export function evaluarHito(ctx: Contexto, indice: number): Record<AccionHito, Resultado> {
  return {
    declarar_hito: evaluarDeclarar(ctx, indice),
    aprobar: evaluarAprobar(ctx, indice),
    objetar: evaluarObjetar(ctx, indice),
    resolver_objecion: evaluarResolver(ctx, indice),
    liberar_pago: evaluarLiberarPago(ctx, indice),
  };
}

/** Texto del motivo: el nombre del error del contrato que saldría y su explicación. */
export function describirMotivo(motivo: Motivo): { titulo: string; detalle: string } {
  if (motivo.tipo === "contrato") {
    return { titulo: motivo.codigo, detalle: ERRORES[motivo.codigo].mensaje };
  }
  return {
    titulo: "Error de autorización del host",
    detalle: `Solo la puede firmar el ${NOMBRE_ROL[motivo.rolRequerido].toLowerCase()} de la obra; con otra cuenta, require_auth() hace fallar la transacción (no es uno de los errores del contrato).`,
  };
}
