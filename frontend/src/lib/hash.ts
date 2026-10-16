// SHA-256 en hexadecimal (64 caracteres, minúsculas) con WebCrypto: funciona en el navegador y en Node.

export const PATRON_HASH = /^[0-9a-f]{64}$/;

export function esHash(valor: unknown): valor is string {
  return typeof valor === "string" && PATRON_HASH.test(valor);
}

/** false en un navegador fuera de un contexto seguro (p. ej. http://192.168… desde un celular). */
export function hashDisponible(): boolean {
  return Boolean(globalThis.crypto?.subtle);
}

export async function sha256Hex(datos: ArrayBuffer | Uint8Array | string): Promise<string> {
  const sutil = globalThis.crypto?.subtle;
  if (!sutil) {
    // En el navegador, crypto.subtle solo existe en contextos seguros (https o localhost).
    throw new Error(
      "No se puede calcular el hash: el navegador solo lo permite en https o en localhost.",
    );
  }
  const bytes = typeof datos === "string" ? new TextEncoder().encode(datos) : datos;
  const resumen = await sutil.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(resumen), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 3f2a9c…81d0 */
export function abreviarHash(hash: string, extremos = 6): string {
  return hash.length <= extremos * 2 + 1 ? hash : `${hash.slice(0, extremos)}…${hash.slice(-extremos)}`;
}
