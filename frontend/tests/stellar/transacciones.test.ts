// @vitest-environment node
import { Keypair, nativeToScVal, StrKey, TransactionBuilder, xdr } from "@stellar/stellar-sdk/base";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ERRORES } from "@/lib/errores";
import { firmanteKeypair } from "@/lib/stellar/firmantes";
import {
  codigoEnEventos,
  describirRechazo,
  enviar,
  horaDelUltimoLedger,
  ErrorTransaccion,
  leer,
  motivoDeSimulacion,
  simular,
  type Etapa,
  type MotivoRechazo,
} from "@/lib/stellar/transacciones";
import {
  authDeDireccion,
  authSourceAccount,
  CONTRATO,
  eventoConErrorDeContrato,
  HASH_TX,
  ORIGEN,
  OTRA,
  PASSPHRASE,
  servidorSimulado,
  simulacionConError,
  simulacionExitosa,
  type Simulado,
} from "../helpers/rpc-simulado";

/** Otro contrato: el token (SAC) al que la obra llama en fondear y liberar_pago. */
const SAC = StrKey.encodeContract(new Uint8Array(32).fill(9));

let rpc: Simulado;
let red: { rpcUrl: string; passphrase: string; servidor: Simulado["servidor"] };
const invocar = {
  contratoId: CONTRATO,
  funcion: "liberar_pago",
  args: [nativeToScVal(1, { type: "u32" }), nativeToScVal(0, { type: "u32" })],
  origen: ORIGEN.publicKey(),
};

beforeEach(() => {
  rpc = servidorSimulado();
  red = { rpcUrl: "http://rpc.invalido", passphrase: PASSPHRASE, servidor: rpc.servidor };
});

