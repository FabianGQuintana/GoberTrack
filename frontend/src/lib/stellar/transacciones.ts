// Transacciones contra el contrato: armar la invocación, simular, firmar, enviar y esperar la
// confirmación. Lo usan el panel (firmante Freighter) y el script de la demo (firmante Keypair).
//
// Si la SIMULACIÓN falla con `Error(Contract, #N)`, se corta antes de pedir la firma: el contrato
// rechaza solo, sin que nadie firme nada.
//
// APIs del SDK 17.2.1 verificadas en sus .d.ts: rpc.Server (getAccount, simulateTransaction,
// sendTransaction, pollTransaction), rpc.Api.isSimulationError/isSimulationRestore,
// rpc.assembleTransaction, TransactionBuilder (y fromXDR), Contract.call, inspectAuthEntry,
// humanizeEvents y scValToNative.

import {
  BASE_FEE,
  Contract,
  humanizeEvents,
  inspectAuthEntry,
  scValToNative,
  TransactionBuilder,
  type Account,
  type FeeBumpTransaction,
  type Transaction,
  type xdr,
} from "@stellar/stellar-sdk/base";
import { Api, assembleTransaction, BasicSleepStrategy, Server } from "@stellar/stellar-sdk/rpc";
import { codigoPorNumero, type CodigoError } from "../errores";

/** Firma una transacción en XDR (base64) y devuelve el XDR firmado. Freighter o un Keypair. */
export type Firmar = (xdrSinFirmar: string) => Promise<string>;

export type Etapa = "simulando" | "firmando" | "enviando" | "confirmando";

export type MotivoRechazo =
  /** Error del contrato (contract.md §2), detectado al simular o al aplicar. */
  | { tipo: "contrato"; codigo: CodigoError; numero: number }
  /** La invocación pide la firma de otras cuentas (require_auth de otro rol). */
  | { tipo: "autorizacion"; direcciones: string[] }
  /** Error de otro contrato llamado por la obra: el token (SAC), p. ej. saldo o trustline. */
  | { tipo: "token"; numero: number; contratoId: string }
  | { tipo: "simulacion"; detalle: string }
  | { tipo: "firma"; detalle: string }
  | { tipo: "envio"; detalle: string }
  | { tipo: "fallida"; detalle: string }
  | { tipo: "sin-confirmar"; detalle: string };

export class ErrorTransaccion extends Error {
  constructor(
    readonly motivo: MotivoRechazo,
    readonly etapa: Etapa,
    readonly hash?: string,
  ) {
    super(describirRechazo(motivo));
    this.name = "ErrorTransaccion";
  }
}

/** Lo que el módulo usa del RPC: así las pruebas pueden inyectar uno simulado. */
export interface ServidorRpc {
  getAccount(direccion: string): Promise<Account>;
  simulateTransaction(tx: Transaction): Promise<Api.SimulateTransactionResponse>;
  sendTransaction(tx: Transaction | FeeBumpTransaction): Promise<Api.SendTransactionResponse>;
  pollTransaction(hash: string, opciones?: { attempts?: number; sleepStrategy?: (i: number) => number }): Promise<Api.GetTransactionResponse>;
  /** Para conocer la hora del ledger (reloj del panel). Opcional en los RPC simulados. */
  getLatestLedger?(): Promise<Pick<Api.GetLatestLedgerResponse, "sequence" | "closeTime">>;
}

/**
 * Hora de cierre del último ledger, en ms. Es la hora que usa el contrato (`env.ledger().timestamp()`)
 * al simular: más fiel que el reloj del navegador para los bordes del período de objeción.
 */
export async function horaDelUltimoLedger(red: Red): Promise<{ ms: number; secuencia: number }> {
  const servidor = servidorDe(red);
  if (!servidor.getLatestLedger) throw new Error("El RPC no expone getLatestLedger");
  const ultimo = await servidor.getLatestLedger();
  const segundos = Number(ultimo.closeTime);
  if (!Number.isFinite(segundos) || segundos <= 0) throw new Error(`closeTime inválido: ${ultimo.closeTime}`);
  return { ms: segundos * 1000, secuencia: ultimo.sequence };
}

