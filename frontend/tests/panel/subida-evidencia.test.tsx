import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubidaEvidencia } from "@/components/panel/SubidaEvidencia";
import { ErrorDeApi } from "@/lib/api/cliente";
import type { Evidencia } from "@/lib/api/tipos";

const HASH_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const HASH_OTRO = "f".repeat(64);
const TITULO = "Arrastrá la evidencia del hito 1";

// Cliente en modo api con `subirEvidencia` simulado; el resto del módulo (ErrorDeApi, tipos permitidos) es el real.
// `subirEvidencia` delega en `impl` (función común, no `vi.fn`): con `vi.fn` + rechazo, Vitest 5 hacía fallar
// el test con el error rechazado aunque el componente lo capturara.
const clienteApi = vi.hoisted(() => {
  const estado = { impl: (_archivo: File): Promise<unknown> => Promise.reject(new Error("sin configurar")) };
  return { modo: "api" as const, estado, subirEvidencia: (archivo: File) => estado.impl(archivo) };
});
vi.mock("@/lib/api/cliente", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("@/lib/api/cliente")>()),
  cliente: clienteApi,
}));

const conRespuesta = (e: Evidencia) => {
  clienteApi.estado.impl = async () => e;
};

const evidencia = (sha256: string): Evidencia => ({
  sha256,
  nombre_original: "abc.pdf",
  tamano_bytes: 3,
  tipo_mime: "application/pdf",
  url: `/evidencia/${sha256}`,
});

/** Elegir el archivo ya lo procesa: lo sube y obtiene la huella (no hay un segundo botón). */
async function subirAbc() {
  const alObtenerHash = vi.fn();
  const usuario = userEvent.setup();
  render(<SubidaEvidencia titulo={TITULO} alObtenerHash={alObtenerHash} />);
  await usuario.upload(screen.getByLabelText(TITULO), new File(["abc"], "abc.pdf", { type: "application/pdf" }));
  return alObtenerHash;
}

/** Llamadas con una huella (sin contar el null que invalida la anterior al elegir). */
const huellasEntregadas = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter(([h]) => h !== null);

beforeEach(() => {
  clienteApi.estado.impl = () => Promise.reject(new Error("sin configurar"));
});
afterEach(() => vi.unstubAllGlobals());

describe("SubidaEvidencia en modo api", () => {
  it("huella del backend == huella local → confirma la coincidencia y la entrega", async () => {
    conRespuesta(evidencia(HASH_ABC));
    const alObtenerHash = await subirAbc();

    expect(await screen.findByText(/la huella coincide con la calculada en tu navegador/)).toBeInTheDocument();
    expect(screen.getByText(HASH_ABC)).toBeInTheDocument();
    expect(screen.getByText("abc.pdf")).toBeInTheDocument();
    expect(huellasEntregadas(alObtenerHash)).toEqual([[HASH_ABC]]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("huella del backend distinta → alerta 'no coincide' y no se entrega ninguna huella", async () => {
    conRespuesta(evidencia(HASH_OTRO));
    const alObtenerHash = await subirAbc();

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("no coincide");
    expect(alerta).toHaveTextContent(HASH_OTRO);
    expect(alerta).toHaveTextContent(HASH_ABC);
    expect(alerta).toHaveTextContent("No se usa");
    expect(huellasEntregadas(alObtenerHash)).toEqual([]);
    expect(screen.queryByText(/la huella coincide/)).not.toBeInTheDocument();
  });

  it("sin WebCrypto → acepta la huella del backend y avisa que no pudo recalcularla", async () => {
    vi.stubGlobal("crypto", {}); // sin `subtle`, como fuera de un contexto seguro (se restaura en afterEach)
    conRespuesta(evidencia(HASH_OTRO));
    const alObtenerHash = await subirAbc();

    expect(await screen.findByText(/no pudo recalcular la huella/)).toBeInTheDocument();
    expect(huellasEntregadas(alObtenerHash)).toEqual([[HASH_OTRO]]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("subirEvidencia rechaza con ErrorDeApi → muestra el mensaje del backend y no entrega huella", async () => {
    clienteApi.estado.impl = async () => {
      throw new ErrorDeApi("TipoNoPermitido", "Solo se aceptan imágenes JPEG o PNG y PDF.", 415);
    };
    const alObtenerHash = await subirAbc();

    expect(await screen.findByRole("alert")).toHaveTextContent("Solo se aceptan imágenes JPEG o PNG y PDF.");
    expect(huellasEntregadas(alObtenerHash)).toEqual([]);
  });

  it("un error que no es de la API muestra su mensaje", async () => {
    clienteApi.estado.impl = async () => {
      throw new Error("se cayó");
    };
    await subirAbc();
    expect(await screen.findByRole("alert")).toHaveTextContent("se cayó");
  });

  it("elegir otro archivo después de una huella válida la invalida con alObtenerHash(null)", async () => {
    conRespuesta(evidencia(HASH_ABC));
    const alObtenerHash = await subirAbc();
    await screen.findByText(/la huella coincide/);
    clienteApi.estado.impl = () => new Promise(() => undefined); // el segundo archivo queda procesando
    await userEvent.upload(screen.getByLabelText(TITULO), new File(["otro"], "o.pdf", { type: "application/pdf" }));
    expect(alObtenerHash).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText(/la huella coincide/)).not.toBeInTheDocument();
  });
});
