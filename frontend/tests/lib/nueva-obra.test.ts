import { describe, expect, it } from "vitest";
import { Keypair, scValToNative } from "@stellar/stellar-sdk/base";
import { construirCrearObra } from "@/lib/invocaciones";
import { validarNuevaObra, type FormularioObra } from "@/lib/nuevaObra";
import { argumentosDe } from "@/lib/stellar/argumentos";

const [M, C, I, V] = Array.from({ length: 4 }, (_, i) => Keypair.fromRawEd25519Seed(new Uint8Array(32).fill(i + 1)).publicKey());

const base = (extra: Partial<FormularioObra> = {}): FormularioObra => ({
  municipio: M,
  nombre: "Bacheo avenida Mitre",
  contratista: C,
  inspector: I,
  veedor: V,
  arbitro: M,
  hitos: [
    { descripcion: "Fresado", monto: "6000" },
    { descripcion: "Carpeta", monto: "9000,5" },
  ],
  ...extra,
});

describe("validarNuevaObra (orden de contract.md §3.1)", () => {
  it("datos válidos: suma el total en unidades mínimas", () => {
    const r = validarNuevaObra(base());
    expect(r.ok && r.total).toBe(150005000000n);
  });

  it("campos faltantes o direcciones mal escritas", () => {
    expect(validarNuevaObra(base({ nombre: " " }))).toMatchObject({ ok: false, campo: "nombre" });
    expect(validarNuevaObra(base({ veedor: "" }))).toMatchObject({ ok: false, campo: "veedor", mensaje: "Falta la dirección del veedor" });
    expect(validarNuevaObra(base({ inspector: "GXYZ" }))).toMatchObject({ ok: false, campo: "inspector" });
  });

  it("RolesDuplicados antes que MontoInvalido", () => {
    expect(validarNuevaObra(base({ veedor: C, hitos: [] }))).toMatchObject({ ok: false, codigo: "RolesDuplicados" });
    expect(validarNuevaObra(base({ contratista: M }))).toMatchObject({ ok: false, codigo: "RolesDuplicados" });
  });

  it("el municipio sí puede ser árbitro", () => {
    expect(validarNuevaObra(base({ arbitro: M })).ok).toBe(true);
  });

  it("MontoInvalido: sin hitos o con un monto ≤ 0 o mal escrito", () => {
    expect(validarNuevaObra(base({ hitos: [] }))).toMatchObject({ ok: false, codigo: "MontoInvalido" });
    expect(validarNuevaObra(base({ hitos: [{ descripcion: "a", monto: "0" }] }))).toMatchObject({ codigo: "MontoInvalido", campo: "hito-0" });
    expect(validarNuevaObra(base({ hitos: [{ descripcion: "a", monto: "1.500,5" }] }))).toMatchObject({ codigo: "MontoInvalido" });
  });
});

describe("crear_obra: invocación y argumentos", () => {
  it("arma los nueve argumentos del contrato, con los montos sin pasar por Number", () => {
    const inv = construirCrearObra({
      municipio: M,
      nombre: "Obra",
      contratista: C,
      inspector: I,
      veedor: V,
      arbitro: M,
      token: "CAKGWGZQI6XOF6XAP2BB2DM6DQP525ETKYDT5UHSYBF2XRA6JUITA2QK",
      hitos: [{ descripcion: "Uno", monto: 2n ** 70n }],
      periodoObjecion: 60,
    });
    expect(inv.funcion).toBe("crear_obra");
    expect(inv.firma).toEqual({ rol: "municipio", direccion: M });
    expect(inv.argumentos.map((a) => a.tipo)).toEqual([
      "Address",
      "String",
      "Address",
      "Address",
      "Address",
      "Address",
      "Address",
      "Vec<NuevoHito>",
      "u64",
    ]);
    expect(inv.argumentos[7].valor).toBe(`[{"descripcion":"Uno","monto":"${(2n ** 70n).toString()}"}]`);
    const scvals = argumentosDe(inv);
    expect(scvals).toHaveLength(9);
    expect(scvals[7].type).toBe("scvVec");
    expect(scvals[8].type).toBe("scvU64");
    expect(scValToNative(scvals[7])).toEqual([{ descripcion: "Uno", monto: 2n ** 70n }]);
    expect(scValToNative(scvals[1])).toBe("Obra");
  });
});
