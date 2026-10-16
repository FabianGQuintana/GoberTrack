import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parseEnv } from 'node:util';
import { Networks } from '@stellar/stellar-sdk';
import { ErrorConfig, leerConfig } from '../src/config.ts';
import { CONTRATO_ID } from './helpers/testnet.ts';

const testnet = { MODO_DATOS: 'testnet', CONTRATO_ID, START_LEDGER: '5220081' };

describe('leerConfig', () => {
  it('MODO_DATOS por defecto es seed y no trae sección testnet', () => {
    const c = leerConfig({});
    assert.equal(c.modo, 'seed');
    assert.equal(c.testnet, undefined);
  });

  it('MODO_DATOS inválido → ErrorConfig', () => {
    assert.throws(() => leerConfig({ MODO_DATOS: 'prod' }), ErrorConfig);
  });

  it('testnet con valores válidos y por defecto', () => {
    const c = leerConfig(testnet);
    assert.equal(c.modo, 'testnet');
    assert.deepEqual(c.testnet, {
      rpcUrl: 'https://soroban-testnet.stellar.org',
      contratoId: CONTRATO_ID,
      ledgerInicial: 5220081,
      redPassphrase: Networks.TESTNET,
      intervaloMs: 5000,
    });
  });

  it('testnet respeta RPC_URL, NETWORK_PASSPHRASE y POLL_MS', () => {
    const c = leerConfig({ ...testnet, RPC_URL: 'http://x:1', NETWORK_PASSPHRASE: 'otra', POLL_MS: '250' });
    assert.equal(c.testnet!.rpcUrl, 'http://x:1');
    assert.equal(c.testnet!.redPassphrase, 'otra');
    assert.equal(c.testnet!.intervaloMs, 250);
  });

  it('testnet sin CONTRATO_ID, o con uno inválido → ErrorConfig', () => {
    assert.throws(() => leerConfig({ MODO_DATOS: 'testnet', START_LEDGER: '1' }), ErrorConfig);
    assert.throws(() => leerConfig({ ...testnet, CONTRATO_ID: 'GABC' }), ErrorConfig);
    assert.throws(() => leerConfig({ ...testnet, CONTRATO_ID: CONTRATO_ID.slice(0, -1) + 'A' }), ErrorConfig);
    // Una cuenta (G...) válida no es un contrato.
    assert.throws(
      () => leerConfig({ ...testnet, CONTRATO_ID: 'GCTYV7VGW23P4R3MF5YXHCIM6JWK3COGOYUBCKUZMDG7OVP6JT5SSNQ3' }),
      ErrorConfig,
    );
  });

  it('testnet sin START_LEDGER o con uno inválido → ErrorConfig', () => {
    assert.throws(() => leerConfig({ MODO_DATOS: 'testnet', CONTRATO_ID }), ErrorConfig);
    assert.throws(() => leerConfig({ ...testnet, START_LEDGER: '' }), ErrorConfig);
    assert.throws(() => leerConfig({ ...testnet, START_LEDGER: 'abc' }), ErrorConfig);
    assert.throws(() => leerConfig({ ...testnet, START_LEDGER: '-5' }), ErrorConfig);
    assert.throws(() => leerConfig({ ...testnet, START_LEDGER: '1.5' }), ErrorConfig);
  });

  it('POLL_MS inválido → ErrorConfig', () => {
    assert.throws(() => leerConfig({ ...testnet, POLL_MS: 'x' }), ErrorConfig);
  });

  it('base por defecto distinta por modo; DB_PATH manda', () => {
    const seed = leerConfig({});
    const tn = leerConfig(testnet);
    assert.match(seed.rutaDb, /opv\.sqlite$/);
    assert.match(tn.rutaDb, /opv-testnet\.sqlite$/);
    assert.notEqual(seed.rutaDb, tn.rutaDb);
    assert.equal(leerConfig({ ...testnet, DB_PATH: 'x.db' }).rutaDb, 'x.db');
  });

  it('el testnet.env del repo es una configuración válida', () => {
    const env = parseEnv(readFileSync(new URL('../testnet.env', import.meta.url), 'utf8'));
    const c = leerConfig(env);
    assert.equal(c.modo, 'testnet');
    assert.equal(c.testnet!.contratoId, CONTRATO_ID);
  });
});
