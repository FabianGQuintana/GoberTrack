import { describe, expect, it } from "vitest";
import type { Evento, TipoEvento } from "@/lib/api/tipos";
import { describirEvento, historialEvidencia } from "@/lib/eventos";
import { AHORA, iso, obra } from "../helpers/fixtures";

const O = obra({ inspector: "GINSPECTOR", veedor: "GVEEDOR", municipio: "GMUNI", arbitro: "GMUNI" });
const H1 = "1".repeat(64);
const H2 = "2".repeat(64);

function evento(tipo: TipoEvento, hito: number | null, datos: Record<string, unknown>, id = "0001"): Evento {
  return { id, tipo, obra_id: 1, hito, ledger: 100, momento: iso(AHORA), tx_hash: "f".repeat(64), datos };
}

const CASOS: [TipoEvento, number | null, Record<string, unknown>, RegExp][] = [
  ["ObraCreada", null, { nombre: "Puente", monto_original: "150000000000", cantidad_hitos: 3, periodo_objecion: 60 }, /Obra creada.*Puente.*3 hitos.*15\.000,0000000.*1 min/s],
  ["ObraFondeada", null, { monto: "100000000", fondeado: "250000000" }, /Fondeo.*10,0000000.*25,0000000/s],
  ["HitoDeclarado", 0, { evidencia_hash: H1, fin_periodo: iso(AHORA + 60000) }, /Hito 1 declarado/],
  ["HitoAprobado", 1, { firmante: "GINSPECTOR", completo: false }, /Hito 2 aprobado/],
  ["HitoObjetado", 1, { motivo_hash: H2 }, /Hito 2 objetado/],
  ["ObjecionResuelta", 1, { decision: "Aceptar", estado: "Pendiente" }, /Objeción del hito 2 aceptada/],
  ["PagoLiberado", 2, { contratista: "GCONTRATISTA", monto: "100000000", pagado: "300000000" }, /Pago del hito 3 liberado.*10,0000000.*30,0000000/s],
  ["AdendaRegistrada", 0, {}, /Adenda en el hito 1/],
];

