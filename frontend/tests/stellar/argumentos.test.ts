// @vitest-environment node
// (en jsdom el Uint8Array de TextEncoder es de otro "realm" y el SDK no serializa los Symbol)
import { Address, Keypair, scValToNative, StrKey, type xdr } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import { construirInvocacion } from "@/lib/invocaciones";
import {
  argumentosCrearObra,
  argumentosDe,
  enumUnitario,
  hexABytes32,
} from "@/lib/stellar/argumentos";
import { obra } from "../helpers/fixtures";

const G = () => Keypair.random().publicKey();
const C = StrKey.encodeContract(new Uint8Array(32).fill(9));
const HEX = "0123456789abcdef".repeat(4);
const bytesDe = (hex: string) => Uint8Array.from(hex.match(/../g)!, (h) => parseInt(h, 16));

const direcciones = { municipio: G(), contratista: G(), inspector: G(), veedor: G(), arbitro: G() };
const OBRA = obra({ id: 5, ...direcciones });
const tipos = (args: xdr.ScVal[]) => args.map((a) => a.type);

describe("argumentosDe: las 6 acciones", () => {
  it("fondear → u32, i128", () => {
    const args = argumentosDe(construirInvocacion(OBRA, { accion: "fondear", monto: 300_000_000n }));
    expect(tipos(args)).toEqual(["scvU32", "scvI128"]);
    expect(args.map((a) => scValToNative(a))).toEqual([5, 300_000_000n]);
  });

  it("fondear con monto > 2^53 no pierde precisión", () => {
    const monto = 2n ** 53n + 12345n;
    const grande = 2n ** 100n + 1n;
    for (const m of [monto, grande, 2n ** 127n - 1n]) {
      const args = argumentosDe(construirInvocacion(OBRA, { accion: "fondear", monto: m }));
      expect(args[1].type).toBe("scvI128");
      expect(scValToNative(args[1])).toBe(m);
    }
  });

  it("declarar_hito → u32, u32, bytes de 32 iguales al hex", () => {
    const args = argumentosDe(construirInvocacion(OBRA, { accion: "declarar_hito", hito: 2, evidenciaHash: HEX }));
    expect(tipos(args)).toEqual(["scvU32", "scvU32", "scvBytes"]);
    expect(scValToNative(args[1])).toBe(2);
    const bytes = scValToNative(args[2]) as Uint8Array;
    expect(bytes.length).toBe(32);
    expect(Array.from(bytes)).toEqual(Array.from(bytesDe(HEX)));
  });

  it("aprobar → u32, u32, Address del firmante", () => {
    const firmante = OBRA.veedor;
    const args = argumentosDe(
      construirInvocacion(OBRA, { accion: "aprobar", hito: 0, firmante, rolFirmante: "veedor" }),
    );
    expect(tipos(args)).toEqual(["scvU32", "scvU32", "scvAddress"]);
    expect(scValToNative(args[2])).toBe(firmante);
    expect(Address.fromScVal(args[2]).toString()).toBe(firmante);
  });

  it("objetar → motivo_hash en bytes de 32", () => {
    const motivo = "ff".repeat(32);
    const args = argumentosDe(construirInvocacion(OBRA, { accion: "objetar", hito: 1, motivoHash: motivo }));
    expect(tipos(args)).toEqual(["scvU32", "scvU32", "scvBytes"]);
    const bytes = scValToNative(args[2]) as Uint8Array;
    expect(bytes.length).toBe(32);
    expect(bytes.every((b) => b === 255)).toBe(true);
  });

  it.each(["Aceptar", "Rechazar"] as const)("resolver_objecion %s → scvVec[scvSymbol]", (decision) => {
    const args = argumentosDe(construirInvocacion(OBRA, { accion: "resolver_objecion", hito: 1, decision }));
    expect(tipos(args)).toEqual(["scvU32", "scvU32", "scvVec"]);
    const vec = args[2] as xdr.ScVal & { vec: xdr.ScVal[] };
    expect(vec.vec).toHaveLength(1);
    expect(vec.vec[0].type).toBe("scvSymbol");
    expect(scValToNative(args[2])).toEqual([decision]);
  });

  it("liberar_pago → u32, u32", () => {
    const args = argumentosDe(construirInvocacion(OBRA, { accion: "liberar_pago", hito: 3 }));
    expect(tipos(args)).toEqual(["scvU32", "scvU32"]);
    expect(args.map((a) => scValToNative(a))).toEqual([5, 3]);
  });

  it("una Decision inválida, un hash inválido o un monto no entero se rechazan", () => {
    const inv = construirInvocacion(OBRA, { accion: "resolver_objecion", hito: 0, decision: "Aceptar" });
    inv.argumentos[2].valor = "Quizas";
    expect(() => argumentosDe(inv)).toThrow(/Decision inválida/);

    const dec = construirInvocacion(OBRA, { accion: "declarar_hito", hito: 0, evidenciaHash: "zz" });
    expect(() => argumentosDe(dec)).toThrow(/Hash inválido/);

    const fon = construirInvocacion(OBRA, { accion: "fondear", monto: 1n });
    fon.argumentos[1].valor = "1.5";
    expect(() => argumentosDe(fon)).toThrow(/i128 inválido/);

    const hito = construirInvocacion(OBRA, { accion: "liberar_pago", hito: 0 });
    hito.argumentos[1].valor = "-1";
    expect(() => argumentosDe(hito)).toThrow(/u32 inválido/);
    hito.argumentos[1].valor = "4294967296";
    expect(() => argumentosDe(hito)).toThrow(/u32 inválido/);

    const raro = construirInvocacion(OBRA, { accion: "liberar_pago", hito: 0 });
    raro.argumentos[1].tipo = "Vec<u8>";
    expect(() => argumentosDe(raro)).toThrow(/sin conversión/);
  });
});