export interface Red {
  rpcUrl: string;
  passphrase: string;
  /** Si falta, se crea un rpc.Server con `rpcUrl`. */
  servidor?: ServidorRpc;
}

export interface Invocar {
  /** Contrato a invocar (el de la obra o, para leer saldos, el SAC). */
  contratoId: string;
  funcion: string;
  args: xdr.ScVal[];
  /** Cuenta origen de la transacción: la que firma y paga la comisión. */
  origen: string;
}

export interface Simulacion {
  tx: Transaction;
  sim: Api.SimulateTransactionSuccessResponse;
  /** Valor de retorno simulado, convertido con scValToNative. */
  retorno: unknown;
}

export interface Confirmacion {
  hash: string;
  ledger: number;
  retorno: unknown;
}

/** Segundos de validez de la transacción (timebounds). */
const VALIDEZ_SEG = 120;
/** Intentos de pollTransaction (1 s entre intentos): ~30 s, unos 6 ledgers. */
const INTENTOS_CONFIRMACION = 30;

const servidores = new Map<string, ServidorRpc>();

export function servidorDe(red: Red): ServidorRpc {
  if (red.servidor) return red.servidor;
  let servidor = servidores.get(red.rpcUrl);
  if (!servidor) {
    servidor = new Server(red.rpcUrl, { allowHttp: red.rpcUrl.startsWith("http://") });
    servidores.set(red.rpcUrl, servidor);
  }
  return servidor;
}

// ---- Errores ----

