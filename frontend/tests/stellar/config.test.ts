// @vitest-environment node
import { Networks, StrKey } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import {
  esPassphraseTestnet,
  leerConfigRed,
  tokenSacConfigurado,
  urlTransaccion,
  type VariablesRed,
} from "@/lib/stellar/config";

const CONTRATO = StrKey.encodeContract(new Uint8Array(32).fill(1));
const SAC = StrKey.encodeContract(new Uint8Array(32).fill(2));
const COMPLETAS: VariablesRed = {
  NEXT_PUBLIC_CONTRATO_ID: CONTRATO,
  NEXT_PUBLIC_RPC_URL: "https://soroban-testnet.stellar.org",
  NEXT_PUBLIC_NETWORK_PASSPHRASE: Networks.TESTNET,
  NEXT_PUBLIC_TOKEN_SAC: SAC,
};

describe("leerConfigRed", () => {
  it("variables completas → ok", () => {
    expect(leerConfigRed(COMPLETAS)).toEqual({
      ok: true,
      config: {
        contratoId: CONTRATO,
        rpcUrl: "https://soroban-testnet.stellar.org",
        passphrase: Networks.TESTNET,
        tokenSac: SAC,
      },
    });
  });

  it.each([Networks.PUBLIC, Networks.FUTURENET, "Test SDF Network ; September 2016"])(
    "R3: passphrase que no es la de testnet (%s) → configuración inválida",
    (passphrase) => {
      const r = leerConfigRed({ ...COMPLETAS, NEXT_PUBLIC_NETWORK_PASSPHRASE: passphrase });
      expect(r).toEqual({
        ok: false,
        problemas: ["NEXT_PUBLIC_NETWORK_PASSPHRASE no es la de testnet: la demo solo firma en testnet."],
      });
    },
  );

  it("recorta espacios y acepta http://", () => {
    const r = leerConfigRed({
      ...COMPLETAS,
      NEXT_PUBLIC_RPC_URL: "  http://localhost:8000/rpc \n",
      NEXT_PUBLIC_NETWORK_PASSPHRASE: `  ${Networks.TESTNET} `,
    });
    expect(r).toMatchObject({ ok: true, config: { rpcUrl: "http://localhost:8000/rpc", passphrase: Networks.TESTNET } });
  });

  it.each(Object.keys(COMPLETAS) as (keyof VariablesRed)[])("%s faltante → un problema que la nombra", (variable) => {
    for (const falta of [undefined, "", "   "]) {
      const r = leerConfigRed({ ...COMPLETAS, [variable]: falta });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.problemas).toHaveLength(1);
        expect(r.problemas[0]).toContain(variable);
      }
    }
  });

  it.each([
    ["NEXT_PUBLIC_CONTRATO_ID", "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H"],
    ["NEXT_PUBLIC_CONTRATO_ID", "CABC"],
    ["NEXT_PUBLIC_TOKEN_SAC", "no-es-un-id"],
    ["NEXT_PUBLIC_RPC_URL", "soroban-testnet.stellar.org"],
    ["NEXT_PUBLIC_RPC_URL", "ftp://x"],
  ])("%s inválida (%s) → problema que la nombra", (variable, valor) => {
    const r = leerConfigRed({ ...COMPLETAS, [variable]: valor });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problemas.join(" ")).toContain(variable);
  });

  it("sin nada → los 4 problemas, uno por variable", () => {
    const r = leerConfigRed({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problemas).toHaveLength(4);
      for (const v of Object.keys(COMPLETAS)) expect(r.problemas.join(" ")).toContain(v);
    }
  });
});

describe("esPassphraseTestnet", () => {
  it("solo la passphrase de testnet", () => {
    expect(esPassphraseTestnet(Networks.TESTNET)).toBe(true);
    expect(esPassphraseTestnet(Networks.PUBLIC)).toBe(false);
    expect(esPassphraseTestnet("")).toBe(false);
  });
});

describe("tokenSacConfigurado", () => {
  it("devuelve el SAC aunque falte el resto de la configuración", () => {
    expect(tokenSacConfigurado({ NEXT_PUBLIC_TOKEN_SAC: SAC })).toBe(SAC);
    expect(tokenSacConfigurado({ NEXT_PUBLIC_TOKEN_SAC: `  ${SAC}\n` })).toBe(SAC);
  });

  it("null si falta o no es un id de contrato", () => {
    expect(tokenSacConfigurado({})).toBeNull();
    expect(tokenSacConfigurado({ NEXT_PUBLIC_TOKEN_SAC: "" })).toBeNull();
    expect(tokenSacConfigurado({ NEXT_PUBLIC_TOKEN_SAC: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H" })).toBeNull();
    expect(tokenSacConfigurado({ NEXT_PUBLIC_TOKEN_SAC: "C123" })).toBeNull();
  });
});

describe("urlTransaccion", () => {
  const HASH = "ab".repeat(32);

  it("arma <base>/tx/<hash> y quita barras finales", () => {
    expect(urlTransaccion(HASH, "https://stellar.expert/explorer/testnet")).toBe(
      `https://stellar.expert/explorer/testnet/tx/${HASH}`,
    );
    expect(urlTransaccion(HASH, " https://stellar.expert/explorer/testnet// ")).toBe(
      `https://stellar.expert/explorer/testnet/tx/${HASH}`,
    );
  });

  it("null sin base o con una base que no es http(s)", () => {
    expect(urlTransaccion(HASH, undefined)).toBeNull();
    expect(urlTransaccion(HASH, "")).toBeNull();
    expect(urlTransaccion(HASH, "stellar.expert")).toBeNull();
    expect(urlTransaccion(HASH, "javascript:alert(1)")).toBeNull();
  });
});
