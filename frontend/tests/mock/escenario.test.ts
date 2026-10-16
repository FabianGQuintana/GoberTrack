import { beforeAll, describe, expect, it } from "vitest";
import { crearCliente } from "@/lib/api/cliente";
import { armarEscenario, TOKEN, TOKEN_NO_OFICIAL, type Escenario } from "@/lib/api/mock/escenario";
import { detectarTipo } from "@/lib/archivos";
import { sha256Hex } from "@/lib/hash";
import { UNIDAD } from "../helpers/fixtures";

// Momento fijo y redondo: el escenario arranca 8 días antes.
const AHORA = Date.parse("2026-10-16T12:00:00Z");

let esc: Escenario;
beforeAll(async () => {
  esc = await armarEscenario(AHORA);
});

const obra = (id: number) => esc.obras.find((o) => o.id === id)!;
const hitos = (id: number) => esc.hitos.get(id)!;
const eventos = (id: number) => esc.eventos.filter((e) => e.obra_id === id);

describe("armarEscenario", () => {
  it("arma sin lanzar y con seis obras", async () => {
    await expect(armarEscenario(AHORA)).resolves.toBeDefined();
    expect(esc.obras.map((o) => o.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(esc.obras.map((o) => o.cantidad_hitos)).toEqual([4, 3, 2, 2, 3, 2]);
  });

  it("obra 5: fondeada por el total, tres hitos Pendiente y período de 60 s", () => {
    const o = obra(5);
    expect(o.nombre).toMatch(/^Veredas/);
    expect(o.estado).toBe("Activa");
    expect(o.token).toBe(TOKEN);
    expect(o.periodo_objecion_seg).toBe(60);
    expect(o.fondeado).toBe(o.monto_vigente);
    expect(o.fondeado).toBe(o.monto_original);
    expect(o.pagado).toBe("0");
    expect(o.saldo).toBe(o.fondeado);
    expect(hitos(5).map((h) => h.estado)).toEqual(["Pendiente", "Pendiente", "Pendiente"]);
    expect(hitos(5).every((h) => h.evidencia_hash === null && !h.pagable)).toBe(true);
    expect(eventos(5).map((e) => e.tipo)).toEqual(["ObraCreada", "ObraFondeada"]);
  });

  it("obra 6: token NO oficial, hito 1 Pagado y hito 2 Pendiente", () => {
    const o = obra(6);
    expect(o.nombre).toBe("Bacheo calle Belgrano");
    expect(o.token).toBe(TOKEN_NO_OFICIAL);
    expect(o.token).not.toBe(TOKEN);
    expect(o.token).toMatch(/^C[A-Z2-7]{55}$/);
    expect(hitos(6).map((h) => h.estado)).toEqual(["Pagado", "Pendiente"]);
    expect(o.hitos_pagados).toBe(1);
    expect(o.estado).toBe("Activa");
    expect(o.saldo).toBe((2_000n * UNIDAD).toString());
    expect(eventos(6).map((e) => e.tipo)).toEqual([
      "ObraCreada",
      "ObraFondeada",
      "HitoDeclarado",
      "HitoAprobado",
      "HitoAprobado",
      "PagoLiberado",
    ]);
  });

  it("los contratistas y veedores de las seis obras son direcciones válidas y distintas", () => {
    const direcciones = new Set<string>();
    for (const id of [1, 2, 3, 4, 5, 6]) {
      const o = obra(id);
      for (const d of [o.contratista, o.veedor]) {
        expect(d).toMatch(/^G[A-Z2-7]{55}$/);
        direcciones.add(d);
      }
    }
    expect(direcciones.size).toBe(12);
  });

  it("es determinista para el mismo `ahora`", async () => {
    const otro = await armarEscenario(AHORA);
    expect(otro.obras).toEqual(esc.obras);
    expect(otro.eventos).toEqual(esc.eventos);
  });

  it("obra 1: Pagado / Objetado / Pendiente / Pendiente", () => {
    expect(hitos(1).map((h) => h.estado)).toEqual(["Pagado", "Objetado", "Pendiente", "Pendiente"]);
    const h2 = hitos(1)[1];
    expect(h2.aprobo_inspector).toBe(true);
    expect(h2.aprobo_veedor).toBe(false);
    expect(h2.objecion_usada).toBe(true);
    expect(h2.motivo_objecion_hash).not.toBeNull();
    expect(obra(1).estado).toBe("Activa");
    expect(obra(1).hitos_pagados).toBe(1);
    expect(obra(1).periodo_objecion_seg).toBe(60);
  });

  it("obra 2: hito 1 en Evidencia con aprobo_inspector, período de 72 h y todavía dentro", () => {
    const [h0, h1, h2] = hitos(2);
    expect(h0.estado).toBe("Evidencia");
    expect(h0.aprobo_inspector).toBe(true);
    expect(h0.aprobo_veedor).toBe(false);
    expect([h1.estado, h2.estado]).toEqual(["Pendiente", "Pendiente"]);
    expect(obra(2).periodo_objecion_seg).toBe(72 * 3600);
    const fin = Date.parse(h0.fin_periodo_objecion!);
    expect(fin - Date.parse(h0.momento_declaracion!)).toBe(72 * 3600 * 1000);
    expect(fin).toBeGreaterThan(AHORA);
    expect(Date.parse(h0.momento_declaracion!)).toBeLessThan(AHORA);
    expect(obra(2).fondeado).toBe("0");
    expect(obra(2).saldo).toBe("0");
  });

  it("obra 3: hito 0 Pagado con DOS HitoDeclarado; hito 1 Aprobado con veedor_por_arbitro y pagable", async () => {
    const [h0, h1] = hitos(3);
    expect(h0.estado).toBe("Pagado");
    expect(eventos(3).filter((e) => e.tipo === "HitoDeclarado" && e.hito === 0)).toHaveLength(2);
    expect(eventos(3).some((e) => e.tipo === "ObjecionResuelta" && e.datos.decision === "Aceptar")).toBe(true);
    expect(h1.estado).toBe("Aprobado");
    expect(h1.aprobo_inspector).toBe(true);
    expect(h1.aprobo_veedor).toBe(true);
    expect(h1.veedor_por_arbitro).toBe(true);
    expect(h1.objecion_usada).toBe(true);
    expect(eventos(3).some((e) => e.tipo === "ObjecionResuelta" && e.datos.decision === "Rechazar")).toBe(true);
  });

  it("obra 3: pagable: true vía crearCliente(undefined).listarHitos(3)", async () => {
    const cliente = crearCliente(undefined);
    expect(cliente.modo).toBe("mock");
    const lista = await cliente.listarHitos(3);
    expect(lista.map((h) => h.pagable)).toEqual([false, true]);
  });

  it("obra 4: Finalizada con los dos hitos pagados", () => {
    expect(obra(4).estado).toBe("Finalizada");
    expect(hitos(4).map((h) => h.estado)).toEqual(["Pagado", "Pagado"]);
    expect(obra(4).hitos_pagados).toBe(2);
    expect(obra(4).saldo).toBe("0");
  });

  it("saldo = fondeado − pagado, hitos_pagados coincide y los montos suman el presupuesto", () => {
    for (const o of esc.obras) {
      expect(BigInt(o.saldo)).toBe(BigInt(o.fondeado) - BigInt(o.pagado));
      expect(o.hitos_pagados).toBe(hitos(o.id).filter((h) => h.estado === "Pagado").length);
      expect(hitos(o.id).reduce((s, h) => s + BigInt(h.monto_vigente), 0n)).toBe(BigInt(o.monto_vigente));
      expect(BigInt(o.pagado)).toBe(
        hitos(o.id).filter((h) => h.estado === "Pagado").reduce((s, h) => s + BigInt(h.monto_vigente), 0n),
      );
      expect(BigInt(o.fondeado)).toBeLessThanOrEqual(BigInt(o.monto_vigente));
    }
  });

  it("el arbitro es la dirección del municipio y los roles son direcciones G... válidas", () => {
    for (const o of esc.obras) {
      expect(o.arbitro).toBe(o.municipio);
      for (const r of [o.municipio, o.contratista, o.inspector, o.veedor]) expect(r).toMatch(/^G[A-Z2-7]{55}$/);
      expect(o.token).toMatch(/^C[A-Z2-7]{55}$/);
      expect(new Set([o.contratista, o.inspector, o.veedor, o.arbitro]).size).toBe(4);
    }
  });

  describe("datos que cumplen el OpenAPI", () => {
    const MONTO = /^[0-9]+$/;
    const HASH = /^[0-9a-f]{64}$/;
    const FECHA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

    it("montos ^[0-9]+$", () => {
      for (const o of esc.obras) {
        for (const k of ["monto_original", "monto_vigente", "fondeado", "pagado", "saldo"] as const) {
          expect(o[k]).toMatch(MONTO);
        }
      }
      for (const h of esc.hitos.values().flatMap((l) => l)) {
        expect(h.monto_original).toMatch(MONTO);
        expect(h.monto_vigente).toMatch(MONTO);
      }
    });

    it("hashes ^[0-9a-f]{64}$ (hitos, eventos y tx_hash)", () => {
      for (const h of esc.hitos.values().flatMap((l) => l)) {
        for (const x of [h.evidencia_hash, h.motivo_objecion_hash]) if (x !== null) expect(x).toMatch(HASH);
      }
      for (const e of esc.eventos) {
        expect(e.tx_hash).toMatch(HASH);
        for (const k of ["evidencia_hash", "motivo_hash"]) if (k in e.datos) expect(e.datos[k]).toMatch(HASH);
      }
    });

    it("fechas ISO 8601 en UTC y coherentes", () => {
      for (const o of esc.obras) {
        expect(o.creada_en).toMatch(FECHA);
        expect(Date.parse(o.creada_en)).toBeLessThan(AHORA);
      }
      for (const h of esc.hitos.values().flatMap((l) => l)) {
        for (const x of [h.momento_declaracion, h.fin_periodo_objecion, h.momento_aprobacion_completa, h.momento_pago]) {
          if (x !== null) {
            expect(x).toMatch(FECHA);
            expect(Date.parse(x)).toBeLessThan(AHORA + 100 * 3600 * 1000);
          }
        }
        if (h.momento_pago) expect(Date.parse(h.momento_pago)).toBeLessThanOrEqual(AHORA);
      }
      for (const e of esc.eventos) {
        expect(e.momento).toMatch(FECHA);
        expect(Date.parse(e.momento)).toBeLessThanOrEqual(AHORA);
      }
    });

    it("ids de evento crecientes (por orden) y únicos", () => {
      const ids = esc.eventos.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^\d{19}-\d{10}$/);
      // Orden de emisión == orden cronológico: ids y ledger no decrecen y el orden lexicográfico coincide.
      const ordenados = [...ids].sort();
      expect(ids).toEqual(ordenados);
      for (let i = 1; i < esc.eventos.length; i++) {
        expect(esc.eventos[i].ledger).toBeGreaterThanOrEqual(esc.eventos[i - 1].ledger);
        expect(Date.parse(esc.eventos[i].momento)).toBeGreaterThanOrEqual(Date.parse(esc.eventos[i - 1].momento));
      }
    });

    it("fin_periodo_objecion = momento_declaracion + período, y null si no hay declaración vigente", () => {
      for (const o of esc.obras) {
        for (const h of hitos(o.id)) {
          if (h.momento_declaracion) {
            expect(Date.parse(h.fin_periodo_objecion!) - Date.parse(h.momento_declaracion)).toBe(
              o.periodo_objecion_seg * 1000,
            );
          } else {
            expect(h.fin_periodo_objecion).toBeNull();
            expect(h.evidencia_hash).toBeNull();
          }
        }
      }
    });

    it("el estado de cada hito es coherente con sus campos", () => {
      for (const h of esc.hitos.values().flatMap((l) => l)) {
        if (h.estado === "Pagado") expect(h.momento_pago).not.toBeNull();
        else expect(h.momento_pago).toBeNull();
        if (h.estado === "Aprobado" || h.estado === "Pagado") {
          expect(h.aprobo_inspector && h.aprobo_veedor).toBe(true);
          expect(h.momento_aprobacion_completa).not.toBeNull();
        }
        if (h.estado === "Objetado") expect(h.motivo_objecion_hash).not.toBeNull();
        if (h.estado === "Pendiente") expect(h.aprobo_inspector || h.aprobo_veedor).toBe(false);
        if (h.veedor_por_arbitro) expect(h.aprobo_veedor).toBe(true);
      }
    });

    it("cada tipo de evento tiene los campos de contract.md §4", () => {
      const CAMPOS: Record<string, string[]> = {
        ObraCreada: ["nombre", "municipio", "contratista", "inspector", "veedor", "arbitro", "token", "monto_original", "cantidad_hitos", "periodo_objecion"],
        ObraFondeada: ["monto", "fondeado"],
        HitoDeclarado: ["evidencia_hash", "fin_periodo"],
        HitoAprobado: ["firmante", "completo"],
        HitoObjetado: ["motivo_hash"],
        ObjecionResuelta: ["decision", "estado"],
        PagoLiberado: ["contratista", "monto", "pagado"],
      };
      for (const e of esc.eventos) {
        expect(Object.keys(e.datos).sort()).toEqual([...CAMPOS[e.tipo]].sort());
        if (e.tipo === "ObraCreada" || e.tipo === "ObraFondeada") expect(e.hito).toBeNull();
        else expect(e.hito).not.toBeNull();
      }
    });
  });

  it("el sha256 de cada archivo simulado coincide con los hashes de los hitos y eventos", async () => {
    for (const [hash, archivo] of esc.archivos) {
      expect(await sha256Hex(archivo.contenido)).toBe(hash);
      expect(archivo.nombre.length).toBeGreaterThan(0);
      expect(["image/png", "application/pdf"]).toContain(archivo.tipoMime);
      expect(detectarTipo(archivo.contenido)).toBe(archivo.tipoMime);
    }
    const referenciados = new Set<string>();
    for (const h of esc.hitos.values().flatMap((l) => l)) {
      for (const x of [h.evidencia_hash, h.motivo_objecion_hash]) if (x) referenciados.add(x);
    }
    for (const e of esc.eventos) {
      for (const k of ["evidencia_hash", "motivo_hash"]) if (typeof e.datos[k] === "string") referenciados.add(e.datos[k]);
    }
    expect(referenciados.size).toBeGreaterThanOrEqual(10);
    for (const hash of referenciados) expect(esc.archivos.has(hash)).toBe(true);
    // 12 archivos definidos (el último, de la obra 6), todos distintos.
    expect(esc.archivos.size).toBe(12);
  });

  it("el escenario se desplaza con `ahora` (la obra 2 sigue dentro del período)", async () => {
    const tarde = await armarEscenario(AHORA + 10 * 86_400_000);
    expect(tarde.obras[0].creada_en).not.toBe(esc.obras[0].creada_en);
    const h = tarde.hitos.get(2)![0];
    expect(Date.parse(h.fin_periodo_objecion!)).toBeGreaterThan(AHORA + 10 * 86_400_000);
  });

  it("la línea de tiempo cabe en los 8 días anteriores a `ahora` y los ledgers no decrecen", () => {
    const momentos = esc.eventos.map((e) => Date.parse(e.momento));
    expect(Math.min(...momentos)).toBeGreaterThanOrEqual(AHORA - 8 * 86_400_000);
    expect(Math.max(...momentos)).toBeLessThan(AHORA);
    const ledgers = esc.eventos.map((e) => e.ledger);
    expect(ledgers).toEqual([...ledgers].sort((a, b) => a - b));
  });
});
