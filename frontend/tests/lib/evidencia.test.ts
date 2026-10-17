import { describe, expect, it, vi } from "vitest";
import { consultarEvidencia, nombreDeContentDisposition } from "@/lib/evidencia";

describe("nombreDeContentDisposition", () => {
  it("prefiere filename* (UTF-8) sobre filename", () => {
    expect(nombreDeContentDisposition(`attachment; filename="acta_medicion.pdf"; filename*=UTF-8''acta%20medici%C3%B3n.pdf`)).toBe(
      "acta medición.pdf",
    );
  });

  it("usa filename si no hay filename*", () => {
    expect(nombreDeContentDisposition('attachment; filename="foto-hito1.jpg"')).toBe("foto-hito1.jpg");
  });

  it("sin cabecera o sin nombre devuelve null", () => {
    expect(nombreDeContentDisposition(null)).toBeNull();
    expect(nombreDeContentDisposition("attachment")).toBeNull();
  });
});

describe("consultarEvidencia (HEAD, sin bajar el archivo)", () => {
  const respuesta = (status: number, disposicion?: string) =>
    new Response(null, { status, headers: disposicion ? { "Content-Disposition": disposicion } : {} });

  it("200 → disponible con el nombre original", async () => {
    const pedir = vi.fn().mockResolvedValue(respuesta(200, 'attachment; filename="a.pdf"'));
    expect(await consultarEvidencia("http://api/evidencia/x", pedir)).toEqual({ estado: "disponible", nombre: "a.pdf" });
    expect(pedir).toHaveBeenCalledWith("http://api/evidencia/x", { method: "HEAD", cache: "no-store" });
  });

  it("404 → no disponible; otro error o una falla de red → error (no se da por faltante)", async () => {
    expect(await consultarEvidencia("u", vi.fn().mockResolvedValue(respuesta(404)))).toEqual({ estado: "no-disponible" });
    expect((await consultarEvidencia("u", vi.fn().mockResolvedValue(respuesta(500)))).estado).toBe("error");
    expect((await consultarEvidencia("u", vi.fn().mockRejectedValue(new Error("sin red")))).estado).toBe("error");
  });
});
