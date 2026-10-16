// Cliente único de la API (interfaces/openapi.yaml v1.0.0) con dos modos:
// - mock (por defecto): datos simulados en memoria (mock/escenario.ts), con los mismos estados que el
//   seed del backend. DATO SIMULADO.
// - api: si NEXT_PUBLIC_API_URL está definida (p. ej. http://localhost:3001), lee del backend.

import { detectarTipo, TIPOS_EVIDENCIA } from "../archivos";
import { sha256Hex } from "../hash";
import type { Alerta, ErrorApi, Evento, Evidencia, Hito, Obra } from "./tipos";

export type ModoApi = "mock" | "api";

export interface ClienteApi {
  readonly modo: ModoApi;
  listarObras(): Promise<Obra[]>;
  /** null si la obra no existe (404). */
  verObra(id: number): Promise<Obra | null>;
  listarHitos(id: number): Promise<Hito[]>;
  /** `desde`: solo eventos posteriores a ese id (refresco incremental). */
  listarEventos(id: number, desde?: string): Promise<Evento[]>;
  listarAlertas(id: number): Promise<Alerta[]>;
  subirEvidencia(archivo: File): Promise<Evidencia>;
  /** URL absoluta (modo api) o relativa al frontend (modo mock) para descargar un archivo por su hash. */
  urlEvidencia(sha256: string): string;
}

/** Error de la API con el `codigo` del esquema Error (o uno local, como SinConexion). */
export class ErrorDeApi extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly estadoHttp?: number,
  ) {
    super(mensaje);
    this.name = "ErrorDeApi";
  }
}

// SUPUESTO: límites de POST /evidencia del OpenAPI (JPEG/PNG o PDF, hasta 10 MB). El modo mock los
// aplica igual que el backend para que la interfaz se comporte igual en los dos modos.
export { TIPOS_EVIDENCIA };
export const TAMANO_MAXIMO_EVIDENCIA = 10 * 1024 * 1024;

// ---- Modo api ----

function crearClienteHttp(base: string): ClienteApi {
  const raiz = base.replace(/\/+$/, "");

  async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
    let respuesta: Response;
    try {
      respuesta = await fetch(`${raiz}${ruta}`, { cache: "no-store", ...init });
    } catch {
      throw new ErrorDeApi("SinConexion", `No se pudo conectar con el backend en ${raiz}.`);
    }
    if (!respuesta.ok) {
      let codigo = `Http${respuesta.status}`;
      let mensaje = `El backend respondió ${respuesta.status} en ${ruta}.`;
      try {
        const cuerpo = (await respuesta.json()) as Partial<ErrorApi>;
        if (cuerpo.error?.codigo) codigo = cuerpo.error.codigo;
        if (cuerpo.error?.mensaje) mensaje = cuerpo.error.mensaje;
      } catch {
        // Sin cuerpo JSON: queda el mensaje genérico.
      }
      throw new ErrorDeApi(codigo, mensaje, respuesta.status);
    }
    return (await respuesta.json()) as T;
  }

  return {
    modo: "api",
    listarObras: () => pedir<Obra[]>("/obras"),
    async verObra(id) {
      try {
        return await pedir<Obra>(`/obras/${id}`);
      } catch (e) {
        if (e instanceof ErrorDeApi && e.estadoHttp === 404) return null;
        throw e;
      }
    },
    listarHitos: (id) => pedir<Hito[]>(`/obras/${id}/hitos`),
    listarEventos: (id, desde) =>
      pedir<Evento[]>(`/obras/${id}/eventos${desde ? `?desde=${encodeURIComponent(desde)}` : ""}`),
    listarAlertas: (id) => pedir<Alerta[]>(`/obras/${id}/alertas`),
    subirEvidencia(archivo) {
      const formulario = new FormData();
      formulario.append("archivo", archivo, archivo.name);
      return pedir<Evidencia>("/evidencia", { method: "POST", body: formulario });
    },
    urlEvidencia: (sha256) => `${raiz}/evidencia/${sha256}`,
  };
}

// ---- Modo mock ----

const copiar = <T>(valor: T): T => structuredClone(valor);

