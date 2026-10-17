// "Comprobá los datos vos mismo": el navegador lee la obra directo del contrato en la red pública
// (ver_obra y ver_hitos por simulación, sin firmar nada) y la compara con lo que muestra la página,
// que viene de nuestro backend. Así nadie tiene que creerle solo a nuestro servidor.
//
// Formato de lo que devuelve el contrato, verificado contra testnet (backend/src/indexador/decodificar.ts):
// structs como mapas con los nombres de campo; enums de variantes unitarias como ["Variante"];
// Option vacío como null; i128 y u64 como bigint; BytesN<32> como bytes; Address como strkey.

import { nativeToScVal } from "@stellar/stellar-sdk/base";
import type { Hito, Obra } from "./api/tipos";
import { formatearMonto } from "./montos";
import { leer, type Red } from "./stellar/transacciones";

export interface ObraEnCadena {
  monto_vigente: string;
  fondeado: string;
  pagado: string;
  contratista: string;
  inspector: string;
  veedor: string;
}

export interface HitoEnCadena {
  indice: number;
  estado: string;
  evidencia_hash: string | null;
  motivo_objecion_hash: string | null;
  aprobo_inspector: boolean;
  aprobo_veedor: boolean;
}

export interface LecturaCadena {
  obra: ObraEnCadena;
  hitos: HitoEnCadena[];
}

export class ErrorLectura extends Error {}

type Nativo = Record<string, unknown>;

function mapa(v: unknown, ctx: string): Nativo {
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw new ErrorLectura(`${ctx}: formato inesperado`);
  return v as Nativo;
}

function entero(v: unknown, ctx: string): string {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number" && Number.isSafeInteger(v)) return String(v);
  throw new ErrorLectura(`${ctx}: no es un entero`);
}

function texto(v: unknown, ctx: string): string {
  if (typeof v !== "string") throw new ErrorLectura(`${ctx}: no es texto`);
  return v;
}

function hexONull(v: unknown, ctx: string): string | null {
  if (v === null || v === undefined) return null;
  if (!(v instanceof Uint8Array) || v.length !== 32) throw new ErrorLectura(`${ctx}: no es BytesN<32>`);
  return Array.from(v, (b) => b.toString(16).padStart(2, "0")).join("");
}

function variante(v: unknown, ctx: string): string {
  if (Array.isArray(v) && v.length === 1 && typeof v[0] === "string") return v[0];
  if (typeof v === "string") return v;
  throw new ErrorLectura(`${ctx}: no es una variante`);
}

export function decodificarObraCadena(v: unknown): ObraEnCadena {
  const o = mapa(v, "ver_obra");
  return {
    monto_vigente: entero(o.monto_vigente, "monto_vigente"),
    fondeado: entero(o.fondeado, "fondeado"),
    pagado: entero(o.pagado, "pagado"),
    contratista: texto(o.contratista, "contratista"),
    inspector: texto(o.inspector, "inspector"),
    veedor: texto(o.veedor, "veedor"),
  };
}

export function decodificarHitosCadena(v: unknown): HitoEnCadena[] {
  if (!Array.isArray(v)) throw new ErrorLectura("ver_hitos: formato inesperado");
  return v.map((x, i) => {
    const h = mapa(x, `hito ${i}`);
    return {
      indice: Number(entero(h.indice, "indice")),
      estado: variante(h.estado, "estado"),
      evidencia_hash: hexONull(h.evidencia_hash, "evidencia_hash"),
      motivo_objecion_hash: hexONull(h.motivo_objecion_hash, "motivo_objecion_hash"),
      aprobo_inspector: Boolean(h.aprobo_inspector),
      aprobo_veedor: Boolean(h.aprobo_veedor),
    };
  });
}

/**
 * Lee la obra del contrato. `origen` es cualquier cuenta existente: la simulación la necesita para
 * armar la transacción, pero no se firma ni se envía nada.
 */
export async function leerObraDeLaCadena(
  red: Red,
  contratoId: string,
  obraId: number,
  origen: string,
): Promise<LecturaCadena> {
  const args = [nativeToScVal(obraId, { type: "u32" })];
  const [obra, hitos] = await Promise.all([
    leer(red, { contratoId, funcion: "ver_obra", args, origen }),
    leer(red, { contratoId, funcion: "ver_hitos", args, origen }),
  ]);
  return { obra: decodificarObraCadena(obra), hitos: decodificarHitosCadena(hitos) };
}

export interface FilaComparacion {
  clave: string;
  etiqueta: string;
  /** Lo que muestra esta página (backend). */
  mostrado: string;
  /** Lo que dice el contrato. */
  enCadena: string;
  coincide: boolean;
}

const abreviar = (hash: string | null) => (hash ? `${hash.slice(0, 4)}…${hash.slice(-4)}` : "sin huella");

/** Compara campo por campo lo que muestra la página con lo que devolvió el contrato. */
export function compararConCadena(obra: Obra, hitos: readonly Hito[], cadena: LecturaCadena): FilaComparacion[] {
  const filas: FilaComparacion[] = [
    {
      clave: "monto_vigente",
      etiqueta: "Presupuesto vigente",
      mostrado: formatearMonto(obra.monto_vigente, true),
      enCadena: formatearMonto(cadena.obra.monto_vigente, true),
      coincide: obra.monto_vigente === cadena.obra.monto_vigente,
    },
    {
      clave: "fondeado",
      etiqueta: "Total depositado",
      mostrado: formatearMonto(obra.fondeado, true),
      enCadena: formatearMonto(cadena.obra.fondeado, true),
      coincide: obra.fondeado === cadena.obra.fondeado,
    },
    {
      clave: "pagado",
      etiqueta: "Total pagado",
      mostrado: formatearMonto(obra.pagado, true),
      enCadena: formatearMonto(cadena.obra.pagado, true),
      coincide: obra.pagado === cadena.obra.pagado,
    },
  ];
  for (const h of [...hitos].sort((a, b) => a.indice - b.indice)) {
    const c = cadena.hitos.find((x) => x.indice === h.indice);
    const n = h.indice + 1;
    filas.push({
      clave: `estado-${h.indice}`,
      etiqueta: `Estado del hito ${n}`,
      mostrado: h.estado,
      enCadena: c?.estado ?? "no existe",
      coincide: c?.estado === h.estado,
    });
    if (h.evidencia_hash !== null || (c && c.evidencia_hash !== null)) {
      filas.push({
        clave: `evidencia-${h.indice}`,
        etiqueta: `Huella de la evidencia del hito ${n}`,
        mostrado: abreviar(h.evidencia_hash),
        enCadena: abreviar(c?.evidencia_hash ?? null),
        coincide: c?.evidencia_hash === h.evidencia_hash,
      });
    }
    if (h.motivo_objecion_hash !== null || (c && c.motivo_objecion_hash !== null)) {
      filas.push({
        clave: `motivo-${h.indice}`,
        etiqueta: `Huella del motivo de objeción del hito ${n}`,
        mostrado: abreviar(h.motivo_objecion_hash),
        enCadena: abreviar(c?.motivo_objecion_hash ?? null),
        coincide: c?.motivo_objecion_hash === h.motivo_objecion_hash,
      });
    }
  }
  return filas;
}

/** Hash de la evidencia (o del motivo) de un hito según el contrato, para el verificador de archivos. */
export function hashEnCadena(cadena: LecturaCadena, indice: number, tipo: "evidencia" | "motivo"): string | null {
  const h = cadena.hitos.find((x) => x.indice === indice);
  if (!h) return null;
  return tipo === "evidencia" ? h.evidencia_hash : h.motivo_objecion_hash;
}
