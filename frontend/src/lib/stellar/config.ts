// Configuración de la red Stellar, solo por variables de entorno (nada fijo en el código).
// Next reemplaza `process.env.NEXT_PUBLIC_*` al compilar únicamente si se escriben literales, por eso
// cada variable se lee por su nombre completo. En Node (scripts/) se leen en tiempo de ejecución.

import { Networks } from "@stellar/stellar-sdk/base";
import { StrKey } from "@stellar/stellar-sdk/base";

export interface ConfigRed {
  /** Id del contrato de GoberTrack (C…). */
  contratoId: string;
  /** URL del RPC de Soroban. */
  rpcUrl: string;
  /** Passphrase de la red (testnet). */
  passphrase: string;
  /** SAC oficial del token de la demo (C…): las obras con otro token se destacan en el tablero. */
  tokenSac: string;
}

export interface VariablesRed {
  NEXT_PUBLIC_CONTRATO_ID?: string;
  NEXT_PUBLIC_RPC_URL?: string;
  NEXT_PUBLIC_NETWORK_PASSPHRASE?: string;
  NEXT_PUBLIC_TOKEN_SAC?: string;
}

export const VARIABLES_DEL_ENTORNO: VariablesRed = {
  NEXT_PUBLIC_CONTRATO_ID: process.env.NEXT_PUBLIC_CONTRATO_ID,
  NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL,
  NEXT_PUBLIC_NETWORK_PASSPHRASE: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE,
  NEXT_PUBLIC_TOKEN_SAC: process.env.NEXT_PUBLIC_TOKEN_SAC,
};

export type LecturaConfig = { ok: true; config: ConfigRed } | { ok: false; problemas: string[] };

const limpio = (v: string | undefined) => v?.trim() ?? "";

/**
 * Valida la configuración. Sin ella el panel sigue funcionando, pero solo con la vista previa de
 * lo que se enviaría (como en la Fase 1).
 */
export function leerConfigRed(variables: VariablesRed = VARIABLES_DEL_ENTORNO): LecturaConfig {
  const problemas: string[] = [];
  const contratoId = limpio(variables.NEXT_PUBLIC_CONTRATO_ID);
  const rpcUrl = limpio(variables.NEXT_PUBLIC_RPC_URL);
  const passphrase = limpio(variables.NEXT_PUBLIC_NETWORK_PASSPHRASE);
  const tokenSac = limpio(variables.NEXT_PUBLIC_TOKEN_SAC);

  if (!StrKey.isValidContract(contratoId)) {
    problemas.push("NEXT_PUBLIC_CONTRATO_ID falta o no es un id de contrato (C…).");
  }
  if (!/^https?:\/\//.test(rpcUrl)) problemas.push("NEXT_PUBLIC_RPC_URL falta o no es una URL http(s).");
  if (!passphrase) problemas.push("NEXT_PUBLIC_NETWORK_PASSPHRASE falta.");
  // Revisión R3: la demo solo firma en testnet. Una passphrase de otra red (un .env copiado, un error
  // de tipeo) deja la configuración inválida, así el panel y el script nunca firman en mainnet.
  else if (!esPassphraseTestnet(passphrase)) {
    problemas.push("NEXT_PUBLIC_NETWORK_PASSPHRASE no es la de testnet: la demo solo firma en testnet.");
  }
  if (!StrKey.isValidContract(tokenSac)) {
    problemas.push("NEXT_PUBLIC_TOKEN_SAC falta o no es un id de contrato (C…).");
  }
  return problemas.length > 0
    ? { ok: false, problemas }
    : { ok: true, config: { contratoId, rpcUrl, passphrase, tokenSac } };
}

/**
 * Solo el SAC oficial, para el tablero: alcanza con NEXT_PUBLIC_TOKEN_SAC aunque falte el resto
 * de la configuración de red. null si falta o no es un id de contrato.
 */
export function tokenSacConfigurado(variables: VariablesRed = VARIABLES_DEL_ENTORNO): string | null {
  const token = limpio(variables.NEXT_PUBLIC_TOKEN_SAC);
  return StrKey.isValidContract(token) ? token : null;
}

/** Explorador de transacciones (opcional), p. ej. https://stellar.expert/explorer/testnet. */
export function urlTransaccion(hash: string, base = process.env.NEXT_PUBLIC_EXPLORADOR_URL): string | null {
  const raiz = limpio(base).replace(/\/+$/, "");
  return /^https?:\/\//.test(raiz) ? `${raiz}/tx/${hash}` : null;
}

/** La passphrase configurada es la de testnet (la demo solo corre en testnet). */
export function esPassphraseTestnet(passphrase: string): boolean {
  return passphrase === Networks.TESTNET;
}
