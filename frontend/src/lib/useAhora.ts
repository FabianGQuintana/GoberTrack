"use client";

import { useEffect, useState } from "react";

/**
 * Reloj del navegador en ms, actualizado cada `intervaloMs`. Devuelve null hasta que el componente
 * se monta, para que el HTML del servidor y el primer render del cliente coincidan.
 */
export function useAhora(intervaloMs = 1000): number | null {
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);
  return ahora;
}
