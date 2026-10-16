"use client";

import { formatearDuracion, formatearMomento } from "@/lib/tiempo";
import { useAhora } from "@/lib/useAhora";

/** Cuenta regresiva del período de objeción: [declaración, fin). Se objeta si ahora < fin. */
export function CuentaRegresiva({ fin }: { fin: string }) {
  const ahora = useAhora(1000);
  const finMs = Date.parse(fin);
  const momentoFin = formatearMomento(fin);

  if (ahora === null) {
    return <span>Termina el {momentoFin}</span>;
  }
  const restante = finMs - ahora;
  if (restante <= 0) {
    return (
      <span>
        <span className="marca-si">Cumplido</span> el {momentoFin}
      </span>
    );
  }
  return (
    <span>
      <strong role="timer" aria-live="off">
        Quedan {formatearDuracion(restante)}
      </strong>{" "}
      (termina el {momentoFin})
    </span>
  );
}
