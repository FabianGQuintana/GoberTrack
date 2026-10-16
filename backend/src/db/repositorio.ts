import type { DatabaseSync } from 'node:sqlite';
import { acotarSegundos } from '../dominio/api.ts';
import type { EstadoHito, EventoIndexado, HitoContrato, ObraContrato, TipoEvento } from '../dominio/tipos.ts';

/**
 * Los segundos se acotan también al guardar: un entero por encima de 2^53 en la base haría fallar
 * la lectura de node:sqlite y, con ella, GET /obras entero.
 */
const segundosONull = (s: number | null) => (s === null ? null : acotarSegundos(s));

// Filas tal como salen de SQLite.

export interface ObraFila {
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
  periodo_objecion: number;
  cantidad_hitos: number;
  creada_en: number;
  hitos_pagados: number;
}

export interface HitoFila {
  obra_id: number;
  indice: number;
  descripcion: string;
  monto_original: string;
  monto_vigente: string;
  estado: EstadoHito;
  evidencia_hash: string | null;
  momento_declaracion: number | null;
  aprobo_inspector: number;
  aprobo_veedor: number;
  veedor_por_arbitro: number;
  objecion_usada: number;
  motivo_objecion_hash: string | null;
  momento_aprobacion_completa: number | null;
  momento_pago: number | null;
}

export interface EventoFila {
  id: string;
  tipo: TipoEvento;
  obra_id: number;
  hito: number | null;
  ledger: number;
  momento: number;
  tx_hash: string;
  datos: string;
}

export interface EvidenciaFila {
  sha256: string;
  nombre_original: string;
  tamano_bytes: number;
  tipo_mime: string;
  subida_en: number;
}

// ---- Lectura (API) ----

const SELECT_OBRA = `
  SELECT o.*,
         (SELECT COUNT(*) FROM hitos h WHERE h.obra_id = o.id AND h.estado = 'Pagado') AS hitos_pagados
  FROM obras o`;

export function listarObras(db: DatabaseSync): ObraFila[] {
  return db.prepare(`${SELECT_OBRA} ORDER BY o.id`).all() as unknown as ObraFila[];
}

export function obtenerObra(db: DatabaseSync, id: number): ObraFila | undefined {
  return db.prepare(`${SELECT_OBRA} WHERE o.id = ?`).get(id) as unknown as ObraFila | undefined;
}

export function listarHitos(db: DatabaseSync, obraId: number): HitoFila[] {
  return db
    .prepare('SELECT * FROM hitos WHERE obra_id = ? ORDER BY indice')
    .all(obraId) as unknown as HitoFila[];
}

/** Eventos de la obra en orden ascendente de id; con `desde`, solo los de id mayor. */
export function listarEventos(db: DatabaseSync, obraId: number, desde?: string): EventoFila[] {
  return db
    .prepare('SELECT * FROM eventos WHERE obra_id = ? AND id > ? ORDER BY id')
    .all(obraId, desde ?? '') as unknown as EventoFila[];
}

export function obtenerEvidencia(db: DatabaseSync, sha256: string): EvidenciaFila | undefined {
  return db.prepare('SELECT * FROM evidencias WHERE sha256 = ?').get(sha256) as unknown as
    | EvidenciaFila
    | undefined;
}

// ---- Escritura (seed ahora; indexador en la Fase 3) ----

/** Inserta o reemplaza el estado de una obra (resultado de `ver_obra`). */
export function guardarObra(db: DatabaseSync, o: ObraContrato): void {
  db.prepare(
    `INSERT INTO obras (id, nombre, municipio, contratista, inspector, veedor, arbitro, token,
                        monto_original, monto_vigente, fondeado, pagado, periodo_objecion,
                        cantidad_hitos, creada_en)
     VALUES (:id, :nombre, :municipio, :contratista, :inspector, :veedor, :arbitro, :token,
             :monto_original, :monto_vigente, :fondeado, :pagado, :periodo_objecion,
             :cantidad_hitos, :creada_en)
     ON CONFLICT (id) DO UPDATE SET
       nombre = excluded.nombre, municipio = excluded.municipio, contratista = excluded.contratista,
       inspector = excluded.inspector, veedor = excluded.veedor, arbitro = excluded.arbitro,
       token = excluded.token, monto_original = excluded.monto_original,
       monto_vigente = excluded.monto_vigente, fondeado = excluded.fondeado, pagado = excluded.pagado,
       periodo_objecion = excluded.periodo_objecion, cantidad_hitos = excluded.cantidad_hitos,
       creada_en = excluded.creada_en`,
  ).run({
    // Parámetros explícitos: node:sqlite rechaza claves de más y deja en NULL las que faltan.
    id: o.id,
    nombre: o.nombre,
    municipio: o.municipio,
    contratista: o.contratista,
    inspector: o.inspector,
    veedor: o.veedor,
    arbitro: o.arbitro,
    token: o.token,
    monto_original: o.monto_original.toString(),
    monto_vigente: o.monto_vigente.toString(),
    fondeado: o.fondeado.toString(),
    pagado: o.pagado.toString(),
    periodo_objecion: acotarSegundos(o.periodo_objecion),
    cantidad_hitos: o.cantidad_hitos,
    creada_en: acotarSegundos(o.creada_en),
  });
}

