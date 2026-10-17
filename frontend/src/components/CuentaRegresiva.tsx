"use client";

import { formatearFechaHora, formatearReloj } from "@/lib/tiempo";
import { useAhora } from "@/lib/useAhora";
import { Icono } from "./ui/Icono";
import { Insignia } from "./ui/Insignia";

/** Últimos minutos: la cuenta pasa a ámbar. */
const UMBRAL_ALERTA_MS = 5 * 60 * 1000;

/**
 * Cuenta regresiva del período de objeción, ventana semiabierta [declaración, fin): se objeta si
 * ahora < fin. `variante`: "chip" (en línea), "grande" (bloque destacado) o "texto".
 * `ahora` permite pasar la hora del ledger; si no, usa el reloj del navegador.
 */
export function CuentaRegresiva({
  fin,
  variante = "chip",
  titulo = "Te queda para objetar",
  ahora: ahoraExterno,
}: {
  fin: string | number;
  variante?: "chip" | "grande" | "texto";
  titulo?: string;
  ahora?: number | null;
}) {
  const navegador = useAhora(1000);
  const ahora = ahoraExterno ?? navegador;
  const finMs = typeof fin === "number" ? fin : Date.parse(fin);
  const momentoFin = formatearFechaHora(finMs);

  if (ahora === null) {
    return <span className="chico suave">Termina el {momentoFin}</span>;
  }
  const restante = finMs - ahora;
  if (restante <= 0) {
    return variante === "texto" ? (
      <span>Terminó el {momentoFin}</span>
    ) : (
      <span className="fila" style={{ gap: 8 }}>
        <Insignia tono="ap" icono="check">
          Período terminado
        </Insignia>
        <span className="chico suave">Terminó el {momentoFin}</span>
      </span>
    );
  }
  const alerta = restante <= UMBRAL_ALERTA_MS;
  const reloj = formatearReloj(restante);

  if (variante === "grande") {
    return (
      <div className={`reloj${alerta ? " reloj--alerta" : ""}`}>
        <span className="etiqueta" style={{ color: "inherit" }}>
          {titulo}
        </span>
        <span className="con-icono" style={{ gap: 12 }}>
          <Icono nombre="reloj" tamano={30} />
          <span className="reloj__cifra" role="timer" aria-live="off">
            {reloj}
          </span>
        </span>
        <span className="chico">Termina el {momentoFin}</span>
      </div>
    );
  }
  if (variante === "texto") {
    return (
      <span>
        <strong role="timer" aria-live="off">
          Quedan {reloj}
        </strong>{" "}
        (termina el {momentoFin})
      </span>
    );
  }
  return (
    <span className="fila" style={{ gap: 8 }}>
      <span className={`cuenta${alerta ? " cuenta--alerta" : ""}`}>
        <Icono nombre="reloj" tamano={16} />
        <span role="timer" aria-live="off">
          {reloj}
        </span>
      </span>
      <span className="chico suave">Termina el {momentoFin}</span>
    </span>
  );
}
