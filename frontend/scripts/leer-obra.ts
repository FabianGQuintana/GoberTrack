// Lectura de una obra del contrato por simulación (no firma ni envía nada).
// Uso: npx tsx --env-file=.env.testnet scripts/leer-obra.ts <obra> <direccion-origen>
// La dirección origen es cualquier cuenta existente en testnet (la simulación la necesita).

import { nativeToScVal } from "@stellar/stellar-sdk/base";
import { leerConfigRed } from "@/lib/stellar/config";
import { leer } from "@/lib/stellar/transacciones";

async function main() {
  const lectura = leerConfigRed();
  if (!lectura.ok) throw new Error(lectura.problemas.join("\n"));
  const { config } = lectura;
  const [obraTexto = "1", origen] = process.argv.slice(2);
  if (!origen) throw new Error("Falta la dirección origen (G…).");

  const red = { rpcUrl: config.rpcUrl, passphrase: config.passphrase };
  const obra = nativeToScVal(Number(obraTexto), { type: "u32" });
  const comun = { contratoId: config.contratoId, origen };
  const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));

  console.log("cantidad_obras:", await leer(red, { ...comun, funcion: "cantidad_obras", args: [] }));
  console.log("ver_obra:", json(await leer(red, { ...comun, funcion: "ver_obra", args: [obra] })));
  console.log("ver_hitos:", json(await leer(red, { ...comun, funcion: "ver_hitos", args: [obra] })));
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
