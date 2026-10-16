// RPC simulado para las pruebas de transacciones: respuestas válidas del SDK (que aceptan
// assembleTransaction, isSimulationSuccess, etc.) armadas a mano, sin red.

import {
  Account,
  Address,
  Keypair,
  nativeToScVal,
  SorobanDataBuilder,
  StrKey,
  xdr,
} from "@stellar/stellar-sdk/base";
import { Api, parseRawSimulation } from "@stellar/stellar-sdk/rpc";
import { vi } from "vitest";
import type { ServidorRpc } from "@/lib/stellar/transacciones";

export const PASSPHRASE = "Test SDF Network ; September 2015";
export const ORIGEN = Keypair.random();
export const OTRA = Keypair.random();
export const CONTRATO = StrKey.encodeContract(new Uint8Array(32).fill(7));
export const HASH_TX = "ab".repeat(32);

/** Respuesta "raw" de simulateTransaction con éxito, pasada por parseRawSimulation del SDK. */
export function simulacionExitosa(
  opciones: { retorno?: xdr.ScVal; auth?: xdr.SorobanAuthorizationEntry[]; restaurar?: boolean } = {},
): Api.SimulateTransactionResponse {
  const datos = new SorobanDataBuilder().setResourceFee(1000).build().toXDR("base64");
  return parseRawSimulation({
    id: "1",
    latestLedger: 100,
    transactionData: datos,
    minResourceFee: "1000",
    results: [
      {
        auth: (opciones.auth ?? []).map((a) => a.toXDR("base64")),
        xdr: (opciones.retorno ?? nativeToScVal(42, { type: "u32" })).toXDR("base64"),
      },
    ],
    ...(opciones.restaurar ? { restorePreamble: { minResourceFee: "500", transactionData: datos } } : {}),
  } as unknown as Api.RawSimulateTransactionResponse);
}

export function simulacionConError(error: string): Api.SimulateTransactionResponse {
  return parseRawSimulation({ id: "1", latestLedger: 100, error } as unknown as Api.RawSimulateTransactionResponse);
}

export function errorDeContrato(numero: number): xdr.ScVal {
  return xdr.ScVal.scvError(xdr.ScError.sceContract(numero));
}

/** Evento de diagnóstico con un error del contrato, como los que devuelve el RPC. */
export function eventoConErrorDeContrato(numero: number, contrato: string = CONTRATO): xdr.DiagnosticEvent {
  return new xdr.DiagnosticEvent({
    inSuccessfulContractCall: false,
    event: new xdr.ContractEvent({
      ext: xdr.ExtensionPoint.v0(),
      contractId: xdr.ContractId.fromXdrObject(StrKey.decodeContract(contrato)),
      type: xdr.ContractEventType.diagnostic,
      body: xdr.ContractEventBody.v0(
        new xdr.ContractEventV0({
          topics: [xdr.ScVal.scvSymbol("error"), errorDeContrato(numero)],
          data: xdr.ScVal.scvString("escalating Ok(ScErrorType::Contract) frame-exit to Err"),
        }),
      ),
    }),
  });
}

function entradaAuth(credenciales: xdr.SorobanCredentials): xdr.SorobanAuthorizationEntry {
  return new xdr.SorobanAuthorizationEntry({
    credentials: credenciales,
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: new Address(CONTRATO).toScAddress(),
          functionName: Uint8Array.from("aprobar", (c) => c.charCodeAt(0)),
          args: [],
        }),
      ),
      subInvocations: [],
    }),
  });
}

export const authSourceAccount = () =>
  entradaAuth(xdr.SorobanCredentials.sorobanCredentialsSourceAccount());

export const authDeDireccion = (direccion: string) =>
  entradaAuth(
    xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(direccion).toScAddress(),
        nonce: 1n,
        signatureExpirationLedger: 0,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
  );

export interface Simulado {
  servidor: ServidorRpc;
  getAccount: ReturnType<typeof vi.fn>;
  simulateTransaction: ReturnType<typeof vi.fn>;
  sendTransaction: ReturnType<typeof vi.fn>;
  pollTransaction: ReturnType<typeof vi.fn>;
}

/** Servidor con vi.fn por método; por defecto, flujo feliz. */
export function servidorSimulado(): Simulado {
  const getAccount = vi.fn(async () => new Account(ORIGEN.publicKey(), "1"));
  const simulateTransaction = vi.fn(async () => simulacionExitosa());
  const sendTransaction = vi.fn(async () => ({
    status: "PENDING",
    hash: HASH_TX,
    latestLedger: 100,
    latestLedgerCloseTime: 1,
  }));
  const pollTransaction = vi.fn(async () => ({
    status: "SUCCESS",
    ledger: 123,
    returnValue: nativeToScVal(7, { type: "u32" }),
  }));
  return {
    servidor: { getAccount, simulateTransaction, sendTransaction, pollTransaction } as unknown as ServidorRpc,
    getAccount,
    simulateTransaction,
    sendTransaction,
    pollTransaction,
  };
}