/** Inserta o reemplaza el estado de un hito (un elemento de `ver_hitos`). */
export function guardarHito(db: DatabaseSync, obraId: number, h: HitoContrato): void {
  db.prepare(
    `INSERT OR REPLACE INTO hitos (obra_id, indice, descripcion, monto_original, monto_vigente,
                                   estado, evidencia_hash, momento_declaracion, aprobo_inspector,
                                   aprobo_veedor, veedor_por_arbitro, objecion_usada,
                                   motivo_objecion_hash, momento_aprobacion_completa, momento_pago)
     VALUES (:obra_id, :indice, :descripcion, :monto_original, :monto_vigente, :estado,
             :evidencia_hash, :momento_declaracion, :aprobo_inspector, :aprobo_veedor,
             :veedor_por_arbitro, :objecion_usada, :motivo_objecion_hash,
             :momento_aprobacion_completa, :momento_pago)`,
  ).run({
    obra_id: obraId,
    indice: h.indice,
    descripcion: h.descripcion,
    monto_original: h.monto_original.toString(),
    monto_vigente: h.monto_vigente.toString(),
    estado: h.estado,
    evidencia_hash: h.evidencia_hash,
    momento_declaracion: segundosONull(h.momento_declaracion),
    aprobo_inspector: Number(h.aprobo_inspector),
    aprobo_veedor: Number(h.aprobo_veedor),
    veedor_por_arbitro: Number(h.veedor_por_arbitro),
    objecion_usada: Number(h.objecion_usada),
    motivo_objecion_hash: h.motivo_objecion_hash,
    momento_aprobacion_completa: segundosONull(h.momento_aprobacion_completa),
    momento_pago: segundosONull(h.momento_pago),
  });
}

/** Guarda un evento. Idempotente: re-indexar el mismo id no lo duplica. */
export function guardarEvento(db: DatabaseSync, e: EventoIndexado): void {
  db.prepare(
    `INSERT OR IGNORE INTO eventos (id, tipo, obra_id, hito, ledger, momento, tx_hash, datos)
     VALUES (:id, :tipo, :obra_id, :hito, :ledger, :momento, :tx_hash, :datos)`,
  ).run({
    id: e.id,
    tipo: e.tipo,
    obra_id: e.obra_id,
    hito: e.hito,
    ledger: e.ledger,
    momento: acotarSegundos(e.momento),
    tx_hash: e.tx_hash,
    datos: JSON.stringify(e.datos),
  });
}

/** Guarda los metadatos de una evidencia. Idempotente: si el hash ya existe no lo toca. */
export function guardarEvidencia(db: DatabaseSync, e: EvidenciaFila): void {
  db.prepare(
    `INSERT OR IGNORE INTO evidencias (sha256, nombre_original, tamano_bytes, tipo_mime, subida_en)
     VALUES (:sha256, :nombre_original, :tamano_bytes, :tipo_mime, :subida_en)`,
  ).run({
    sha256: e.sha256,
    nombre_original: e.nombre_original,
    tamano_bytes: e.tamano_bytes,
    tipo_mime: e.tipo_mime,
    subida_en: e.subida_en,
  });
}

export function leerEstadoIndexador(db: DatabaseSync, clave: string): string | undefined {
  const fila = db.prepare('SELECT valor FROM indexador_estado WHERE clave = ?').get(clave) as
    | { valor: string }
    | undefined;
  return fila?.valor;
}

export function guardarEstadoIndexador(db: DatabaseSync, clave: string, valor: string): void {
  db.prepare(
    `INSERT INTO indexador_estado (clave, valor) VALUES (?, ?)
     ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor`,
  ).run(clave, valor);
}

/** Borra todo el estado indexado (obras, hitos, eventos, cursor). No toca las evidencias. */
export function borrarEstadoIndexado(db: DatabaseSync): void {
  db.exec('DELETE FROM eventos; DELETE FROM hitos; DELETE FROM obras; DELETE FROM indexador_estado;');
}