describe("describirEvento", () => {
  it.each(CASOS)("%s da título y texto en castellano", (tipo, hito, datos, titulo) => {
    const d = describirEvento(evento(tipo, hito, datos), O);
    expect(d.titulo + " " + d.detalle).toMatch(titulo);
    expect(d.titulo.length).toBeGreaterThan(0);
  });

  it("cubre los ocho TipoEvento", () => {
    expect(new Set(CASOS.map((c) => c[0])).size).toBe(8);
  });

  it("numera el hito como el usuario (índice + 1) y '?' si no hay hito", () => {
    expect(describirEvento(evento("HitoDeclarado", 0, {}), O).titulo).toContain("Hito 1");
    expect(describirEvento(evento("HitoDeclarado", null, {}), O).titulo).toContain("Hito ?");
  });

  it("HitoDeclarado: fin_periodo ISO", () => {
    const d = describirEvento(evento("HitoDeclarado", 0, { evidencia_hash: H1, fin_periodo: "2026-10-16T15:01:00Z" }), O);
    expect(d.detalle).toContain("El período de objeción termina el 16/10/2026, 12:01:00");
    expect(d.archivo).toEqual({ etiqueta: "Evidencia", hash: H1 });
  });

  it("HitoDeclarado: fin_periodo como número de segundos (u64)", () => {
    const seg = Date.parse("2026-10-16T15:01:00Z") / 1000;
    const d = describirEvento(evento("HitoDeclarado", 0, { evidencia_hash: H1, fin_periodo: seg }), O);
    expect(d.detalle).toContain("termina el 16/10/2026, 12:01:00");
  });

  it("HitoDeclarado: fin_periodo como string de segundos", () => {
    const seg = String(Date.parse("2026-10-16T15:01:00Z") / 1000);
    const d = describirEvento(evento("HitoDeclarado", 0, { evidencia_hash: H1, fin_periodo: seg }), O);
    expect(d.detalle).toContain("termina el 16/10/2026, 12:01:00");
  });

  it("HitoDeclarado: sin fin_periodo o con hash inválido no rompe y omite el archivo", () => {
    const d = describirEvento(evento("HitoDeclarado", 0, { evidencia_hash: "zz" }), O);
    expect(d.detalle).not.toContain("termina");
    expect(d.archivo).toBeUndefined();
  });

  it("HitoAprobado nombra al firmante como inspector o veedor", () => {
    expect(describirEvento(evento("HitoAprobado", 0, { firmante: O.inspector, completo: false }), O).titulo).toBe(
      "Hito 1 aprobado por el inspector",
    );
    expect(describirEvento(evento("HitoAprobado", 0, { firmante: O.veedor, completo: true }), O).titulo).toBe(
      "Hito 1 aprobado por el veedor",
    );
  });

  it("HitoAprobado: completo true/false cambia el detalle", () => {
    expect(describirEvento(evento("HitoAprobado", 0, { firmante: O.veedor, completo: true }), O).detalle).toMatch(/las dos/);
    expect(describirEvento(evento("HitoAprobado", 0, { firmante: O.veedor, completo: false }), O).detalle).toMatch(/Falta/);
  });

  it("HitoAprobado con firmante desconocido usa la dirección abreviada", () => {
    const d = describirEvento(evento("HitoAprobado", 0, { firmante: "GABCDEFGHIJKLMNOP", completo: false }), O);
    expect(d.titulo).toContain("GABC…MNOP");
  });

  it("HitoObjetado adjunta el motivo", () => {
    expect(describirEvento(evento("HitoObjetado", 0, { motivo_hash: H2 }), O).archivo).toEqual({
      etiqueta: "Motivo",
      hash: H2,
    });
  });

  it("ObjecionResuelta: Aceptar, Rechazar y decisión desconocida", () => {
    expect(describirEvento(evento("ObjecionResuelta", 0, { decision: "Aceptar", estado: "Pendiente" }), O).titulo).toMatch(/aceptada/);
    const r = describirEvento(evento("ObjecionResuelta", 0, { decision: "Rechazar", estado: "Aprobado" }), O);
    expect(r.titulo).toMatch(/rechazada/);
    expect(r.detalle).toContain("Aprobado");
    expect(describirEvento(evento("ObjecionResuelta", 0, { estado: "Evidencia" }), O).titulo).toMatch(/resuelta/);
  });

  it("datos ausentes no lanzan", () => {
    for (const [tipo] of CASOS) {
      expect(() => describirEvento({ ...evento(tipo, 0, {}), datos: undefined as never }, O)).not.toThrow();
    }
  });

  it("monto inválido → texto neutro, nunca NaN", () => {
    const d = describirEvento(evento("ObraFondeada", null, { monto: "abc", fondeado: null }), O);
    expect(d.detalle).not.toMatch(/NaN|undefined/);
    expect(d.detalle).toContain("un monto no informado");
  });
});

describe("historialEvidencia", () => {
  it("lista los hashes de cada declaración del hito, en orden, ignorando otros hitos", () => {
    const eventos = [
      evento("HitoDeclarado", 0, { evidencia_hash: H1 }, "1"),
      evento("HitoDeclarado", 1, { evidencia_hash: H2 }, "2"),
      evento("HitoObjetado", 0, { motivo_hash: H2 }, "3"),
      evento("HitoDeclarado", 0, { evidencia_hash: H2 }, "4"),
    ];
    expect(historialEvidencia(eventos, 0).map((h) => h.hash)).toEqual([H1, H2]);
    expect(historialEvidencia(eventos, 1).map((h) => h.hash)).toEqual([H2]);
    expect(historialEvidencia(eventos, 5)).toEqual([]);
  });
});
