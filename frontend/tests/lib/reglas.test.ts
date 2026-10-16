import { describe, expect, it } from "vitest";
import type { EstadoHito, Hito } from "@/lib/api/tipos";
import { CODIGOS_ERROR, type CodigoError } from "@/lib/errores";
import {
  dentroDelPeriodo,
  describirMotivo,
  evaluarAccionHito,
  evaluarAprobar,
  evaluarDeclarar,
  evaluarFondear,
  evaluarHito,
  evaluarLiberarPago,
  evaluarObjetar,
  evaluarResolver,
  finPeriodo,
  hitoAnteriorOk,
  type Resultado,
} from "@/lib/reglas";
import type { Rol } from "@/lib/roles";
import {
  AHORA,
  PERIODO_SEG,
  UNIDAD,
  ctx,
  declaradoHace,
  hito,
  hitoEnEstado,
  hitosConObjetivo,
  iso,
  obra,
} from "../helpers/fixtures";

/** Notación compacta de lo esperado: "ok", un código del contrato, o "auth:<rol>" (falla el host). */
type Esperado = "ok" | CodigoError | `auth:${Rol}`;

function compacto(r: Resultado): Esperado {
  if (r.permitida) return "ok";
  return r.motivo.tipo === "contrato" ? r.motivo.codigo : `auth:${r.motivo.rolRequerido}`;
}

const ESTADOS: EstadoHito[] = ["Pendiente", "Evidencia", "Aprobado", "Objetado", "Pagado"];

const ROLES_PRUEBA: { nombre: string; roles: Rol[] }[] = [
  { nombre: "sin rol", roles: [] },
  { nombre: "municipio", roles: ["municipio"] },
  { nombre: "contratista", roles: ["contratista"] },
  { nombre: "inspector", roles: ["inspector"] },
  { nombre: "veedor", roles: ["veedor"] },
  { nombre: "árbitro", roles: ["arbitro"] },
  { nombre: "municipio+árbitro (MVP)", roles: ["municipio", "arbitro"] },
];

/** Lo que devuelve cada acción para cada estado cuando la firma del rol es la correcta. */
type PorEstado = Record<EstadoHito, Esperado>;

const DECLARAR: PorEstado = {
  Pendiente: "ok",
  Evidencia: "EstadoInvalido",
  Aprobado: "EstadoInvalido",
  Objetado: "EstadoInvalido",
  Pagado: "EstadoInvalido",
};
const APROBAR: PorEstado = {
  Pendiente: "EstadoInvalido",
  Evidencia: "ok",
  Aprobado: "YaDecidio", // el hito de prueba "Aprobado" ya tiene las dos aprobaciones
  Objetado: "ObjecionAbierta",
  Pagado: "YaPagado",
};
const OBJETAR: PorEstado = {
  Pendiente: "EstadoInvalido",
  Evidencia: "ok",
  Aprobado: "YaDecidio", // aprobo_veedor y objecion_usada=false
  Objetado: "ObjecionAbierta",
  Pagado: "YaPagado",
};
const RESOLVER: PorEstado = {
  Pendiente: "EstadoInvalido",
  Evidencia: "EstadoInvalido",
  Aprobado: "EstadoInvalido",
  Objetado: "ok",
  Pagado: "EstadoInvalido",
};
const LIBERAR: PorEstado = {
  Pendiente: "EstadoInvalido",
  Evidencia: "EstadoInvalido",
  Aprobado: "ok",
  Objetado: "ObjecionAbierta",
  Pagado: "YaPagado",
};

const tiene = (rol: Rol) => (roles: Rol[]) => roles.includes(rol);
const inspectorOVeedor = (roles: Rol[]) => roles.includes("inspector") || roles.includes("veedor");

