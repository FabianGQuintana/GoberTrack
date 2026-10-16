import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ErrorDeApi,
  TAMANO_MAXIMO_EVIDENCIA,
  cargarObra,
  crearCliente,
  parsearIdObra,
} from "@/lib/api/cliente";
import { generarPdf, generarPng } from "@/lib/archivos";

afterEach(() => vi.unstubAllGlobals());

function respuesta(cuerpo: unknown, status = 200): Response {
  return new Response(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("modo del cliente según la URL", () => {
  it.each([undefined, "", "   "])("sin URL (%j) → mock", (url) => {
    expect(crearCliente(url).modo).toBe("mock");
  });
  it("con URL → api", () => {
    expect(crearCliente("http://localhost:3001").modo).toBe("api");
  });
  it("urlEvidencia: relativa en mock, absoluta (sin barras duplicadas) en api", () => {
    const h = "a".repeat(64);
    expect(crearCliente(undefined).urlEvidencia(h)).toBe(`/evidencia/${h}`);
    expect(crearCliente("http://localhost:3001/").urlEvidencia(h)).toBe(`http://localhost:3001/evidencia/${h}`);
    expect(crearCliente(" http://x.test// ").urlEvidencia(h)).toBe(`http://x.test/evidencia/${h}`);
  });
});

describe("modo api con fetch simulado", () => {
  it("pide a la URL base + ruta, sin caché", async () => {
    const f = vi.fn().mockImplementation(async () => respuesta([]));
    vi.stubGlobal("fetch", f);
    const api = crearCliente("http://api.test/");
    await api.listarObras();
    await api.listarHitos(3);
    await api.listarEventos(3);
    await api.listarEventos(3, "0001-0002");
    await api.listarAlertas(3);
    expect(f.mock.calls.map((c) => c[0])).toEqual([
      "http://api.test/obras",
      "http://api.test/obras/3/hitos",
      "http://api.test/obras/3/eventos",
      "http://api.test/obras/3/eventos?desde=0001-0002",
      "http://api.test/obras/3/alertas",
    ]);
    expect(f.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("404 en verObra → null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta({ error: { codigo: "ObraNoExiste", mensaje: "No existe." } }, 404)));
    await expect(crearCliente("http://api.test").verObra(99)).resolves.toBeNull();
  });

  it("verObra devuelve la obra en 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta({ id: 5, nombre: "X" })));
    await expect(crearCliente("http://api.test").verObra(5)).resolves.toMatchObject({ id: 5 });
  });

  it("un 500 en verObra se propaga (no es null)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta({ error: { codigo: "Interno", mensaje: "Falló." } }, 500)));
    await expect(crearCliente("http://api.test").verObra(1)).rejects.toMatchObject({ codigo: "Interno", estadoHttp: 500 });
  });

  it("error JSON {error:{codigo,mensaje}} → ErrorDeApi con ese codigo y mensaje", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respuesta({ error: { codigo: "TipoNoPermitido", mensaje: "Solo imágenes." } }, 415)),
    );
    const e = await crearCliente("http://api.test").listarObras().catch((x) => x);
    expect(e).toBeInstanceOf(ErrorDeApi);
    expect(e).toMatchObject({ codigo: "TipoNoPermitido", message: "Solo imágenes.", estadoHttp: 415, name: "ErrorDeApi" });
  });

  it("error sin cuerpo JSON → código Http<status> y mensaje genérico", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>502</html>", { status: 502 })));
    const e = await crearCliente("http://api.test").listarObras().catch((x) => x);
    expect(e).toBeInstanceOf(ErrorDeApi);
    expect(e.codigo).toBe("Http502");
    expect(e.message).toContain("502");
  });

  it("sin conexión (fetch rechaza) → codigo SinConexion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const e = await crearCliente("http://api.test").listarObras().catch((x) => x);
    expect(e).toBeInstanceOf(ErrorDeApi);
    expect(e.codigo).toBe("SinConexion");
    expect(e.message).toContain("http://api.test");
  });

  it("verObra sin conexión también lanza SinConexion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(crearCliente("http://api.test").verObra(1)).rejects.toMatchObject({ codigo: "SinConexion" });
  });

  it("subirEvidencia envía multipart con el campo `archivo` por POST /evidencia", async () => {
    const f = vi.fn().mockResolvedValue(respuesta({ sha256: "a".repeat(64) }));
    vi.stubGlobal("fetch", f);
    await crearCliente("http://api.test").subirEvidencia(new File(["hola"], "a.pdf", { type: "application/pdf" }));
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://api.test/evidencia");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("archivo")).toBeInstanceOf(File);
  });
});

