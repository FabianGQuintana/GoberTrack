import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Esquema SQLite. Las tablas obras e hitos son una copia del estado del contrato
 * (`ver_obra` / `ver_hitos`, interfaces/contract.md §1) con los mismos nombres de campo, y eventos
 * guarda lo que devuelve `getEvents` ya traducido. En la Fase 3 el indexador escribe en estas
 * mismas tablas con las funciones de repositorio.ts, sin cambiar la API.
 *
 * - Montos i128 como TEXT decimal: no entran en un INTEGER de 64 bits.
 * - Momentos u64 como INTEGER: segundos Unix del ledger. La API los pasa a ISO 8601.
 * - Booleanos como INTEGER 0/1.
 * - Lo calculado (saldo, estado de la obra, fin del período, pagable) no se guarda: se deriva
 *   al responder.
 */
const MIGRACIONES: string[] = [
  `
  CREATE TABLE obras (
    id                INTEGER PRIMARY KEY CHECK (id >= 1),
    nombre            TEXT    NOT NULL,
    municipio         TEXT    NOT NULL,
    contratista       TEXT    NOT NULL,
    inspector         TEXT    NOT NULL,
    veedor            TEXT    NOT NULL,
    arbitro           TEXT    NOT NULL,
    token             TEXT    NOT NULL,
    monto_original    TEXT    NOT NULL,
    monto_vigente     TEXT    NOT NULL,
    fondeado          TEXT    NOT NULL,
    pagado            TEXT    NOT NULL,
    periodo_objecion  INTEGER NOT NULL CHECK (periodo_objecion >= 0),
    cantidad_hitos    INTEGER NOT NULL CHECK (cantidad_hitos >= 1),
    creada_en         INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE hitos (
    obra_id                     INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
    indice                      INTEGER NOT NULL CHECK (indice >= 0),
    descripcion                 TEXT    NOT NULL,
    monto_original              TEXT    NOT NULL,
    monto_vigente               TEXT    NOT NULL,
    estado                      TEXT    NOT NULL
      CHECK (estado IN ('Pendiente', 'Evidencia', 'Aprobado', 'Objetado', 'Pagado')),
    evidencia_hash              TEXT,
    momento_declaracion         INTEGER,
    aprobo_inspector            INTEGER NOT NULL CHECK (aprobo_inspector IN (0, 1)),
    aprobo_veedor               INTEGER NOT NULL CHECK (aprobo_veedor IN (0, 1)),
    veedor_por_arbitro          INTEGER NOT NULL CHECK (veedor_por_arbitro IN (0, 1)),
    objecion_usada              INTEGER NOT NULL CHECK (objecion_usada IN (0, 1)),
    motivo_objecion_hash        TEXT,
    momento_aprobacion_completa INTEGER,
    momento_pago                INTEGER,
    PRIMARY KEY (obra_id, indice)
  ) STRICT;

  -- Sin clave foránea a obras: el indexador puede guardar un evento antes de leer el estado.
  CREATE TABLE eventos (
    id       TEXT    PRIMARY KEY,  -- id del RPC: "<toid 19 dígitos>-<índice 10 dígitos>", ordenable como texto
    tipo     TEXT    NOT NULL,     -- nombre legible (TipoEvento), ya traducido del nombre corto on-chain
    obra_id  INTEGER NOT NULL,
    hito     INTEGER,
    ledger   INTEGER NOT NULL,
    momento  INTEGER NOT NULL,
    tx_hash  TEXT    NOT NULL,
    datos    TEXT    NOT NULL      -- JSON con los campos de interfaces/contract.md §4
  ) STRICT;
  CREATE INDEX eventos_por_obra ON eventos (obra_id, id);

  CREATE TABLE evidencias (
    sha256           TEXT    PRIMARY KEY,
    nombre_original  TEXT    NOT NULL,
    tamano_bytes     INTEGER NOT NULL CHECK (tamano_bytes >= 1),
    tipo_mime        TEXT    NOT NULL,
    subida_en        INTEGER NOT NULL
  ) STRICT;

  -- Cursor y metadatos del indexador (Fase 3): último ledger y último id de evento procesados.
  CREATE TABLE indexador_estado (
    clave  TEXT PRIMARY KEY,
    valor  TEXT NOT NULL
  ) STRICT;
  `,
];

export function abrirDb(ruta: string): DatabaseSync {
  if (ruta !== ':memory:') mkdirSync(dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  migrar(db);
  return db;
}

function migrar(db: DatabaseSync): void {
  const fila = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = fila.user_version; v < MIGRACIONES.length; v++) {
    enTransaccion(db, () => {
      db.exec(MIGRACIONES[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

export function enTransaccion<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
