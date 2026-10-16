import { describe, expect, it } from "vitest";
import {
  CODIGOS_ERROR,
  ERRORES,
  MENSAJE_AUTORIZACION_HOST,
  codigoPorNumero,
  esCodigoError,
  mensajeError,
} from "@/lib/errores";

// contract.md §2, en orden, con su número congelado.
const CONTRATO = [
  ["ObraNoExiste", 1],
  ["HitoNoExiste", 2],
  ["NoAutorizado", 3],
  ["RolesDuplicados", 4],
  ["MontoInvalido", 5],
  ["ExcedeMontoTotal", 6],
  ["FondosInsuficientes", 7],
  ["EstadoInvalido", 8],
  ["HitoAnteriorPendiente", 9],
  ["YaDecidio", 10],
  ["ObjecionAbierta", 11],
  ["ObjecionYaUsada", 12],
  ["FueraDePeriodo", 13],
  ["PeriodoNoCumplido", 14],
  ["YaPagado", 15],
] as const;

describe("errores del contrato", () => {
  it("son exactamente 15, en el orden de contract.md §2", () => {
    expect([...CODIGOS_ERROR]).toEqual(CONTRATO.map(([c]) => c));
    expect(Object.keys(ERRORES)).toHaveLength(15);
  });

  it.each(CONTRATO)("%s = #%i, con mensaje no vacío", (codigo, numero) => {
    expect(ERRORES[codigo].numero).toBe(numero);
    expect(ERRORES[codigo].mensaje.trim().length).toBeGreaterThan(10);
    expect(codigoPorNumero(numero)).toBe(codigo);
    expect(mensajeError(numero)).toBe(ERRORES[codigo].mensaje);
    expect(mensajeError(codigo)).toBe(ERRORES[codigo].mensaje);
  });

  it("los números son únicos y consecutivos del 1 al 15", () => {
    const numeros = CODIGOS_ERROR.map((c) => ERRORES[c].numero);
    expect(numeros).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it("los mensajes son distintos entre sí", () => {
    expect(new Set(CODIGOS_ERROR.map((c) => ERRORES[c].mensaje)).size).toBe(15);
  });

  it("números fuera de rango → undefined / mensaje de error desconocido", () => {
    for (const n of [0, 16, -1, 1.5, 999]) {
      expect(codigoPorNumero(n)).toBeUndefined();
      expect(mensajeError(n)).toMatch(/desconocido/i);
    }
  });

  it("esCodigoError", () => {
    expect(esCodigoError("YaPagado")).toBe(true);
    expect(esCodigoError("yaPagado")).toBe(false);
    expect(esCodigoError(3)).toBe(false);
    expect(esCodigoError(undefined)).toBe(false);
  });

  it("existe el mensaje del error de autorización del host", () => {
    expect(MENSAJE_AUTORIZACION_HOST).toMatch(/autorización/i);
  });
});