describe("hexABytes32", () => {
  it("convierte 64 hex en 32 bytes", () => {
    const b = hexABytes32(HEX);
    expect(b).toBeInstanceOf(Uint8Array);
    expect(Array.from(b)).toEqual(Array.from(bytesDe(HEX)));
  });

  it.each([
    ["vacío", ""],
    ["corto", "ab".repeat(31)],
    ["largo", "ab".repeat(33)],
    ["no hex", "g".repeat(64)],
    ["mayúsculas", "AB".repeat(32)],
    ["con 0x", "0x" + "ab".repeat(31) + "a"],
    ["con espacios", " " + "ab".repeat(32)],
  ])("rechaza %s", (_nombre, hex) => {
    expect(() => hexABytes32(hex)).toThrow(/Hash inválido/);
  });
});

describe("enumUnitario", () => {
  it("es Vec[Symbol(variante)]", () => {
    expect(scValToNative(enumUnitario("Aceptar"))).toEqual(["Aceptar"]);
  });
});

describe("argumentosCrearObra (§3.1)", () => {
  const nueva = {
    ...direcciones,
    nombre: "Puente",
    token: C,
    hitos: [
      { descripcion: "Cimientos", monto: 10_000_000n },
      { descripcion: "Estructura", monto: 2n ** 70n },
    ],
    periodoObjecion: 86_400,
  };

  it("9 argumentos en el orden de la firma", () => {
    const args = argumentosCrearObra(nueva);
    expect(tipos(args)).toEqual([
      "scvAddress", // municipio
      "scvString", // nombre
      "scvAddress", // contratista
      "scvAddress", // inspector
      "scvAddress", // veedor
      "scvAddress", // arbitro
      "scvAddress", // token
      "scvVec", // hitos
      "scvU64", // periodo_objecion
    ]);
    const nativos = args.map((a) => scValToNative(a));
    expect(nativos[0]).toBe(nueva.municipio);
    expect(nativos[1]).toBe("Puente");
    expect(nativos.slice(2, 6)).toEqual([nueva.contratista, nueva.inspector, nueva.veedor, nueva.arbitro]);
    expect(nativos[6]).toBe(C);
    expect(nativos[8]).toBe(86_400n);
  });

  it("cada NuevoHito es un mapa con claves Symbol ordenadas y monto i128", () => {
    const hitos = argumentosCrearObra(nueva)[7] as xdr.ScVal & { vec: xdr.ScVal[] };
    expect(hitos.vec).toHaveLength(2);
    hitos.vec.forEach((h, i) => {
      expect(h.type).toBe("scvMap");
      const mapa = (h as xdr.ScVal & { map: { key: xdr.ScVal; val: xdr.ScVal }[] }).map;
      expect(mapa.map((e) => e.key.type)).toEqual(["scvSymbol", "scvSymbol"]);
      expect(mapa.map((e) => scValToNative(e.key))).toEqual(["descripcion", "monto"]);
      expect(mapa[0].val.type).toBe("scvString");
      expect(mapa[1].val.type).toBe("scvI128");
      expect(scValToNative(mapa[1].val)).toBe(nueva.hitos[i].monto);
      expect(scValToNative(mapa[0].val)).toBe(nueva.hitos[i].descripcion);
    });
  });

  it("serializa a XDR y vuelve igual (ida y vuelta)", () => {
    for (const a of argumentosCrearObra(nueva)) {
      expect(a.toXDR("base64")).toBeTruthy();
    }
  });
});
