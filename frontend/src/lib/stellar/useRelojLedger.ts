"use client";

import { useEffect, useState } from "react";
import { useAhora } from "../useAhora";
import { horaDelUltimoLedger, type Red } from "./transacciones";

/** Cada cuánto se consulta el último ledger (≈ un ledger). */
const INTERVALO_MS = 5000;

/**
 * Márgenes para las reglas del panel según de dónde sale la hora:
 * - ledger: la simulación usa esa misma hora, así que el pago no necesita margen; para objetar se
 *   deja un ledger (≈5 s), porque la transacción entra en un ledger posterior.
 * - navegador: el reloj puede ir adelantado o atrasado; se dejan ~10 s en los dos sentidos.
 */
export const MARGENES = {
  ledger: { margenObjecionMs: 5_000, margenPagoMs: 0 },
  navegador: { margenObjecionMs: 10_000, margenPagoMs: 10_000 },
} as const;

export interface RelojPanel {
  /** ms Unix, o null hasta que el componente se monta. */
  ahora: number | null;
  fuente: "ledger" | "navegador";
  /** Secuencia del último ledger conocido (solo con fuente "ledger"). */
  secuencia?: number;
}

/**
 * Hora para evaluar las reglas: la del último ledger del RPC si hay red configurada y responde; si
 * no, la del navegador. (Revisión F4: el reloj del navegador suele ir adelante del ledger.)
 */
export function useRelojLedger(red: Red | null): RelojPanel {
  const navegador = useAhora(1000);
  const [ledger, setLedger] = useState<{ ms: number; secuencia: number } | null>(null);
  const rpcUrl = red?.rpcUrl;
  const passphrase = red?.passphrase;
  const servidor = red?.servidor;

  useEffect(() => {
    if (!rpcUrl || !passphrase) {
      setLedger(null);
      return;
    }
    let vigente = true;
    const leer = async () => {
      try {
        const hora = await horaDelUltimoLedger({ rpcUrl, passphrase, servidor });
        if (vigente) setLedger(hora);
      } catch {
        if (vigente) setLedger(null);
      }
    };
    void leer();
    const id = setInterval(leer, INTERVALO_MS);
    return () => {
      vigente = false;
      clearInterval(id);
    };
  }, [rpcUrl, passphrase, servidor]);

  if (navegador === null) return { ahora: null, fuente: ledger ? "ledger" : "navegador" };
  return ledger ? { ahora: ledger.ms, fuente: "ledger", secuencia: ledger.secuencia } : { ahora: navegador, fuente: "navegador" };
}
