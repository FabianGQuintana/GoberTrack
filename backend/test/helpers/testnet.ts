import { rpc, scValToNative, type xdr } from '@stellar/stellar-sdk';
import { readFileSync } from 'node:fs';
import type { ClienteContrato, PaginaEventos, PedidoEventos } from '../../src/indexador/cliente.ts';
import { ErrorLectura } from '../../src/indexador/cliente.ts';
import type { Registro } from '../../src/indexador/index.ts';

// Fixtures REALES de testnet (scripts/capturar-fixtures-testnet.ts) y un ClienteContrato falso que los sirve.

const leer = (nombre: string): any =>
  JSON.parse(readFileSync(new URL(`../fixtures/testnet/${nombre}`, import.meta.url), 'utf8'));

export const CONTRATO_ID = 'CCRFFXP25OT5FOI3VJXAX666QI76YWHV52IYTG45ICK4TMB7QFS7KYSM';
export const LEDGER_INICIAL = 5220081;

export const SALUD_CRUDA = leer('get-health.json');
export const PAGINAS_2: { pedido: any; respuesta: any }[] = leer('get-events-limite-2.json');
export const PAGINAS_100: { pedido: any; respuesta: any }[] = leer('get-events-limite-100.json');

export const eventosReales = () => rpc.parseRawEvents(PAGINAS_100[0]!.respuesta).events;

export const IDS_EVENTOS = [
  '0022420107242266624-0000000000',
  '0022420111537254400-0000000001',
  '0022420115832193024-0000000000',
  '0022420133012107264-0000000000',
  '0022420141602013184-0000000000',
  '0022420210321522688-0000000001',
];

export function simulacion(nombre: string): rpc.Api.SimulateTransactionResponse {
  return rpc.parseRawSimulation(leer(nombre).respuesta);
}

export function retval(nombre: string): xdr.ScVal {
  const s = simulacion(nombre);
  if (!rpc.Api.isSimulationSuccess(s) || !s.result) throw new Error(`${nombre}: no es una simulación exitosa`);
  return s.result.retval;
}

export interface ClienteFalso extends ClienteContrato {
  llamadas: { salud: number; eventos: PedidoEventos[]; leer: { funcion: string; args: unknown[] }[] };
  /** Si está definido, se lanza en la próxima llamada a leer (y se mantiene hasta ponerlo en undefined). */
  fallaLeer?: Error;
  /** Si está definido, salud() lanza esto. */
  fallaSalud?: Error;
  ledgerMasViejo: number;
  /** Si está definido, el ledger que informan las simulaciones (para simular un nodo atrasado). */
  ledgerLectura?: number;
}

/**
 * Sirve las páginas grabadas con limite=2: la primera para `desdeLedger` y las siguientes según el
 * cursor de cada pedido grabado. `leer` responde con las simulaciones grabadas según función/args.
 */
export function clienteFalso(opciones: { ledgerMasViejo?: number } = {}): ClienteFalso {
  const porCursor = new Map<string, (typeof PAGINAS_2)[number]>();
  for (const p of PAGINAS_2) {
    const c = p.pedido.pagination.cursor;
    if (c) porCursor.set(c, p);
  }
  const c: ClienteFalso = {
    llamadas: { salud: 0, eventos: [], leer: [] },
    ledgerMasViejo: opciones.ledgerMasViejo ?? SALUD_CRUDA.oldestLedger,
    async salud() {
      c.llamadas.salud++;
      if (c.fallaSalud) throw c.fallaSalud;
      return { ledgerMasViejo: c.ledgerMasViejo, ultimoLedger: SALUD_CRUDA.latestLedger };
    },
    async eventos(pedido, limite) {
      c.llamadas.eventos.push(pedido);
      if (limite !== 2) throw new Error(`el fixture solo sirve limite=2, llegó ${limite}`);
      // El cursor final (sintético) ya no tiene eventos detrás: página vacía con el mismo cursor.
      const ultimo = PAGINAS_2.at(-1)!.respuesta;
      if ('cursor' in pedido && pedido.cursor === ultimo.cursor) {
        return {
          eventos: [],
          cursor: ultimo.cursor,
          ultimoLedger: ultimo.latestLedger,
          ultimoCierre: Number(ultimo.latestLedgerCloseTime),
          ledgerMasViejo: ultimo.oldestLedger,
        };
      }
      const pagina = 'cursor' in pedido ? porCursor.get(pedido.cursor) : PAGINAS_2[0];
      if (!pagina) throw new Error(`cursor sin página grabada: ${JSON.stringify(pedido)}`);
      const r = rpc.parseRawEvents(pagina.respuesta);
      return {
        eventos: r.events,
        cursor: r.cursor,
        ultimoLedger: r.latestLedger,
        ultimoCierre: Number(r.latestLedgerCloseTime),
        ledgerMasViejo: r.oldestLedger,
      } satisfies PaginaEventos;
    },
    async leer(funcion, args) {
      const nativos = args.map((a) => scValToNative(a));
      c.llamadas.leer.push({ funcion, args: nativos });
      if (c.fallaLeer) throw c.fallaLeer;
      const lectura = (nombre: string) => ({
        valor: retval(nombre),
        ledger: c.ledgerLectura ?? (leer(nombre).respuesta.latestLedger as number),
      });
      if (funcion === 'cantidad_obras') return lectura('simulate-cantidad_obras.json');
      if ((funcion === 'ver_obra' || funcion === 'ver_hitos') && nativos[0] === 1) {
        return lectura(`simulate-${funcion}-1.json`);
      }
      if (funcion === 'ver_obra') {
        throw new ErrorLectura(funcion, 'HostError: Error(Contract, #1)');
      }
      throw new Error(`lectura no grabada: ${funcion}(${nativos.join(',')})`);
    },
  };
  return c;
}

export interface RegistroFalso extends Registro {
  mensajes: { nivel: 'info' | 'warn' | 'error'; obj: any; msg?: string }[];
  de(nivel: 'info' | 'warn' | 'error'): { obj: any; msg?: string }[];
}

export function registroFalso(): RegistroFalso {
  const mensajes: RegistroFalso['mensajes'] = [];
  const r = (nivel: 'info' | 'warn' | 'error') => (obj: object, msg?: string) => {
    mensajes.push({ nivel, obj, msg });
  };
  return {
    mensajes,
    info: r('info'),
    warn: r('warn'),
    error: r('error'),
    de: (nivel) => mensajes.filter((m) => m.nivel === nivel),
  };
}

export const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