describe("subirEvidencia en modo mock", () => {
  const api = crearCliente(undefined);
  const archivo = (partes: BlobPart[], tipoDeclarado: string, nombre = "e.bin") =>
    new File(partes, nombre, { type: tipoDeclarado });
  const PDF = "%PDF-1.4\nhola";
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

  it("hash correcto (sha256 de los bytes) y tipo_mime detectado", async () => {
    const r = await api.subirEvidencia(archivo([PDF], "application/pdf", "doc.pdf"));
    const esperado = createHash("sha256").update(PDF).digest("hex");
    expect(r).toEqual({
      sha256: esperado,
      nombre_original: "doc.pdf",
      tamano_bytes: PDF.length,
      tipo_mime: "application/pdf",
      url: `/evidencia/${esperado}`,
    });
  });

  it.each([
    ["image/jpeg", JPEG],
    ["image/png", PNG],
    ["application/pdf", PDF],
  ] as const)("acepta %s por sus primeros bytes", async (tipo, contenido) => {
    await expect(api.subirEvidencia(archivo([contenido], tipo))).resolves.toMatchObject({ tipo_mime: tipo });
  });

  it("el tipo declarado y la extensión no cuentan: manda la firma del archivo", async () => {
    await expect(api.subirEvidencia(archivo([PNG], "application/pdf", "foto.pdf"))).resolves.toMatchObject({
      tipo_mime: "image/png",
    });
    await expect(api.subirEvidencia(archivo([PDF], "", "sin-extension"))).resolves.toMatchObject({
      tipo_mime: "application/pdf",
    });
    await expect(api.subirEvidencia(archivo(["hola"], "application/pdf", "falso.pdf"))).rejects.toMatchObject({
      codigo: "TipoNoPermitido",
      estadoHttp: 415,
    });
  });

  it.each([
    ["texto", "hola mundo"],
    ["GIF", "GIF89a"],
    ["SVG", "<svg xmlns='http://www.w3.org/2000/svg'/>"],
    ["PDF truncado", "%PDF"],
    ["JPEG truncado", new Uint8Array([0xff, 0xd8])],
  ])("TipoNoPermitido con %s", async (_nombre, contenido) => {
    await expect(api.subirEvidencia(archivo([contenido], "application/pdf"))).rejects.toMatchObject({
      codigo: "TipoNoPermitido",
      estadoHttp: 415,
    });
  });

  it("acepta los PDF y PNG que genera el propio frontend", async () => {
    await expect(api.subirEvidencia(archivo([new Uint8Array(generarPdf("t", ["l"]))], ""))).resolves.toMatchObject({
      tipo_mime: "application/pdf",
    });
    await expect(api.subirEvidencia(archivo([new Uint8Array(generarPng("d", [1, 2, 3]))], ""))).resolves.toMatchObject({
      tipo_mime: "image/png",
    });
  });

  it("ArchivoMuyGrande por encima de 10 MB; justo 10 MB pasa", async () => {
    const conFirmaPdf = (n: number) => {
      const b = new Uint8Array(n);
      b.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
      return b;
    };
    await expect(api.subirEvidencia(archivo([conFirmaPdf(TAMANO_MAXIMO_EVIDENCIA + 1)], "application/pdf"))).rejects.toMatchObject({
      codigo: "ArchivoMuyGrande",
      estadoHttp: 413,
    });
    await expect(api.subirEvidencia(archivo([conFirmaPdf(TAMANO_MAXIMO_EVIDENCIA)], "application/pdf"))).resolves.toMatchObject({
      tamano_bytes: TAMANO_MAXIMO_EVIDENCIA,
    });
  });

  it("ArchivoVacio con un archivo vacío (400)", async () => {
    await expect(api.subirEvidencia(archivo([], "application/pdf"))).rejects.toMatchObject({
      codigo: "ArchivoVacio",
      estadoHttp: 400,
    });
  });

  it("vacío tiene prioridad sobre el tipo inválido", async () => {
    await expect(api.subirEvidencia(archivo([], "text/plain"))).rejects.toMatchObject({ codigo: "ArchivoVacio" });
  });
});

describe("cliente mock: lectura", () => {
  const api = crearCliente(undefined);

  it("verObra: obra existente, null si no existe", async () => {
    expect((await api.verObra(1))?.nombre).toBe("Pavimentación calle Los Aromos");
    expect(await api.verObra(99)).toBeNull();
  });

  it("listarHitos / listarEventos / listarAlertas de una obra inexistente → ObraNoExiste", async () => {
    await expect(api.listarHitos(99)).rejects.toMatchObject({ codigo: "ObraNoExiste", estadoHttp: 404 });
    await expect(api.listarEventos(99)).rejects.toMatchObject({ codigo: "ObraNoExiste" });
    await expect(api.listarAlertas(99)).rejects.toMatchObject({ codigo: "ObraNoExiste" });
  });

  it("listarEventos(desde) devuelve solo posteriores", async () => {
    const todos = await api.listarEventos(1);
    expect(todos.length).toBeGreaterThan(3);
    const resto = await api.listarEventos(1, todos[2].id);
    expect(resto.map((e) => e.id)).toEqual(todos.slice(3).map((e) => e.id));
    expect(await api.listarEventos(1, todos[todos.length - 1].id)).toEqual([]);
  });

  it("devuelve copias: mutar el resultado no altera el escenario", async () => {
    const a = await api.listarObras();
    a[0].nombre = "MUTADA";
    expect((await api.listarObras())[0].nombre).not.toBe("MUTADA");
  });

  it("obra 1: el hito 2 Objetado y los pendientes nunca son pagables", async () => {
    expect((await api.listarHitos(1)).map((h) => h.pagable)).toEqual([false, false, false, false]);
  });

  it("cargarObra: ordena los hitos por índice y devuelve null si no existe", async () => {
    const d = await cargarObra(3, api);
    expect(d?.hitos.map((h) => h.indice)).toEqual([0, 1]);
    expect(d?.eventos.length).toBeGreaterThan(0);
    expect(d?.alertas).toEqual([]);
    expect(await cargarObra(99, api)).toBeNull();
  });
});

describe("parsearIdObra", () => {
  it.each([
    ["1", 1],
    ["42", 42],
    ["4294967295", 4294967295],
  ])("%s → %i", (t, n) => expect(parsearIdObra(t)).toBe(n));

  it.each(["0", "01", "-1", "1.5", "abc", "", "4294967296", "99999999999", " 1", "1 ", "1e3"])("%j → null", (t) =>
    expect(parsearIdObra(t)).toBeNull(),
  );
});
