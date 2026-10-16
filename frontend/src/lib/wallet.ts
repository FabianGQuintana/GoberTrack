// Conexión y firma con Freighter (@stellar/freighter-api 6.x). Solo se usa en el navegador: el
// paquete se importa de forma diferida dentro de cada función, nunca al cargar el módulo.
// API verificada contra los tipos del paquete: isConnected(), getAddress(), requestAccess(),
// getNetwork() y signTransaction(xdr, { networkPassphrase, address }) devuelven un objeto con los
// datos y un `error?: { code, message }`.

import { Networks } from "@stellar/stellar-sdk/base";
import { leerConfigRed } from "./stellar/config";
import type { Firmar } from "./stellar/transacciones";

export type EstadoWallet =
  | { estado: "desconectada" }
  | { estado: "conectando" }
  | { estado: "sin-freighter" }
  | { estado: "error"; mensaje: string }
  | {
      estado: "conectada";
      direccion: string;
      /** Nombre de la red según Freighter, p. ej. "TESTNET" o "PUBLIC". */
      red: string;
      /** Freighter está en la red de la demo (misma passphrase que la configurada). */
      esTestnet: boolean;
    };

/** Passphrase esperada: la configurada en NEXT_PUBLIC_NETWORK_PASSPHRASE o, si falta, la de testnet. */
function passphraseEsperada(): string {
  const lectura = leerConfigRed();
  return lectura.ok ? lectura.config.passphrase : Networks.TESTNET;
}

export function esTestnet(red: { network: string; networkPassphrase: string }): boolean {
  return red.networkPassphrase === passphraseEsperada();
}

export async function conectarFreighter(): Promise<EstadoWallet> {
  try {
    const freighter = await import("@stellar/freighter-api");

    const conexion = await freighter.isConnected();
    if (conexion.error || !conexion.isConnected) return { estado: "sin-freighter" };

    // getAddress devuelve "" si el sitio todavía no tiene permiso; requestAccess abre el pedido.
    let { address, error } = await freighter.getAddress();
    if (!error && !address) ({ address, error } = await freighter.requestAccess());
    if (error) return { estado: "error", mensaje: error.message || "Freighter rechazó el pedido." };
    if (!address) return { estado: "error", mensaje: "Freighter no devolvió ninguna dirección." };

    const red = await freighter.getNetwork();
    if (red.error) return { estado: "error", mensaje: red.error.message || "No se pudo leer la red." };

    return { estado: "conectada", direccion: address, red: red.network, esTestnet: esTestnet(red) };
  } catch (e) {
    return {
      estado: "error",
      mensaje: e instanceof Error ? e.message : "No se pudo conectar con Freighter.",
    };
  }
}

/** Error de la firma en Freighter (rechazo del usuario, cuenta distinta, extensión cerrada). */
export class ErrorFirmaFreighter extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorFirmaFreighter";
  }
}

/**
 * Firmante del módulo de transacciones que pide la firma a Freighter, para `direccion` y con la
 * passphrase de la red configurada.
 */
export function firmanteFreighter(direccion: string, passphrase: string): Firmar {
  return async (xdrSinFirmar) => {
    const freighter = await import("@stellar/freighter-api");
    const respuesta = await freighter.signTransaction(xdrSinFirmar, {
      networkPassphrase: passphrase,
      address: direccion,
    });
    if (respuesta.error) {
      throw new ErrorFirmaFreighter(respuesta.error.message || "Freighter no firmó la transacción.");
    }
    if (respuesta.signerAddress && respuesta.signerAddress !== direccion) {
      throw new ErrorFirmaFreighter(
        `Freighter firmó con otra cuenta (${respuesta.signerAddress}); cambiá a ${direccion} y reintentá.`,
      );
    }
    return respuesta.signedTxXdr;
  };
}
