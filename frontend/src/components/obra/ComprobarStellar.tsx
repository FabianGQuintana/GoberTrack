"use client";

import type { Hito, Obra } from "@/lib/api/tipos";
import { formatearFechaHora } from "@/lib/tiempo";
import { compararConCadena } from "@/lib/verificacion";
import { Icono } from "../ui/Icono";
import { Insignia } from "../ui/Insignia";
import { motivoSinRed, useLecturaCadena } from "./useLecturaCadena";

/**
 * "Comprobá los datos vos mismo": el navegador le pregunta directo al contrato en la red pública de
 * Stellar y compara campo por campo con lo que muestra esta página (que viene de nuestro backend).
 * Si la red no responde, se dice: nunca se muestra un ✓ sin haber leído la red.
 */
export function ComprobarStellar({ obra, hitos }: { obra: Obra; hitos: Hito[] }) {
  const { estado, leer } = useLecturaCadena(obra);
  const sinRed = motivoSinRed();
  const filas = estado.tipo === "lista" ? compararConCadena(obra, hitos, estado.lectura) : [];
  const coinciden = filas.filter((f) => f.coincide).length;

  return (
    <section className="tarjeta tarjeta--grande pila" aria-labelledby="titulo-comprobar" style={{ gap: 16 }}>
      <div className="pila pila--chica">
        <h2 id="titulo-comprobar">Comprobá los datos vos mismo</h2>
        <p className="suave">
          Tu navegador le pregunta directo a la red pública de Stellar y compara con lo que muestra esta página. La
          consulta no pasa por nuestro servidor.
        </p>
      </div>
      <button
        type="button"
        className="boton boton--primario"
        style={{ alignSelf: "flex-start" }}
        disabled={sinRed !== null || estado.tipo === "leyendo"}
        aria-describedby={sinRed ? "sin-red-comprobar" : undefined}
        onClick={() => void leer()}
      >
        <Icono nombre="red" />
        {estado.tipo === "leyendo" ? "Consultando la red…" : estado.tipo === "lista" ? "Volver a comprobar" : "Comprobar contra Stellar"}
      </button>
      {sinRed && (
        <p className="motivo" id="sin-red-comprobar">
          <Icono nombre="info" tamano={16} />
          <span>{sinRed}</span>
        </p>
      )}

      <div role="status" aria-live="polite">
        {estado.tipo === "error" && (
          <div className="aviso aviso--neutro">
            <Icono nombre="info" />
            <div>
              <b>No se pudo consultar la red</b>
              <div className="chico">
                No mostramos ningún resultado: sin la respuesta de la red no hay nada comprobado. Probá de nuevo en unos
                segundos. ({estado.detalle})
              </div>
            </div>
          </div>
        )}
        {estado.tipo === "lista" && (
          <div>
            <div className="fila fila--entre chico" style={{ marginBottom: 4 }}>
              <b>Resultado · {formatearFechaHora(estado.momento)}</b>
              <span className="suave">
                {coinciden} de {filas.length} datos coinciden
              </span>
            </div>
            <ul className="lista-limpia">
              {filas.map((f) => (
                <li key={f.clave} className="renglon">
                  <span>
                    {f.etiqueta} · {f.mostrado}
                    {!f.coincide && <span className="chico suave"> (en la red: {f.enCadena})</span>}
                  </span>
                  {f.coincide ? (
                    <Insignia tono="ap" icono="check">
                      Coincide
                    </Insignia>
                  ) : (
                    <Insignia tono="er" icono="cerrar">
                      No coincide
                    </Insignia>
                  )}
                </li>
              ))}
            </ul>
            {coinciden < filas.length && (
              <p className="chico suave" style={{ marginTop: 8 }}>
                Si algo acaba de cambiar, nuestro servidor puede tardar unos segundos en registrarlo: volvé a comprobar. Si la
                diferencia sigue, lo que vale es lo que dice la red.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