describe("tabla rol × estado → acción (hito 1 con anterior Pagado, dentro de un período de 60 s)", () => {
  const filas = ROLES_PRUEBA.flatMap((r) => ESTADOS.map((estado) => ({ ...r, estado })));

  const ACCIONES_TABLA: {
    accion: string;
    evaluar: (c: ReturnType<typeof ctx>, i: number) => Resultado;
    tabla: PorEstado;
    puede: (r: Rol[]) => boolean;
    sinPermiso: Esperado;
  }[] = [
    { accion: "declarar_hito", evaluar: evaluarDeclarar, tabla: DECLARAR, puede: tiene("contratista"), sinPermiso: "auth:contratista" },
    { accion: "aprobar", evaluar: evaluarAprobar, tabla: APROBAR, puede: inspectorOVeedor, sinPermiso: "NoAutorizado" },
    { accion: "objetar", evaluar: evaluarObjetar, tabla: OBJETAR, puede: tiene("veedor"), sinPermiso: "auth:veedor" },
    { accion: "resolver_objecion", evaluar: evaluarResolver, tabla: RESOLVER, puede: tiene("arbitro"), sinPermiso: "auth:arbitro" },
    // Sin firma de rol: el resultado no depende del rol.
    { accion: "liberar_pago", evaluar: evaluarLiberarPago, tabla: LIBERAR, puede: () => true, sinPermiso: "ok" },
  ];

  describe.each(ACCIONES_TABLA)("$accion", ({ evaluar, tabla, puede, sinPermiso }) => {
    it.each(filas)("$nombre en $estado", ({ roles, estado }) => {
      const esperado = puede(roles) ? tabla[estado] : sinPermiso;
      expect(compacto(evaluar(ctx(roles, hitosConObjetivo(estado)), 1))).toBe(esperado);
    });
  });

  it("evaluarHito devuelve lo mismo que cada evaluador por separado", () => {
    for (const { roles } of ROLES_PRUEBA) {
      for (const estado of ESTADOS) {
        const c = ctx(roles, hitosConObjetivo(estado));
        const todo = evaluarHito(c, 1);
        expect(Object.keys(todo).sort()).toEqual(
          ["aprobar", "declarar_hito", "liberar_pago", "objetar", "resolver_objecion"],
        );
        expect(todo.declarar_hito).toEqual(evaluarDeclarar(c, 1));
        expect(todo.aprobar).toEqual(evaluarAprobar(c, 1));
        expect(todo.objetar).toEqual(evaluarObjetar(c, 1));
        expect(todo.resolver_objecion).toEqual(evaluarResolver(c, 1));
        expect(todo.liberar_pago).toEqual(evaluarLiberarPago(c, 1));
        for (const a of ["declarar_hito", "aprobar", "objetar", "resolver_objecion", "liberar_pago"] as const) {
          expect(evaluarAccionHito(a, c, 1)).toEqual(todo[a]);
        }
      }
    }
  });
});

describe("hito inexistente (paso 1, antes de cualquier firma)", () => {
  it.each([
    ["declarar", evaluarDeclarar],
    ["aprobar", evaluarAprobar],
    ["objetar", evaluarObjetar],
    ["resolver", evaluarResolver],
    ["liberar", evaluarLiberarPago],
  ] as const)("%s sobre el índice 7 → HitoNoExiste aunque no tenga rol", (_n, evaluar) => {
    expect(compacto(evaluar(ctx([], hitosConObjetivo("Evidencia")), 7))).toBe("HitoNoExiste");
  });
});

