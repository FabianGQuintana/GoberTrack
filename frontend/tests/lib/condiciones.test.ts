import { describe, expect, it } from "vitest";
import { condicionesDePago } from "@/lib/condiciones";
import { AHORA, hito, hitoEnEstado, hitosConObjetivo, obra, UNIDAD } from "../helpers/fixtures";

const cumplidas = (c: ReturnType<typeof condicionesDePago>) => c.filter((x) => x.cumplida).map((x) => x.clave);

describe("condicionesDePago (las 6 condiciones del contrato, explicadas)", () => {
  it("son seis, en el orden del PRD", () => {
    const c = condicionesDePago(obra(), hitosConObjetivo("Aprobado"), hitoEnEstado(1, "Aprobado"), AHORA);
    expect(c.map((x) => x.clave)).toEqual(["inspector", "veedor", "periodo", "sin-objecion", "anterior", "saldo"]);
  });

  it("hito Aprobado con período vencido y saldo: se cumplen todas", () => {
    const c = condicionesDePago(obra(), hitosConObjetivo("Aprobado"), hitoEnEstado(1, "Aprobado"), AHORA);
    expect(cumplidas(c)).toHaveLength(6);
  });

  it("hito Objetado: faltan el veedor y que no haya objeción abierta", () => {
    const h = { ...hitoEnEstado(1, "Objetado"), aprobo_inspector: true };
    const c = condicionesDePago(obra(), [hitoEnEstado(0, "Pagado"), h], h, AHORA + 120_000);
    expect(cumplidas(c)).toEqual(["inspector", "periodo", "anterior", "saldo"]);
    expect(c.find((x) => x.clave === "veedor")?.detalle).toContain("Falta la decisión del árbitro.");
  });

  it("período en curso: no se cumple y dice cuándo termina; pagable del backend lo da por cumplido", () => {
    const h = hitoEnEstado(1, "Evidencia");
    expect(condicionesDePago(obra(), [hitoEnEstado(0, "Pagado"), h], h, AHORA).find((x) => x.clave === "periodo")?.cumplida).toBe(false);
    const pagable = { ...hitoEnEstado(1, "Aprobado"), pagable: true };
    expect(condicionesDePago(obra(), [hitoEnEstado(0, "Pagado"), pagable], pagable, null).find((x) => x.clave === "periodo")?.cumplida).toBe(true);
  });

  it("saldo insuficiente y hito anterior pendiente", () => {
    const h = hito(1, "Pendiente");
    const c = condicionesDePago(obra({ saldo: (5n * UNIDAD).toString() }), [hito(0, "Evidencia"), h], h, AHORA);
    expect(c.find((x) => x.clave === "saldo")?.cumplida).toBe(false);
    expect(c.find((x) => x.clave === "anterior")?.cumplida).toBe(false);
    expect(c.find((x) => x.clave === "periodo")?.detalle).toBe("Empieza cuando el contratista declara el hito.");
  });
});
