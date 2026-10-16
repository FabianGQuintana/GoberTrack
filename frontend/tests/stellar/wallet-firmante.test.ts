// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorFirmaFreighter, firmanteFreighter } from "@/lib/wallet";

const freighter = vi.hoisted(() => ({ signTransaction: vi.fn() }));
vi.mock("@stellar/freighter-api", () => freighter);

const DIRECCION = "GCONTRATISTA";
const PASSPHRASE = "Test SDF Network ; September 2015";

beforeEach(() => freighter.signTransaction.mockReset());

describe("firmanteFreighter", () => {
  it("pasa el XDR, networkPassphrase y address, y devuelve signedTxXdr", async () => {
    freighter.signTransaction.mockResolvedValue({ signedTxXdr: "FIRMADO", signerAddress: DIRECCION });
    await expect(firmanteFreighter(DIRECCION, PASSPHRASE)("SINFIRMAR")).resolves.toBe("FIRMADO");
    expect(freighter.signTransaction).toHaveBeenCalledWith("SINFIRMAR", {
      networkPassphrase: PASSPHRASE,
      address: DIRECCION,
    });
  });

  it("sin signerAddress en la respuesta también devuelve signedTxXdr", async () => {
    freighter.signTransaction.mockResolvedValue({ signedTxXdr: "FIRMADO" });
    await expect(firmanteFreighter(DIRECCION, PASSPHRASE)("X")).resolves.toBe("FIRMADO");
  });

  it("error de Freighter → ErrorFirmaFreighter con su mensaje", async () => {
    freighter.signTransaction.mockResolvedValue({ signedTxXdr: "", error: { code: -4, message: "User declined access" } });
    const promesa = firmanteFreighter(DIRECCION, PASSPHRASE)("X");
    await expect(promesa).rejects.toBeInstanceOf(ErrorFirmaFreighter);
    await expect(promesa).rejects.toThrow("User declined access");
  });

  it("error sin mensaje → mensaje genérico", async () => {
    freighter.signTransaction.mockResolvedValue({ signedTxXdr: "", error: { code: -1, message: "" } });
    await expect(firmanteFreighter(DIRECCION, PASSPHRASE)("X")).rejects.toThrow(/no firmó/);
  });

  it("signerAddress de otra cuenta → error que nombra ambas cuentas", async () => {
    freighter.signTransaction.mockResolvedValue({ signedTxXdr: "FIRMADO", signerAddress: "GOTRA" });
    const promesa = firmanteFreighter(DIRECCION, PASSPHRASE)("X");
    await expect(promesa).rejects.toBeInstanceOf(ErrorFirmaFreighter);
    await expect(promesa).rejects.toThrow(/GOTRA.*GCONTRATISTA/);
  });

  it("el error es un Error con nombre ErrorFirmaFreighter", () => {
    const e = new ErrorFirmaFreighter("x");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("ErrorFirmaFreighter");
  });
});