describe("precedencia del orden de validación (contract.md §3)", () => {
  describe("aprobar", () => {
    it("sin rol en Pagado → NoAutorizado (paso 2 antes que el 5)", () => {
      expect(compacto(evaluarAprobar(ctx([], hitosConObjetivo("Pagado")), 1))).toBe("NoAutorizado");
    });
    it("el municipio (aunque sea árbitro) no puede aprobar → NoAutorizado", () => {
      expect(compacto(evaluarAprobar(ctx(["municipio", "arbitro"], hitosConObjetivo("Evidencia")), 1))).toBe(
        "NoAutorizado",
      );
    });
    it("inspector en Evidencia con anterior Pendiente → HitoAnteriorPendiente", () => {
      const hitos = [hitoEnEstado(0, "Pendiente"), hitoEnEstado(1, "Evidencia")];
      expect(compacto(evaluarAprobar(ctx(["inspector"], hitos), 1))).toBe("HitoAnteriorPendiente");
    });
    it.each(ESTADOS)("HitoAnteriorPendiente (paso 4) gana al estado (paso 5): hito en %s", (estado) => {
      const hitos = [hitoEnEstado(0, "Pendiente"), hitoEnEstado(1, estado)];
      expect(compacto(evaluarAprobar(ctx(["veedor"], hitos), 1))).toBe("HitoAnteriorPendiente");
    });
    it.each(["Evidencia", "Objetado"] as const)("el hito anterior en %s tampoco es OK", (prev) => {
      const hitos = [hitoEnEstado(0, prev), hitoEnEstado(1, "Evidencia")];
      expect(compacto(evaluarAprobar(ctx(["inspector"], hitos), 1))).toBe("HitoAnteriorPendiente");
    });
    it("el anterior Aprobado (sin pagar) alcanza", () => {
      const hitos = [hitoEnEstado(0, "Aprobado"), hitoEnEstado(1, "Evidencia")];
      expect(compacto(evaluarAprobar(ctx(["inspector"], hitos), 1))).toBe("ok");
    });
    it("el hito 0 nunca tiene anterior pendiente", () => {
      expect(compacto(evaluarAprobar(ctx(["veedor"], [hitoEnEstado(0, "Evidencia")]), 0))).toBe("ok");
    });
    it("YaDecidio es por rol: el inspector ya aprobó, el veedor todavía no", () => {
      const h = hito(1, "Evidencia", { ...declaradoHace(30_000), aprobo_inspector: true });
      const hitos = [hitoEnEstado(0, "Pagado"), h];
      expect(compacto(evaluarAprobar(ctx(["inspector"], hitos), 1))).toBe("YaDecidio");
      expect(compacto(evaluarAprobar(ctx(["veedor"], hitos), 1))).toBe("ok");
    });
    it("el veedor aprueba aunque el período haya vencido (sin límite de tiempo)", () => {
      const h = hito(1, "Evidencia", { ...declaradoHace(10 * 60_000), aprobo_inspector: true });
      expect(compacto(evaluarAprobar(ctx(["veedor"], [hitoEnEstado(0, "Pagado"), h]), 1))).toBe("ok");
    });
    it("veedor que ya decidió por el árbitro (veedor_por_arbitro) → YaDecidio", () => {
      const h = hito(1, "Evidencia", {
        ...declaradoHace(30_000),
        aprobo_veedor: true,
        veedor_por_arbitro: true,
        objecion_usada: true,
      });
      expect(compacto(evaluarAprobar(ctx(["veedor"], [hitoEnEstado(0, "Pagado"), h]), 1))).toBe("YaDecidio");
    });
  });

  describe("objetar", () => {
    const hitosCon = (extra: Partial<Hito>, estado: EstadoHito = "Evidencia") => [
      hitoEnEstado(0, "Pagado"),
      hito(1, estado, { ...declaradoHace(30_000), ...extra }),
    ];

    it("no veedor en Pagado → motivo de autorización (falla el host, no un error del contrato)", () => {
      const r = evaluarObjetar(ctx(["inspector"], hitosConObjetivo("Pagado")), 1);
      expect(r).toEqual({ permitida: false, motivo: { tipo: "autorizacion", rolRequerido: "veedor" } });
    });
    it("objetar ignora el hito anterior: con anterior Pendiente y estado Evidencia sigue ok", () => {
      const hitos = [hitoEnEstado(0, "Pendiente"), hitoEnEstado(1, "Evidencia")];
      expect(compacto(evaluarObjetar(ctx(["veedor"], hitos), 1))).toBe("ok");
    });
    it("objecion_usada y aprobo_veedor → ObjecionYaUsada (paso 4 antes que el 5)", () => {
      const hitos = hitosCon({ objecion_usada: true, aprobo_veedor: true, veedor_por_arbitro: true });
      expect(compacto(evaluarObjetar(ctx(["veedor"], hitos), 1))).toBe("ObjecionYaUsada");
    });
    it("aprobo_veedor y fuera de período → YaDecidio (paso 5 antes que el 6)", () => {
      const hitos = [
        hitoEnEstado(0, "Pagado"),
        hito(1, "Evidencia", { ...declaradoHace(10 * 60_000), aprobo_veedor: true }),
      ];
      expect(compacto(evaluarObjetar(ctx(["veedor"], hitos), 1))).toBe("YaDecidio");
    });
    it("objecion_usada y fuera de período → ObjecionYaUsada", () => {
      const hitos = [
        hitoEnEstado(0, "Pagado"),
        hito(1, "Evidencia", { ...declaradoHace(10 * 60_000), objecion_usada: true }),
      ];
      expect(compacto(evaluarObjetar(ctx(["veedor"], hitos), 1))).toBe("ObjecionYaUsada");
    });
    it("fuera de período sin otras causas → FueraDePeriodo", () => {
      const hitos = [hitoEnEstado(0, "Pagado"), hito(1, "Evidencia", declaradoHace(10 * 60_000))];
      expect(compacto(evaluarObjetar(ctx(["veedor"], hitos), 1))).toBe("FueraDePeriodo");
    });
    it("borde semiabierto: ahora == fin → FueraDePeriodo; ahora == fin − 1 ms → permitida", () => {
      // Declarada hace exactamente el período: fin == AHORA.
      const hitos = [hitoEnEstado(0, "Pagado"), hito(1, "Evidencia", declaradoHace(PERIODO_SEG * 1000))];
      expect(compacto(evaluarObjetar(ctx(["veedor"], hitos, { ahora: AHORA }), 1))).toBe("FueraDePeriodo");
      expect(compacto(evaluarObjetar(ctx(["veedor"], hitos, { ahora: AHORA - 1 }), 1))).toBe("ok");
      expect(compacto(evaluarObjetar(ctx(["veedor"], hitos, { ahora: AHORA + 1 }), 1))).toBe("FueraDePeriodo");
    });
    it("veedor aprueba y luego objeta → YaDecidio (§6)", () => {
      expect(compacto(evaluarObjetar(ctx(["veedor"], hitosCon({ aprobo_veedor: true })), 1))).toBe("YaDecidio");
    });
    it("veedor objeta otra vez tras un Rechazar → ObjecionYaUsada (§6)", () => {
      const hitos = hitosCon({ aprobo_veedor: true, veedor_por_arbitro: true, objecion_usada: true });
      expect(compacto(evaluarObjetar(ctx(["veedor"], hitos), 1))).toBe("ObjecionYaUsada");
    });
  });

  describe("liberar_pago", () => {
    const aprobadoHace = (ms: number): Hito =>
      hito(1, "Aprobado", { ...declaradoHace(ms), aprobo_inspector: true, aprobo_veedor: true });

    it("en Objetado con anterior Pendiente → ObjecionAbierta (paso 3 antes que el 4)", () => {
      const hitos = [hitoEnEstado(0, "Pendiente"), hitoEnEstado(1, "Objetado")];
      expect(compacto(evaluarLiberarPago(ctx([], hitos), 1))).toBe("ObjecionAbierta");
    });
    it("en Pagado con anterior Pendiente → YaPagado (paso 2 antes que el 4)", () => {
      const hitos = [hitoEnEstado(0, "Pendiente"), hitoEnEstado(1, "Pagado")];
      expect(compacto(evaluarLiberarPago(ctx([], hitos), 1))).toBe("YaPagado");
    });
    it.each(["Pendiente", "Evidencia", "Aprobado"] as const)(
      "HitoAnteriorPendiente (paso 4) gana al estado (paso 5): hito en %s",
      (estado) => {
        const hitos = [hitoEnEstado(0, "Pendiente"), hitoEnEstado(1, estado)];
        expect(compacto(evaluarLiberarPago(ctx([], hitos), 1))).toBe("HitoAnteriorPendiente");
      },
    );
    it("borde: ahora == fin → ok; ahora == fin − 1 ms → PeriodoNoCumplido", () => {
      const hitos = [hitoEnEstado(0, "Pagado"), aprobadoHace(PERIODO_SEG * 1000)]; // fin == AHORA
      expect(compacto(evaluarLiberarPago(ctx([], hitos, { ahora: AHORA }), 1))).toBe("ok");
      expect(compacto(evaluarLiberarPago(ctx([], hitos, { ahora: AHORA - 1 }), 1))).toBe("PeriodoNoCumplido");
      expect(compacto(evaluarLiberarPago(ctx([], hitos, { ahora: AHORA + 1 }), 1))).toBe("ok");
    });
    it("Aprobado antes de que termine el período → PeriodoNoCumplido (§6)", () => {
      const hitos = [hitoEnEstado(0, "Pagado"), aprobadoHace(10_000)];
      expect(compacto(evaluarLiberarPago(ctx([], hitos), 1))).toBe("PeriodoNoCumplido");
    });
    it("Evidencia → EstadoInvalido (§6: cobrar sin las dos aprobaciones)", () => {
      expect(compacto(evaluarLiberarPago(ctx([], hitosConObjetivo("Evidencia")), 1))).toBe("EstadoInvalido");
    });
    it("saldo menor al monto vigente → FondosInsuficientes (§6)", () => {
      const o = obra({ fondeado: (15n * UNIDAD).toString(), pagado: (10n * UNIDAD).toString() }); // saldo 5 < 10
      expect(compacto(evaluarLiberarPago(ctx([], hitosConObjetivo("Aprobado"), { obra: o }), 1))).toBe(
        "FondosInsuficientes",
      );
    });
    it("saldo == monto vigente → ok; saldo − 1 unidad → FondosInsuficientes", () => {
      const justo = obra({ fondeado: (20n * UNIDAD).toString(), pagado: (10n * UNIDAD).toString() });
      expect(compacto(evaluarLiberarPago(ctx([], hitosConObjetivo("Aprobado"), { obra: justo }), 1))).toBe("ok");
      const corto = obra({ fondeado: (20n * UNIDAD - 1n).toString(), pagado: (10n * UNIDAD).toString() });
      expect(compacto(evaluarLiberarPago(ctx([], hitosConObjetivo("Aprobado"), { obra: corto }), 1))).toBe(
        "FondosInsuficientes",
      );
    });
    it("PeriodoNoCumplido (paso 6) gana a FondosInsuficientes (paso 7)", () => {
      const o = obra({ fondeado: "0", pagado: "0" });
      const hitos = [hitoEnEstado(0, "Pagado"), aprobadoHace(10_000)];
      expect(compacto(evaluarLiberarPago(ctx([], hitos, { obra: o }), 1))).toBe("PeriodoNoCumplido");
    });
    it("saltear un hito: liberar el N+1 con el anterior Pendiente → HitoAnteriorPendiente (§6)", () => {
      const hitos = [hitoEnEstado(0, "Pendiente"), hitoEnEstado(1, "Aprobado")];
      expect(compacto(evaluarLiberarPago(ctx([], hitos), 1))).toBe("HitoAnteriorPendiente");
    });
    it("usa fin_periodo_objecion si falta momento_declaracion", () => {
      const h = hito(1, "Aprobado", {
        fin_periodo_objecion: iso(AHORA + 1000),
        aprobo_inspector: true,
        aprobo_veedor: true,
      });
      expect(compacto(evaluarLiberarPago(ctx([], [hitoEnEstado(0, "Pagado"), h]), 1))).toBe("PeriodoNoCumplido");
    });
    it("Aprobado sin ninguna fecha de período → PeriodoNoCumplido (no habilita el pago a ciegas)", () => {
      const h = hito(1, "Aprobado", { aprobo_inspector: true, aprobo_veedor: true });
      expect(compacto(evaluarLiberarPago(ctx([], [hitoEnEstado(0, "Pagado"), h]), 1))).toBe("PeriodoNoCumplido");
    });
  });

  describe("declarar_hito", () => {
    it("sin ser contratista, aun con anterior Pendiente y estado inválido → autorización (paso 2 primero)", () => {
      const hitos = [hitoEnEstado(0, "Pendiente"), hitoEnEstado(1, "Pagado")];
      expect(compacto(evaluarDeclarar(ctx(["inspector"], hitos), 1))).toBe("auth:contratista");
    });
    it("contratista con anterior Pendiente y hito Pagado → HitoAnteriorPendiente (paso 3 antes que el 4)", () => {
      const hitos = [hitoEnEstado(0, "Pendiente"), hitoEnEstado(1, "Pagado")];
      expect(compacto(evaluarDeclarar(ctx(["contratista"], hitos), 1))).toBe("HitoAnteriorPendiente");
    });
    it("saltear un hito: declarar el N+1 con el anterior en Evidencia → HitoAnteriorPendiente (§6)", () => {
      const hitos = [hitoEnEstado(0, "Evidencia"), hitoEnEstado(1, "Pendiente")];
      expect(compacto(evaluarDeclarar(ctx(["contratista"], hitos), 1))).toBe("HitoAnteriorPendiente");
    });
    it("el hito 0 Pendiente se puede declarar", () => {
      expect(compacto(evaluarDeclarar(ctx(["contratista"], [hitoEnEstado(0, "Pendiente")]), 0))).toBe("ok");
    });
  });

  describe("resolver_objecion", () => {
    it("el árbitro solo puede en Objetado; en el resto EstadoInvalido", () => {
      for (const e of ESTADOS) {
        const r = evaluarResolver(ctx(["arbitro"], hitosConObjetivo(e)), 1);
        expect(compacto(r)).toBe(e === "Objetado" ? "ok" : "EstadoInvalido");
      }
    });
    it("el municipio sin el rol árbitro no puede aunque el hito esté Objetado", () => {
      expect(compacto(evaluarResolver(ctx(["municipio"], hitosConObjetivo("Objetado")), 1))).toBe("auth:arbitro");
    });
    it("auth antes que estado: no árbitro en Pendiente → autorización", () => {
      expect(compacto(evaluarResolver(ctx(["veedor"], hitosConObjetivo("Pendiente")), 1))).toBe("auth:arbitro");
    });
  });
});

