import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { DatabaseSync } from 'node:sqlite';
import { obtenerEvidencia } from '../db/repositorio.ts';
import {
  TAMANO_MAXIMO_BYTES,
  detectarTipo,
  esHashValido,
  guardarArchivoEvidencia,
  rutaEvidencia,
} from '../evidencia/almacen.ts';
import { ErrorHttp } from './errores.ts';

interface Dependencias {
  db: DatabaseSync;
  dirEvidencia: string;
  ahoraSeg: () => number;
}

const CAMPO = 'archivo';

/**
 * Corte rápido: con un Content-Length muy por encima del máximo se responde 413 sin leer el
 * cuerpo. Entre el máximo y este tope se lee todo (descartando lo que sobra) y se responde 413
 * al final, para que el cliente reciba la respuesta en vez de un corte de conexión.
 */
const TOPE_CONTENT_LENGTH = 2 * TAMANO_MAXIMO_BYTES;

function errorMuyGrande(): ErrorHttp {
  const mb = TAMANO_MAXIMO_BYTES / (1024 * 1024);
  return new ErrorHttp(413, 'ArchivoMuyGrande', `El archivo supera el máximo de ${mb} MB`);
}

/** Content-Disposition con el nombre original (RFC 6266 / 5987). */
function contentDisposition(nombre: string): string {
  const ascii = nombre.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

export function registrarRutasEvidencia(
  app: FastifyInstance,
  { db, dirEvidencia, ahoraSeg }: Dependencias,
): void {
  app.post('/evidencia', async (request, reply) => {
    if (!request.isMultipart()) {
      throw new ErrorHttp(
        415,
        'TipoNoPermitido',
        `La solicitud debe ser multipart/form-data con el campo "${CAMPO}"`,
      );
    }
    if (Number(request.headers['content-length'] ?? 0) > TOPE_CONTENT_LENGTH) throw errorMuyGrande();

    let archivo: { contenido: Buffer; nombre: string } | undefined;
    let truncado = false;
    // El límite de tamaño se configura al registrar @fastify/multipart (throwFileSizeLimit: false):
    // busboy deja de entregar bytes al llegar al máximo y marca el stream como truncado.
    try {
      for await (const parte of request.parts()) {
        if (parte.type !== 'file') continue;
        if (parte.fieldname === CAMPO && !archivo) {
          const trozos: Buffer[] = [];
          for await (const trozo of parte.file) trozos.push(trozo as Buffer);
          truncado ||= parte.file.truncated;
          archivo = { contenido: Buffer.concat(trozos), nombre: parte.filename };
        } else {
          // Otros archivos se descartan, pero hay que consumirlos para que el parser avance.
          for await (const _ of parte.file);
        }
      }
    } catch (err) {
      // Los límites de @fastify/multipart traen su status (413, 400). Lo que no lo trae es un error
      // de busboy por un cuerpo mal formado: es un error del cliente, no del servidor.
      if (typeof (err as { statusCode?: unknown }).statusCode === 'number') throw err;
      request.log.info({ err }, 'multipart mal formado');
      throw new ErrorHttp(400, 'SolicitudInvalida', 'El cuerpo multipart/form-data está mal formado');
    }

    if (truncado) throw errorMuyGrande();
    if (!archivo) {
      throw new ErrorHttp(400, 'ArchivoFaltante', `Falta el archivo en el campo "${CAMPO}"`);
    }
    if (archivo.contenido.length === 0) {
      throw new ErrorHttp(400, 'ArchivoVacio', 'El archivo está vacío');
    }
    const tipo = detectarTipo(archivo.contenido);
    if (!tipo) {
      throw new ErrorHttp(415, 'TipoNoPermitido', 'Solo se aceptan imágenes JPEG o PNG y documentos PDF');
    }

    const evidencia = await guardarArchivoEvidencia(
      db,
      dirEvidencia,
      archivo.contenido,
      tipo,
      archivo.nombre,
      ahoraSeg(),
    );
    return reply.code(201).send(evidencia);
  });

  app.get<{ Params: { sha256: string } }>('/evidencia/:sha256', async (request, reply) => {
    const sha256 = request.params.sha256.toLowerCase();
    const noExiste = () =>
      new ErrorHttp(404, 'EvidenciaNoExiste', `No hay evidencia con hash ${request.params.sha256}`);
    if (!esHashValido(sha256)) throw noExiste();

    const ruta = rutaEvidencia(dirEvidencia, sha256);
    const info = await stat(ruta).catch(() => undefined);
    if (!info?.isFile()) throw noExiste();

    const meta = obtenerEvidencia(db, sha256);
    return reply
      .type('application/octet-stream')
      .header('Content-Length', info.size)
      .header('Content-Disposition', contentDisposition(meta?.nombre_original ?? sha256))
      // B4: que el navegador no adivine otro tipo (un PDF o una imagen armados a propósito).
      .header('X-Content-Type-Options', 'nosniff')
      // El contenido nunca cambia para un mismo hash.
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(createReadStream(ruta));
  });
}
