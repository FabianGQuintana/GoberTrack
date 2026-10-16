import {
  Account,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  contract,
  nativeToScVal,
  type xdr,
} from '@stellar/stellar-sdk';
import { mkdir, writeFile } from 'node:fs/promises';
import { leerConfig } from '../src/config.ts';

/*
 * npm run fixtures:testnet — graba respuestas REALES del Soroban RPC de testnet para las pruebas
 * del indexador (test/fixtures/testnet/). Guarda el JSON crudo de cada método (el `result` del
 * JSON-RPC, con el XDR en base64), así las pruebas lo decodifican con los parsers del SDK
 * (rpc.parseRawEvents / rpc.parseRawSimulation) igual que en producción.
 * Volver a correrlo reemplaza los archivos (por ejemplo, después de un redespliegue).
 */

const config = leerConfig({ ...process.env, MODO_DATOS: 'testnet' });
const t = config.testnet!;
const DIR = new URL('../test/fixtures/testnet/', import.meta.url);
let idPedido = 0;

async function llamar(method: string, params?: object): Promise<unknown> {
  const respuesta = await fetch(t.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++idPedido, method, params }),
  });
  const cuerpo = (await respuesta.json()) as { result?: unknown; error?: unknown };
  if (cuerpo.error) throw new Error(`${method}: ${JSON.stringify(cuerpo.error)}`);
  return cuerpo.result;
}

async function guardar(nombre: string, contenido: unknown) {
  await writeFile(new URL(nombre, DIR), `${JSON.stringify(contenido, null, 2)}\n`);
  console.log(`  ${nombre}`);
}

/** Todas las páginas de getEvents desde el ledger inicial, con el `limit` dado. */
async function paginasDeEventos(limite: number) {
  const filters = [{ type: 'contract', contractIds: [t.contratoId] }];
  const paginas = [];
  let params: object = { startLedger: t.ledgerInicial, filters, pagination: { limit: limite } };
  for (;;) {
    const r = (await llamar('getEvents', params)) as { events: unknown[]; cursor: string };
    paginas.push({ pedido: params, respuesta: r });
    if (r.events.length < limite) return paginas;
    params = { filters, pagination: { cursor: r.cursor, limit: limite } };
  }
}

async function simular(funcion: string, args: xdr.ScVal[], descripcionArgs: unknown[]) {
  const tx = new TransactionBuilder(new Account(contract.NULL_ACCOUNT, '0'), {
    fee: BASE_FEE,
    networkPassphrase: t.redPassphrase,
  })
    .addOperation(new Contract(t.contratoId).call(funcion, ...args))
    .setTimeout(0)
    .build();
  const transaccion = tx.toXDR();
  return { funcion, args: descripcionArgs, transaccion, respuesta: await llamar('simulateTransaction', { transaction: transaccion }) };
}

await mkdir(DIR, { recursive: true });
console.log(`Capturando de ${t.rpcUrl}, contrato ${t.contratoId}:`);
const salud = await llamar('getHealth');
await guardar('meta.json', {
  capturado_en: new Date().toISOString(),
  rpc: t.rpcUrl,
  contrato: t.contratoId,
  ledger_inicial: t.ledgerInicial,
  red: t.redPassphrase,
  nota: 'Respuestas reales del RPC de testnet (campo result del JSON-RPC). Las genera scripts/capturar-fixtures-testnet.ts.',
});
await guardar('get-health.json', salud);
await guardar('get-events-limite-100.json', await paginasDeEventos(100));
await guardar('get-events-limite-2.json', await paginasDeEventos(2));
await guardar('simulate-cantidad_obras.json', await simular('cantidad_obras', [], []));
const u32 = (n: number) => nativeToScVal(n, { type: 'u32' });
await guardar('simulate-ver_obra-1.json', await simular('ver_obra', [u32(1)], [1]));
await guardar('simulate-ver_hitos-1.json', await simular('ver_hitos', [u32(1)], [1]));
await guardar('simulate-ver_obra-99.json', await simular('ver_obra', [u32(99)], [99]));
console.log('Listo.');