function crearClienteMock(): ClienteApi {
  // Import diferido: el escenario no entra en el paquete del navegador hasta que se usa.
  const escenario = () => import("./mock/escenario").then((m) => m.obtenerEscenario());

  async function obraOError(id: number): Promise<Obra> {
    const obra = (await escenario()).obras.find((o) => o.id === id);
    if (!obra) throw new ErrorDeApi("ObraNoExiste", `No existe la obra ${id}.`, 404);
    return obra;
  }

  return {
    modo: "mock",
    listarObras: async () => copiar((await escenario()).obras),
    async verObra(id) {
      const obra = (await escenario()).obras.find((o) => o.id === id);
      return obra ? copiar(obra) : null;
    },
    async listarHitos(id) {
      const obra = await obraOError(id);
      const hitos = (await escenario()).hitos.get(id) ?? [];
      const ahora = Date.now();
      // `pagable` lo calcula el backend al responder; acá igual: Aprobado, período cumplido y saldo.
      return copiar(hitos).map((h) => ({
        ...h,
        pagable:
          h.estado === "Aprobado" &&
          h.fin_periodo_objecion !== null &&
          ahora >= Date.parse(h.fin_periodo_objecion) &&
          BigInt(obra.saldo) >= BigInt(h.monto_vigente),
      }));
    },
    async listarEventos(id, desde) {
      await obraOError(id);
      const eventos = (await escenario()).eventos.filter(
        (e) => e.obra_id === id && (desde === undefined || e.id > desde),
      );
      return copiar(eventos);
    },
    async listarAlertas(id) {
      await obraOError(id);
      return []; // Hasta la Fase 4.
    },
    async subirEvidencia(archivo) {
      // Mismos códigos y criterio que el backend: el tipo sale de los primeros bytes del archivo,
      // no de la extensión ni del tipo que declara el navegador.
      if (archivo.size === 0) throw new ErrorDeApi("ArchivoVacio", "El archivo está vacío.", 400);
      if (archivo.size > TAMANO_MAXIMO_EVIDENCIA) {
        throw new ErrorDeApi("ArchivoMuyGrande", "El archivo supera los 10 MB.", 413);
      }
      const bytes = new Uint8Array(await archivo.arrayBuffer());
      const tipo = detectarTipo(bytes);
      if (!tipo) {
        throw new ErrorDeApi("TipoNoPermitido", "Solo se aceptan imágenes JPEG o PNG, o archivos PDF.", 415);
      }
      // En modo mock no hay backend: el hash se calcula en el navegador y el archivo no se guarda.
      const sha256 = await sha256Hex(bytes);
      return {
        sha256,
        nombre_original: archivo.name,
        tamano_bytes: archivo.size,
        tipo_mime: tipo,
        url: `/evidencia/${sha256}`,
      };
    },
    urlEvidencia: (sha256) => `/evidencia/${sha256}`,
  };
}

export function crearCliente(apiUrl: string | undefined): ClienteApi {
  const base = apiUrl?.trim();
  return base ? crearClienteHttp(base) : crearClienteMock();
}

export const cliente: ClienteApi = crearCliente(process.env.NEXT_PUBLIC_API_URL);

/** Todo lo que muestran el detalle de una obra y el panel. null si la obra no existe. */
export async function cargarObra(
  id: number,
  api: ClienteApi = cliente,
): Promise<{ obra: Obra; hitos: Hito[]; eventos: Evento[]; alertas: Alerta[] } | null> {
  const obra = await api.verObra(id);
  if (!obra) return null;
  const [hitos, eventos, alertas] = await Promise.all([
    api.listarHitos(id),
    api.listarEventos(id),
    api.listarAlertas(id),
  ]);
  return { obra, hitos: [...hitos].sort((a, b) => a.indice - b.indice), eventos, alertas };
}

/** Id de obra de la URL: entero ≥ 1 (u32 del contrato), o null. */
export function parsearIdObra(texto: string): number | null {
  if (!/^[1-9][0-9]{0,9}$/.test(texto)) return null;
  const id = Number(texto);
  return id <= 0xffffffff ? id : null;
}
