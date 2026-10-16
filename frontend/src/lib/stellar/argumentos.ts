// Argumentos del contrato como xdr.ScVal, según los tipos de las firmas de contract.md §3.
// Se arman a partir de la misma `Invocacion` que muestra la vista previa del panel, así lo que se
// ve es exactamente lo que se envía.

import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk/base";
import type { Argumento, Invocacion } from "../invocaciones";

/** Hex de 64 caracteres → 32 bytes (BytesN<32>). Sin Buffer, para que funcione en el navegador. */
export function hexABytes32(hex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error(`Hash inválido (se esperan 64 hex en minúsculas): "${hex}"`);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/**
 * Un enum `contracttype` de variantes unitarias va on-chain como `Vec[Symbol("Variante")]`
 * (contracts/DEPLOY.md, soroban-sdk 28).
 */
export function enumUnitario(variante: string): xdr.ScVal {
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variante)]);
}

function u32(valor: string): xdr.ScVal {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new Error(`u32 inválido: "${valor}"`);
  return nativeToScVal(n, { type: "u32" });
}

function i128(valor: string): xdr.ScVal {
  if (!/^-?[0-9]+$/.test(valor)) throw new Error(`i128 inválido: "${valor}"`);
  return nativeToScVal(BigInt(valor), { type: "i128" });
}

/** Un argumento de la vista previa → ScVal, según su tipo Soroban. */
export function argumentoAScVal({ nombre, tipo, valor }: Argumento): xdr.ScVal {
  switch (tipo) {
    case "u32":
      return u32(valor);
    case "i128":
      return i128(valor);
    case "Address":
      return new Address(valor).toScVal();
    case "BytesN<32>":
      return nativeToScVal(hexABytes32(valor), { type: "bytes" });
    case "Decision":
      if (valor !== "Aceptar" && valor !== "Rechazar") throw new Error(`Decision inválida: "${valor}"`);
      return enumUnitario(valor);
    default:
      throw new Error(`Tipo de argumento sin conversión: ${tipo} (${nombre})`);
  }
}

export function argumentosDe(invocacion: Invocacion): xdr.ScVal[] {
  return invocacion.argumentos.map(argumentoAScVal);
}

export interface NuevaObra {
  municipio: string;
  nombre: string;
  contratista: string;
  inspector: string;
  veedor: string;
  arbitro: string;
  token: string;
  hitos: { descripcion: string; monto: bigint }[];
  /** Segundos. */
  periodoObjecion: number;
}

/**
 * Argumentos de `crear_obra` (§3.1). No tiene pantalla: la usa el script de la demo.
 * `NuevoHito` es un struct: un mapa con claves Symbol ordenadas (nativeToScVal las ordena).
 */
export function argumentosCrearObra(o: NuevaObra): xdr.ScVal[] {
  return [
    new Address(o.municipio).toScVal(),
    nativeToScVal(o.nombre, { type: "string" }),
    new Address(o.contratista).toScVal(),
    new Address(o.inspector).toScVal(),
    new Address(o.veedor).toScVal(),
    new Address(o.arbitro).toScVal(),
    new Address(o.token).toScVal(),
    xdr.ScVal.scvVec(
      o.hitos.map((h) =>
        nativeToScVal(
          { descripcion: h.descripcion, monto: h.monto },
          { type: { descripcion: ["symbol", "string"], monto: ["symbol", "i128"] } },
        ),
      ),
    ),
    nativeToScVal(BigInt(o.periodoObjecion), { type: "u64" }),
  ];
}