const PATRON_ERROR_CONTRATO = /Error\(Contract, #(\d+)\)/;

function motivoContrato(numero: number): MotivoRechazo | null {
  const codigo = codigoPorNumero(numero);
  return codigo ? { tipo: "contrato", codigo, numero } : null;
}

/** Busca `{ type: "contract", code }` (un scvError del contrato pasado por scValToNative). */
function buscarCodigo(valor: unknown, profundidad = 0): number | null {
  if (profundidad > 6 || valor === null || typeof valor !== "object") return null;
  const v = valor as { type?: unknown; code?: unknown };
  if (v.type === "contract" && typeof v.code === "number") return v.code;
  for (const hijo of Array.isArray(valor) ? valor : Object.values(valor)) {
    const encontrado = buscarCodigo(hijo, profundidad + 1);
    if (encontrado !== null) return encontrado;
  }
  return null;
}

/** Errores de contrato (`{type:"contract", code}`) en eventos de diagnóstico, con el contrato que los emitió. */
function erroresEnEventos(
  eventos: readonly xdr.DiagnosticEvent[] | undefined,
): { numero: number; contratoId?: string }[] {
  if (!eventos || eventos.length === 0) return [];
  try {
    return humanizeEvents([...eventos]).flatMap((e) => {
      const numero = buscarCodigo([e.topics, e.data]);
      return numero === null ? [] : [{ numero, contratoId: e.contractId }];
    });
  } catch {
    // Eventos que no se pueden decodificar: no hay código.
    return [];
  }
}

/**
 * Código de error de contrato en eventos de diagnóstico, si lo hay. Con `contratoId`, solo cuenta el
 * que emitió ese contrato (revisión R2: un `Error(Contract, #N)` del SAC no es un error de la obra).
 */
export function codigoEnEventos(
  eventos: readonly xdr.DiagnosticEvent[] | undefined,
  contratoId?: string,
): number | null {
  const errores = erroresEnEventos(eventos);
  const elegido = contratoId ? errores.find((e) => e.contratoId === contratoId) : errores[0];
  return elegido?.numero ?? null;
}

/**
 * Motivo según quién emitió el error: si fue otro contrato (el token, al que la obra llama en
 * `fondear` y `liberar_pago`), "token"; si fue el de la obra, su error del catálogo. null si no hay.
 */
export function motivoEnEventos(
  eventos: readonly xdr.DiagnosticEvent[] | undefined,
  contratoId: string,
): MotivoRechazo | null {
  const errores = erroresEnEventos(eventos);
  const ajeno = errores.find((e) => e.contratoId !== undefined && e.contratoId !== contratoId);
  if (ajeno) return { tipo: "token", numero: ajeno.numero, contratoId: ajeno.contratoId ?? "" };
  const propio = errores.find((e) => e.contratoId === contratoId);
  return propio ? motivoContrato(propio.numero) : null;
}

/**
 * Motivo a partir del error de la simulación (p. ej. "HostError: Error(Contract, #9)"). Con
 * `contratoId`, primero se atribuye el error por los eventos de diagnóstico (revisión R2); el texto
 * no dice qué contrato lo emitió.
 */
export function motivoDeSimulacion(
  error: string,
  eventos?: readonly xdr.DiagnosticEvent[],
  contratoId?: string,
): MotivoRechazo {
  if (contratoId) {
    const atribuido = motivoEnEventos(eventos, contratoId);
    if (atribuido) return atribuido;
  }
  const coincidencia = PATRON_ERROR_CONTRATO.exec(error);
  const numero = coincidencia ? Number(coincidencia[1]) : codigoEnEventos(eventos);
  const motivo = numero !== null ? motivoContrato(numero) : null;
  if (motivo) return motivo;
  if (/Error\(Auth,/.test(error)) return { tipo: "autorizacion", direcciones: [] };
  return { tipo: "simulacion", detalle: error.split("\n")[0].slice(0, 300) };
}

export function describirRechazo(motivo: MotivoRechazo): string {
  switch (motivo.tipo) {
    case "contrato":
      return `El contrato rechazó la operación: ${motivo.codigo} (#${motivo.numero}).`;
    case "autorizacion":
      return motivo.direcciones.length > 0
        ? `La operación necesita la firma de otra cuenta: ${motivo.direcciones.join(", ")}.`
        : "La operación necesita la firma de otra cuenta.";
    case "token":
      return `El token rechazó la operación (#${motivo.numero}).`;
    case "simulacion":
      return `La simulación falló: ${motivo.detalle}`;
    case "firma":
      return `No se firmó: ${motivo.detalle}`;
    case "envio":
      return `El RPC no aceptó la transacción: ${motivo.detalle}`;
    case "fallida":
      return `La transacción falló en el ledger: ${motivo.detalle}`;
    case "sin-confirmar":
      return `Sin confirmación todavía: ${motivo.detalle}`;
  }
}

// ---- Flujo ----

async function armar(red: Red, p: Invocar): Promise<Transaction> {
  const cuenta = await servidorDe(red).getAccount(p.origen);
  return new TransactionBuilder(cuenta, { fee: BASE_FEE, networkPassphrase: red.passphrase })
    .addOperation(new Contract(p.contratoId).call(p.funcion, ...p.args))
    .setTimeout(VALIDEZ_SEG)
    .build();
}

/**
 * Arma y simula. Lanza ErrorTransaccion (etapa "simulando") si el contrato rechaza, si hacen falta
 * firmas de otras cuentas o si hay datos archivados que restaurar.
 */
export async function simular(red: Red, p: Invocar): Promise<Simulacion> {
  const tx = await armar(red, p);
  const sim = await servidorDe(red).simulateTransaction(tx);
  if (Api.isSimulationError(sim)) {
    throw new ErrorTransaccion(motivoDeSimulacion(sim.error, sim.events, p.contratoId), "simulando");
  }
  if (Api.isSimulationRestore(sim)) {
    throw new ErrorTransaccion(
      { tipo: "simulacion", detalle: "hay datos archivados del contrato que primero hay que restaurar" },
      "simulando",
    );
  }
  // Firmamos solo el sobre de la transacción: cualquier autorización con credenciales de dirección
  // (otra cuenta que tiene que firmar su require_auth) haría fallar el envío. Se corta acá.
  const ajenas = (sim.result?.auth ?? [])
    .map((entrada) => inspectAuthEntry(entrada))
    .filter((info) => info.credentialType !== "sourceAccount")
    .map((info) => info.address ?? "(dirección desconocida)");
  if (ajenas.length > 0) {
    throw new ErrorTransaccion({ tipo: "autorizacion", direcciones: [...new Set(ajenas)] }, "simulando");
  }
  return { tx, sim, retorno: sim.result ? scValToNative(sim.result.retval) : undefined };
}

/** Simulación de solo lectura (ver_obra, balance del SAC…): devuelve el valor de retorno. */
export async function leer(red: Red, p: Invocar): Promise<unknown> {
  return (await simular(red, p)).retorno;
}

/**
 * Simula, firma con `firmar`, envía y espera la confirmación. Si la simulación falla, `firmar`
 * nunca se llama.
 */
export async function enviar(
  red: Red,
  p: Invocar & { firmar: Firmar; alAvanzar?: (etapa: Etapa) => void },
): Promise<Confirmacion> {
  p.alAvanzar?.("simulando");
  const { tx, sim } = await simular(red, p);
  const preparada = assembleTransaction(tx, sim).build();

  p.alAvanzar?.("firmando");
  let firmadaXdr: string;
  try {
    firmadaXdr = await p.firmar(preparada.toXDR());
  } catch (e) {
    throw new ErrorTransaccion(
      { tipo: "firma", detalle: e instanceof Error ? e.message : "el firmante no devolvió la transacción" },
      "firmando",
    );
  }
  const firmada = TransactionBuilder.fromXDR(firmadaXdr, red.passphrase);

  p.alAvanzar?.("enviando");
  const servidor = servidorDe(red);
  const envio = await servidor.sendTransaction(firmada);
  if (envio.status === "ERROR") {
    throw new ErrorTransaccion(
      motivoEnEventos(envio.diagnosticEvents, p.contratoId) ?? {
        tipo: "envio",
        detalle: envio.errorResult ? `resultado ${resumenResultado(envio.errorResult)}` : "estado ERROR",
      },
      "enviando",
      envio.hash,
    );
  }
  if (envio.status === "TRY_AGAIN_LATER") {
    throw new ErrorTransaccion({ tipo: "envio", detalle: "el RPC pidió reintentar más tarde" }, "enviando", envio.hash);
  }

  p.alAvanzar?.("confirmando");
  const final = await servidor.pollTransaction(envio.hash, {
    attempts: INTENTOS_CONFIRMACION,
    sleepStrategy: BasicSleepStrategy,
  });
  if (final.status === Api.GetTransactionStatus.SUCCESS) {
    return {
      hash: envio.hash,
      ledger: final.ledger,
      retorno: final.returnValue ? scValToNative(final.returnValue) : undefined,
    };
  }
  if (final.status === Api.GetTransactionStatus.FAILED) {
    throw new ErrorTransaccion(
      motivoEnEventos(final.diagnosticEventsXdr, p.contratoId) ?? {
        tipo: "fallida",
        detalle: `resultado ${resumenResultado(final.resultXdr)} (ledger ${final.ledger})`,
      },
      "confirmando",
      envio.hash,
    );
  }
  throw new ErrorTransaccion(
    { tipo: "sin-confirmar", detalle: `la red todavía no confirmó la transacción ${envio.hash}` },
    "confirmando",
    envio.hash,
  );
}

/** Nombre del código de resultado de una transacción, si se puede leer. */
function resumenResultado(resultado: unknown): string {
  try {
    const r = resultado as { result?: { type?: string; switch?: () => { name?: string } } };
    return r.result?.type ?? r.result?.switch?.().name ?? "desconocido";
  } catch {
    return "desconocido";
  }
}
