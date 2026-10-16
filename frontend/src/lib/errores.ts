// Catálogo cerrado de errores del contrato (interfaces/contract.md §2) con su mensaje en castellano.
// Único lugar donde viven estos textos: el panel los usa para explicar por qué una acción no aplica
// y la Fase 3 los reutiliza para traducir los errores que devuelva la simulación o la transacción.

export const CODIGOS_ERROR = [
  "ObraNoExiste",
  "HitoNoExiste",
  "NoAutorizado",
  "RolesDuplicados",
  "MontoInvalido",
  "ExcedeMontoTotal",
  "FondosInsuficientes",
  "EstadoInvalido",
  "HitoAnteriorPendiente",
  "YaDecidio",
  "ObjecionAbierta",
  "ObjecionYaUsada",
  "FueraDePeriodo",
  "PeriodoNoCumplido",
  "YaPagado",
] as const;

export type CodigoError = (typeof CODIGOS_ERROR)[number];

export interface DefinicionError {
  /** Código numérico congelado en el contrato (`#[repr(u32)]`). */
  numero: number;
  mensaje: string;
}

export const ERRORES: Record<CodigoError, DefinicionError> = {
  ObraNoExiste: { numero: 1, mensaje: "La obra no existe." },
  HitoNoExiste: { numero: 2, mensaje: "El hito no existe en esta obra." },
  NoAutorizado: {
    numero: 3,
    mensaje: "La dirección firmante no es el inspector ni el veedor de la obra.",
  },
  RolesDuplicados: {
    numero: 4,
    mensaje:
      "Los roles deben ser direcciones distintas: contratista, inspector, veedor y árbitro entre sí, y el municipio distinto de contratista, inspector y veedor.",
  },
  MontoInvalido: {
    numero: 5,
    mensaje: "El monto tiene que ser mayor que cero (o la lista de hitos está vacía o la suma desborda).",
  },
  ExcedeMontoTotal: {
    numero: 6,
    mensaje: "Con este depósito lo fondeado superaría el presupuesto vigente de la obra.",
  },
  FondosInsuficientes: {
    numero: 7,
    mensaje: "El saldo bloqueado de la obra no alcanza para pagar el monto vigente del hito.",
  },
  EstadoInvalido: {
    numero: 8,
    mensaje: "La acción no corresponde al estado actual del hito.",
  },
  HitoAnteriorPendiente: {
    numero: 9,
    mensaje: "El hito anterior todavía no está aprobado ni pagado.",
  },
  YaDecidio: {
    numero: 10,
    mensaje: "Este rol ya decidió sobre la declaración vigente del hito.",
  },
  ObjecionAbierta: {
    numero: 11,
    mensaje: "El hito tiene una objeción abierta: queda congelado hasta que el árbitro la resuelva.",
  },
  ObjecionYaUsada: {
    numero: 12,
    mensaje: "El veedor ya objetó esta declaración y el árbitro rechazó la objeción.",
  },
  FueraDePeriodo: {
    numero: 13,
    mensaje: "Terminó el período de objeción de esta declaración.",
  },
  PeriodoNoCumplido: {
    numero: 14,
    mensaje: "Todavía no terminó el período de objeción: el pago se puede liberar cuando venza.",
  },
  YaPagado: { numero: 15, mensaje: "El hito ya fue pagado." },
};

const POR_NUMERO = new Map<number, CodigoError>(
  CODIGOS_ERROR.map((codigo) => [ERRORES[codigo].numero, codigo]),
);

export function esCodigoError(valor: unknown): valor is CodigoError {
  return typeof valor === "string" && (CODIGOS_ERROR as readonly string[]).includes(valor);
}

/** Código a partir del número que devuelve el contrato (p. ej. `Error(Contract, #9)`). */
export function codigoPorNumero(numero: number): CodigoError | undefined {
  return POR_NUMERO.get(numero);
}

/** Mensaje en castellano para un código o número de error del contrato. */
export function mensajeError(codigo: CodigoError | number): string {
  const clave = typeof codigo === "number" ? codigoPorNumero(codigo) : codigo;
  return clave ? ERRORES[clave].mensaje : `Error desconocido del contrato (${codigo}).`;
}

/**
 * Las funciones de un solo rol piden la firma con `require_auth()`: si firma otra cuenta, falla el host,
 * no el contrato (contract.md §0). No es uno de los 15 errores, pero el panel también lo explica.
 */
export const MENSAJE_AUTORIZACION_HOST =
  "Error de autorización del host: la transacción tiene que firmarla la dirección del rol que pide la función.";
