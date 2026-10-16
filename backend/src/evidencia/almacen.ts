import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { guardarEvidencia, obtenerEvidencia, type EvidenciaFila } from '../db/repositorio.ts';
import type { EvidenciaApi } from '../dominio/tipos.ts';

/** SUPUESTO (openapi.yaml): hasta 10 MB, tomado como 10 MiB. */
export const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

/** Límites del multipart de POST /evidencia (se espera un solo archivo). */
export const MAXIMO_ARCHIVOS_POR_PEDIDO = 5;
export const MAXIMO_CAMPOS_POR_PEDIDO = 20;

export const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type TipoPermitido = (typeof TIPOS_PERMITIDOS)[number];

const HASH_VALIDO = /^[0-9a-f]{64}$/;

/**
 * Tipo según los primeros bytes del archivo (firma), no según lo que declara el cliente:
 * JPEG FF D8 FF · PNG 89 50 4E 47 0D 0A 1A 0A · PDF "%PDF-".
 */
export function detectarTipo(contenido: Buffer): TipoPermitido | null {
  const empieza = (firma: number[]) =>
    contenido.length >= firma.length && firma.every((b, i) => contenido[i] === b);
  if (empieza([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (empieza([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (empieza([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  return null;
}

export function sha256Hex(contenido: Buffer): string {
  return createHash('sha256').update(contenido).digest('hex');
}

export function esHashValido(valor: string): boolean {
  return HASH_VALIDO.test(valor);
}

/** Ruta del archivo en disco. Solo se llama con hashes validados (no hay forma de salir del directorio). */
export function rutaEvidencia(dir: string, sha256: string): string {
  if (!esHashValido(sha256)) throw new Error(`hash inválido: ${sha256}`);
  return join(dir, sha256);
}

/** Quita rutas que algunos navegadores mandan en el nombre y acota el largo. */
function limpiarNombre(nombre: string | undefined): string {
  const base = (nombre ?? '').split(/[\\/]/).pop()?.trim() ?? '';
  return base.slice(0, 255) || 'archivo';
}

export function evidenciaApi(fila: EvidenciaFila): EvidenciaApi {
  return {
    sha256: fila.sha256,
    nombre_original: fila.nombre_original,
    tamano_bytes: fila.tamano_bytes,
    tipo_mime: fila.tipo_mime,
    url: `/evidencia/${fila.sha256}`,
  };
}

/**
 * Guarda el archivo como <dir>/<sha256> y registra sus metadatos. Idempotente: si el mismo
 * contenido ya estaba, no lo reescribe y devuelve los metadatos de la primera subida.
 * Quien llama ya validó tamaño y tipo (`tipo` es el detectado por firma).
 */
export async function guardarArchivoEvidencia(
  db: DatabaseSync,
  dir: string,
  contenido: Buffer,
  tipo: TipoPermitido,
  nombreOriginal: string | undefined,
  ahoraSeg: number,
): Promise<EvidenciaApi> {
  const sha256 = sha256Hex(contenido);
  const destino = rutaEvidencia(dir, sha256);

  if (!existsSync(destino)) {
    await mkdir(dir, { recursive: true });
    // Escritura atómica: un archivo a medio escribir nunca queda con el nombre del hash.
    const temporal = `${destino}.${randomBytes(6).toString('hex')}.tmp`;
    try {
      await writeFile(temporal, contenido);
      await rename(temporal, destino);
    } catch (err) {
      await rm(temporal, { force: true });
      if (!existsSync(destino)) throw err;
    }
  }

  guardarEvidencia(db, {
    sha256,
    nombre_original: limpiarNombre(nombreOriginal),
    tamano_bytes: contenido.length,
    tipo_mime: tipo,
    subida_en: ahoraSeg,
  });
  return evidenciaApi(obtenerEvidencia(db, sha256)!);
}
