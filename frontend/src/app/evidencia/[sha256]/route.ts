// GET /evidencia/{sha256} del modo mock: sirve los archivos simulados del escenario para que el enlace
// del tablero funcione sin backend. Igual que la API (openapi.yaml), responde application/octet-stream.
// En modo API los enlaces apuntan directo al backend y esta ruta responde 404.

import { cliente } from "@/lib/api/cliente";
import { obtenerEscenario } from "@/lib/api/mock/escenario";
import { esHash } from "@/lib/hash";

const noEncontrado = () =>
  Response.json({ error: { codigo: "EvidenciaNoExiste", mensaje: "No hay un archivo con ese hash." } }, { status: 404 });

export async function GET(_request: Request, { params }: { params: Promise<{ sha256: string }> }) {
  const { sha256 } = await params;
  if (cliente.modo !== "mock" || !esHash(sha256)) return noEncontrado();
  const archivo = (await obtenerEscenario()).archivos.get(sha256);
  if (!archivo) return noEncontrado();
  return new Response(archivo.contenido as BodyInit, {
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="${archivo.nombre}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

/** HEAD: lo usa el tablero para saber si el archivo está y cuál es su nombre, sin bajarlo. */
export async function HEAD(request: Request, contexto: { params: Promise<{ sha256: string }> }) {
  const respuesta = await GET(request, contexto);
  return new Response(null, { status: respuesta.status, headers: respuesta.headers });
}
