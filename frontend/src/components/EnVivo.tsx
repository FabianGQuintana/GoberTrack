"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cliente } from "@/lib/api/cliente";
import { formatearMomento } from "@/lib/tiempo";

/** Cada cuánto se consulta el backend: más o menos un ledger. */
export const INTERVALO_EN_VIVO_MS = 5000;

type Estado = { tipo: "esperando" } | { tipo: "ok"; hora: number; nuevos: number } | { tipo: "error"; hora: number };

/**
 * Refresco en vivo (solo modo API). Con `obraId` pide `GET /obras/{id}/eventos?desde=<último id>`
 * y solo si llegó algo nuevo vuelve a pedir la página al servidor (router.refresh), que trae obra,
 * hitos y eventos actualizados sin perder el estado del navegador. Sin `obraId` (listado) refresca
 * la página cada vez.
 */
export function EnVivo({ obraId, ultimoEventoId }: { obraId?: number; ultimoEventoId?: string | null }) {
  const router = useRouter();
  const ultimo = useRef<string | null>(ultimoEventoId ?? null);
  const [estado, setEstado] = useState<Estado>({ tipo: "esperando" });

  // Después de un refresh, la página trae el último id nuevo.
  useEffect(() => {
    if (ultimoEventoId && (!ultimo.current || ultimoEventoId > ultimo.current)) ultimo.current = ultimoEventoId;
  }, [ultimoEventoId]);

  useEffect(() => {
    if (cliente.modo !== "api") return;
    let vigente = true;
    let ocupado = false;
    const consultar = async () => {
      if (ocupado) return;
      ocupado = true;
      try {
        let nuevos = 0;
        if (obraId === undefined) {
          router.refresh();
        } else {
          const eventos = await cliente.listarEventos(obraId, ultimo.current ?? undefined);
          nuevos = eventos.length;
          if (nuevos > 0) {
            ultimo.current = eventos[eventos.length - 1].id;
            router.refresh();
          }
        }
        if (vigente) setEstado({ tipo: "ok", hora: Date.now(), nuevos });
      } catch {
        if (vigente) setEstado({ tipo: "error", hora: Date.now() });
      } finally {
        ocupado = false;
      }
    };
    const id = setInterval(consultar, INTERVALO_EN_VIVO_MS);
    return () => {
      vigente = false;
      clearInterval(id);
    };
  }, [obraId, router]);

  if (cliente.modo !== "api") return null;
  return (
    <p className="chico suave" aria-live="polite">
      <span aria-hidden="true">● </span>En vivo: se actualiza cada {INTERVALO_EN_VIVO_MS / 1000} s.{" "}
      {estado.tipo === "ok" && (
        <>
          Última consulta {formatearMomento(estado.hora)}
          {estado.nuevos > 0 ? ` · ${estado.nuevos} ${estado.nuevos === 1 ? "evento nuevo" : "eventos nuevos"}` : ""}.
        </>
      )}
      {estado.tipo === "error" && <>No se pudo consultar el backend ({formatearMomento(estado.hora)}); se reintenta.</>}
    </p>
  );
}
