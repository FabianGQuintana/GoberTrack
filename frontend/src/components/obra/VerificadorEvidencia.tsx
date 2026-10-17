"use client";

import { useId, useState } from "react";
import { cliente } from "@/lib/api/cliente";
import type { Hito, Obra } from "@/lib/api/tipos";
import { hashDisponible, sha256Hex } from "@/lib/hash";
import { hashEnCadena } from "@/lib/verificacion";
import { HuellaExpandible } from "../ui/Huella";
import { Icono } from "../ui/Icono";
import { motivoSinRed, useLecturaCadena } from "./useLecturaCadena";
import { ZonaArchivo } from "./ZonaArchivo";

interface Documento {
  clave: string;
  etiqueta: string;
  indice: number;
  tipo: "evidencia" | "motivo";
  /** Huella que muestra esta página (backend). */
  hash: string;
}

type Resultado =
  | { tipo: "inactivo" }
  | { tipo: "calculando" }
  | {
      tipo: "listo";
      nombre: string;
      calculado: string;
      esperado: string;
      /** De dónde salió la huella esperada. */
      fuente: "red" | "pagina";
    }
  | { tipo: "error"; mensaje: string };

function documentosDe(hitos: readonly Hito[]): Documento[] {
  const docs: Documento[] = [];
  for (const h of [...hitos].sort((a, b) => b.indice - a.indice)) {
    if (h.evidencia_hash) {
      docs.push({
        clave: `e-${h.indice}`,
        etiqueta: `Hito ${h.indice + 1} · ${h.descripcion} (evidencia)`,
        indice: h.indice,
        tipo: "evidencia",
        hash: h.evidencia_hash,
      });
    }
    if (h.motivo_objecion_hash) {
      docs.push({
        clave: `m-${h.indice}`,
        etiqueta: `Hito ${h.indice + 1} · motivo de la objeción`,
        indice: h.indice,
        tipo: "motivo",
        hash: h.motivo_objecion_hash,
      });
    }
  }
  return docs;
}

/**
 * Verificador de evidencia: calcula la huella SHA-256 de un archivo en el navegador (sin subirlo) y la
 * compara con la registrada. Con la red configurada, la huella esperada se lee del contrato; si no, se
 * compara con la que muestra la página y se dice. Prueba que el archivo no cambió; no que la obra esté
 * bien hecha.
 */
