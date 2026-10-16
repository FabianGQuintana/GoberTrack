import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MARGENES, useRelojLedger } from "@/lib/stellar/useRelojLedger";
import type { Red, ServidorRpc } from "@/lib/stellar/transacciones";

const AHORA_NAVEGADOR = Date.parse("2026-10-16T12:00:00Z");
const CIERRE_LEDGER_S = Math.floor(AHORA_NAVEGADOR / 1000) - 42; // el ledger va 42 s atrás del navegador

function redCon(getLatestLedger?: ServidorRpc["getLatestLedger"]): Red {
  return {
    rpcUrl: "http://rpc.invalido",
    passphrase: "Test SDF Network ; September 2015",
    servidor: { getLatestLedger } as unknown as ServidorRpc,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AHORA_NAVEGADOR);
});
afterEach(() => vi.useRealTimers());

/** Monta el hook y deja correr las promesas pendientes del primer efecto. */
async function montar(red: Red | null) {
  const hook = renderHook(({ r }) => useRelojLedger(r), { initialProps: { r: red } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return hook;
}

describe("useRelojLedger", () => {
  it("con un RPC que responde: fuente ledger y ahora = closeTime * 1000", async () => {
    const getLatestLedger = vi.fn(async () => ({ sequence: 777, closeTime: String(CIERRE_LEDGER_S) }));
    const { result } = await montar(redCon(getLatestLedger));
    expect(result.current).toEqual({ ahora: CIERRE_LEDGER_S * 1000, fuente: "ledger", secuencia: 777 });
    expect(getLatestLedger).toHaveBeenCalledTimes(1);
  });

  it("vuelve a consultar cada 5 s y toma la hora nueva", async () => {
    let cierre = CIERRE_LEDGER_S;
    const getLatestLedger = vi.fn(async () => ({ sequence: cierre, closeTime: String(cierre) }));
    const { result } = await montar(redCon(getLatestLedger));
    cierre += 5;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(getLatestLedger).toHaveBeenCalledTimes(2);
    expect(result.current.ahora).toBe(cierre * 1000);
    expect(result.current.secuencia).toBe(cierre);
  });

  it("si el RPC falla → fuente navegador con la hora del navegador", async () => {
    const getLatestLedger = vi.fn(async () => {
      throw new Error("sin red");
    });
    const { result } = await montar(redCon(getLatestLedger));
    expect(result.current.fuente).toBe("navegador");
    expect(result.current.ahora).toBe(AHORA_NAVEGADOR);
    expect(result.current.secuencia).toBeUndefined();
  });

  it("si el RPC no expone getLatestLedger → navegador", async () => {
    const { result } = await montar(redCon(undefined));
    expect(result.current).toEqual({ ahora: AHORA_NAVEGADOR, fuente: "navegador" });
  });

  it("si el RPC falla después de haber andado, vuelve al navegador", async () => {
    let falla = false;
    const getLatestLedger = vi.fn(async () => {
      if (falla) throw new Error("caído");
      return { sequence: 1, closeTime: String(CIERRE_LEDGER_S) };
    });
    const { result } = await montar(redCon(getLatestLedger));
    expect(result.current.fuente).toBe("ledger");
    falla = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.fuente).toBe("navegador");
  });

  it("con red null → navegador y no consulta nada", async () => {
    const { result } = await montar(null);
    expect(result.current).toEqual({ ahora: AHORA_NAVEGADOR, fuente: "navegador" });
  });

  it("el reloj del navegador avanza cada segundo", async () => {
    const { result } = await montar(null);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current.ahora).toBe(AHORA_NAVEGADOR + 3000);
  });

  it("al desmontar deja de consultar", async () => {
    const getLatestLedger = vi.fn(async () => ({ sequence: 1, closeTime: String(CIERRE_LEDGER_S) }));
    const { unmount } = await montar(redCon(getLatestLedger));
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(getLatestLedger).toHaveBeenCalledTimes(1);
  });
});

describe("MARGENES", () => {
  it("ledger: un ledger para objetar y ninguno para pagar; navegador: 10 s para ambos", () => {
    expect(MARGENES.ledger).toEqual({ margenObjecionMs: 5000, margenPagoMs: 0 });
    expect(MARGENES.navegador).toEqual({ margenObjecionMs: 10_000, margenPagoMs: 10_000 });
  });
});
