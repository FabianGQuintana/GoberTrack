"use client";

import { useEffect, useState } from "react";
import { cliente } from "@/lib/api/cliente";
import { consultarEvidencia, type ConsultaEvidencia } from "@/lib/evidencia";

/**
 * Nombre original del archivo de una huella, preguntado al almacén de evidencias (HEAD). Mientras no
 * llega, o si el almacén no lo tiene, muestra `alternativo`; con `avisarFaltante` dice que no está.
 */
export function NombreArchivo({
  hash,
  alternativo,
  avisarFaltante = false,
}: {
  hash: string;
  alternativo: string;
  avisarFaltante?: boolean;
}) {
  const [consulta, setConsulta] = useState<ConsultaEvidencia | null>(null);

  useEffect(() => {
    let vigente = true;
    void consultarEvidencia(cliente.urlEvidencia(hash)).then((c) => vigente && setConsulta(c));
    return () => {
      vigente = false;
    };
  }, [hash]);

  if (consulta?.estado === "disponible" && consulta.nombre) return <span>{consulta.nombre}</span>;
  if (consulta?.estado === "no-disponible" && avisarFaltante) {
    return (
      <span>
        {alternativo} <span className="marca-alerta">(el archivo no está en el almacén)</span>
      </span>
    );
  }
  return <span>{alternativo}</span>;
}
