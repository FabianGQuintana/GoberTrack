// Momentos de la declaración vigente de un hito, sacados de la línea de tiempo (eventos del contrato).
// El estado del hito (aprobo_inspector, aprobo_veedor…) no guarda cuándo pasó cada cosa; los eventos sí.
// Si el backend arrancó cuando el RPC ya había descartado eventos viejos, puede faltar alguno: por eso
// todos los campos son opcionales y la interfaz muestra el estado aunque no sepa el momento.

import type { Evento, Obra } from "./api/tipos";

export interface MomentosHito {
  /** Declaración vigente (la última). */
  declarado?: string;
  inspector?: string;
  veedor?: string;
  objetado?: string;
  resuelta?: { momento: string; decision: string };
  pagado?: string;
  /** Hash de tx del pago, para "Ver transacción". */
  txPago?: string;
}

const ROL_FIRMANTE = (obra: Pick<Obra, "inspector" | "veedor">, firmante: unknown) => {
  if (typeof firmante !== "string") return null;
  const f = firmante.toUpperCase();
  if (f === obra.inspector.toUpperCase()) return "inspector" as const;
  if (f === obra.veedor.toUpperCase()) return "veedor" as const;
  return null;
};

/**
 * Momentos de la declaración vigente del hito `indice`: lo que pasó desde su último `HitoDeclarado`.
 * El pago se toma de toda la historia (un hito se paga una sola vez).
 */
export function momentosDeHito(
  eventos: readonly Evento[],
  obra: Pick<Obra, "inspector" | "veedor">,
  indice: number,
): MomentosHito {
  const delHito = eventos.filter((e) => e.hito === indice);
  const resultado: MomentosHito = {};
  const pago = delHito.find((e) => e.tipo === "PagoLiberado");
  if (pago) {
    resultado.pagado = pago.momento;
    resultado.txPago = pago.tx_hash;
  }
  let ultimaDeclaracion = -1;
  delHito.forEach((e, i) => {
    if (e.tipo === "HitoDeclarado") ultimaDeclaracion = i;
  });
  if (ultimaDeclaracion < 0) return resultado;
  for (const e of delHito.slice(ultimaDeclaracion)) {
    switch (e.tipo) {
      case "HitoDeclarado":
        resultado.declarado = e.momento;
        break;
      case "HitoAprobado": {
        const rol = ROL_FIRMANTE(obra, e.datos?.firmante);
        if (rol) resultado[rol] = e.momento;
        break;
      }
      case "HitoObjetado":
        resultado.objetado = e.momento;
        break;
      case "ObjecionResuelta":
        resultado.resuelta = { momento: e.momento, decision: String(e.datos?.decision ?? "") };
        break;
    }
  }
  return resultado;
}

/** Hashes de cada declaración del hito, en orden (incluye las anteriores a un Aceptar). */
export function declaraciones(eventos: readonly Evento[], indice: number): { hash: string; momento: string }[] {
  return eventos
    .filter((e) => e.tipo === "HitoDeclarado" && e.hito === indice && typeof e.datos?.evidencia_hash === "string")
    .map((e) => ({ hash: e.datos.evidencia_hash as string, momento: e.momento }));
}
