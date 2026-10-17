"use client";

import { useId, useState } from "react";
import { TIPOS_EVIDENCIA } from "@/lib/api/cliente";
import { Icono } from "../ui/Icono";

/**
 * Zona para arrastrar un archivo (o elegirlo con el botón, que es el input real: funciona con teclado).
 * Solo entrega el archivo: qué se hace con él (calcular la huella, subirlo) lo decide quien la usa.
 */
export function ZonaArchivo({
  titulo,
  ayuda,
  alElegir,
  enFila = false,
  deshabilitada = false,
  aceptar = TIPOS_EVIDENCIA.join(","),
}: {
  titulo: string;
  ayuda: string;
  alElegir: (archivo: File) => void;
  enFila?: boolean;
  deshabilitada?: boolean;
  aceptar?: string;
}) {
  const id = useId();
  const [encima, setEncima] = useState(false);

  return (
    <div
      className={`zona-archivo${enFila ? " zona-archivo--fila" : ""}${encima ? " zona-archivo--activa" : ""}`}
      onDragOver={(e) => {
        if (deshabilitada) return;
        e.preventDefault();
        setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setEncima(false);
        const archivo = e.dataTransfer.files?.[0];
        if (archivo && !deshabilitada) alElegir(archivo);
      }}
    >
      <Icono nombre="subir" tamano={26} />
      <div>
        <b>{titulo}</b>
        <div className="chico suave" id={`${id}-ayuda`}>
          o elegilo desde tu equipo. {ayuda}
        </div>
      </div>
      <input
        type="file"
        aria-label={titulo}
        aria-describedby={`${id}-ayuda`}
        accept={aceptar}
        disabled={deshabilitada}
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (archivo) alElegir(archivo);
          e.target.value = "";
        }}
      />
    </div>
  );
}
