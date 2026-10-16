// Saldo de una cuenta en el SAC oficial (lectura por simulación, no firma nada).
// Uso: npx tsx --env-file=.env.testnet scripts/saldo.ts <G…>

import { Address } from "@stellar/stellar-sdk/base";
import { formatearMonto } from "@/lib/montos";
import { leerConfigRed } from "@/lib/stellar/config";
import { leer } from "@/lib/stellar/transacciones";

async function main() {
  const lectura = leerConfigRed();
  if (!lectura.ok) throw new Error(lectura.problemas.join("\n"));
  const { config } = lectura;
  const [direccion] = process.argv.slice(2);
  if (!direccion) throw new Error("Falta la dirección (G…).");
  const saldo = (await leer(
    { rpcUrl: config.rpcUrl, passphrase: config.passphrase },
    { contratoId: config.tokenSac, funcion: "balance", args: [new Address(direccion).toScVal()], origen: direccion },
  )) as bigint;
  console.log(`${direccion}: ${formatearMonto(saldo)} (${saldo} unidades mínimas)`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
