// Montos del contrato: enteros i128 en la unidad mínima del token (7 decimales), que la API
// serializa como string. Todo el cálculo pasa por BigInt: nunca por `number`.

export const DECIMALES = 7;
const ESCALA = 10n ** BigInt(DECIMALES);

// SUPUESTO: activo de prueba tipo USDC en testnet (PRD §11). Se usa solo como etiqueta.
export const SIMBOLO_TOKEN = "USDC";

const PATRON_MONTO = /^[0-9]+$/;

/** Convierte el string de la API a BigInt. Lanza si no cumple el patrón `^[0-9]+$` del OpenAPI. */
export function aUnidades(monto: string): bigint {
  if (!PATRON_MONTO.test(monto)) throw new Error(`Monto inválido: "${monto}"`);
  return BigInt(monto);
}

function agruparMiles(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Formatea unidades mínimas con 7 decimales en notación argentina: "15000000000" → "1.500,0000000".
 * Acepta string (como viene de la API) o bigint.
 */
export function formatearMonto(monto: string | bigint, conSimbolo = false): string {
  const valor = typeof monto === "bigint" ? monto : aUnidades(monto);
  const negativo = valor < 0n;
  const absoluto = negativo ? -valor : valor;
  const entero = agruparMiles((absoluto / ESCALA).toString());
  const fraccion = (absoluto % ESCALA).toString().padStart(DECIMALES, "0");
  const texto = `${negativo ? "-" : ""}${entero},${fraccion}`;
  return conSimbolo ? `${texto} ${SIMBOLO_TOKEN}` : texto;
}

/**
 * Interpreta lo que escribe una persona ("1500", "1500,5" o "1500.5") y lo pasa a unidades mínimas.
 * Un solo separador decimal (coma o punto), sin separador de miles, hasta 7 decimales.
 * Devuelve null si el texto no es un monto válido.
 */
export function parsearMonto(texto: string): bigint | null {
  const limpio = texto.trim();
  const coincidencia = /^([0-9]+)(?:[.,]([0-9]+))?$/.exec(limpio);
  if (!coincidencia) return null;
  const [, entero, fraccion = ""] = coincidencia;
  if (fraccion.length > DECIMALES) return null;
  return BigInt(entero) * ESCALA + BigInt(fraccion.padEnd(DECIMALES, "0"));
}

/** Porcentaje (0–100, con dos decimales) de `parte` sobre `total`, calculado con BigInt. */
export function porcentaje(parte: string | bigint, total: string | bigint): number {
  const p = typeof parte === "bigint" ? parte : aUnidades(parte);
  const t = typeof total === "bigint" ? total : aUnidades(total);
  if (t <= 0n) return 0;
  return Number((p * 10000n) / t) / 100;
}
