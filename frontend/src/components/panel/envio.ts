import type { Firmar, Red } from "@/lib/stellar/transacciones";

/** Lo que el panel necesita para simular y enviar contra la red. null = solo vista previa. */
export interface ContextoEnvio {
  red: Red;
  contratoId: string;
  /** Cuenta origen: la conectada o, en desarrollo, la del rol simulado (solo para simular). */
  origen: string;
  /** Firmante (Freighter); null si no se puede firmar. */
  firmar: Firmar | null;
  /** Por qué no se puede firmar, si `firmar` es null. */
  motivoSinFirma: string | null;
  /** Explorador de transacciones, si está configurado. */
  urlTransaccion: (hash: string) => string | null;
}

/** Hash de relleno para "probar con el contrato" una acción que pide un hash todavía no subido. */
export const HASH_DE_PRUEBA = "0".repeat(64);
