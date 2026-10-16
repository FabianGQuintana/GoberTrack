// Línea de tiempo en castellano a partir de `Evento.datos` (nombres de campo de contract.md §4).
// Formato acordado con el backend: montos como string, hashes en hex, direcciones como strkey,
// `periodo_objecion` en segundos (número), `fin_periodo` en ISO 8601, `decision`/`estado` como string.
// Se tolera también un u64 numérico en `fin_periodo` por si cambia la serialización.

import type { Evento, Obra } from "./api/tipos";
import { esHash } from "./hash";
import { formatearMonto } from "./montos";
import { NOMBRE_ROL, quienEs, rolesDe } from "./roles";
import { formatearMomento, formatearPeriodo } from "./tiempo";

export interface DescripcionEvento {
  titulo: string;
  detalle: string;
  /** Archivo asociado (evidencia declarada o motivo de una objeción). */
  archivo?: { etiqueta: string; hash: string };
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

function monto(valor: unknown): string {
  if (typeof valor === "string" && /^[0-9]+$/.test(valor)) return formatearMonto(valor, true);
  if (typeof valor === "number" && Number.isSafeInteger(valor) && valor >= 0) {
    return formatearMonto(BigInt(valor), true);
  }
  return "un monto no informado";
}

function momento(valor: unknown): string | null {
  if (typeof valor === "string" && !Number.isNaN(Date.parse(valor))) return formatearMomento(valor);
  if (typeof valor === "number" && Number.isFinite(valor)) return formatearMomento(valor * 1000);
  if (typeof valor === "string" && /^[0-9]+$/.test(valor)) return formatearMomento(Number(valor) * 1000);
  return null;
}

function numeroHito(evento: Evento): string {
  return evento.hito === null ? "?" : String(evento.hito + 1);
}

function quien(obra: Obra, direccion: unknown): string {
  const dir = texto(direccion);
  if (!dir) return "una dirección no informada";
  const roles = rolesDe(obra, dir);
  // Para aprobar solo cuentan inspector y veedor (el municipio puede ser también el árbitro).
  const rol = roles.find((r) => r === "inspector" || r === "veedor");
  return rol ? `el ${NOMBRE_ROL[rol].toLowerCase()}` : quienEs(obra, dir);
}

export function describirEvento(evento: Evento, obra: Obra): DescripcionEvento {
  const d = evento.datos ?? {};
  const n = numeroHito(evento);
  switch (evento.tipo) {
    case "ObraCreada": {
      const periodo = typeof d.periodo_objecion === "number" ? formatearPeriodo(d.periodo_objecion) : null;
      const cantidad = typeof d.cantidad_hitos === "number" ? `${d.cantidad_hitos} hitos` : "sus hitos";
      return {
        titulo: "Obra creada por el municipio",
        detalle:
          `«${texto(d.nombre) ?? obra.nombre}»: ${cantidad} por ${monto(d.monto_original)}.` +
          (periodo ? ` Período de objeción: ${periodo}.` : ""),
      };
    }
    case "ObraFondeada":
      return {
        titulo: "Fondeo del municipio",
        detalle: `Depositó ${monto(d.monto)} en el contrato. Fondeado acumulado: ${monto(d.fondeado)}.`,
      };
    case "HitoDeclarado": {
      const fin = momento(d.fin_periodo);
      const hash = texto(d.evidencia_hash);
      return {
        titulo: `Hito ${n} declarado por el contratista`,
        detalle:
          "Presentó la evidencia del avance." +
          (fin ? ` El período de objeción termina el ${fin}.` : ""),
        archivo: hash && esHash(hash) ? { etiqueta: "Evidencia", hash } : undefined,
      };
    }
    case "HitoAprobado":
      return {
        titulo: `Hito ${n} aprobado por ${quien(obra, d.firmante)}`,
        detalle:
          d.completo === true
            ? "Con esta aprobación el hito tiene las dos: inspector y veedor."
            : "Falta la otra aprobación (inspector o veedor).",
      };
    case "HitoObjetado": {
      const hash = texto(d.motivo_hash);
      return {
        titulo: `Hito ${n} objetado por el veedor`,
        detalle: "El pago queda congelado hasta que el árbitro resuelva la objeción.",
        archivo: hash && esHash(hash) ? { etiqueta: "Motivo", hash } : undefined,
      };
    }
    case "ObjecionResuelta": {
      const estado = texto(d.estado);
      if (d.decision === "Aceptar") {
        return {
          titulo: `Objeción del hito ${n} aceptada por el árbitro`,
          detalle:
            "El hito vuelve a Pendiente y se borran las aprobaciones: el contratista tiene que declararlo de nuevo.",
        };
      }
      if (d.decision === "Rechazar") {
        return {
          titulo: `Objeción del hito ${n} rechazada por el árbitro`,
          detalle:
            "Cuenta como aprobación del veedor." + (estado ? ` El hito quedó en ${estado}.` : ""),
        };
      }
      return {
        titulo: `Objeción del hito ${n} resuelta por el árbitro`,
        detalle: estado ? `El hito quedó en ${estado}.` : "",
      };
    }
    case "PagoLiberado":
      return {
        titulo: `Pago del hito ${n} liberado`,
        detalle: `Se transfirieron ${monto(d.monto)} al contratista. Pagado acumulado: ${monto(d.pagado)}.`,
      };
    case "AdendaRegistrada":
      return {
        titulo: `Adenda en el hito ${n}`,
        detalle: "Se modificó el monto vigente del hito.",
      };
    default:
      return { titulo: String(evento.tipo), detalle: "" };
  }
}

/** Hashes de evidencia de cada declaración de un hito, en orden (incluye las anteriores a un Aceptar). */
export function historialEvidencia(eventos: readonly Evento[], indice: number): { hash: string; momento: string }[] {
  return eventos
    .filter((e) => e.tipo === "HitoDeclarado" && e.hito === indice && esHash(e.datos?.evidencia_hash))
    .map((e) => ({ hash: e.datos.evidencia_hash as string, momento: e.momento }));
}
