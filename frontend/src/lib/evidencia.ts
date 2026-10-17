// ¿Está el archivo de una huella en el almacén de evidencias? Se pregunta con HEAD a
// GET /evidencia/{sha256} (openapi.yaml): 200 = está, 404 = no está. El nombre original sale del
// Content-Disposition que manda el backend (expuesto por CORS). No baja el archivo.

export type ConsultaEvidencia =
  | { estado: "disponible"; nombre: string | null }
  | { estado: "no-disponible" }
  | { estado: "error"; detalle: string };

/** Nombre del archivo en un Content-Disposition: `filename*=UTF-8''…` (RFC 5987) o `filename="…"`. */
export function nombreDeContentDisposition(valor: string | null): string | null {
  if (!valor) return null;
  const extendido = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(valor);
  if (extendido) {
    try {
      return decodeURIComponent(extendido[1].trim());
    } catch {
      // Codificación rota: se prueba con el nombre simple.
    }
  }
  const simple = /filename\s*=\s*"([^"]*)"/i.exec(valor) ?? /filename\s*=\s*([^;]+)/i.exec(valor);
  const nombre = simple?.[1].trim();
  return nombre ? nombre : null;
}

export async function consultarEvidencia(url: string, pedir: typeof fetch = fetch): Promise<ConsultaEvidencia> {
  try {
    const respuesta = await pedir(url, { method: "HEAD", cache: "no-store" });
    if (respuesta.status === 404) return { estado: "no-disponible" };
    if (!respuesta.ok) return { estado: "error", detalle: `respondió ${respuesta.status}` };
    return { estado: "disponible", nombre: nombreDeContentDisposition(respuesta.headers.get("Content-Disposition")) };
  } catch (e) {
    return { estado: "error", detalle: e instanceof Error ? e.message : "no se pudo consultar" };
  }
}
