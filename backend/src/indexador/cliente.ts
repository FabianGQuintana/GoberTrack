import {
  Account,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  contract,
  rpc,
  type xdr,
} from '@stellar/stellar-sdk';

/**
 * Lo que el indexador necesita de la red. La implementación real usa el Soroban RPC; las pruebas
 * inyectan una que sirve respuestas grabadas de testnet.
 */
export interface ClienteContrato {
  /** getHealth: rango de ledgers que el RPC todavía conserva. */
  salud(): Promise<{ ledgerMasViejo: number; ultimoLedger: number }>;
  /** getEvents del contrato, desde un ledger o siguiendo un cursor. */
  eventos(pedido: PedidoEventos, limite: number): Promise<PaginaEventos>;
  /** Simulación de solo lectura de una función del contrato. */
  leer(funcion: string, args: xdr.ScVal[]): Promise<Lectura>;
}

/**
 * Valor de retorno y ledger contra el que se simuló. El RPC está balanceado entre nodos: la
 * simulación puede caer en uno más atrasado que el que respondió getEvents (R1).
 */
export interface Lectura {
  valor: xdr.ScVal;
  ledger: number;
}

export type PedidoEventos = { desdeLedger: number } | { cursor: string };

export interface PaginaEventos {
  eventos: rpc.Api.EventResponse[];
  /** Cursor para seguir: el del último evento o el del final del rango recorrido. */
  cursor: string;
  ultimoLedger: number;
  /** Momento de cierre del último ledger (segundos Unix): el "ahora" de la red. */
  ultimoCierre: number;
  ledgerMasViejo: number;
}

/** La simulación terminó en error. `codigoContrato` es el N de "Error(Contract, #N)" si lo hay. */
export class ErrorLectura extends Error {
  readonly codigoContrato: number | undefined;

  constructor(funcion: string, detalle: string) {
    super(`${funcion}: ${detalle.split('\n')[0]}`);
    const m = /Error\(Contract, #(\d+)\)/.exec(detalle);
    this.codigoContrato = m ? Number(m[1]) : undefined;
  }
}

export interface ConfigCliente {
  rpcUrl: string;
  contratoId: string;
  redPassphrase: string;
}

export function crearClienteRpc({ rpcUrl, contratoId, redPassphrase }: ConfigCliente): ClienteContrato {
  const servidor = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
  const contrato = new Contract(contratoId);
  const filtros: rpc.Api.EventFilter[] = [{ type: 'contract', contractIds: [contratoId] }];

  return {
    async salud() {
      const s = await servidor.getHealth();
      return { ledgerMasViejo: s.oldestLedger, ultimoLedger: s.latestLedger };
    },

    async eventos(pedido, limite) {
      const r = await servidor.getEvents(
        'cursor' in pedido
          ? { filters: filtros, cursor: pedido.cursor, limit: limite }
          : { filters: filtros, startLedger: pedido.desdeLedger, limit: limite },
      );
      return {
        eventos: r.events,
        cursor: r.cursor,
        ultimoLedger: r.latestLedger,
        ultimoCierre: Number(r.latestLedgerCloseTime),
        ledgerMasViejo: r.oldestLedger,
      };
    },

    async leer(funcion, args) {
      // Igual que contract.Client del SDK sin cuenta: una cuenta nula con secuencia 0 alcanza para
      // simular, porque la transacción nunca se envía.
      const tx = new TransactionBuilder(new Account(contract.NULL_ACCOUNT, '0'), {
        fee: BASE_FEE,
        networkPassphrase: redPassphrase,
      })
        .addOperation(contrato.call(funcion, ...args))
        .setTimeout(30)
        .build();
      const sim = await servidor.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(sim)) throw new ErrorLectura(funcion, sim.error);
      if (!sim.result) throw new ErrorLectura(funcion, 'la simulación no devolvió resultado');
      return { valor: sim.result.retval, ledger: sim.latestLedger };
    },
  };
}
