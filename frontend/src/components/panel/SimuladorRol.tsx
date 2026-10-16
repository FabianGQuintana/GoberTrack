"use client";

import { useId } from "react";
import type { Obra } from "@/lib/api/tipos";
import { NOMBRE_ROL, ROLES, type Rol } from "@/lib/roles";

export type RolSimulado = Rol | "sin-rol";

/** DATO SIMULADO: cuenta válida que no tiene ningún rol en las obras del escenario. */
export const DIRECCION_SIN_ROL = "GALW3CGSZ3GBRSWLYYHXBBVICM2H6U5JASVMGQQBEBIRIYGQQTAIFK5H";

export function direccionSimulada(obra: Obra, rol: RolSimulado): string {
  return rol === "sin-rol" ? DIRECCION_SIN_ROL : obra[rol];
}

/**
 * SOLO DESARROLLO: elegir un rol de la obra para probar el panel sin wallet. No se muestra en el
 * build de producción (`NODE_ENV === "production"`).
 */
export function SimuladorRol({
  valor,
  alCambiar,
}: {
  valor: RolSimulado | null;
  alCambiar: (rol: RolSimulado | null) => void;
}) {
  const id = useId();
  return (
    <div className="aviso aviso--dev" role="group" aria-labelledby={`${id}-titulo`}>
      <p id={`${id}-titulo`} style={{ marginBottom: "0.5rem" }}>
        <strong>SOLO DESARROLLO · Simular rol</strong> — prueba el panel sin wallet usando la dirección
        del rol elegido. No existe en producción.
      </p>
      <div className="campo" style={{ maxWidth: "22rem" }}>
        <label htmlFor={id}>Rol simulado</label>
        <select
          id={id}
          value={valor ?? ""}
          onChange={(e) => alCambiar(e.target.value === "" ? null : (e.target.value as RolSimulado))}
        >
          <option value="">No simular (usar Freighter)</option>
          {ROLES.map((rol) => (
            <option key={rol} value={rol}>
              {NOMBRE_ROL[rol]}
            </option>
          ))}
          <option value="sin-rol">Sin rol (otra cuenta)</option>
        </select>
      </div>
    </div>
  );
}
