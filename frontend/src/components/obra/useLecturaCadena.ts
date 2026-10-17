"use client";

import { useCallback, useState } from "react";
import { cliente } from "@/lib/api/cliente";
import type { Obra } from "@/lib/api/tipos";
import { leerConfigRed } from "@/lib/stellar/config";
import { leerObraDeLaCadena, type LecturaCadena } from "@/lib/verificacion";

export type EstadoLectura =
  | { tipo: "inactiva" }
  | { tipo: "leyendo" }
  | { tipo: "lista"; lectura: LecturaCadena; momento: number }
  | { tipo: "error"; detalle: string };

/** Por qué no se puede consultar la red desde esta página, o null si se puede. */
export function motivoSinRed(): string | null {
  if (cliente.modo !== "api") return "En el modo de demostración (DATO SIMULADO) las obras no están en la red: no hay nada que comprobar.";
  const lectura = leerConfigRed();
  return lectura.ok ? null : "Esta instalación no tiene configurada la red de Stellar, así que no puede consultarla.";
}

/**
 * Lee la obra directo del contrato, desde el navegador. La simulación necesita una cuenta origen
 * existente: se usa la del municipio de la obra (es pública y existe en la red). No se firma nada.
 */
export function useLecturaCadena(obra: Pick<Obra, "id" | "municipio">) {
  const [estado, setEstado] = useState<EstadoLectura>({ tipo: "inactiva" });

  const leer = useCallback(async (): Promise<LecturaCadena | null> => {
    const config = leerConfigRed();
    if (cliente.modo !== "api" || !config.ok) return null;
    setEstado({ tipo: "leyendo" });
    try {
      const lectura = await leerObraDeLaCadena(
        { rpcUrl: config.config.rpcUrl, passphrase: config.config.passphrase },
        config.config.contratoId,
        obra.id,
        obra.municipio,
      );
      setEstado({ tipo: "lista", lectura, momento: Date.now() });
      return lectura;
    } catch (e) {
      setEstado({ tipo: "error", detalle: e instanceof Error ? e.message : "error desconocido" });
      return null;
    }
  }, [obra.id, obra.municipio]);

  return { estado, leer };
}
