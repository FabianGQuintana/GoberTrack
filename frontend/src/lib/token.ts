// ¿La obra usa el token oficial de la demo? contract.md v1.1 §0: el contrato no verifica el token;
// con uno sin valor una obra queda "Pagada" sin que el contratista reciba nada. Por eso el tablero
// destaca las obras con otro token.

import type { ModoApi } from "./api/cliente";
import { TOKEN as TOKEN_MOCK } from "./api/mock/cuentas";
import { tokenSacConfigurado } from "./stellar/config";

export type EstadoToken = "oficial" | "no-oficial" | "sin-verificar";

export interface VerificacionToken {
  estado: EstadoToken;
  /** SAC oficial contra el que se comparó, o null si no está configurado. */
  oficial: string | null;
}

/**
 * Token oficial según el modo: en mock, el del escenario simulado; con la API real, el SAC de
 * NEXT_PUBLIC_TOKEN_SAC (o null si falta).
 */
export function tokenOficial(modo: ModoApi, configurado: string | null = tokenSacConfigurado()): string | null {
  return modo === "mock" ? TOKEN_MOCK : configurado;
}

export function verificarToken(token: string, oficial: string | null): VerificacionToken {
  if (!oficial) return { estado: "sin-verificar", oficial: null };
  return { estado: token === oficial ? "oficial" : "no-oficial", oficial };
}
