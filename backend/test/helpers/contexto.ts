import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { crearApp } from '../../src/app.ts';
import { abrirDb } from '../../src/db/conexion.ts';
import type { EventoIndexado, HitoContrato, ObraContrato } from '../../src/dominio/tipos.ts';

export interface Contexto {
  app: FastifyInstance;
  db: DatabaseSync;
  dirEvidencia: string;
  cerrar: () => Promise<void>;
}

/** Reloj fijo por defecto: 2026-10-16T00:00:00Z. */
export const AHORA_MS = Date.UTC(2026, 9, 16);

export async function crearContexto(ahora: () => number = () => AHORA_MS): Promise<Contexto> {
  const raiz = await mkdtemp(join(tmpdir(), 'opv-test-'));
  const dirEvidencia = join(raiz, 'evidencia');
  const db = abrirDb(':memory:');
  const app = await crearApp({ db, dirEvidencia, ahora });
  return {
    app,
    db,
    dirEvidencia,
    cerrar: async () => {
      await app.close();
      db.close();
      await rm(raiz, { recursive: true, force: true });
    },
  };
}

export const G = (c: string) => 'G' + c.repeat(55);
export const HASH = (c: string) => c.repeat(64);

export function obra(parcial: Partial<ObraContrato> = {}): ObraContrato {
  return {
    id: 1,
    nombre: 'Obra de prueba',
    municipio: G('A'),
    contratista: G('B'),
    inspector: G('C'),
    veedor: G('D'),
    arbitro: G('E'),
    token: 'C' + 'F'.repeat(55),
    monto_original: 1000n,
    monto_vigente: 1000n,
    fondeado: 0n,
    pagado: 0n,
    periodo_objecion: 3600,
    cantidad_hitos: 1,
    creada_en: 1_700_000_000,
    ...parcial,
  };
}

export function hito(parcial: Partial<HitoContrato> = {}): HitoContrato {
  return {
    indice: 0,
    descripcion: 'Hito de prueba',
    monto_original: 500n,
    monto_vigente: 500n,
    estado: 'Pendiente',
    evidencia_hash: null,
    momento_declaracion: null,
    aprobo_inspector: false,
    aprobo_veedor: false,
    veedor_por_arbitro: false,
    objecion_usada: false,
    motivo_objecion_hash: null,
    momento_aprobacion_completa: null,
    momento_pago: null,
    ...parcial,
  };
}

/** Id de evento con el formato del RPC: "<19 dígitos>-<10 dígitos>". */
export function idEvento(toid: number | bigint, indice = 0): string {
  return `${String(toid).padStart(19, '0')}-${String(indice).padStart(10, '0')}`;
}

export function evento(parcial: Partial<EventoIndexado> & Pick<EventoIndexado, 'id'>): EventoIndexado {
  return {
    tipo: 'ObraCreada',
    obra_id: 1,
    hito: null,
    ledger: 1000,
    momento: 1_700_000_000,
    tx_hash: HASH('a'),
    datos: {},
    ...parcial,
  };
}

export interface Multipart {
  payload: Buffer;
  headers: Record<string, string>;
}

/** Cuerpo multipart/form-data con un archivo, armado a mano. */
export function multipart(campo: string, nombre: string, mime: string, contenido: Buffer): Multipart {
  const limite = '----opvtest' + Math.random().toString(16).slice(2);
  const cabecera = `--${limite}\r\nContent-Disposition: form-data; name="${campo}"; filename="${nombre}"\r\nContent-Type: ${mime}\r\n\r\n`;
  const payload = Buffer.concat([Buffer.from(cabecera), contenido, Buffer.from(`\r\n--${limite}--\r\n`)]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${limite}` } };
}

/** Multipart con solo un campo de texto (sin archivo). */
export function multipartSoloTexto(campo: string, valor: string): Multipart {
  const limite = '----opvtest' + Math.random().toString(16).slice(2);
  const texto = `--${limite}\r\nContent-Disposition: form-data; name="${campo}"\r\n\r\n${valor}\r\n--${limite}--\r\n`;
  return { payload: Buffer.from(texto), headers: { 'content-type': `multipart/form-data; boundary=${limite}` } };
}

/** PNG mínimo válido de 1×1 píxel. */
export const PNG_MINIMO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
/** PDF mínimo. */
export const PDF_MINIMO = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
