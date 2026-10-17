"use client";

import { useEffect, useId, useRef } from "react";
import { Icono } from "./Icono";

/**
 * Diálogo modal accesible: fondo oscurecido, foco en el título al abrir, Escape para cerrar (salvo que
 * `bloqueado`, p. ej. mientras se espera la confirmación de la red) y foco devuelto al cerrar.
 */
export function Modal({
  titulo,
  children,
  alCerrar,
  bloqueado = false,
  alerta = false,
  ancho = false,
  etiqueta,
}: {
  titulo: React.ReactNode;
  children: React.ReactNode;
  alCerrar: () => void;
  bloqueado?: boolean;
  /** role="alertdialog" (acción rechazada). */
  alerta?: boolean;
  ancho?: boolean;
  /** Nombre accesible, si el título no es texto. */
  etiqueta?: string;
}) {
  const id = useId();
  const refTitulo = useRef<HTMLHeadingElement>(null);
  const anterior = useRef<Element | null>(null);

  useEffect(() => {
    anterior.current = document.activeElement;
    refTitulo.current?.focus();
    return () => {
      if (anterior.current instanceof HTMLElement) anterior.current.focus();
    };
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !bloqueado) alCerrar();
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [alCerrar, bloqueado]);

  return (
    <div
      className="modal-fondo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !bloqueado) alCerrar();
      }}
    >
      <div
        className={`modal${ancho ? " modal--ancho" : ""}`}
        role={alerta ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={etiqueta ? undefined : `${id}-titulo`}
        aria-label={etiqueta}
      >
        <div className="modal__titulo">
          <h3 id={`${id}-titulo`} ref={refTitulo} tabIndex={-1}>
            {titulo}
          </h3>
          {!bloqueado && (
            <button type="button" className="boton boton--icono" aria-label="Cerrar ventana" onClick={alCerrar}>
              <Icono nombre="cerrar" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
