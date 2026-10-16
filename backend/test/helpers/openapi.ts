import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parse } from 'yaml';

// Valida respuestas contra interfaces/openapi.yaml sin copiar esquemas a mano.

type Json = Record<string, unknown>;

const ID_DOC = 'https://opv.test/openapi.yaml';
const doc = parse(readFileSync(new URL('../../../interfaces/openapi.yaml', import.meta.url), 'utf8')) as Json;

// Claves de OpenAPI que no son JSON Schema: se declaran como palabras clave sin efecto para que el
// modo strict siga validando el resto de los esquemas.
const CLAVES_OPENAPI = ['openapi', 'info', 'servers', 'security', 'tags', 'paths', 'components'];

const ajv = new Ajv2020.default({ strict: true, allErrors: true });
addFormats.default(ajv);
ajv.addFormat('binary', true);
for (const k of CLAVES_OPENAPI) ajv.addKeyword(k);
ajv.addSchema({ $id: ID_DOC, ...doc });

const codificar = (segmento: string) => encodeURIComponent(segmento.replaceAll('~', '~0').replaceAll('/', '~1'));

function leerPuntero(segmentos: string[]): unknown {
  let actual: unknown = doc;
  for (const s of segmentos) {
    assert.ok(
      actual !== null && typeof actual === 'object' && s in actual,
      `puntero inexistente: /${segmentos.join('/')}`,
    );
    actual = (actual as Json)[s];
  }
  return actual;
}

/** Sigue `$ref` locales (p. ej. a components/responses) hasta el objeto real; devuelve su puntero. */
function resolver(segmentos: string[]): string[] {
  let ruta = segmentos;
  for (let i = 0; i < 10; i++) {
    const nodo = leerPuntero(ruta) as Json;
    if (typeof nodo.$ref !== 'string') return ruta;
    assert.ok(nodo.$ref.startsWith('#/'), `$ref no local: ${nodo.$ref}`);
    ruta = nodo.$ref
      .slice(2)
      .split('/')
      .map((s) => s.replaceAll('~1', '/').replaceAll('~0', '~'));
  }
  throw new Error('demasiados $ref encadenados');
}

const validadores = new Map<string, ReturnType<typeof ajv.compile>>();

function validadorPara(segmentos: string[]): ReturnType<typeof ajv.compile> {
  const puntero = segmentos.map(codificar).join('/');
  let v = validadores.get(puntero);
  if (!v) {
    v = ajv.compile({ $ref: `${ID_DOC}#/${puntero}` });
    validadores.set(puntero, v);
  }
  return v;
}

/** Valida un valor contra components/schemas/<nombre> del OpenAPI. */
export function validarEsquema(nombre: string, valor: unknown, contexto = nombre): void {
  const v = validadorPara(['components', 'schemas', nombre]);
  assert.ok(
    v(valor),
    `${contexto} no cumple el esquema ${nombre}: ${v.errors ? JSON.stringify(v.errors) : ''}\n${JSON.stringify(valor)}`,
  );
}

export interface RespuestaHttp {
  statusCode: number;
  headers: Record<string, unknown>;
  body: string;
  rawPayload: Buffer;
}

/**
 * Comprueba que el status esté documentado para metodo+ruta, que el content-type coincida con el
 * documentado y que el cuerpo JSON cumpla el esquema. Para cuerpos binarios solo se verifica el
 * content-type (los bytes los comprueba cada prueba). Devuelve el cuerpo JSON (o undefined).
 */
export function validarRespuesta(metodo: string, rutaPlantilla: string, status: number, res: RespuestaHttp): unknown {
  const m = metodo.toLowerCase();
  const etiqueta = `${metodo} ${rutaPlantilla} ${status}`;
  assert.equal(res.statusCode, status, `${etiqueta}: status real ${res.statusCode}: ${res.body.slice(0, 200)}`);
  const paths = doc.paths as Json;
  assert.ok(paths[rutaPlantilla], `ruta no documentada: ${rutaPlantilla}`);
  const operacion = (paths[rutaPlantilla] as Json)[m] as Json | undefined;
  assert.ok(operacion, `método no documentado: ${metodo} ${rutaPlantilla}`);
  assert.ok(String(status) in (operacion.responses as Json), `status no documentado: ${etiqueta}`);

  const base = resolver(['paths', rutaPlantilla, m, 'responses', String(status)]);
  const contenido = (leerPuntero(base) as Json).content as Json | undefined;
  assert.ok(contenido, `${etiqueta} no documenta cuerpo`);
  const tipos = Object.keys(contenido);
  const recibido = String(res.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
  assert.ok(tipos.includes(recibido), `${etiqueta}: content-type '${recibido}' no documentado (${tipos.join(', ')})`);

  if (recibido !== 'application/json') return undefined;
  const cuerpo: unknown = JSON.parse(res.body);
  const v = validadorPara([...base, 'content', recibido, 'schema']);
  assert.ok(v(cuerpo), `${etiqueta}: ${v.errors ? JSON.stringify(v.errors) : ''}\n${res.body.slice(0, 500)}`);
  return cuerpo;
}
