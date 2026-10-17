import { describe, expect, it } from "vitest";
import { compararConCadena, decodificarHitosCadena, decodificarObraCadena, ErrorLectura, hashEnCadena, type LecturaCadena } from "@/lib/verificacion";
import { hitoEnEstado, obra } from "../helpers/fixtures";

const bytes = (byte: number) => new Uint8Array(32).fill(byte);
const HEX_AA = "aa".repeat(32);

/** Lo que devuelve scValToNative de ver_obra / ver_hitos (formato verificado contra testnet). */
const obraNativa = (o = obra()) => ({
  id: 1,
  nombre: o.nombre,
  municipio: o.municipio,
  contratista: o.contratista,
  inspector: o.inspector,
  veedor: o.veedor,
  arbitro: o.arbitro,
  token: o.token,
  monto_original: BigInt(o.monto_original),
  monto_vigente: BigInt(o.monto_vigente),
  fondeado: BigInt(o.fondeado),
  pagado: BigInt(o.pagado),
  periodo_objecion: 60n,
  cantidad_hitos: 3,
  estado: ["Activa"],
  creada_en: 1n,
});

const hitoNativo = (indice: number, estado: string, evidencia: Uint8Array | null, motivo: Uint8Array | null = null) => ({
  indice,
  descripcion: "x",
  monto_original: 100n,
  monto_vigente: 100n,
  estado: [estado],
  evidencia_hash: evidencia,
  momento_declaracion: null,
  aprobo_inspector: true,
  aprobo_veedor: false,
  veedor_por_arbitro: false,
  objecion_usada: false,
  motivo_objecion_hash: motivo,
  momento_aprobacion_completa: null,
  momento_pago: null,
});

describe("decodificación de lo que devuelve el contrato", () => {
  it("ver_obra: montos i128 como string", () => {
    expect(decodificarObraCadena(obraNativa())).toMatchObject({ monto_vigente: obra().monto_vigente, pagado: obra().pagado });
  });

  it("ver_hitos: enum como variante, BytesN<32> a hex, Option vacío como null", () => {
    const [h] = decodificarHitosCadena([hitoNativo(0, "Evidencia", bytes(0xaa))]);
    expect(h).toEqual({
      indice: 0,
      estado: "Evidencia",
      evidencia_hash: HEX_AA,
      motivo_objecion_hash: null,
      aprobo_inspector: true,
      aprobo_veedor: false,
    });
  });

  it("un formato inesperado lanza en vez de comparar mal", () => {
    expect(() => decodificarObraCadena(null)).toThrow(ErrorLectura);
    expect(() => decodificarHitosCadena([hitoNativo(0, "Evidencia", new Uint8Array(3))])).toThrow(ErrorLectura);
  });
});

describe("compararConCadena", () => {
  const hitos = [hitoEnEstado(0, "Pagado"), hitoEnEstado(1, "Objetado"), hitoEnEstado(2, "Pendiente")];
  const lectura = (cambios: Partial<{ fondeado: string; estado1: string; evidencia1: string | null }> = {}): LecturaCadena => ({
    obra: { ...decodificarObraCadena(obraNativa()), ...(cambios.fondeado ? { fondeado: cambios.fondeado } : {}) },
    hitos: [
      { indice: 0, estado: "Pagado", evidencia_hash: hitos[0].evidencia_hash, motivo_objecion_hash: null, aprobo_inspector: true, aprobo_veedor: true },
      {
        indice: 1,
        estado: cambios.estado1 ?? "Objetado",
        evidencia_hash: cambios.evidencia1 === undefined ? hitos[1].evidencia_hash : cambios.evidencia1,
        motivo_objecion_hash: hitos[1].motivo_objecion_hash,
        aprobo_inspector: false,
        aprobo_veedor: false,
      },
      { indice: 2, estado: "Pendiente", evidencia_hash: null, motivo_objecion_hash: null, aprobo_inspector: false, aprobo_veedor: false },
    ],
  });

  it("todo igual → todas las filas coinciden (montos, estados, huellas y motivo)", () => {
    const filas = compararConCadena(obra(), hitos, lectura());
    expect(filas.map((f) => f.clave)).toEqual([
      "monto_vigente",
      "fondeado",
      "pagado",
      "estado-0",
      "evidencia-0",
      "estado-1",
      "evidencia-1",
      "motivo-1",
      "estado-2",
    ]);
    expect(filas.every((f) => f.coincide)).toBe(true);
  });

  it("un monto, un estado o una huella distintos se marcan como 'no coincide'", () => {
    const filas = compararConCadena(obra(), hitos, lectura({ fondeado: "1", estado1: "Pendiente", evidencia1: "f".repeat(64) }));
    const distintas = filas.filter((f) => !f.coincide).map((f) => f.clave);
    expect(distintas).toEqual(["fondeado", "estado-1", "evidencia-1"]);
    expect(filas.find((f) => f.clave === "estado-1")?.enCadena).toBe("Pendiente");
  });

  it("hashEnCadena devuelve la huella de la evidencia o del motivo según el contrato", () => {
    expect(hashEnCadena(lectura(), 1, "evidencia")).toBe(hitos[1].evidencia_hash);
    expect(hashEnCadena(lectura(), 1, "motivo")).toBe(hitos[1].motivo_objecion_hash);
    expect(hashEnCadena(lectura(), 9, "evidencia")).toBeNull();
  });
});
