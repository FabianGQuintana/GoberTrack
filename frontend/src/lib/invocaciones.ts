// Lo que se enviaría al contrato: función, argumentos con su tipo Soroban y quién firma.
// En la Fase 1 el panel solo lo muestra; en la Fase 3 se arma la transacción con el SDK a partir de esto.

import type { Obra } from "./api/tipos";
import type { Accion } from "./reglas";
import type { Rol } from "./roles";

export type Decision = "Aceptar" | "Rechazar";

export interface Argumento {
  nombre: string;
  /** Tipo en la firma del contrato (contract.md §3). */
  tipo: string;
  valor: string;
}

export interface Invocacion {
  funcion: Accion | "crear_obra";
  argumentos: Argumento[];
  /** Quién tiene que firmar con `require_auth()`; null en `liberar_pago` (sin firma de rol). */
  firma: { rol: Rol; direccion: string } | null;
}

export type ParametrosInvocacion =
  | { accion: "fondear"; monto: bigint }
  | { accion: "declarar_hito"; hito: number; evidenciaHash: string }
  | { accion: "aprobar"; hito: number; firmante: string; rolFirmante: "inspector" | "veedor" }
  | { accion: "objetar"; hito: number; motivoHash: string }
  | { accion: "resolver_objecion"; hito: number; decision: Decision }
  | { accion: "liberar_pago"; hito: number };

/** Lo que hace falta de la obra: su id y las direcciones de los roles que firman. */
export type ObraInvocable = Pick<Obra, "id" | "municipio" | "contratista" | "veedor" | "arbitro">;

/** Datos de `crear_obra` (contract.md §3.1). Montos en unidades mínimas; período en segundos. */
export interface DatosNuevaObra {
  municipio: string;
  nombre: string;
  contratista: string;
  inspector: string;
  veedor: string;
  arbitro: string;
  token: string;
  hitos: { descripcion: string; monto: bigint }[];
  periodoObjecion: number;
}

/** `crear_obra(...)`: firma el municipio. Los hitos van como JSON (montos en string, sin pasar por Number). */
export function construirCrearObra(d: DatosNuevaObra): Invocacion {
  return {
    funcion: "crear_obra",
    argumentos: [
      { nombre: "municipio", tipo: "Address", valor: d.municipio },
      { nombre: "nombre", tipo: "String", valor: d.nombre },
      { nombre: "contratista", tipo: "Address", valor: d.contratista },
      { nombre: "inspector", tipo: "Address", valor: d.inspector },
      { nombre: "veedor", tipo: "Address", valor: d.veedor },
      { nombre: "arbitro", tipo: "Address", valor: d.arbitro },
      { nombre: "token", tipo: "Address", valor: d.token },
      {
        nombre: "hitos",
        tipo: "Vec<NuevoHito>",
        valor: JSON.stringify(d.hitos.map((h) => ({ descripcion: h.descripcion, monto: h.monto.toString() }))),
      },
      { nombre: "periodo_objecion", tipo: "u64", valor: String(d.periodoObjecion) },
    ],
    firma: { rol: "municipio", direccion: d.municipio },
  };
}

const argObra = (obra: ObraInvocable): Argumento => ({ nombre: "obra", tipo: "u32", valor: String(obra.id) });
const argHito = (hito: number): Argumento => ({ nombre: "hito", tipo: "u32", valor: String(hito) });

export function construirInvocacion(obra: ObraInvocable, p: ParametrosInvocacion): Invocacion {
  switch (p.accion) {
    case "fondear":
      return {
        funcion: "fondear",
        argumentos: [argObra(obra), { nombre: "monto", tipo: "i128", valor: p.monto.toString() }],
        firma: { rol: "municipio", direccion: obra.municipio },
      };
    case "declarar_hito":
      return {
        funcion: "declarar_hito",
        argumentos: [
          argObra(obra),
          argHito(p.hito),
          { nombre: "evidencia_hash", tipo: "BytesN<32>", valor: p.evidenciaHash },
        ],
        firma: { rol: "contratista", direccion: obra.contratista },
      };
    case "aprobar":
      return {
        funcion: "aprobar",
        argumentos: [
          argObra(obra),
          argHito(p.hito),
          { nombre: "firmante", tipo: "Address", valor: p.firmante },
        ],
        firma: { rol: p.rolFirmante, direccion: p.firmante },
      };
    case "objetar":
      return {
        funcion: "objetar",
        argumentos: [
          argObra(obra),
          argHito(p.hito),
          { nombre: "motivo_hash", tipo: "BytesN<32>", valor: p.motivoHash },
        ],
        firma: { rol: "veedor", direccion: obra.veedor },
      };
    case "resolver_objecion":
      return {
        funcion: "resolver_objecion",
        argumentos: [
          argObra(obra),
          argHito(p.hito),
          { nombre: "decision", tipo: "Decision", valor: p.decision },
        ],
        firma: { rol: "arbitro", direccion: obra.arbitro },
      };
    case "liberar_pago":
      return {
        funcion: "liberar_pago",
        argumentos: [argObra(obra), argHito(p.hito)],
        firma: null,
      };
  }
}
