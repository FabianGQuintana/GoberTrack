import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import {
  MAXIMO_ARCHIVOS_POR_PEDIDO,
  MAXIMO_CAMPOS_POR_PEDIDO,
  TAMANO_MAXIMO_BYTES,
} from './evidencia/almacen.ts';
import { registrarManejoDeErrores } from './http/errores.ts';
import { registrarRutasEvidencia } from './http/rutas-evidencia.ts';
import { registrarRutasObras } from './http/rutas-obras.ts';

export interface OpcionesApp {
  db: DatabaseSync;
  dirEvidencia: string;
  /** Orígenes habilitados para CORS. Por defecto, el frontend en http://localhost:3000. */
  origenesCors?: string[];
  /** Reloj en milisegundos Unix (para `pagable`). Las pruebas lo fijan. */
  ahora?: () => number;
  logger?: FastifyServerOptions['logger'];
}

/** Arma la API de interfaces/openapi.yaml sin abrir el puerto (las pruebas usan app.inject). */
export async function crearApp(opciones: OpcionesApp): Promise<FastifyInstance> {
  const { db, dirEvidencia, origenesCors = ['http://localhost:3000'], logger = false } = opciones;
  const ahora = opciones.ahora ?? Date.now;
  const ahoraSeg = () => Math.floor(ahora() / 1000);

  const app = Fastify({ logger });
  registrarManejoDeErrores(app);

  await app.register(cors, {
    origin: origenesCors,
    methods: ['GET', 'HEAD', 'POST'],
    exposedHeaders: ['Content-Disposition'],
  });
  await app.register(multipart, {
    throwFileSizeLimit: false,
    limits: {
      fileSize: TAMANO_MAXIMO_BYTES,
      files: MAXIMO_ARCHIVOS_POR_PEDIDO,
      fields: MAXIMO_CAMPOS_POR_PEDIDO,
    },
  });

  registrarRutasObras(app, { db, ahoraSeg });
  registrarRutasEvidencia(app, { db, dirEvidencia, ahoraSeg });
  return app;
}
