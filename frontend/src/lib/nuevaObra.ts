// Validación del formulario "Crear una obra nueva" del panel del municipio. Los pasos 2 y 3 siguen el
// orden de interfaces/contract.md §3.1 (RolesDuplicados, después MontoInvalido) para mostrar el mismo
// error que daría el contrato; el resto son controles de formulario (direcciones mal escritas, campos
// vacíos) que el contrato no ve porque ni siquiera se podría armar la transacción.

import { StrKey } from "@stellar/stellar-sdk/base";
import type { CodigoError } from "./errores";
import { parsearMonto } from "./montos";

export interface FormularioObra {
  municipio: string;
  nombre: string;
  contratista: string;
  inspector: string;
  veedor: string;
  arbitro: string;
  hitos: { descripcion: string; monto: string }[];
}

export type CampoObra = "nombre" | "contratista" | "inspector" | "veedor" | "arbitro" | `hito-${number}`;

export type ResultadoObra =
  | { ok: true; hitos: { descripcion: string; monto: bigint }[]; total: bigint }
  | { ok: false; campo: CampoObra | null; mensaje: string; codigo?: CodigoError };

const NOMBRES: Record<"contratista" | "inspector" | "veedor" | "arbitro", string> = {
  contratista: "del contratista",
  inspector: "del inspector",
  veedor: "del veedor",
  arbitro: "del árbitro",
};

const normal = (d: string) => d.trim().toUpperCase();

export function validarNuevaObra(f: FormularioObra): ResultadoObra {
  if (!f.nombre.trim()) return { ok: false, campo: "nombre", mensaje: "Falta el nombre de la obra" };
  for (const rol of ["contratista", "inspector", "veedor", "arbitro"] as const) {
    const valor = f[rol].trim();
    if (!valor) return { ok: false, campo: rol, mensaje: `Falta la dirección ${NOMBRES[rol]}` };
    if (!StrKey.isValidEd25519PublicKey(valor)) {
      return { ok: false, campo: rol, mensaje: `La dirección ${NOMBRES[rol]} no es una cuenta de Stellar válida (empieza con G)` };
    }
  }

  // §3.1 paso 2: RolesDuplicados.
  const roles = [f.contratista, f.inspector, f.veedor, f.arbitro].map(normal);
  if (new Set(roles).size !== roles.length) {
    return {
      ok: false,
      campo: null,
      codigo: "RolesDuplicados",
      mensaje: "Contratista, inspector, veedor y árbitro tienen que ser cuentas distintas",
    };
  }
  const municipio = normal(f.municipio);
  if ([f.contratista, f.inspector, f.veedor].map(normal).includes(municipio)) {
    return {
      ok: false,
      campo: null,
      codigo: "RolesDuplicados",
      mensaje: "El municipio no puede ser contratista, inspector ni veedor de su obra (sí puede ser árbitro)",
    };
  }

  // §3.1 paso 3: MontoInvalido (lista vacía o algún monto ≤ 0).
  if (f.hitos.length === 0) {
    return { ok: false, campo: null, codigo: "MontoInvalido", mensaje: "La obra necesita al menos un hito" };
  }
  const hitos: { descripcion: string; monto: bigint }[] = [];
  let total = 0n;
  for (const [i, h] of f.hitos.entries()) {
    if (!h.descripcion.trim()) return { ok: false, campo: `hito-${i}`, mensaje: `Falta la descripción del hito ${i + 1}` };
    const monto = parsearMonto(h.monto);
    if (monto === null || monto <= 0n) {
      return {
        ok: false,
        campo: `hito-${i}`,
        codigo: "MontoInvalido",
        mensaje: `El monto del hito ${i + 1} tiene que ser mayor que cero (hasta 7 decimales)`,
      };
    }
    hitos.push({ descripcion: h.descripcion.trim(), monto });
    total += monto;
  }
  return { ok: true, hitos, total };
}
