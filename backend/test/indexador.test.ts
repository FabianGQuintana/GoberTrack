import assert from 'node:assert/strict';
import { nativeToScVal, rpc, xdr } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ErrorLectura } from '../src/indexador/cliente.ts';
import { CLAVES_ESTADO, crearIndexador, type ConfigIndexador } from '../src/indexador/index.ts';
import { leerEstadoIndexador } from '../src/db/repositorio.ts';
import { crearContexto, type Contexto } from './helpers/contexto.ts';
import { validarRespuesta, type RespuestaHttp } from './helpers/openapi.ts';
import {
  CONTRATO_ID,
  IDS_EVENTOS,
  LEDGER_INICIAL,
  PAGINAS_2,
  clienteFalso,
  espera,
  registroFalso,
} from './helpers/testnet.ts';

const CURSOR_FINAL = PAGINAS_2.at(-1)!.respuesta.cursor as string;

const config = (parcial: Partial<ConfigIndexador> = {}): ConfigIndexador => ({
  contratoId: CONTRATO_ID,
  ledgerInicial: LEDGER_INICIAL,
  intervaloMs: 5,
  tamanoPagina: 2,
  ...parcial,
});

async function hasta(condicion: () => boolean, ms = 3000) {
  const limite = Date.now() + ms;
  while (!condicion()) {
    if (Date.now() > limite) throw new Error('timeout esperando la condición');
    await espera(5);
  }
}

