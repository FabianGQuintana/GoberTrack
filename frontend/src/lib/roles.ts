import type { Obra } from "./api/tipos";

export const ROLES = ["municipio", "contratista", "inspector", "veedor", "arbitro"] as const;
export type Rol = (typeof ROLES)[number];

export const NOMBRE_ROL: Record<Rol, string> = {
  municipio: "Municipio",
  contratista: "Contratista",
  inspector: "Inspector",
  veedor: "Veedor",
  arbitro: "Árbitro",
};

/**
 * Roles que tiene una dirección en la obra. Puede ser más de uno: en el MVP el árbitro es la
 * dirección del municipio (PRD §3), así que esa cuenta tiene los dos. Lista vacía = sin rol.
 */
export function rolesDe(obra: Pick<Obra, Rol>, direccion: string | null | undefined): Rol[] {
  if (!direccion) return [];
  const buscada = direccion.trim().toUpperCase();
  return ROLES.filter((rol) => obra[rol].toUpperCase() === buscada);
}

/** "Municipio y Árbitro", "Veedor", o "Sin rol". */
export function describirRoles(roles: readonly Rol[]): string {
  if (roles.length === 0) return "Sin rol";
  const nombres = roles.map((r) => NOMBRE_ROL[r]);
  return nombres.length === 1
    ? nombres[0]
    : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** Nombre del rol de una dirección para la línea de tiempo ("el inspector"), o la dirección abreviada. */
export function quienEs(obra: Pick<Obra, Rol>, direccion: string): string {
  const roles = rolesDe(obra, direccion);
  return roles.length > 0 ? describirRoles(roles) : abreviarDireccion(direccion);
}

/** GABC…WXYZ */
export function abreviarDireccion(direccion: string, extremos = 4): string {
  return direccion.length <= extremos * 2 + 1
    ? direccion
    : `${direccion.slice(0, extremos)}…${direccion.slice(-extremos)}`;
}
