import type { Hito } from "@/lib/api/tipos";
import { Icono } from "../ui/Icono";
import { iconoDeEstado, tonoDeEstado } from "../ui/Insignia";

/** Stepper de hitos: horizontal en escritorio, vertical en el celular (la línea queda a la izquierda). */
export function PasosHitos({ hitos }: { hitos: readonly Hito[] }) {
  const ordenados = [...hitos].sort((a, b) => a.indice - b.indice);
  return (
    <ol className="pasos lista-limpia" style={{ ["--cantidad" as string]: ordenados.length }} aria-label="Avance de los hitos">
      {ordenados.map((h, i) => {
        const tono = tonoDeEstado(h.estado);
        const ultimo = i === ordenados.length - 1;
        const conIcono = h.estado !== "Pendiente";
        return (
          <li key={h.indice} className="pasos__item">
            <div className="pasos__marca" aria-hidden="true">
              <span className={`pasos__punto punto--${tono}`}>
                {conIcono ? <Icono nombre={iconoDeEstado(h.estado)} /> : h.indice + 1}
              </span>
              {!ultimo && <span className={`pasos__linea${h.estado === "Pagado" ? " pasos__linea--hecha" : ""}`} />}
            </div>
            <div className="pasos__texto chico">
              <b>Hito {h.indice + 1}</b>
              <div className="suave">{h.estado}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
