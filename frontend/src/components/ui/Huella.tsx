"use client";

import { useState } from "react";
import { Icono } from "./Icono";

/** a3f9…7c21 */
export function abreviar(valor: string, extremos = 4): string {
  return valor.length <= extremos * 2 + 1 ? valor : `${valor.slice(0, extremos)}…${valor.slice(-extremos)}`;
}

/**
 * Huella (hash) o dirección abreviada, con el valor completo en el título y en el texto para lectores
 * de pantalla. Al tocarla se copia el valor completo.
 */
export function Huella({ valor, etiqueta, sinIcono = false }: { valor: string; etiqueta: string; sinIcono?: boolean }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sin permiso de portapapeles: el valor sigue visible en el título.
    }
  }

  return (
    <button type="button" className="huella" title={valor} aria-label={`Copiar ${etiqueta}: ${valor}`} onClick={copiar}>
      <span aria-hidden="true">{copiado ? "Copiado" : abreviar(valor)}</span>
      {!sinIcono && <Icono nombre={copiado ? "check" : "copiar"} tamano={14} />}
    </button>
  );
}

/** Huella abreviada con un botón "Ver completa" que despliega los 64 caracteres. */
export function HuellaExpandible({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <span className="pila pila--chica" style={{ display: "inline-flex" }}>
      <span className="fila" style={{ gap: 8 }}>
        <Huella valor={valor} etiqueta={etiqueta} />
        <button type="button" className="boton boton--texto chico" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta}>
          {abierta ? "Ocultar" : "Ver completa"}
        </button>
      </span>
      {abierta && <code className="huella-completa">{valor}</code>}
    </span>
  );
}
