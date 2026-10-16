// Tipos del dominio. Los del contrato siguen interfaces/contract.md §1; los de la API siguen
// los esquemas de interfaces/openapi.yaml v1.0.0.

export const ESTADOS_HITO = ['Pendiente', 'Evidencia', 'Aprobado', 'Objetado', 'Pagado'] as const;
export type EstadoHito = (typeof ESTADOS_HITO)[number];

export type EstadoObra = 'Activa' | 'Finalizada';

export const TIPOS_EVENTO = [
  'ObraCreada',
  'ObraFondeada',
  'HitoDeclarado',
  'HitoAprobado',
  'HitoObjetado',
  'ObjecionResuelta',
  'PagoLiberado',
  'AdendaRegistrada',
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export type Decision = 'Aceptar' | 'Rechazar';

// ---- Estado del contrato tal como lo devuelven ver_obra / ver_hitos (lo que se indexa) ----
// Montos i128 como bigint, momentos u64 como segundos Unix, hashes BytesN<32> en hex minúsculas.
// El `estado` de la obra no se guarda: la API lo deriva de los hitos.

export interface ObraContrato {
  id: number;
  nombre: string;
  municipio: string;
  contratista: string;
  inspector: string;
  veedor: string;
  arbitro: string;
  token: string;
  monto_original: bigint;
  monto_vigente: bigint;
  fondeado: bigint;
  pagado: bigint;
  periodo_objecion: number;
  cantidad_hitos: number;
  creada_en: number;
}

export interface HitoContrato {
  indice: number;
  descripcion: string;
  monto_original: bigint;
  monto_vigente: bigint;
  estado: EstadoHito;
  evidencia_hash: string | null;
  momento_declaracion: number | null;
  aprobo_inspector: boolean;
  aprobo_veedor: boolean;
  veedor_por_arbitro: boolean;
  objecion_usada: boolean;
  motivo_objecion_hash: string | null;
  momento_aprobacion_completa: number | null;
  momento_pago: number | null;
}

/** Evento ya traducido, listo para guardar. `datos` sigue los nombres de contract.md §4. */
export interface EventoIndexado {
  id: string;
  tipo: TipoEvento;
  obra_id: number;
  hito: number | null;
  ledger: number;
  momento: number;
  tx_hash: string;
  datos: Record<string, unknown>;
}

// ---- Respuestas de la API (openapi.yaml, components/schemas) ----

export interface ObraApi {
  id: number;
  nombre: string;
  municipio: string;
  contratista: string;
  inspector: string;
  veedor: string;
  arbitro: string;
  token: string;
  monto_original: string;
  monto_vigente: string;
  fondeado: string;
  pagado: string;
  saldo: string;
  periodo_objecion_seg: number;
  estado: EstadoObra;
  cantidad_hitos: number;
  hitos_pagados: number;
  creada_en: string;
}

export interface HitoApi {
  obra_id: number;
  indice: number;
  descripcion: string;
  monto_original: string;
  monto_vigente: string;
  estado: EstadoHito;
  evidencia_hash: string | null;
  momento_declaracion: string | null;
  fin_periodo_objecion: string | null;
  aprobo_inspector: boolean;
  aprobo_veedor: boolean;
  veedor_por_arbitro: boolean;
  objecion_usada: boolean;
  motivo_objecion_hash: string | null;
  momento_aprobacion_completa: string | null;
  momento_pago: string | null;
  pagable: boolean;
}

export interface EventoApi {
  id: string;
  tipo: TipoEvento;
  obra_id: number;
  hito: number | null;
  ledger: number;
  momento: string;
  tx_hash: string;
  datos: Record<string, unknown>;
}

export interface AlertaApi {
  tipo: 'Sobrecosto';
  severidad: 'info' | 'advertencia' | 'critica';
  mensaje: string;
  momento: string;
  hito?: number | null;
}

export interface EvidenciaApi {
  sha256: string;
  nombre_original: string;
  tamano_bytes: number;
  tipo_mime: string;
  url: string;
}

export interface ErrorApi {
  error: { codigo: string; mensaje: string };
}
