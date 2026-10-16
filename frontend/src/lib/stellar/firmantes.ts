// Firmante con un Keypair, para el script de la demo y las pruebas. En el navegador se usa el de
// Freighter (lib/wallet.ts). Los dos cumplen la misma interfaz `Firmar`.

import { TransactionBuilder, type Keypair } from "@stellar/stellar-sdk/base";
import type { Firmar } from "./transacciones";

export function firmanteKeypair(par: Keypair, passphrase: string): Firmar {
  return async (xdrSinFirmar) => {
    const tx = TransactionBuilder.fromXDR(xdrSinFirmar, passphrase);
    tx.sign(par);
    return tx.toXDR();
  };
}
