import { Networks, StrKey } from '@stellar/stellar-sdk';
import { fileURLToPath } from 'node:url';

// src/config.ts y dist/config.js quedan un nivel debajo de backend/, así que ../data es backend/data.
const DIR_DATA = fileURLToPath(new URL('../data/', import.meta.url));

/**
 * De dónde salen los datos:
 * - `seed`: datos simulados de `npm run seed` (Fase 1).
 * - `testnet`: el indexador lee el contrato desplegado; no se siembra nada.
 */
export type ModoDatos = 'seed' | 'testnet';

export interface ConfigTestnet {
  rpcUrl: string;
  contratoId: string;
  /** Ledger de creación del contrato. */
  ledgerInicial: number;
  redPassphrase: string;
  intervaloMs: number;
}

export interface Config {
  modo: ModoDatos;
  puerto: number;
  host: string;
  rutaDb: string;
  dirEvidencia: string;
  origenesCors: string[];
  /** Solo en modo testnet. */
  testnet?: ConfigTestnet;
}

export class ErrorConfig extends Error {}

function entero(env: NodeJS.ProcessEnv, nombre: string, porDefecto?: number): number {
  const texto = env[nombre];
  if (texto === undefined || texto === '') {
    if (porDefecto !== undefined) return porDefecto;
    throw new ErrorConfig(`falta la variable ${nombre}`);
  }
  const n = Number(texto);
  if (!Number.isSafeInteger(n) || n < 0) throw new ErrorConfig(`${nombre} no es un entero válido: ${texto}`);
  return n;
}

function leerTestnet(env: NodeJS.ProcessEnv): ConfigTestnet {
  // El id del contrato y su ledger de creación son configuración (testnet.env), no código:
  // un redespliegue solo cambia esas dos variables.
  const contratoId = env.CONTRATO_ID ?? '';
  if (!StrKey.isValidContract(contratoId)) {
    throw new ErrorConfig(`CONTRATO_ID no es un id de contrato válido (C...): "${contratoId}"`);
  }
  return {
    rpcUrl: env.RPC_URL ?? 'https://soroban-testnet.stellar.org',
    contratoId,
    ledgerInicial: entero(env, 'START_LEDGER'),
    redPassphrase: env.NETWORK_PASSPHRASE ?? Networks.TESTNET,
    // Más o menos el cierre de un ledger.
    intervaloMs: entero(env, 'POLL_MS', 5000),
  };
}

export function leerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const modo = env.MODO_DATOS ?? 'seed';
  if (modo !== 'seed' && modo !== 'testnet') {
    throw new ErrorConfig(`MODO_DATOS tiene que ser "seed" o "testnet", no "${modo}"`);
  }
  return {
    modo,
    // SUPUESTO: puerto 3001, el de `servers` en interfaces/openapi.yaml.
    puerto: entero(env, 'PORT', 3001),
    // Con 'localhost' Fastify escucha en todas las direcciones que resuelve (127.0.0.1 y ::1).
    host: env.HOST ?? 'localhost',
    // Una base por modo, para que los datos simulados nunca se mezclen con los de la red.
    rutaDb: env.DB_PATH ?? `${DIR_DATA}${modo === 'seed' ? 'opv.sqlite' : 'opv-testnet.sqlite'}`,
    dirEvidencia: env.EVIDENCIA_DIR ?? `${DIR_DATA}evidencia`,
    origenesCors: (env.CORS_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    testnet: modo === 'testnet' ? leerTestnet(env) : undefined,
  };
}
