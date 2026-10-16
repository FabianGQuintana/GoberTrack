import { StrKey } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import { TOKEN, TOKEN_NO_OFICIAL } from "@/lib/api/mock/cuentas";
import { tokenOficial, verificarToken } from "@/lib/token";

const SAC = StrKey.encodeContract(new Uint8Array(32).fill(3));
const OTRO = StrKey.encodeContract(new Uint8Array(32).fill(4));

describe("verificarToken", () => {
  it("el mismo token → oficial", () => {
    expect(verificarToken(SAC, SAC)).toEqual({ estado: "oficial", oficial: SAC });
  });

  it("otro token → no-oficial", () => {
    expect(verificarToken(OTRO, SAC)).toEqual({ estado: "no-oficial", oficial: SAC });
  });

  it("sin token oficial configurado → sin-verificar", () => {
    expect(verificarToken(SAC, null)).toEqual({ estado: "sin-verificar", oficial: null });
    expect(verificarToken(SAC, "")).toEqual({ estado: "sin-verificar", oficial: null });
  });

  it("distingue mayúsculas: no normaliza", () => {
    expect(verificarToken(SAC.toLowerCase(), SAC).estado).toBe("no-oficial");
  });
});

describe("tokenOficial", () => {
  it("en mock es el token del escenario, sin importar lo configurado", () => {
    expect(tokenOficial("mock", SAC)).toBe(TOKEN);
    expect(tokenOficial("mock", null)).toBe(TOKEN);
    expect(TOKEN_NO_OFICIAL).not.toBe(TOKEN);
  });

  it("en api es el SAC configurado, o null si falta", () => {
    expect(tokenOficial("api", SAC)).toBe(SAC);
    expect(tokenOficial("api", null)).toBeNull();
  });
});
