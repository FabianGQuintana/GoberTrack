import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { listarEventos, listarHitos, listarObras, obtenerObra, type ObraFila } from '../db/repositorio.ts';
import { eventoApi, hitoApi, obraApi } from '../dominio/api.ts';
import type { AlertaApi } from '../dominio/tipos.ts';
import { ErrorHttp } from './errores.ts';

interface Dependencias {
  db: DatabaseSync;
  /** Momento actual en segundos Unix; se inyecta para poder fijarlo en las pruebas. */
  ahoraSeg: () => number;
}

interface ParamsObra {
  Params: { id: string };
}

const U32_MAX = 4_294_967_295;

/**
 * El OpenAPI solo documenta 200 y 404 para estas rutas, así que un id que no es un u32 ≥ 1
 * (por ejemplo "abc" o "0") se responde como obra inexistente.
 */
function buscarObra(db: DatabaseSync, idTexto: string): ObraFila {
  const id = /^[1-9][0-9]{0,9}$/.test(idTexto) ? Number(idTexto) : NaN;
  const obra = id <= U32_MAX ? obtenerObra(db, id) : undefined;
  if (!obra) throw new ErrorHttp(404, 'ObraNoExiste', `No existe la obra ${idTexto}`);
  return obra;
}

export function registrarRutasObras(app: FastifyInstance, { db, ahoraSeg }: Dependencias): void {
  app.get('/obras', async () => listarObras(db).map(obraApi));

  app.get<ParamsObra>('/obras/:id', async (request) => obraApi(buscarObra(db, request.params.id)));

  app.get<ParamsObra>('/obras/:id/hitos', async (request) => {
    const obra = buscarObra(db, request.params.id);
    const ahora = ahoraSeg();
    return listarHitos(db, obra.id).map((h) => hitoApi(h, obra, ahora));
  });

  app.get<ParamsObra & { Querystring: { desde?: string | string[] } }>(
    '/obras/:id/eventos',
    async (request) => {
      const obra = buscarObra(db, request.params.id);
      const { desde } = request.query;
      // Si el parámetro viene repetido se toma el primero.
      const cursor = Array.isArray(desde) ? desde[0] : desde;
      return listarEventos(db, obra.id, cursor).map(eventoApi);
    },
  );

  // Las alertas (sobrecosto por adendas) llegan en la Fase 4.
  app.get<ParamsObra>('/obras/:id/alertas', async (request): Promise<AlertaApi[]> => {
    buscarObra(db, request.params.id);
    return [];
  });
}