describe("fondear (§3.2)", () => {
  const MUNI: Rol[] = ["municipio"];
  const sinFondos = obra({ fondeado: "0", pagado: "0", saldo: "0" });
  const c = (roles: Rol[], o = sinFondos) => ctx(roles, [hitoEnEstado(0, "Pendiente")], { obra: o });

  it("monto null → MontoInvalido", () => {
    expect(compacto(evaluarFondear(c(MUNI), null))).toBe("MontoInvalido");
  });
  it.each([0n, -1n])("monto %s → MontoInvalido", (m) => {
    expect(compacto(evaluarFondear(c(MUNI), m))).toBe("MontoInvalido");
  });
  it("no municipio → autorización antes que MontoInvalido", () => {
    expect(compacto(evaluarFondear(c([]), null))).toBe("auth:municipio");
    expect(compacto(evaluarFondear(c(["contratista"]), 0n))).toBe("auth:municipio");
    expect(compacto(evaluarFondear(c(["arbitro"]), 5n))).toBe("auth:municipio");
  });
  it("autorización antes que ExcedeMontoTotal", () => {
    expect(compacto(evaluarFondear(c(["veedor"]), 10n ** 20n))).toBe("auth:municipio");
  });
  it("MontoInvalido antes que ExcedeMontoTotal: 0 sobre una obra llena → MontoInvalido", () => {
    const llena = obra({ fondeado: obra().monto_vigente });
    expect(compacto(evaluarFondear(c(MUNI, llena), 0n))).toBe("MontoInvalido");
  });
  it("fondeado + monto == vigente → ok; +1 → ExcedeMontoTotal", () => {
    const o = obra({ fondeado: (10n * UNIDAD).toString() });
    const resto = 20n * UNIDAD;
    expect(compacto(evaluarFondear(c(MUNI, o), resto))).toBe("ok");
    expect(compacto(evaluarFondear(c(MUNI, o), resto + 1n))).toBe("ExcedeMontoTotal");
  });
  it("obra totalmente fondeada: cualquier monto positivo excede", () => {
    const llena = obra({ fondeado: obra().monto_vigente });
    expect(compacto(evaluarFondear(c(MUNI, llena), 1n))).toBe("ExcedeMontoTotal");
  });
  it("municipio+árbitro puede fondear", () => {
    expect(compacto(evaluarFondear(c(["municipio", "arbitro"]), 1n))).toBe("ok");
  });
  it("usa el monto vigente (adenda), no el original", () => {
    const o = obra({ monto_vigente: (40n * UNIDAD).toString(), fondeado: (30n * UNIDAD).toString() });
    expect(compacto(evaluarFondear(c(MUNI, o), 10n * UNIDAD))).toBe("ok");
    expect(compacto(evaluarFondear(c(MUNI, o), 10n * UNIDAD + 1n))).toBe("ExcedeMontoTotal");
  });
  it("montos de i128 sin perder precisión", () => {
    const max = 170141183460469231731687303715884105727n;
    const o = obra({ monto_vigente: max.toString(), fondeado: (max - 1n).toString() });
    expect(compacto(evaluarFondear(c(MUNI, o), 1n))).toBe("ok");
    expect(compacto(evaluarFondear(c(MUNI, o), 2n))).toBe("ExcedeMontoTotal");
  });
});

