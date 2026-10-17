"use client";

import type { Hito, Obra } from "@/lib/api/tipos";
import { aUnidades } from "@/lib/montos";
import { finPeriodo } from "@/lib/reglas";
import { formatearFechaHora } from "@/lib/tiempo";
import { useAhora } from "@/lib/useAhora";

/**
 * Margen sobre el reloj del navegador para decir "listo para liberar": el navegador puede ir unos
 * segundos adelante del ledger, y el contrato compara con la hora del ledger.
 */
export const MARGEN_RELOJ_MS = 10_000;

/** Situación del pago de un hito; se recalcula sola cuando vence el período (sin recargar). */
export function EstadoPago({ hito, obra }: { hito: Hito; obra: Pick<Obra, "saldo" | "periodo_objecion_seg"> }) {
  const ahora = useAhora(1000);

  if (hito.estado === "Pagado") {
    return <>{hito.momento_pago ? `Pagado el ${formatearFechaHora(hito.momento_pago)}` : "Pagado"}</>;
  }
  if (hito.estado === "Objetado") {
    return <span className="marca-alerta">Congelado por la objeción hasta que resuelva el árbitro</span>;
  }
  if (hito.estado !== "Aprobado") {
    return <span className="suave">Requiere las dos aprobaciones y el período cumplido</span>;
  }
  if (aUnidades(obra.saldo) < aUnidades(hito.monto_vigente)) {
    return <>Aprobado, pero el saldo bloqueado no alcanza: falta fondear</>;
  }
  const fin = finPeriodo(hito, obra);
  const cumplido = hito.pagable || (ahora !== null && fin !== null && ahora - MARGEN_RELOJ_MS >= fin);
  return cumplido ? (
    <span className="marca-ok" style={{ fontWeight: 600 }}>Listo para liberar el pago (período cumplido y saldo suficiente)</span>
  ) : (
    <>Aprobado: el pago se puede liberar cuando termine el período de objeción</>
  );
}
