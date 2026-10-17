import { describe, expect, it } from "vitest";
import type { Evento } from "@/lib/api/tipos";
import { avisosDeObra } from "@/lib/atencion";
import { AHORA, declaradoHace, hito, hitoEnEstado, iso, obra, UNIDAD } from "../helpers/fixtures";

const tipos = (a: ReturnType<typeof avisosDeObra>) => a.map((x) => x.tipo);

function declaracion(indice: number, hash: string, haceMs: number, id: string): Evento {
  return {
    id,
    tipo: "HitoDeclarado",
    obra_id: 1,
    hito: indice,
    ledger: 1,
    momento: iso(AHORA - haceMs),
    tx_hash: "0".repeat(64),
    datos: { evidencia_hash: hash },
  };
}

describe("avisosDeObra", () => {
  it("sin nada para destrabar no hay avisos", () => {
    const hitos = [hitoEnEstado(0, "Pagado"), hitoEnEstado(1, "Evidencia"), hitoEnEstado(2, "Pendiente")];
    expect(avisosDeObra(obra(), hitos, [], { ahora: AHORA })).toEqual([]);
  });

  it("objeción abierta → aviso del hito objetado", () => {
    const a = avisosDeObra(obra(), [hitoEnEstado(0, "Pagado"), hitoEnEstado(1, "Objetado")], [], { ahora: AHORA });
    expect(tipos(a)).toEqual(["objecion-abierta"]);
    expect(a[0].hito).toBe(1);
    expect(a[0].titulo).toBe("Hay una objeción abierta esperando al árbitro");
  });

  it("hito pagable (según el backend) que nadie liberó", () => {
    const h = { ...hitoEnEstado(1, "Aprobado"), pagable: true };
    expect(tipos(avisosDeObra(obra(), [hitoEnEstado(0, "Pagado"), h], [], { ahora: AHORA }))).toEqual(["pago-sin-liberar"]);
  });

  it("veedor sin decidir con el período vencido; sin reloj no se evalúa", () => {
    const h = hito(1, "Evidencia", { ...declaradoHace(120_000), aprobo_inspector: true });
    const hitos = [hitoEnEstado(0, "Pagado"), h];
    expect(tipos(avisosDeObra(obra(), hitos, [], { ahora: AHORA }))).toEqual(["veedor-sin-decidir"]);
    expect(avisosDeObra(obra(), hitos, [], { ahora: null })).toEqual([]);
    // Dentro del período todavía no es un problema.
    const dentro = hito(1, "Evidencia", declaradoHace(30_000));
    expect(avisosDeObra(obra(), [hitoEnEstado(0, "Pagado"), dentro], [], { ahora: AHORA })).toEqual([]);
  });

  it("evidencia declarada que no está en el almacén", () => {
    const h = { ...hitoEnEstado(1, "Evidencia"), evidencia_hash: "e".repeat(64) };
    const a = avisosDeObra(obra(), [hitoEnEstado(0, "Pagado"), h], [], {
      ahora: AHORA,
      evidenciasFaltantes: new Set([h.evidencia_hash!]),
    });
    expect(tipos(a)).toEqual(["evidencia-no-disponible"]);
  });

  it("re-declaración con la misma evidencia que la anterior", () => {
    const h = hitoEnEstado(1, "Evidencia");
    const eventos = [declaracion(1, h.evidencia_hash!, 900_000, "1"), declaracion(1, h.evidencia_hash!, 30_000, "2")];
    expect(tipos(avisosDeObra(obra(), [hitoEnEstado(0, "Pagado"), h], eventos, { ahora: AHORA }))).toEqual(["misma-evidencia"]);
  });

  it("saldo menor que el monto del próximo hito sin pagar", () => {
    const a = avisosDeObra(obra({ saldo: (5n * UNIDAD).toString() }), [hitoEnEstado(0, "Pagado"), hitoEnEstado(1, "Pendiente")], [], {
      ahora: AHORA,
    });
    expect(tipos(a)).toEqual(["saldo-insuficiente"]);
    expect(a[0].detalle).toContain("El hito 2 necesita 10,0000000 USDCDEMO y hay 5,0000000 USDCDEMO bloqueados.");
  });

  it("obra finalizada (todo pagado) no pide saldo", () => {
    expect(avisosDeObra(obra({ saldo: "0" }), [hitoEnEstado(0, "Pagado")], [], { ahora: AHORA })).toEqual([]);
  });
});