describe("helpers de período y orden", () => {
  it("hitoAnteriorOk: índice 0, Aprobado/Pagado sí; resto y ausente no; en cualquier orden", () => {
    const hs = [hitoEnEstado(2, "Pendiente"), hitoEnEstado(0, "Pagado"), hitoEnEstado(1, "Aprobado")];
    expect(hitoAnteriorOk(hs, 0)).toBe(true);
    expect(hitoAnteriorOk(hs, 1)).toBe(true); // 0 Pagado
    expect(hitoAnteriorOk(hs, 2)).toBe(true); // 1 Aprobado
    expect(hitoAnteriorOk(hs, 3)).toBe(false); // 2 Pendiente
    expect(hitoAnteriorOk(hs, 9)).toBe(false); // no existe el 8
    expect(hitoAnteriorOk([], 0)).toBe(true);
  });
  it("finPeriodo = momento_declaracion + periodo_objecion_seg", () => {
    const h = hito(0, "Evidencia", declaradoHace(30_000));
    expect(finPeriodo(h, obra())).toBe(AHORA - 30_000 + PERIODO_SEG * 1000);
  });
  it("finPeriodo sin declaración ni fin → null; dentroDelPeriodo false", () => {
    const h = hito(0, "Pendiente");
    expect(finPeriodo(h, obra())).toBeNull();
    expect(dentroDelPeriodo(h, obra(), AHORA)).toBe(false);
  });
  it("finPeriodo prefiere la definición del contrato a fin_periodo_objecion", () => {
    const h = hito(0, "Evidencia", { ...declaradoHace(30_000), fin_periodo_objecion: iso(AHORA + 999_999_000) });
    expect(finPeriodo(h, obra())).toBe(AHORA - 30_000 + PERIODO_SEG * 1000);
  });
});

