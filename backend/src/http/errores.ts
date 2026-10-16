import type { FastifyInstance } from 'fastify';
import type { ErrorApi } from '../dominio/tipos.ts';
import { MAXIMO_ARCHIVOS_POR_PEDIDO, MAXIMO_CAMPOS_POR_PEDIDO } from '../evidencia/almacen.ts';

/** Errores de @fastify/multipart (sus mensajes vienen en inglés) → mensaje en castellano. */
const MENSAJES_MULTIPART: Record<string, string> = {
  FST_FILES_LIMIT: `Se espera un solo archivo en el campo "archivo" (máximo ${MAXIMO_ARCHIVOS_POR_PEDIDO} archivos por solicitud)`,
  FST_FIELDS_LIMIT: `La solicitud tiene demasiados campos de texto (máximo ${MAXIMO_CAMPOS_POR_PEDIDO})`,
  FST_PARTS_LIMIT: 'La solicitud tiene demasiadas partes',
  FST_PROTO_VIOLATION: 'Nombre de campo no permitido',
  FST_MP_PREMATURE_CLOSE: 'La solicitud se cortó antes de terminar de enviar el formulario',
};

/** Error con status HTTP y `codigo` para el cuerpo `{ error: { codigo, mensaje } }` del OpenAPI. */
export class ErrorHttp extends Error {
  readonly status: number;
  readonly codigo: string;

  constructor(status: number, codigo: string, mensaje: string) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

export function cuerpoError(codigo: string, mensaje: string): ErrorApi {
  return { error: { codigo, mensaje } };
}

interface ErrorConStatus {
  statusCode?: unknown;
  code?: unknown;
  message?: unknown;
}

/** Traduce errores propios, de Fastify y de @fastify/multipart al formato del OpenAPI. */
export function registrarManejoDeErrores(app: FastifyInstance): void {
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ErrorHttp) {
      return reply.code(err.status).send(cuerpoError(err.codigo, err.message));
    }

    const e = (err ?? {}) as ErrorConStatus;
    const status = typeof e.statusCode === 'number' && e.statusCode >= 400 ? e.statusCode : 500;
    if (status >= 500) {
      request.log.error({ err }, 'error no controlado');
      return reply.code(500).send(cuerpoError('ErrorInterno', 'Error interno del servidor'));
    }

    const traducido = typeof e.code === 'string' ? MENSAJES_MULTIPART[e.code] : undefined;
    const mensaje =
      traducido ?? (typeof e.message === 'string' ? `Solicitud inválida: ${e.message}` : 'Solicitud inválida');
    if (e.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send(cuerpoError('ArchivoMuyGrande', 'El archivo supera el tamaño máximo'));
    }
    if (e.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
      const tipo = request.headers['content-type'] ?? '(ninguno)';
      return reply.code(415).send(cuerpoError('TipoNoPermitido', `Content-Type no soportado: ${tipo}`));
    }
    if (status === 413) return reply.code(413).send(cuerpoError('SolicitudMuyGrande', mensaje));
    return reply.code(status).send(cuerpoError('SolicitudInvalida', mensaje));
  });

  app.setNotFoundHandler((request, reply) => {
    reply
      .code(404)
      .send(cuerpoError('RutaNoExiste', `No existe la ruta ${request.method} ${request.url}`));
  });
}
