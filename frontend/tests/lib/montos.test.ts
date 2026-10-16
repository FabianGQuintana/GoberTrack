import { describe, expect, it } from "vitest";
import { SIMBOLO_TOKEN, aUnidades, formatearMonto, parsearMonto, porcentaje } from "@/lib/montos";

const MAX_I128 = "170141183460469231731687303715884105727";

describe("formatearMonto", () => {
  it.each([
    ["15000000000", "1.500,0000000"],
    ["0", "0,0000000"],
    ["1", "0,0000001"],
    ["9999999", "0,9999999"],
    ["10000000", "1,0000000"],
    ["10000000000", "1.000,0000000"],
    ["10000000000000", "1.000.000,0000000"],
    ["123456789", "12,3456789"],
  ])("%s → %s", (entrada, salida) => {
    expect(formatearMonto(entrada)).toBe(salida);
  });

  it("el máximo i128 sin pérdida de precisión", () => {
    expect(formatearMonto(MAX_I128)).toBe("17.014.118.346.046.923.173.168.730.371.588,4105727");
    expect(formatearMonto(BigInt(MAX_I128))).toBe(formatearMonto(MAX_I128));
  });

  it("con símbolo", () => {
    expect(formatearMonto("15000000000", true)).toBe(`1.500,0000000 ${SIMBOLO_TOKEN}`);
    expect(formatearMonto("0", true)).toBe(`0,0000000 ${SIMBOLO_TOKEN}`);
  });

  it("acepta bigint, incluso negativo", () => {
    expect(formatearMonto(15000000000n)).toBe("1.500,0000000");
    expect(formatearMonto(-1n)).toBe("-0,0000001");
  });

  it("lanza con strings que no cumplen el patrón de la API", () => {
    expect(() => formatearMonto("1.5")).toThrow();
    expect(() => formatearMonto("")).toThrow();
  });
});

describe("aUnidades", () => {
  it("convierte strings válidos sin perder precisión", () => {
    expect(aUnidades("0")).toBe(0n);
    expect(aUnidades("15000000000")).toBe(15000000000n);
    expect(aUnidades(MAX_I128)).toBe(170141183460469231731687303715884105727n);
  });
  it.each(["1.5", "-1", "", " 1", "1 ", "1e3", "abc", "+1", "0x10"])("lanza con %j", (malo) => {
    expect(() => aUnidades(malo)).toThrow(/Monto inválido/);
  });
});

describe("parsearMonto", () => {
  it.each([
    ["1500", 15000000000n],
    ["1500,5", 15005000000n],
    ["1500.5", 15005000000n],
    ["0,0000001", 1n],
    ["0.1234567", 1234567n],
    ["  25  ", 250000000n],
    ["0", 0n],
    ["007", 70000000n],
  ])("%j → %s", (texto, esperado) => {
    expect(parsearMonto(texto)).toBe(esperado);
  });

  it("7 decimales OK, 8 → null", () => {
    expect(parsearMonto("1,1234567")).toBe(11234567n);
    expect(parsearMonto("1,12345678")).toBeNull();
  });

  it.each(["1.500,5", "1,500.5", "", "   ", "abc", "-1", "1,", ",5", ".5", "1,2,3", "1 500", "1e3", "+1"])(
    "%j → null",
    (texto) => {
      expect(parsearMonto(texto)).toBeNull();
    },
  );

  it('"1.500" es 1,5 (un solo separador es decimal, no de miles)', () => {
    expect(parsearMonto("1.500")).toBe(15000000n);
  });

  it("ida y vuelta con formatearMonto para valores enteros de unidades", () => {
    expect(parsearMonto("1500,0000000")).toBe(15000000000n);
    expect(formatearMonto(parsearMonto("1500,5")!)).toBe("1.500,5000000");
  });
});

describe("porcentaje", () => {
  it("calcula con dos decimales usando BigInt", () => {
    expect(porcentaje("5000", "10000")).toBe(50);
    expect(porcentaje("1", "3")).toBe(33.33);
    expect(porcentaje(1n, 3n)).toBe(33.33);
    expect(porcentaje("10", "10")).toBe(100);
    expect(porcentaje("0", "10")).toBe(0);
  });
  it("trunca (no redondea): 2/3 → 66,66", () => {
    expect(porcentaje("2", "3")).toBe(66.66);
  });
  it("total 0 o negativo → 0", () => {
    expect(porcentaje("5", "0")).toBe(0);
    expect(porcentaje(5n, -1n)).toBe(0);
  });
  it("no pierde precisión con montos enormes", () => {
    expect(porcentaje(MAX_I128, MAX_I128)).toBe(100);
    // MAX es impar: la mitad entera es apenas menos de 50 %, y se trunca a 49,99.
    expect(porcentaje((BigInt(MAX_I128) / 2n).toString(), MAX_I128)).toBe(49.99);
    expect(porcentaje(((BigInt(MAX_I128) + 1n) / 2n).toString(), MAX_I128)).toBe(50);
  });
  it("pagado 10.000 de 40.000 → 25", () => {
    expect(porcentaje("100000000000", "400000000000")).toBe(25);
  });
});
