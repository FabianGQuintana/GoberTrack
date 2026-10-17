"use client";

import { useEffect, useState } from "react";
import { cliente } from "@/lib/api/cliente";
import type { Evento, Hito, Obra } from "@/lib/api/tipos";
import { avisosDeObra } from "@/lib/atencion";
import { consultarEvidencia } from "@/lib/evidencia";
import { useAhora } from "@/lib/useAhora";
import { Icono } from "../ui/Icono";

/** Hashes declarados cuyo archivo no está en el almacén (se consulta con HEAD, sin bajar nada). */
function useEvidenciasFaltantes(hitos: readonly Hito[]): ReadonlySet<string> {
  const [faltantes, setFaltantes] = useState<ReadonlySet<string>>(new Set());
  const hashes = hitos.map((h) => h.evidencia_hash).filter((h): h is string => h !== null);
  const clave = hashes.join(",");

  useEffect(() => {
    let vigente = true;
    const lista = clave ? clave.split(",") : [];
    void Promise.all(lista.map(async (h) => ({ h, c: await consultarEvidencia(cliente.urlEvidencia(h)) }))).then((r) => {
      if (vigente) setFaltantes(new Set(r.filter((x) => x.c.estado === "no-disponible").map((x) => x.h)));
    });
    return () => {
      vigente = false;
    };
  }, [clave]);

  return faltantes;
}

/** Bloque "Requiere atención" de la obra. No se muestra si no hay nada que destrabar. */
export function RequiereAtencion({ obra, hitos, eventos }: { obra: Obra; hitos: Hito[]; eventos: Evento[] }) {
  const ahora = useAhora(5000);
  const evidenciasFaltantes = useEvidenciasFaltantes(hitos);
  const avisos = avisosDeObra(obra, hitos, eventos, { ahora, evidenciasFaltantes });
  if (avisos.length === 0) return null;
  const [principal, ...resto] = avisos;

  return (
    <section className="aviso aviso--alerta aviso--borde" aria-label="Requiere atención" style={{ padding: "22px 24px", gap: 16 }}>
      <Icono nombre="alerta" tamano={26} />
      <div className="pila" style={{ gap: 6, flex: 1 }}>
        <div className="etiqueta" style={{ color: "inherit" }}>
          Requiere atención
        </div>
        <h3>{principal.titulo}</h3>
        <p>{principal.detalle}</p>
        {resto.length > 0 && (
          <ul className="lista-limpia" style={{ marginTop: 8 }}>
            {resto.map((a) => (
              <li key={`${a.tipo}-${a.hito}`} className="renglon renglon--arriba" style={{ borderColor: "currentColor", justifyContent: "flex-start" }}>
                <Icono nombre="alerta" tamano={16} style={{ marginTop: 3 }} />
                <span>
                  <b>{a.titulo}.</b> {a.detalle}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
