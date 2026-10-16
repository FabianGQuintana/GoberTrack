import { describe, expect, it } from "vitest";
import { GET } from "@/app/evidencia/[sha256]/route";
import { obtenerEscenario } from "@/lib/api/mock/escenario";
import { sha256Hex } from "@/lib/hash";

const pedir = (sha256: string) =>
  GET(new Request(`http://localhost/evidencia/${sha256}`), { params: Promise.resolve({ sha256 }) });

describe("GET /evidencia/[sha256] (modo mock)", () => {
  it("200 application/octet-stream con un hash del escenario, y los bytes hashean a lo pedido", async () => {
    const esc = await obtenerEscenario();
    const [hash, archivo] = [...esc.archivos][0];
    const res = await pedir(hash);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("content-disposition")).toContain(archivo.nombre);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(await sha256Hex(bytes)).toBe(hash);
  });

  it("responde 200 para todos los archivos del escenario", async () => {
    const esc = await obtenerEscenario();
    for (const hash of esc.archivos.keys()) expect((await pedir(hash)).status).toBe(200);
  });

  it("404 con JSON de error con un hash válido pero desconocido", async () => {
    const res = await pedir("0".repeat(64));
    expect(res.status).toBe(404);
    expect((await res.json()).error.codigo).toBe("EvidenciaNoExiste");
  });

  it.each(["abc", "", "G".repeat(64), "A".repeat(64), "a".repeat(63), "a".repeat(65), "../../etc/passwd"])(
    "404 con un hash inválido (%j)",
    async (malo) => {
      expect((await pedir(malo)).status).toBe(404);
    },
  );
});
