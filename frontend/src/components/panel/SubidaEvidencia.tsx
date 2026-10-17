"use client";

import { useState } from "react";
import { cliente, ErrorDeApi } from "@/lib/api/cliente";
import { hashDisponible, sha256Hex } from "@/lib/hash";
import { HuellaExpandible } from "../ui/Huella";
import { Icono } from "../ui/Icono";
import { Insignia } from "../ui/Insignia";
import { ZonaArchivo } from "../obra/ZonaArchivo";

type Estado =
  | { tipo: "inactivo" }
  | { tipo: "procesando"; nombre: string }
  | { tipo: "listo"; nombre: string; sha256: string; verificadoLocalmente: boolean }
  | { tipo: "error"; mensaje: string };

/**
 * Sube un archivo al almacén de evidencias y obtiene su huella SHA-256 (la que se pasa al contrato).
 * Con la API real, además recalcula la huella en el navegador y descarta el archivo si no coincide con
 * la del backend. En el modo de demostración solo se calcula en el navegador (no se guarda nada).
 * La huella queda registrada en la red recién cuando se firma la acción.
 */
export function SubidaEvidencia({
  titulo,
  alObtenerHash,
  enFila = false,
}: {
  titulo: string;
  alObtenerHash: (hash: string | null) => void;
  enFila?: boolean;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "inactivo" });

  async function procesar(archivo: File) {
    alObtenerHash(null);
    setEstado({ tipo: "procesando", nombre: archivo.name });
    try {
      const evidencia = await cliente.subirEvidencia(archivo);
      const verificable = cliente.modo === "api" && hashDisponible();
      if (verificable) {
        const local = await sha256Hex(await archivo.arrayBuffer());
        if (local !== evidencia.sha256) {
          setEstado({
            tipo: "error",
            mensaje: `La huella del servidor (${evidencia.sha256}) no coincide con la calculada en tu navegador (${local}). No se usa.`,
          });
          return;
        }
      }
      setEstado({ tipo: "listo", nombre: archivo.name, sha256: evidencia.sha256, verificadoLocalmente: verificable });
      alObtenerHash(evidencia.sha256);
    } catch (e) {
      const mensaje = e instanceof ErrorDeApi || e instanceof Error ? e.message : "No se pudo procesar el archivo.";
      setEstado({ tipo: "error", mensaje });
    }
  }

  return (
    <div className="pila">
      <ZonaArchivo
        titulo={titulo}
        ayuda={
          cliente.modo === "mock"
            ? "Imagen JPEG o PNG, o PDF, hasta 10 MB. En la demostración la huella se calcula en tu navegador y el archivo no se guarda."
            : "Imagen JPEG o PNG, o PDF, hasta 10 MB. Se guarda en el almacén público de evidencias."
        }
        enFila={enFila}
        deshabilitada={estado.tipo === "procesando"}
        alElegir={(a) => void procesar(a)}
      />
      <div aria-live="polite">
        {estado.tipo === "procesando" && (
          <p className="con-icono chico">
            <span className="giro" /> Procesando {estado.nombre}…
          </p>
        )}
        {estado.tipo === "listo" && (
          <div className="caja pila pila--chica" style={{ background: "var(--sf)", padding: 14 }}>
            <div className="fila" style={{ gap: 10 }}>
              <Icono nombre="archivo" />
              <b>{estado.nombre}</b>
              <Insignia tono="ap" icono="check">
                Huella calculada
              </Insignia>
            </div>
            <div className="fila chico suave" style={{ gap: 8 }}>
              SHA-256 <HuellaExpandible valor={estado.sha256} etiqueta="huella del archivo" />
              <span className="visualmente-oculto">{estado.sha256}</span>
            </div>
            <p className="chico suave">
              {cliente.modo === "mock"
                ? "DATO SIMULADO: calculada en tu navegador; el archivo no se guarda."
                : estado.verificadoLocalmente
                  ? "Guardado en el almacén de evidencias; la huella coincide con la calculada en tu navegador. Se registra en la red cuando firmes."
                  : "Guardado en el almacén de evidencias. Este navegador no pudo recalcular la huella (hace falta https o localhost)."}
            </p>
          </div>
        )}
        {estado.tipo === "error" && (
          <p className="aviso aviso--peligro chico" role="alert">
            <Icono nombre="alerta" />
            {estado.mensaje}
          </p>
        )}
      </div>
    </div>
  );
}