export function VerificadorEvidencia({ obra, hitos }: { obra: Obra; hitos: Hito[] }) {
  const id = useId();
  const documentos = documentosDe(hitos);
  const [clave, setClave] = useState(documentos[0]?.clave ?? "");
  const [resultado, setResultado] = useState<Resultado>({ tipo: "inactivo" });
  const { estado: lectura, leer } = useLecturaCadena(obra);
  const documento = documentos.find((d) => d.clave === clave) ?? documentos[0];
  const sinRed = motivoSinRed();

  async function huellaEsperada(doc: Documento): Promise<{ hash: string; fuente: "red" | "pagina" }> {
    if (sinRed) return { hash: doc.hash, fuente: "pagina" };
    const cadena = lectura.tipo === "lista" ? lectura.lectura : await leer();
    const enRed = cadena ? hashEnCadena(cadena, doc.indice, doc.tipo) : null;
    return enRed ? { hash: enRed, fuente: "red" } : { hash: doc.hash, fuente: "pagina" };
  }

  async function verificar(bytes: ArrayBuffer, nombre: string) {
    if (!documento) return;
    if (!hashDisponible()) {
      setResultado({ tipo: "error", mensaje: "Este navegador solo calcula huellas en https o en localhost." });
      return;
    }
    setResultado({ tipo: "calculando" });
    try {
      const [calculado, esperado] = await Promise.all([sha256Hex(bytes), huellaEsperada(documento)]);
      setResultado({ tipo: "listo", nombre, calculado, esperado: esperado.hash, fuente: esperado.fuente });
    } catch (e) {
      setResultado({ tipo: "error", mensaje: e instanceof Error ? e.message : "No se pudo calcular la huella." });
    }
  }

  async function verificarPublicado() {
    if (!documento) return;
    setResultado({ tipo: "calculando" });
    try {
      const respuesta = await fetch(cliente.urlEvidencia(documento.hash), { cache: "no-store" });
      if (!respuesta.ok) {
        setResultado({
          tipo: "error",
          mensaje:
            respuesta.status === 404
              ? "El archivo no está en el almacén de evidencias: la huella está registrada, pero nadie puede revisar el archivo."
              : `El almacén de evidencias respondió ${respuesta.status}.`,
        });
        return;
      }
      await verificar(await respuesta.arrayBuffer(), "archivo publicado en el almacén");
    } catch {
      setResultado({ tipo: "error", mensaje: "No se pudo descargar el archivo publicado." });
    }
  }

  return (
    <section className="tarjeta tarjeta--grande pila" aria-labelledby="titulo-verificador" style={{ gap: 16 }}>
      <div className="pila pila--chica">
        <h2 id="titulo-verificador">Verificá un archivo de evidencia</h2>
        <p className="suave">
          Arrastrá el archivo y tu navegador calcula su huella (SHA-256) sin subirlo a ningún lado. Después la compara con la
          que quedó registrada.
        </p>
      </div>

      {documentos.length === 0 ? (
        <p className="motivo">
          <Icono nombre="info" tamano={16} />
          <span>Todavía no se declaró ningún hito: no hay archivos para verificar.</span>
        </p>
      ) : (
        <>
          <div className="campo">
            <label htmlFor={`${id}-doc`}>Documento a comparar</label>
            <select
              id={`${id}-doc`}
              className="entrada"
              value={documento?.clave}
              onChange={(e) => {
                setClave(e.target.value);
                setResultado({ tipo: "inactivo" });
              }}
            >
              {documentos.map((d) => (
                <option key={d.clave} value={d.clave}>
                  {d.etiqueta}
                </option>
              ))}
            </select>
          </div>
          <ZonaArchivo
            titulo="Soltá el archivo acá"
            ayuda="El archivo no sale de tu navegador."
            aceptar="*/*"
            alElegir={async (archivo) => verificar(await archivo.arrayBuffer(), archivo.name)}
          />
          <button type="button" className="boton boton--texto" style={{ alignSelf: "flex-start" }} onClick={verificarPublicado}>
            O verificá el archivo publicado en el almacén de evidencias
          </button>
        </>
      )}

      <div role="status" aria-live="polite" className="pila">
        {resultado.tipo === "calculando" && (
          <p className="con-icono chico">
            <span className="giro" /> Calculando la huella…
          </p>
        )}
        {resultado.tipo === "error" && (
          <p className="aviso aviso--peligro chico">
            <Icono nombre="alerta" />
            {resultado.mensaje}
          </p>
        )}
        {resultado.tipo === "listo" && (
          <>
            <div className="fila chico" style={{ gap: 8 }}>
              <Icono nombre="archivo" tamano={16} />
              <span>{resultado.nombre}</span>
              <span className="suave">· huella calculada</span>
              <HuellaExpandible valor={resultado.calculado} etiqueta="huella calculada" />
            </div>
            {resultado.calculado === resultado.esperado ? (
              <p className="aviso aviso--exito">
                <Icono nombre="check-circulo" />
                <b>Es el mismo archivo que se registró</b>
              </p>
            ) : (
              <p className="aviso aviso--peligro">
                <Icono nombre="cerrar" />
                <span>
                  <b>No coincide.</b> Este archivo no es el que se registró: aunque se parezca, cambió al menos un byte.
                </span>
              </p>
            )}
            <p className="chico suave">
              {resultado.fuente === "red"
                ? "Comparado con la huella que guarda el contrato en la red de Stellar."
                : sinRed
                  ? "Comparado con la huella que muestra esta página (no hay red para consultar)."
                  : "Comparado con la huella que muestra esta página: la red no respondió, así que no se comprobó contra el contrato."}
            </p>
          </>
        )}
      </div>
      <p className="motivo">
        <Icono nombre="info" tamano={16} />
        <span>Esto prueba que el archivo no cambió; no prueba que la obra esté bien hecha.</span>
      </p>
    </section>
  );
}