describe('indexador sobre fixtures reales (sin red)', () => {
  let ctx: Contexto;
  const get = (url: string) => ctx.app.inject({ method: 'GET', url }) as Promise<RespuestaHttp>;
  const idsEventos = async (url = '/obras/1/eventos') =>
    (validarRespuesta('GET', '/obras/{id}/eventos', 200, await get(url)) as { id: string }[]).map((e) => e.id);
  const contar = (tabla: string) =>
    (ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get() as { n: number }).n;

  beforeEach(async () => {
    ctx = await crearContexto();
  });
  afterEach(() => ctx.cerrar());

  it('sincronizar() deja la API con el estado y los 6 eventos de la corrida de humo', async () => {
    const cliente = clienteFalso();
    const registro = registroFalso();
    const r = await crearIndexador(ctx.db, config(), { cliente, registro }).sincronizar();

    assert.equal(r.eventosNuevos, 6);
    assert.deepEqual(r.obrasActualizadas, [1]);
    assert.equal(r.alDia, true);

    const obra = validarRespuesta('GET', '/obras/{id}', 200, await get('/obras/1')) as Record<string, unknown>;
    assert.equal(obra.saldo, '300000000000');
    assert.equal(obra.hitos_pagados, 1);
    assert.equal(obra.cantidad_hitos, 4);
    assert.equal(obra.estado, 'Activa');
    assert.equal(obra.fondeado, '400000000000');
    assert.equal(obra.pagado, '100000000000');

    const hitos = validarRespuesta('GET', '/obras/{id}/hitos', 200, await get('/obras/1/hitos')) as {
      indice: number;
      estado: string;
      evidencia_hash: string | null;
    }[];
    assert.deepEqual(hitos.map((h) => h.estado), ['Pagado', 'Pendiente', 'Pendiente', 'Pendiente']);
    assert.equal(hitos[0]!.evidencia_hash, '5071abaf0534578c02f6cfee9396fb3e90ca2879c6259944d95367309772078a');

    const eventos = validarRespuesta('GET', '/obras/{id}/eventos', 200, await get('/obras/1/eventos')) as {
      id: string;
      tipo: string;
    }[];
    assert.deepEqual(eventos.map((e) => e.id), IDS_EVENTOS);
    assert.deepEqual(eventos.map((e) => e.tipo), [
      'ObraCreada',
      'ObraFondeada',
      'HitoDeclarado',
      'HitoAprobado',
      'HitoAprobado',
      'PagoLiberado',
    ]);

    validarRespuesta('GET', '/obras', 200, await get('/obras'));
    assert.equal(leerEstadoIndexador(ctx.db, CLAVES_ESTADO.contrato), CONTRATO_ID);
    assert.equal(leerEstadoIndexador(ctx.db, CLAVES_ESTADO.cursor), CURSOR_FINAL);
    assert.equal(leerEstadoIndexador(ctx.db, CLAVES_ESTADO.ultimoLedger), String(PAGINAS_2.at(-1)!.respuesta.latestLedger));
    assert.deepEqual(registro.de('warn'), []);
    assert.deepEqual(registro.de('error'), []);
  });

  it('la paginación con límite 2 recorre todas las páginas siguiendo el cursor de cada una', async () => {
    const cliente = clienteFalso();
    await crearIndexador(ctx.db, config(), { cliente, registro: registroFalso() }).sincronizar();
    assert.deepEqual(
      cliente.llamadas.eventos,
      [{ desdeLedger: LEDGER_INICIAL }, ...PAGINAS_2.slice(0, 3).map((p) => ({ cursor: p.respuesta.cursor }))],
    );
  });

  it('maxPaginas corta la pasada (alDia false) y la siguiente continúa sin duplicar', async () => {
    const cliente = clienteFalso();
    const indexador = crearIndexador(ctx.db, config({ maxPaginas: 2 }), { cliente, registro: registroFalso() });
    const a = await indexador.sincronizar();
    assert.equal(a.alDia, false);
    assert.equal(a.eventosNuevos, 4);
    assert.deepEqual(await idsEventos(), IDS_EVENTOS.slice(0, 4));
    const b = await indexador.sincronizar();
    assert.equal(b.alDia, true);
    assert.equal(b.eventosNuevos, 2);
    assert.deepEqual(await idsEventos(), IDS_EVENTOS);
  });

  it('con página de 100 (un solo pedido) el resultado es el mismo', async () => {
    // Cliente que sirve el fixture de límite 100 entero.
    const base = clienteFalso();
    const { PAGINAS_100 } = await import('./helpers/testnet.ts');
    const { rpc } = await import('@stellar/stellar-sdk');
    const r = rpc.parseRawEvents(PAGINAS_100[0]!.respuesta);
    const cliente = {
      ...base,
      async eventos() {
        return {
          eventos: r.events,
          cursor: r.cursor,
          ultimoLedger: r.latestLedger,
          ultimoCierre: Number(r.latestLedgerCloseTime),
          ledgerMasViejo: r.oldestLedger,
        };
      },
    };
    const res = await crearIndexador(ctx.db, config({ tamanoPagina: 100 }), {
      cliente,
      registro: registroFalso(),
    }).sincronizar();
    assert.equal(res.eventosNuevos, 6);
    assert.equal(res.alDia, true);
    assert.deepEqual(await idsEventos(), IDS_EVENTOS);
  });

  it('?desde= de la API funciona sobre lo indexado', async () => {
    await crearIndexador(ctx.db, config(), { cliente: clienteFalso(), registro: registroFalso() }).sincronizar();
    assert.deepEqual(await idsEventos(`/obras/1/eventos?desde=${IDS_EVENTOS[3]}`), IDS_EVENTOS.slice(4));
  });

  it('segunda pasada: no duplica y no relee obras sin eventos nuevos', async () => {
    const cliente = clienteFalso();
    const indexador = crearIndexador(ctx.db, config(), { cliente, registro: registroFalso() });
    await indexador.sincronizar();
    assert.deepEqual(
      cliente.llamadas.leer.map((l) => `${l.funcion}(${l.args.join(',')})`),
      ['cantidad_obras()', 'ver_obra(1)', 'ver_hitos(1)'],
    );
    cliente.llamadas.leer.length = 0;
    cliente.llamadas.eventos.length = 0;

    const r = await indexador.sincronizar();
    assert.equal(r.eventosNuevos, 0);
    assert.deepEqual(r.obrasActualizadas, []);
    assert.equal(r.alDia, true);
    assert.deepEqual(cliente.llamadas.leer, []);
    assert.deepEqual(cliente.llamadas.eventos, [{ cursor: CURSOR_FINAL }]);
    assert.equal(contar('eventos'), 6);
    assert.equal(contar('hitos'), 4);
    assert.equal(contar('obras'), 1);
    assert.deepEqual(await idsEventos(), IDS_EVENTOS);
  });

  it('una obra con eventos nuevos se relee sola (sin cantidad_obras)', async () => {
    const cliente = clienteFalso();
    const indexador = crearIndexador(ctx.db, config(), { cliente, registro: registroFalso() });
    await indexador.sincronizar();
    // Se retrocede el cursor guardado a mitad de camino: la próxima pasada vuelve a ver 2 eventos de la obra 1.
    ctx.db
      .prepare('UPDATE indexador_estado SET valor = ? WHERE clave = ?')
      .run(PAGINAS_2[1]!.respuesta.cursor, CLAVES_ESTADO.cursor);
    cliente.llamadas.leer.length = 0;
    const r = await indexador.sincronizar();
    assert.equal(r.eventosNuevos, 2);
    assert.deepEqual(r.obrasActualizadas, [1]);
    assert.deepEqual(
      cliente.llamadas.leer.map((l) => l.funcion),
      ['ver_obra', 'ver_hitos'],
    );
    assert.equal(contar('eventos'), 6, 'guardarEvento es idempotente');
  });

  it('reinicio (indexador nuevo sobre la misma base): relee todo con cantidad_obras y no duplica', async () => {
    await crearIndexador(ctx.db, config(), { cliente: clienteFalso(), registro: registroFalso() }).sincronizar();
    const cliente = clienteFalso();
    const registro = registroFalso();
    const r = await crearIndexador(ctx.db, config(), { cliente, registro }).sincronizar();
    assert.equal(r.eventosNuevos, 0);
    assert.deepEqual(r.obrasActualizadas, [1]);
    assert.deepEqual(
      cliente.llamadas.leer.map((l) => l.funcion),
      ['cantidad_obras', 'ver_obra', 'ver_hitos'],
    );
    // Sigue desde el cursor guardado, no desde el ledger inicial.
    assert.deepEqual(cliente.llamadas.eventos, [{ cursor: CURSOR_FINAL }]);
    assert.equal(contar('eventos'), 6);
    assert.deepEqual(await idsEventos(), IDS_EVENTOS);
    assert.deepEqual(registro.de('warn'), []);
  });

  describe('ventana de retención del RPC', () => {
    it('ledgerInicial fuera de retención: arranca desde el más viejo + margen (10) y avisa', async () => {
      const cliente = clienteFalso({ ledgerMasViejo: 5220200 });
      const registro = registroFalso();
      await crearIndexador(ctx.db, config(), { cliente, registro }).sincronizar();
      assert.deepEqual(cliente.llamadas.eventos[0], { desdeLedger: 5220210 });
      const avisos = registro.de('warn');
      assert.equal(avisos.length, 1);
      assert.equal(avisos[0]!.obj.ledgerInicial, LEDGER_INICIAL);
      assert.equal(avisos[0]!.obj.ledgerMasViejo, 5220200);
      assert.equal(avisos[0]!.obj.desde, 5220210);
      assert.match(avisos[0]!.msg ?? '', /ledger inicial/);
      // El estado igual sale del contrato.
      const obra = validarRespuesta('GET', '/obras/{id}', 200, await get('/obras/1')) as { saldo: string };
      assert.equal(obra.saldo, '300000000000');
    });

    it('ledgerInicial justo en el borde de la ventana no avisa y se usa tal cual', async () => {
      const cliente = clienteFalso({ ledgerMasViejo: LEDGER_INICIAL });
      const registro = registroFalso();
      await crearIndexador(ctx.db, config(), { cliente, registro }).sincronizar();
      assert.deepEqual(cliente.llamadas.eventos[0], { desdeLedger: LEDGER_INICIAL });
      assert.deepEqual(registro.de('warn'), []);
    });

    it('cursor guardado fuera de retención: avisa y arranca desde el más viejo + margen', async () => {
      await crearIndexador(ctx.db, config(), { cliente: clienteFalso(), registro: registroFalso() }).sincronizar();
      const cliente = clienteFalso({ ledgerMasViejo: 5300000 });
      const registro = registroFalso();
      await crearIndexador(ctx.db, config(), { cliente, registro }).sincronizar();
      assert.deepEqual(cliente.llamadas.eventos[0], { desdeLedger: 5300010 });
      const avisos = registro.de('warn');
      assert.equal(avisos.length, 2, 'uno por el cursor y otro por el ledger inicial');
      assert.match(avisos[0]!.msg ?? '', /cursor guardado/);
      assert.equal(avisos[0]!.obj.ledgerCursor, 5226834);
    });

    it('cursor guardado dentro de retención se usa sin avisar', async () => {
      await crearIndexador(ctx.db, config(), { cliente: clienteFalso(), registro: registroFalso() }).sincronizar();
      const cliente = clienteFalso({ ledgerMasViejo: 5226834 });
      const registro = registroFalso();
      await crearIndexador(ctx.db, config(), { cliente, registro }).sincronizar();
      assert.deepEqual(cliente.llamadas.eventos[0], { cursor: CURSOR_FINAL });
      assert.deepEqual(registro.de('warn'), []);
    });
  });

  it('cambio de CONTRATO_ID: borra lo indexado y avisa; la base queda con el id nuevo', async () => {
    await crearIndexador(ctx.db, config(), { cliente: clienteFalso(), registro: registroFalso() }).sincronizar();
    assert.equal(contar('eventos'), 6);

    const otro = 'CAKGWGZQI6XOF6XAP2BB2DM6DQP525ETKYDT5UHSYBF2XRA6JUITA2QK';
    const registro = registroFalso();
    crearIndexador(ctx.db, config({ contratoId: otro }), { cliente: clienteFalso(), registro });

    assert.equal(contar('eventos'), 0);
    assert.equal(contar('hitos'), 0);
    assert.equal(contar('obras'), 0);
    assert.equal(leerEstadoIndexador(ctx.db, CLAVES_ESTADO.cursor), undefined);
    assert.equal(leerEstadoIndexador(ctx.db, CLAVES_ESTADO.contrato), otro);
    assert.equal((await get('/obras/1')).statusCode, 404);
    const avisos = registro.de('warn');
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0]!.obj.anterior, CONTRATO_ID);
    assert.equal(avisos[0]!.obj.nuevo, otro);
  });

  it('base nueva: guarda el contrato sin avisar; mismo contrato no borra nada', async () => {
    const registro = registroFalso();
    crearIndexador(ctx.db, config(), { cliente: clienteFalso(), registro });
    assert.equal(leerEstadoIndexador(ctx.db, CLAVES_ESTADO.contrato), CONTRATO_ID);
    assert.deepEqual(registro.de('warn'), []);
  });

  it('un leer que lanza: sincronizar rechaza y no escribe nada (ni eventos ni cursor)', async () => {
    const cliente = clienteFalso();
    cliente.fallaLeer = new Error('RPC caído');
    const indexador = crearIndexador(ctx.db, config(), { cliente, registro: registroFalso() });
    await assert.rejects(indexador.sincronizar(), /RPC caído/);
    assert.equal(contar('eventos'), 0);
    assert.equal(contar('obras'), 0);
    assert.equal(contar('hitos'), 0);
    assert.equal(leerEstadoIndexador(ctx.db, CLAVES_ESTADO.cursor), undefined);
    assert.equal(leerEstadoIndexador(ctx.db, CLAVES_ESTADO.ultimoLedger), undefined);

    // Y se recupera en la pasada siguiente, desde cero.
    cliente.fallaLeer = undefined;
    const r = await indexador.sincronizar();
    assert.equal(r.eventosNuevos, 6);
    assert.equal(contar('eventos'), 6);
  });

  it('R4: una obra que no se puede leer no frena a las demás y se reintenta sola', async () => {
    const cliente = clienteFalso();
    const original = cliente.leer.bind(cliente);
    // cantidad_obras dice 2, pero ver_obra(2) falla con Error(Contract, #1).
    cliente.leer = async (funcion, args) =>
      funcion === 'cantidad_obras' ? { valor: nativeToScVal(2, { type: 'u32' }), ledger: 5_226_834 } : original(funcion, args);
    const registro = registroFalso();
    const indexador = crearIndexador(ctx.db, config(), { cliente, registro });
    const r = await indexador.sincronizar();
    assert.deepEqual(r.obrasActualizadas, [1]);
    assert.deepEqual(r.obrasPendientes, [2]);
    assert.equal(contar('eventos'), 6);
    assert.equal(contar('obras'), 1);
    assert.ok(registro.de('warn').some((w) => w.obj.obra === 2 && w.obj.err instanceof ErrorLectura));

    // Pasada siguiente, sin eventos nuevos: reintenta solo la obra 2.
    cliente.llamadas.leer.length = 0;
    const r2 = await indexador.sincronizar();
    assert.deepEqual(cliente.llamadas.leer.map((l) => `${l.funcion}(${l.args.join(',')})`), ['ver_obra(2)']);
    assert.deepEqual(r2.obrasPendientes, [2]);
  });

  it('R1: una simulación más atrasada que los eventos no se guarda y la obra se relee en la pasada siguiente', async () => {
    const cliente = clienteFalso();
    // El último evento de la obra 1 está en el ledger 5220112; la simulación cae en un nodo en 5220100.
    cliente.ledgerLectura = 5_220_100;
    const registro = registroFalso();
    const indexador = crearIndexador(ctx.db, config(), { cliente, registro });
    const r = await indexador.sincronizar();
    assert.equal(r.eventosNuevos, 6);
    assert.deepEqual(r.obrasActualizadas, []);
    assert.deepEqual(r.obrasPendientes, [1]);
    assert.equal(contar('obras'), 0);
    assert.match(registro.de('warn')[0]!.msg ?? '', /estado atrasado/);

    // Siguiente pasada, sin eventos nuevos: la simulación ya está al día y la obra se guarda.
    cliente.ledgerLectura = undefined;
    const r2 = await indexador.sincronizar();
    assert.equal(r2.eventosNuevos, 0);
    assert.deepEqual(r2.obrasActualizadas, [1]);
    assert.deepEqual(r2.obrasPendientes, []);
    assert.equal(contar('obras'), 1);
  });

  it('R5: un evento salteado igual hace releer su obra', async () => {
    const cliente = clienteFalso();
    const indexador = crearIndexador(ctx.db, config(), { cliente, registro: registroFalso() });
    await indexador.sincronizar();
    // Pasada siguiente: llega un evento de la obra 1 con datos ilegibles.
    const [real] = rpc.parseRawEvents(PAGINAS_2[0]!.respuesta).events;
    const dato = new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('extra'), val: xdr.ScVal.scvVoid() });
    const raro = { ...real!, id: '0022449999999999999-0000000000', ledger: 5_226_800, value: xdr.ScVal.scvMap([dato]) };
    const original = cliente.eventos.bind(cliente);
    cliente.eventos = async (p, l) => ({ ...(await original(p, l)), eventos: [raro] });
    cliente.llamadas.leer.length = 0;
    const r = await indexador.sincronizar();
    assert.equal(r.eventosNuevos, 0);
    assert.deepEqual(r.obrasActualizadas, [1]);
    assert.deepEqual(cliente.llamadas.leer.map((l) => l.funcion), ['ver_obra', 'ver_hitos']);
  });

  it('una falla de eventos() (a mitad de las páginas) tampoco escribe nada', async () => {
    const cliente = clienteFalso();
    const original = cliente.eventos.bind(cliente);
    let n = 0;
    cliente.eventos = async (p, l) => {
      if (++n === 3) throw new Error('nodo sin esa ventana');
      return original(p, l);
    };
    const indexador = crearIndexador(ctx.db, config(), { cliente, registro: registroFalso() });
    await assert.rejects(indexador.sincronizar(), /nodo sin esa ventana/);
    assert.equal(contar('eventos'), 0);
    assert.equal(leerEstadoIndexador(ctx.db, CLAVES_ESTADO.cursor), undefined);
  });

  it('evento ilegible (nombre desconocido) se ignora con warn y el resto se indexa', async () => {
    const cliente = clienteFalso();
    const original = cliente.eventos.bind(cliente);
    cliente.eventos = async (p, l) => {
      const pagina = await original(p, l);
      if ('desdeLedger' in p) {
        const raro = { ...pagina.eventos[0]!, id: '0022420107242266625-0000000000', topic: [xdr.ScVal.scvSymbol('rareza')] };
        return { ...pagina, eventos: [raro, pagina.eventos[1]!] };
      }
      return pagina;
    };
    const registro = registroFalso();
    const r = await crearIndexador(ctx.db, config(), { cliente, registro }).sincronizar();
    assert.equal(r.eventosNuevos, 5);
    const avisos = registro.de('warn');
    assert.equal(avisos.length, 1);
    assert.match(avisos[0]!.msg ?? '', /evento ignorado/);
    assert.equal(avisos[0]!.obj.id, '0022420107242266625-0000000000');
  });

  it('evento con datos de un tipo no previsto se ignora con warn y no traba la pasada', async () => {
    const cliente = clienteFalso();
    const original = cliente.eventos.bind(cliente);
    cliente.eventos = async (p, l) => {
      const pagina = await original(p, l);
      if ('desdeLedger' in p) {
        const dato = new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('extra'), val: xdr.ScVal.scvVoid() });
        const raro = { ...pagina.eventos[0]!, id: '0022420107242266625-0000000000', value: xdr.ScVal.scvMap([dato]) };
        return { ...pagina, eventos: [raro, pagina.eventos[1]!] };
      }
      return pagina;
    };
    const registro = registroFalso();
    const r = await crearIndexador(ctx.db, config(), { cliente, registro }).sincronizar();
    assert.equal(r.eventosNuevos, 5);
    assert.deepEqual(r.obrasActualizadas, [1]);
    const avisos = registro.de('warn');
    assert.equal(avisos.length, 1);
    assert.match(avisos[0]!.msg ?? '', /evento ignorado: .*tipo no previsto/);
  });

  describe('iniciar / detener', () => {
    it('con un cliente que falla reintenta con espera creciente sin romper, y se recupera', async () => {
      const cliente = clienteFalso();
      cliente.fallaSalud = new Error('RPC no disponible');
      const registro = registroFalso();
      const indexador = crearIndexador(ctx.db, config({ intervaloMs: 5 }), { cliente, registro });
      indexador.iniciar();
      await hasta(() => registro.de('error').length >= 4);

      const errores = registro.de('error');
      assert.deepEqual(errores.map((e) => e.obj.fallos), [1, 2, 3, 4].slice(0, errores.length));
      const esperas = errores.map((e) => e.obj.reintentoEnMs as number);
      assert.deepEqual(esperas.slice(0, 4), [10, 20, 40, 80]);
      assert.match(String(errores[0]!.obj.err), /RPC no disponible/);
      assert.equal(contar('eventos'), 0);

      cliente.fallaSalud = undefined;
      await hasta(() => contar('eventos') === 6);
      await indexador.detener();
      assert.deepEqual(await idsEventos(), IDS_EVENTOS);
      assert.ok(registro.de('info').some((m) => m.msg === 'indexador: iniciado'));
    });

    it('tras recuperarse el contador de fallos vuelve a cero', async () => {
      const cliente = clienteFalso();
      const registro = registroFalso();
      const indexador = crearIndexador(ctx.db, config(), { cliente, registro });
      cliente.fallaSalud = new Error('x');
      indexador.iniciar();
      await hasta(() => registro.de('error').length >= 2);
      cliente.fallaSalud = undefined;
      await hasta(() => contar('eventos') === 6);
      cliente.fallaSalud = new Error('otra vez');
      const antes = registro.de('error').length;
      await hasta(() => registro.de('error').length > antes);
      assert.equal(registro.de('error')[antes]!.obj.fallos, 1);
      await indexador.detener();
    });

    it('detener() espera la pasada en curso y no quedan más llamadas después', async () => {
      const cliente = clienteFalso();
      const indexador = crearIndexador(ctx.db, config({ intervaloMs: 5 }), { cliente, registro: registroFalso() });
      indexador.iniciar();
      await hasta(() => cliente.llamadas.salud >= 2);
      await indexador.detener();
      const n = cliente.llamadas.salud;
      await espera(60);
      assert.equal(cliente.llamadas.salud, n);
    });

    it('iniciar() dos veces no duplica el ciclo; detener() sin iniciar no falla', async () => {
      const cliente = clienteFalso();
      const registro = registroFalso();
      const indexador = crearIndexador(ctx.db, config({ intervaloMs: 1000 }), { cliente, registro });
      await indexador.detener();
      indexador.iniciar();
      indexador.iniciar();
      await hasta(() => contar('eventos') === 6);
      await indexador.detener();
      assert.equal(registro.de('info').filter((m) => m.msg === 'indexador: iniciado').length, 1);
    });
  });
});