/** Ejecuta `enviar` y devuelve el ErrorTransaccion lanzado. */
async function fallo(firmar = vi.fn(firmanteKeypair(ORIGEN, PASSPHRASE))) {
  const etapas: Etapa[] = [];
  const error = await enviar(red, { ...invocar, firmar, alAvanzar: (e) => etapas.push(e) }).then(
    () => {
      throw new Error("se esperaba un rechazo");
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ErrorTransaccion);
  return { error: error as ErrorTransaccion, firmar, etapas };
}

describe("enviar: flujo feliz", () => {
  it("etapas en orden, firma el XDR ensamblado, envía lo firmado y devuelve hash, ledger y retorno", async () => {
    const etapas: Etapa[] = [];
    const firmar = vi.fn(firmanteKeypair(ORIGEN, PASSPHRASE));
    const r = await enviar(red, { ...invocar, firmar, alAvanzar: (e) => etapas.push(e) });

    expect(etapas).toEqual(["simulando", "firmando", "enviando", "confirmando"]);
    expect(r).toEqual({ hash: HASH_TX, ledger: 123, retorno: 7 });
    expect(rpc.getAccount).toHaveBeenCalledWith(ORIGEN.publicKey());

    // firmar recibe la transacción ya ensamblada: fee base (100) + resourceFee de los datos Soroban de la simulación (1000)
    expect(firmar).toHaveBeenCalledTimes(1);
    const recibida = TransactionBuilder.fromXDR(firmar.mock.calls[0][0], PASSPHRASE);
    expect(recibida.fee).toBe("1100");
    expect(recibida.signatures).toHaveLength(0);

    // se envía lo que devolvió el firmante
    const firmadaXdr = await firmar.mock.results[0].value;
    const enviada = rpc.sendTransaction.mock.calls[0][0];
    expect(enviada.toXDR()).toBe(firmadaXdr);
    expect(enviada.signatures).toHaveLength(1);
    expect(rpc.pollTransaction).toHaveBeenCalledWith(HASH_TX, expect.objectContaining({ attempts: 30 }));
  });

  it("sin retorno en la confirmación, retorno es undefined", async () => {
    rpc.pollTransaction.mockResolvedValue({ status: "SUCCESS", ledger: 5 });
    const r = await enviar(red, { ...invocar, firmar: firmanteKeypair(ORIGEN, PASSPHRASE) });
    expect(r).toEqual({ hash: HASH_TX, ledger: 5, retorno: undefined });
  });

  it("alAvanzar es opcional", async () => {
    await expect(enviar(red, { ...invocar, firmar: firmanteKeypair(ORIGEN, PASSPHRASE) })).resolves.toBeDefined();
  });
});

describe("simulación rechazada: no se firma ni se envía", () => {
  it.each([
    [1, "ObraNoExiste"],
    [9, "HitoAnteriorPendiente"],
    [11, "ObjecionAbierta"],
    [14, "PeriodoNoCumplido"],
    [15, "YaPagado"],
  ])("Error(Contract, #%i) → contrato %s", async (numero, codigo) => {
    rpc.simulateTransaction.mockResolvedValue(
      simulacionConError(`HostError: Error(Contract, #${numero})\n\nEvent log (newest first):\n   0: [...]`),
    );
    const { error, firmar, etapas } = await fallo();
    expect(error.motivo).toEqual({ tipo: "contrato", codigo, numero });
    expect(error.etapa).toBe("simulando");
    expect(etapas).toEqual(["simulando"]);
    expect(firmar).not.toHaveBeenCalled();
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
    expect(rpc.pollTransaction).not.toHaveBeenCalled();
    expect(error.message).toContain(codigo);
  });

  it("el catálogo completo (1 a 15) se traduce por número", async () => {
    for (const [codigo, { numero }] of Object.entries(ERRORES)) {
      rpc.simulateTransaction.mockResolvedValue(simulacionConError(`HostError: Error(Contract, #${numero})`));
      const { error } = await fallo();
      expect(error.motivo).toEqual({ tipo: "contrato", codigo, numero });
    }
  });

  it("número desconocido (99) → simulacion con el texto", async () => {
    rpc.simulateTransaction.mockResolvedValue(simulacionConError("HostError: Error(Contract, #99)\nmás"));
    const { error, firmar } = await fallo();
    expect(error.motivo).toEqual({ tipo: "simulacion", detalle: "HostError: Error(Contract, #99)" });
    expect(error.etapa).toBe("simulando");
    expect(firmar).not.toHaveBeenCalled();
  });

  it("Error(Auth, …) → autorizacion", async () => {
    rpc.simulateTransaction.mockResolvedValue(simulacionConError("HostError: Error(Auth, InvalidAction)"));
    const { error, firmar } = await fallo();
    expect(error.motivo).toEqual({ tipo: "autorizacion", direcciones: [] });
    expect(firmar).not.toHaveBeenCalled();
  });

  it("error sin código en el texto pero con evento de diagnóstico del contrato → contrato", async () => {
    rpc.simulateTransaction.mockResolvedValue({
      ...simulacionConError("HostError: algo raro"),
      events: [eventoConErrorDeContrato(7)],
    });
    const { error } = await fallo();
    expect(error.motivo).toEqual({ tipo: "contrato", codigo: "FondosInsuficientes", numero: 7 });
  });

  it("R2: un error del token (otro contrato) no se traduce con el catálogo de la obra, sin firmar", async () => {
    // El SAC devuelve BalanceError = 10; el texto no dice quién lo emitió y antes salía "YaDecidio".
    rpc.simulateTransaction.mockResolvedValue({
      ...simulacionConError("HostError: Error(Contract, #10)"),
      events: [eventoConErrorDeContrato(10, SAC), eventoConErrorDeContrato(10)],
    });
    const { error, firmar } = await fallo();
    expect(error.motivo).toEqual({ tipo: "token", numero: 10, contratoId: SAC });
    expect(error.message).toBe("El token rechazó la operación (#10).");
    expect(firmar).not.toHaveBeenCalled();
  });

  it("R2: el error emitido por el contrato de la obra sigue traduciéndose con su catálogo", async () => {
    rpc.simulateTransaction.mockResolvedValue({
      ...simulacionConError("HostError: Error(Contract, #10)"),
      events: [eventoConErrorDeContrato(10)],
    });
    const { error } = await fallo();
    expect(error.motivo).toEqual({ tipo: "contrato", codigo: "YaDecidio", numero: 10 });
  });

  it("R2: después del envío (FAILED), un error del token también es 'token'", async () => {
    rpc.pollTransaction.mockResolvedValue({
      status: "FAILED",
      ledger: 7,
      resultXdr: undefined,
      diagnosticEventsXdr: [eventoConErrorDeContrato(13, SAC)],
    } as never);
    const { error } = await fallo();
    expect(error.motivo).toEqual({ tipo: "token", numero: 13, contratoId: SAC });
    expect(error.etapa).toBe("confirmando");
  });

  it("otro error de simulación → simulacion (primera línea, máx. 300 caracteres)", async () => {
    rpc.simulateTransaction.mockResolvedValue(simulacionConError("x".repeat(500) + "\nsegunda"));
    const { error } = await fallo();
    expect(error.motivo).toEqual({ tipo: "simulacion", detalle: "x".repeat(300) });
  });

  it("isSimulationRestore → simulacion, sin firmar", async () => {
    rpc.simulateTransaction.mockResolvedValue(simulacionExitosa({ restaurar: true }));
    const { error, firmar } = await fallo();
    expect(error.motivo.tipo).toBe("simulacion");
    expect(error.etapa).toBe("simulando");
    expect(firmar).not.toHaveBeenCalled();
  });
});

describe("autorizaciones de otras cuentas", () => {
  it("credenciales de dirección ajena → autorizacion con esa dirección, sin firmar", async () => {
    rpc.simulateTransaction.mockResolvedValue(
      simulacionExitosa({ auth: [authDeDireccion(OTRA.publicKey()), authDeDireccion(OTRA.publicKey())] }),
    );
    const { error, firmar } = await fallo();
    expect(error.motivo).toEqual({ tipo: "autorizacion", direcciones: [OTRA.publicKey()] });
    expect(error.etapa).toBe("simulando");
    expect(error.message).toContain(OTRA.publicKey());
    expect(firmar).not.toHaveBeenCalled();
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it("varias direcciones distintas se listan todas, sin repetir", async () => {
    const otra2 = Keypair.random().publicKey();
    rpc.simulateTransaction.mockResolvedValue(
      simulacionExitosa({ auth: [authDeDireccion(OTRA.publicKey()), authDeDireccion(otra2)] }),
    );
    const { error } = await fallo();
    expect(error.motivo).toEqual({ tipo: "autorizacion", direcciones: [OTRA.publicKey(), otra2] });
  });

  it("credenciales sourceAccount pasan", async () => {
    rpc.simulateTransaction.mockResolvedValue(simulacionExitosa({ auth: [authSourceAccount()] }));
    const firmar = vi.fn(firmanteKeypair(ORIGEN, PASSPHRASE));
    await expect(enviar(red, { ...invocar, firmar })).resolves.toMatchObject({ hash: HASH_TX });
    expect(firmar).toHaveBeenCalledTimes(1);
  });
});

describe("firma", () => {
  it("si el firmante lanza → firma, etapa firmando, sin envío", async () => {
    const firmar = vi.fn(async (): Promise<string> => {
      throw new Error("El usuario rechazó la firma");
    });
    const { error, etapas } = await fallo(firmar);
    expect(error.motivo).toEqual({ tipo: "firma", detalle: "El usuario rechazó la firma" });
    expect(error.etapa).toBe("firmando");
    expect(error.hash).toBeUndefined();
    expect(etapas).toEqual(["simulando", "firmando"]);
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it("si rechaza con algo que no es Error → firma con detalle genérico", async () => {
    const { error } = await fallo(vi.fn(async (): Promise<string> => Promise.reject("no")));
    expect(error.motivo.tipo).toBe("firma");
    expect(error.etapa).toBe("firmando");
  });
});

describe("envío", () => {
  it("ERROR sin eventos → envio con el hash", async () => {
    rpc.sendTransaction.mockResolvedValue({ status: "ERROR", hash: HASH_TX });
    const { error, etapas } = await fallo();
    expect(error.motivo).toEqual({ tipo: "envio", detalle: "estado ERROR" });
    expect(error.etapa).toBe("enviando");
    expect(error.hash).toBe(HASH_TX);
    expect(etapas).toEqual(["simulando", "firmando", "enviando"]);
    expect(rpc.pollTransaction).not.toHaveBeenCalled();
  });

  it("ERROR con código del contrato en diagnosticEvents → contrato", async () => {
    rpc.sendTransaction.mockResolvedValue({
      status: "ERROR",
      hash: HASH_TX,
      diagnosticEvents: [eventoConErrorDeContrato(13)],
    });
    const { error } = await fallo();
    expect(error.motivo).toEqual({ tipo: "contrato", codigo: "FueraDePeriodo", numero: 13 });
    expect(error.etapa).toBe("enviando");
  });

  it("ERROR con un código desconocido en los eventos → envio", async () => {
    rpc.sendTransaction.mockResolvedValue({
      status: "ERROR",
      hash: HASH_TX,
      diagnosticEvents: [eventoConErrorDeContrato(99)],
    });
    const { error } = await fallo();
    expect(error.motivo.tipo).toBe("envio");
  });

  it("TRY_AGAIN_LATER → envio", async () => {
    rpc.sendTransaction.mockResolvedValue({ status: "TRY_AGAIN_LATER", hash: HASH_TX });
    const { error } = await fallo();
    expect(error.motivo).toEqual({ tipo: "envio", detalle: "el RPC pidió reintentar más tarde" });
    expect(error.etapa).toBe("enviando");
    expect(rpc.pollTransaction).not.toHaveBeenCalled();
  });
});

describe("confirmación", () => {
  it("FAILED sin eventos → fallida con el ledger", async () => {
    rpc.pollTransaction.mockResolvedValue({ status: "FAILED", ledger: 77 });
    const { error, etapas } = await fallo();
    expect(error.motivo.tipo).toBe("fallida");
    expect((error.motivo as { detalle: string }).detalle).toContain("ledger 77");
    expect(error.etapa).toBe("confirmando");
    expect(error.hash).toBe(HASH_TX);
    expect(etapas).toEqual(["simulando", "firmando", "enviando", "confirmando"]);
  });

  it("FAILED con código en diagnosticEventsXdr → contrato", async () => {
    rpc.pollTransaction.mockResolvedValue({
      status: "FAILED",
      ledger: 77,
      diagnosticEventsXdr: [eventoConErrorDeContrato(15)],
    });
    const { error } = await fallo();
    expect(error.motivo).toEqual({ tipo: "contrato", codigo: "YaPagado", numero: 15 });
    expect(error.etapa).toBe("confirmando");
    expect(error.hash).toBe(HASH_TX);
  });

  it("NOT_FOUND → sin-confirmar con el hash", async () => {
    rpc.pollTransaction.mockResolvedValue({ status: "NOT_FOUND" });
    const { error } = await fallo();
    expect(error.motivo.tipo).toBe("sin-confirmar");
    expect((error.motivo as { detalle: string }).detalle).toContain(HASH_TX);
    expect(error.etapa).toBe("confirmando");
    expect(error.hash).toBe(HASH_TX);
  });
});

describe("simular y leer", () => {
  it("leer devuelve el retorno simulado y nunca firma ni envía", async () => {
    rpc.simulateTransaction.mockResolvedValue(
      simulacionExitosa({ retorno: nativeToScVal(2n ** 70n, { type: "i128" }) }),
    );
    await expect(leer(red, invocar)).resolves.toBe(2n ** 70n);
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it("leer con una lista (Vec) devuelve el arreglo nativo", async () => {
    rpc.simulateTransaction.mockResolvedValue(
      simulacionExitosa({ retorno: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Aceptar")]) }),
    );
    await expect(leer(red, invocar)).resolves.toEqual(["Aceptar"]);
  });

  it("leer propaga el rechazo del contrato", async () => {
    rpc.simulateTransaction.mockResolvedValue(simulacionConError("HostError: Error(Contract, #1)"));
    await expect(leer(red, invocar)).rejects.toMatchObject({
      motivo: { tipo: "contrato", codigo: "ObraNoExiste", numero: 1 },
      etapa: "simulando",
    });
  });

  it("simular devuelve la tx armada, la simulación y el retorno", async () => {
    const s = await simular(red, invocar);
    expect(s.retorno).toBe(42);
    expect(s.tx.operations).toHaveLength(1);
    expect(s.tx.networkPassphrase).toBe(PASSPHRASE);
    expect(s.tx.source).toBe(ORIGEN.publicKey());
    expect(rpc.simulateTransaction).toHaveBeenCalledWith(s.tx);
  });
});

describe("motivoDeSimulacion y codigoEnEventos", () => {
  it("motivoDeSimulacion: contrato, desconocido, auth, otro", () => {
    expect(motivoDeSimulacion("HostError: Error(Contract, #3)")).toEqual({
      tipo: "contrato",
      codigo: "NoAutorizado",
      numero: 3,
    });
    expect(motivoDeSimulacion("Error(Contract, #0)").tipo).toBe("simulacion");
    expect(motivoDeSimulacion("Error(Contract, #16)").tipo).toBe("simulacion");
    expect(motivoDeSimulacion("Error(Auth, InvalidAction)")).toEqual({ tipo: "autorizacion", direcciones: [] });
    expect(motivoDeSimulacion("boom")).toEqual({ tipo: "simulacion", detalle: "boom" });
  });

  it("motivoDeSimulacion: el texto manda sobre los eventos; sin texto usa los eventos", () => {
    expect(motivoDeSimulacion("Error(Contract, #2)", [eventoConErrorDeContrato(9)])).toMatchObject({ numero: 2 });
    expect(motivoDeSimulacion("raro", [eventoConErrorDeContrato(9)])).toMatchObject({ numero: 9 });
  });

  it("codigoEnEventos: sin eventos, vacío, sin error de contrato y con error de contrato", () => {
    expect(codigoEnEventos(undefined)).toBeNull();
    expect(codigoEnEventos([])).toBeNull();
    const sinContrato = new xdr.DiagnosticEvent({
      inSuccessfulContractCall: true,
      event: new xdr.ContractEvent({
        ext: xdr.ExtensionPoint.v0(),
        contractId: null,
        type: xdr.ContractEventType.diagnostic,
        body: xdr.ContractEventBody.v0(
          new xdr.ContractEventV0({
            topics: [xdr.ScVal.scvSymbol("log")],
            data: xdr.ScVal.scvString("hola"),
          }),
        ),
      }),
    });
    expect(codigoEnEventos([sinContrato])).toBeNull();
    expect(codigoEnEventos([sinContrato, eventoConErrorDeContrato(13)])).toBe(13);
  });

  it("codigoEnEventos con basura no lanza", () => {
    expect(codigoEnEventos([{} as xdr.DiagnosticEvent])).toBeNull();
  });
});

describe("describirRechazo", () => {
  it("un texto distinto por cada tipo de motivo", () => {
    const motivos: MotivoRechazo[] = [
      { tipo: "contrato", codigo: "YaPagado", numero: 15 },
      { tipo: "autorizacion", direcciones: ["GA", "GB"] },
      { tipo: "autorizacion", direcciones: [] },
      { tipo: "simulacion", detalle: "d" },
      { tipo: "firma", detalle: "d" },
      { tipo: "envio", detalle: "d" },
      { tipo: "fallida", detalle: "d" },
      { tipo: "sin-confirmar", detalle: "d" },
    ];
    const textos = motivos.map(describirRechazo);
    expect(new Set(textos).size).toBe(motivos.length);
    expect(textos[0]).toContain("YaPagado (#15)");
    expect(textos[1]).toContain("GA, GB");
  });
});

describe("horaDelUltimoLedger", () => {
  const conLedger = (getLatestLedger: unknown) =>
    ({ ...red, servidor: { ...rpc.servidor, getLatestLedger } }) as typeof red;

  it("devuelve la hora de cierre en ms (closeTime en segundos, como string) y la secuencia", async () => {
    const getLatestLedger = vi.fn(async () => ({ sequence: 1234, closeTime: "1760616000" }));
    await expect(horaDelUltimoLedger(conLedger(getLatestLedger))).resolves.toEqual({
      ms: 1_760_616_000_000,
      secuencia: 1234,
    });
    expect(getLatestLedger).toHaveBeenCalledTimes(1);
  });

  it("acepta closeTime numérico", async () => {
    const r = await horaDelUltimoLedger(conLedger(async () => ({ sequence: 1, closeTime: 1_700_000_000 })));
    expect(r.ms).toBe(1_700_000_000_000);
  });

  it("sin getLatestLedger en el RPC → lanza", async () => {
    await expect(horaDelUltimoLedger(red)).rejects.toThrow(/getLatestLedger/);
  });

  it.each(["", "abc", "0", "-5", "NaN"])("closeTime inválido %j → lanza", async (closeTime) => {
    await expect(horaDelUltimoLedger(conLedger(async () => ({ sequence: 1, closeTime })))).rejects.toThrow(
      /closeTime inválido/,
    );
  });

  it("propaga el error de red del RPC", async () => {
    await expect(
      horaDelUltimoLedger(
        conLedger(async () => {
          throw new Error("ECONNREFUSED");
        }),
      ),
    ).rejects.toThrow("ECONNREFUSED");
  });
});
