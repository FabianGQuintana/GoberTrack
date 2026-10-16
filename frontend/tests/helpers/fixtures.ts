// Obras e hitos armados a mano para las pruebas de reglas. `AHORA` es fijo.
import type { EstadoHito, Hito, Obra } from "@/lib/api/tipos";
import type { Contexto } from "@/lib/reglas";
import type { Rol } from "@/lib/roles";

export const AHORA = Date.parse("2026-10-16T12:00:00Z");
export const PERIODO_SEG = 60;
export const UNIDAD = 10_000_000n;

export const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");

export const OBRA_BASE: Obra = {
  id: 1,
  nombre: "Obra de prueba",
  municipio: "GMUNICIPIO",
  contratista: "GCONTRATISTA",
  inspector: "GINSPECTOR",
  veedor: "GVEEDOR",
  arbitro: "GMUNICIPIO",
  token: "CTOKEN",
  monto_original: (30n * UNIDAD).toString(),
  monto_vigente: (30n * UNIDAD).toString(),
  fondeado: (30n * UNIDAD).toString(),
  pagado: (10n * UNIDAD).toString(),
  saldo: (20n * UNIDAD).toString(),
  periodo_objecion_seg: PERIODO_SEG,
  estado: "Activa",
  cantidad_hitos: 3,
  hitos_pagados: 1,
  creada_en: iso(AHORA - 86_400_000),
};

export function obra(extra: Partial<Obra> = {}): Obra {
  return { ...OBRA_BASE, ...extra };
}

export function hito(indice: number, estado: EstadoHito, extra: Partial<Hito> = {}): Hito {
  return {
    obra_id: 1,
    indice,
    descripcion: `Hito de prueba ${indice + 1}`,
    monto_original: (10n * UNIDAD).toString(),
    monto_vigente: (10n * UNIDAD).toString(),
    estado,
    evidencia_hash: null,
    momento_declaracion: null,
    fin_periodo_objecion: null,
    aprobo_inspector: false,
    aprobo_veedor: false,
    veedor_por_arbitro: false,
    objecion_usada: false,
    motivo_objecion_hash: null,
    momento_aprobacion_completa: null,
    momento_pago: null,
    pagable: false,
    ...extra,
  };
}

/** Hito declarado `haceMs` antes de AHORA, con el período de la obra de prueba. */
export function declaradoHace(haceMs: number, periodoSeg = PERIODO_SEG): Partial<Hito> {
  const decl = AHORA - haceMs;
  return {
    evidencia_hash: "a".repeat(64),
    momento_declaracion: iso(decl),
    fin_periodo_objecion: iso(decl + periodoSeg * 1000),
  };
}

/** El hito `indice` en cada estado, con los campos coherentes con contract.md §3. */
export function hitoEnEstado(indice: number, estado: EstadoHito): Hito {
  switch (estado) {
    case "Pendiente":
      return hito(indice, "Pendiente");
    case "Evidencia": // dentro del período, sin aprobaciones
      return hito(indice, "Evidencia", declaradoHace(30_000));
    case "Aprobado": // las dos aprobaciones, período vencido
      return hito(indice, "Aprobado", {
        ...declaradoHace(600_000),
        aprobo_inspector: true,
        aprobo_veedor: true,
      });
    case "Objetado": // el veedor objetó dentro del período
      return hito(indice, "Objetado", {
        ...declaradoHace(30_000),
        objecion_usada: true,
        motivo_objecion_hash: "b".repeat(64),
      });
    case "Pagado":
      return hito(indice, "Pagado", {
        ...declaradoHace(600_000),
        aprobo_inspector: true,
        aprobo_veedor: true,
        momento_pago: iso(AHORA - 60_000),
      });
  }
}

/** [hito 0 Pagado, hito 1 en `estado`, hito 2 Pendiente]: el hito 1 tiene anterior OK. */
export function hitosConObjetivo(estado: EstadoHito): Hito[] {
  return [hitoEnEstado(0, "Pagado"), hitoEnEstado(1, estado), hitoEnEstado(2, "Pendiente")];
}

export function ctx(roles: readonly Rol[], hitos: Hito[], extra: Partial<Contexto> = {}): Contexto {
  return { obra: obra(), hitos, roles, ahora: AHORA, ...extra };
}
