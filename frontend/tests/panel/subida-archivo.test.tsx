import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubidaArchivo } from "@/components/panel/SubidaArchivo";
import { ErrorDeApi } from "@/lib/api/cliente";
import type { Evidencia } from "@/lib/api/tipos";

const HASH_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const HASH_OTRO = "f".repeat(64);

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

async function subirAbc() {
  const alObtenerHash = vi.fn();
  const usuario = userEvent.setup();
  render(<SubidaArchivo etiqueta="evidencia" alObtenerHash={alObtenerHash} />);
  await usuario.upload(
    screen.getByLabelText("Archivo de evidencia"),
    new File(["abc"], "abc.pdf", { type: "application/pdf" }),
  );
  alObtenerHash.mockClear(); // descarta el null que se emite al elegir el archivo
  await usuario.click(screen.getByRole("button", { name: "Subir y obtener hash" }));
  return alObtenerHash;
}

beforeEach(() => {
  clienteApi.estado.impl = () => Promise.reject(new Error("sin configurar"));
});
afterEach(() => vi.unstubAllGlobals());

describe("SubidaArchivo en modo api", () => {
  it("hash del backend == hash local → confirma la coincidencia y entrega el hash", async () => {
    conRespuesta(evidencia(HASH_ABC));
    const alObtenerHash = await subirAbc();

    expect(await screen.findByText(/el hash coincide con el calculado en tu navegador/)).toBeInTheDocument();
    expect(screen.getByText(HASH_ABC)).toBeInTheDocument();
    expect(alObtenerHash).toHaveBeenCalledTimes(1);
    expect(alObtenerHash).toHaveBeenCalledWith(HASH_ABC);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("hash del backend distinto → alerta 'no coincide' y no se entrega ningún hash", async () => {
    conRespuesta(evidencia(HASH_OTRO));
    const alObtenerHash = await subirAbc();

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("no coincide");
    expect(alerta).toHaveTextContent(HASH_OTRO);
    expect(alerta).toHaveTextContent(HASH_ABC);
    expect(alerta).toHaveTextContent("No se usa");
    expect(alObtenerHash).not.toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/));
    expect(alObtenerHash).not.toHaveBeenCalled();
    expect(screen.queryByText(/el hash coincide/)).not.toBeInTheDocument();
  });

  it("sin WebCrypto → acepta el hash del backend y avisa que no pudo recalcularlo", async () => {
    vi.stubGlobal("crypto", {}); // sin `subtle`, como fuera de un contexto seguro (se restaura en afterEach)
    conRespuesta(evidencia(HASH_OTRO));
    const alObtenerHash = await subirAbc();

    expect(await screen.findByText(/no pudo recalcular el hash/)).toBeInTheDocument();
    expect(alObtenerHash).toHaveBeenCalledWith(HASH_OTRO);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/el hash coincide/)).not.toBeInTheDocument();
  });

  it("subirEvidencia rechaza con ErrorDeApi → muestra el mensaje del backend y no entrega hash", async () => {
    clienteApi.estado.impl = (async () => {
      throw new ErrorDeApi("TipoNoPermitido", "Solo se aceptan imágenes JPEG o PNG y PDF.", 415);
    });
    const alObtenerHash = await subirAbc();

    expect(await screen.findByRole("alert")).toHaveTextContent("Solo se aceptan imágenes JPEG o PNG y PDF.");
    expect(alObtenerHash).not.toHaveBeenCalled();
  });

  it("un error que no es de la API muestra su mensaje", async () => {
    clienteApi.estado.impl = (async () => {
      throw new Error("se cayó");
    });
    await subirAbc();
    expect(await screen.findByRole("alert")).toHaveTextContent("se cayó");
  });

  it("elegir otro archivo después de un hash válido lo invalida con alObtenerHash(null)", async () => {
    conRespuesta(evidencia(HASH_ABC));
    const alObtenerHash = await subirAbc();
    await screen.findByText(/el hash coincide/);
    await userEvent.upload(screen.getByLabelText("Archivo de evidencia"), new File(["otro"], "o.pdf", { type: "application/pdf" }));
    expect(alObtenerHash).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText(/el hash coincide/)).not.toBeInTheDocument();
  });
});
