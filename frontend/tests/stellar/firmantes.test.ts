// @vitest-environment node
import { Account, BASE_FEE, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import { firmanteKeypair } from "@/lib/stellar/firmantes";
import { PASSPHRASE } from "../helpers/rpc-simulado";

function sinFirmar(origen: Keypair) {
  return new TransactionBuilder(new Account(origen.publicKey(), "10"), { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(Operation.bumpSequence({ bumpTo: "100" }))
    .setTimeout(60)
    .build();
}

describe("firmanteKeypair", () => {
  it("devuelve el XDR con una firma válida de esa clave sobre el hash de la tx", async () => {
    const par = Keypair.random();
    const tx = sinFirmar(par);
    const firmado = await firmanteKeypair(par, PASSPHRASE)(tx.toXDR());

    const resultado = TransactionBuilder.fromXDR(firmado, PASSPHRASE);
    expect(resultado.signatures).toHaveLength(1);
    expect(Buffer.from(resultado.hash()).equals(Buffer.from(tx.hash()))).toBe(true);
    const firma = resultado.signatures[0];
    expect(par.verify(tx.hash(), firma.signature)).toBe(true);
  });

  it("la firma de otra clave no verifica", async () => {
    const par = Keypair.random();
    const tx = sinFirmar(par);
    const firmado = TransactionBuilder.fromXDR(await firmanteKeypair(par, PASSPHRASE)(tx.toXDR()), PASSPHRASE);
    expect(Keypair.random().verify(tx.hash(), firmado.signatures[0].signature)).toBe(false);
  });

  it("no modifica la transacción original ni acumula firmas entre llamadas", async () => {
    const par = Keypair.random();
    const xdrSinFirmar = sinFirmar(par).toXDR();
    const firmar = firmanteKeypair(par, PASSPHRASE);
    const a = await firmar(xdrSinFirmar);
    const b = await firmar(xdrSinFirmar);
    expect(a).toBe(b);
    expect(TransactionBuilder.fromXDR(xdrSinFirmar, PASSPHRASE).signatures).toHaveLength(0);
  });

  it("con otra passphrase la firma no sirve para el hash de la red de la tx", async () => {
    const par = Keypair.random();
    const tx = sinFirmar(par);
    const firmado = TransactionBuilder.fromXDR(
      await firmanteKeypair(par, "Otra red ; 2026")(tx.toXDR()),
      "Otra red ; 2026",
    );
    expect(par.verify(tx.hash(), firmado.signatures[0].signature)).toBe(false);
  });

  it("XDR inválido → lanza", async () => {
    await expect(firmanteKeypair(Keypair.random(), PASSPHRASE)("no-es-xdr")).rejects.toThrow();
  });
});