describe("describirMotivo", () => {
  it("error del contrato: título = nombre del código y detalle no vacío", () => {
    for (const codigo of CODIGOS_ERROR) {
      const d = describirMotivo({ tipo: "contrato", codigo });
      expect(d.titulo).toBe(codigo);
      expect(d.detalle.length).toBeGreaterThan(0);
    }
  });
  it("autorización: título propio y menciona al rol requerido", () => {
    const d = describirMotivo({ tipo: "autorizacion", rolRequerido: "veedor" });
    expect(d.titulo).toBe("Error de autorización del host");
    expect(d.detalle).toContain("veedor");
  });
});

describe("márgenes de reloj (margenObjecionMs y margenPagoMs)", () => {
  // Hito 1 en Evidencia declarado 30 s antes de AHORA, período de 60 s: fin = AHORA + 30 s.
  const enEvidencia = hitosConObjetivo("Evidencia");
  // Hito 1 Aprobado declarado 600 s antes, período de 60 s: fin = AHORA − 540 s.
  const aprobado = hitosConObjetivo("Aprobado");
  const FIN_OBJECION = 30_000;
  const FIN_PAGO = 540_000;

  describe("objetar exige ahora + margen < fin", () => {
    const objetar = (margen?: number, ahora = AHORA) =>
      compacto(evaluarObjetar(ctx(["veedor"], enEvidencia, { ahora, margenObjecionMs: margen }), 1));

    it("sin margen: igual que antes", () => {
      expect(objetar()).toBe("ok");
      expect(objetar(0)).toBe("ok");
    });

    it("bordes: margen = fin − ahora − 1 pasa; = fin − ahora falla", () => {
      expect(objetar(FIN_OBJECION - 1)).toBe("ok");
      expect(objetar(FIN_OBJECION)).toBe("FueraDePeriodo");
      expect(objetar(FIN_OBJECION + 1)).toBe("FueraDePeriodo");
    });

    it("el margen se suma al reloj: mismo resultado moviendo ahora o el margen", () => {
      expect(objetar(10_000, AHORA + 19_999)).toBe("ok");
      expect(objetar(10_000, AHORA + 20_000)).toBe("FueraDePeriodo");
    });

    it("sin margen, ahora = fin ya es FueraDePeriodo (ventana semiabierta)", () => {
      expect(objetar(undefined, AHORA + FIN_OBJECION - 1)).toBe("ok");
      expect(objetar(undefined, AHORA + FIN_OBJECION)).toBe("FueraDePeriodo");
    });

    it("el margen de pago no afecta a objetar", () => {
      const r = evaluarObjetar(ctx(["veedor"], enEvidencia, { margenPagoMs: 10 ** 9 }), 1);
      expect(compacto(r)).toBe("ok");
    });

    it("los pasos previos conservan su prioridad sobre el margen", () => {
      const r = evaluarObjetar(ctx(["inspector"], enEvidencia, { margenObjecionMs: 10 ** 9 }), 1);
      expect(compacto(r)).toBe("auth:veedor");
    });
  });

  describe("liberar exige ahora − margen >= fin", () => {
    const liberar = (margen?: number, ahora = AHORA) =>
      compacto(evaluarLiberarPago(ctx([], aprobado, { ahora, margenPagoMs: margen }), 1));

    it("sin margen: igual que antes", () => {
      expect(liberar()).toBe("ok");
      expect(liberar(0)).toBe("ok");
    });

    it("bordes: margen = ahora − fin pasa (>=); un ms más falla", () => {
      expect(liberar(FIN_PAGO)).toBe("ok");
      expect(liberar(FIN_PAGO + 1)).toBe("PeriodoNoCumplido");
      expect(liberar(FIN_PAGO - 1)).toBe("ok");
    });

    it("el margen se resta al reloj", () => {
      expect(liberar(10_000, AHORA - FIN_PAGO + 10_000)).toBe("ok");
      expect(liberar(10_000, AHORA - FIN_PAGO + 9_999)).toBe("PeriodoNoCumplido");
    });

    it("sin margen, ahora = fin ya alcanza (>=)", () => {
      expect(liberar(undefined, AHORA - FIN_PAGO)).toBe("ok");
      expect(liberar(undefined, AHORA - FIN_PAGO - 1)).toBe("PeriodoNoCumplido");
    });

    it("el margen de objeción no afecta a liberar", () => {
      const r = evaluarLiberarPago(ctx([], aprobado, { margenObjecionMs: 10 ** 9 }), 1);
      expect(compacto(r)).toBe("ok");
    });

    it("el estado va antes que el período: un hito en Evidencia sigue dando EstadoInvalido", () => {
      const r = evaluarLiberarPago(ctx([], enEvidencia, { margenPagoMs: 0 }), 1);
      expect(compacto(r)).toBe("EstadoInvalido");
    });
  });

  it("evaluarHito pasa los márgenes a objetar y liberar", () => {
    const e = evaluarHito(ctx(["veedor"], enEvidencia, { margenObjecionMs: FIN_OBJECION }), 1);
    expect(compacto(e.objetar)).toBe("FueraDePeriodo");
    const l = evaluarHito(ctx([], aprobado, { margenPagoMs: FIN_PAGO + 1 }), 1);
    expect(compacto(l.liberar_pago)).toBe("PeriodoNoCumplido");
  });
});
