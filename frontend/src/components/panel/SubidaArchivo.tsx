"use client";

import { useId, useState } from "react";
import { cliente, ErrorDeApi, TIPOS_EVIDENCIA } from "@/lib/api/cliente";
import type { Evidencia } from "@/lib/api/tipos";
import { hashDisponible, sha256Hex } from "@/lib/hash";

type Estado =
  | { tipo: "inactivo" }
  | { tipo: "subiendo" }
  | { tipo: "listo"; evidencia: Evidencia; verificadoLocalmente: boolean }
  | { tipo: "error"; mensaje: string };

/**
 * Sube un archivo y obtiene su SHA-256 (el que se pasa al contrato).
 * Modo api: POST /evidencia, y además recalcula el hash en el navegador para compararlo.
 * Modo mock: calcula el hash en el navegador con WebCrypto (el archivo no se guarda en ningún lado).
 */
export function SubidaArchivo({
  etiqueta,
  alObtenerHash,
}: {
  /** "evidencia" o "motivo de la objeción" */
  etiqueta: string;
  alObtenerHash: (hash: string | null) => void;
}) {
  const id = useId();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: "inactivo" });

  function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    setArchivo(e.target.files?.[0] ?? null);
    setEstado({ tipo: "inactivo" });
    alObtenerHash(null);
  }

  async function subir() {
    if (!archivo) return;
    setEstado({ tipo: "subiendo" });
    try {
      const evidencia = await cliente.subirEvidencia(archivo);
      // Sin contexto seguro no hay WebCrypto: se usa el hash del backend sin verificarlo acá.
      const verificable = cliente.modo === "api" && hashDisponible();
      if (verificable) {
        const local = await sha256Hex(await archivo.arrayBuffer());
        if (local !== evidencia.sha256) {
          setEstado({
            tipo: "error",
            mensaje: `El hash del backend (${evidencia.sha256}) no coincide con el calculado en el navegador (${local}). No se usa.`,
          });
          return;
        }
      }
      setEstado({ tipo: "listo", evidencia, verificadoLocalmente: verificable });
      alObtenerHash(evidencia.sha256);
    } catch (e) {
      const mensaje =
        e instanceof ErrorDeApi ? e.message : e instanceof Error ? e.message : "No se pudo procesar el archivo.";
      setEstado({ tipo: "error", mensaje });
    }
  }

  return (
    <div className="pila">
      <div className="campo">
        <label htmlFor={id}>Archivo de {etiqueta}</label>
        <span className="suave chico" id={`${id}-ayuda`}>
          Imagen JPEG o PNG, o PDF, hasta 10 MB.
        </span>
        <input
          id={id}
          type="file"
          accept={TIPOS_EVIDENCIA.join(",")}
          aria-describedby={`${id}-ayuda`}
          onChange={elegir}
        />
      </div>
      <div>
        <button
          type="button"
          className="boton boton--secundario"
          disabled={!archivo || estado.tipo === "subiendo"}
          onClick={subir}
        >
          {estado.tipo === "subiendo"
            ? "Procesando…"
            : cliente.modo === "mock"
              ? "Calcular hash (modo simulado)"
              : "Subir y obtener hash"}
        </button>
      </div>
      <div aria-live="polite">
        {estado.tipo === "listo" && (
          <p className="chico">
            SHA-256: <code>{estado.evidencia.sha256}</code>
            <br />
            {cliente.modo === "mock"
              ? "Calculado en tu navegador (DATO SIMULADO: el archivo no se guarda)."
              : estado.verificadoLocalmente
                ? "Guardado en el backend; el hash coincide con el calculado en tu navegador."
                : "Guardado en el backend. Este navegador no pudo recalcular el hash (hace falta https o localhost)."}
          </p>
        )}
        {estado.tipo === "error" && (
          <p className="aviso aviso--peligro chico" role="alert">
            {estado.mensaje}
          </p>
        )}
      </div>
    </div>
  );
}
