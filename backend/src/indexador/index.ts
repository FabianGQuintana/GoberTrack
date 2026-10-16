import { nativeToScVal } from '@stellar/stellar-sdk';
import type { DatabaseSync } from 'node:sqlite';
import { enTransaccion } from '../db/conexion.ts';
import {
  borrarEstadoIndexado,
  guardarEstadoIndexador,
  guardarEvento,
  guardarHito,
  guardarObra,
  leerEstadoIndexador,
} from '../db/repositorio.ts';
import type { EventoIndexado, HitoContrato, ObraContrato } from '../dominio/tipos.ts';
import type { ClienteContrato, PedidoEventos } from './cliente.ts';
import {
  decodificarCantidadObras,
  decodificarHitos,
  decodificarObra,
  ledgerDeCursor,
  traducirEvento,
} from './decodificar.ts';

/*
 * Indexador del contrato (Fase 3). Cada pasada (`sincronizar`):
 *  1. Lee los eventos nuevos con getEvents filtrando por el contrato, desde el cursor guardado en
 *     indexador_estado o, la primera vez, desde `ledgerInicial`. Si eso ya salió de la ventana
 *     de retención del RPC, arranca desde el ledger más viejo disponible y lo registra en el log.
 *  2. Traduce cada evento (nombre corto → TipoEvento, datos al formato de la API).
 *  3. Relee el estado con ver_obra y ver_hitos (simulación de solo lectura): todas las obras
 *     (según cantidad_obras) en la primera pasada después de arrancar, y después solo las que
 *     recibieron eventos. El estado sale del contrato, no de los eventos, así que no depende de
 *     la retención del RPC.
 *  4. Guarda eventos, estado y cursor en una sola transacción: si el proceso se corta a mitad de
 *     camino, la próxima pasada repite desde el cursor anterior (guardarEvento es idempotente).
 */

export interface ConfigIndexador {
  contratoId: string;
  /** Ledger de creación del contrato: antes no puede haber eventos. */
  ledgerInicial: number;
  intervaloMs: number;
  /** Eventos por pedido a getEvents. */
  tamanoPagina?: number;
  /** Páginas por pasada, para que una pasada no se haga eterna al ponerse al día. */
  maxPaginas?: number;
}

/** Lo que el indexador escribe en el log (compatible con el logger de Fastify). */
export interface Registro {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface ResultadoSincronizacion {
  eventosNuevos: number;
  obrasActualizadas: number[];
  /** Obras que se van a releer en la próxima pasada (estado atrasado o lectura fallida). */
  obrasPendientes: number[];
  ultimoLedger: number;
  /** false si quedaron páginas de eventos para la próxima pasada. */
  alDia: boolean;
}

export interface Indexador {
  sincronizar(): Promise<ResultadoSincronizacion>;
  /** Polling cada `intervaloMs`; ante errores reintenta con espera creciente sin tirar el proceso. */
  iniciar(): void;
  detener(): Promise<void>;
}

/** Claves de la tabla indexador_estado. */
export const CLAVES_ESTADO = {
  contrato: 'contrato_id',
  cursor: 'cursor_eventos',
  ultimoLedger: 'ultimo_ledger',
  /** Segundos Unix del cierre del último ledger visto. */
  ultimoCierre: 'ultimo_ledger_cierre',
} as const;

/** Margen sobre el reloj de la máquina mientras no se conoce el ledger: va ~5 s adelante. */
export const MARGEN_RELOJ_MS = 10_000;

/**
 * Reloj de la red para `pagable` (B2): el cierre del último ledger que vio el indexador. Se queda
 * corto como mucho un intervalo de polling, así que `pagable` nunca pasa a true antes de que el
 * contrato acepte liberar_pago (si el indexador se atrasa, tarda más, pero no se adelanta). Sin
 * ledger conocido, usa el reloj de la máquina menos MARGEN_RELOJ_MS.
 */
export function crearRelojLedger(db: DatabaseSync, relojMaquina: () => number = Date.now): () => number {
  return () => {
    const cierre = Number(leerEstadoIndexador(db, CLAVES_ESTADO.ultimoCierre));
    return Number.isFinite(cierre) && cierre > 0 ? cierre * 1000 : relojMaquina() - MARGEN_RELOJ_MS;
  };
}

/** Margen al arrancar desde el ledger más viejo: la ventana avanza mientras tanto. */
const MARGEN_RETENCION = 10;
const ESPERA_MAXIMA_MS = 60_000;

export function crearIndexador(
  db: DatabaseSync,
  config: ConfigIndexador,
  deps: { cliente: ClienteContrato; registro: Registro },
): Indexador {
  const { cliente, registro } = deps;
  const tamanoPagina = config.tamanoPagina ?? 100;
  const maxPaginas = config.maxPaginas ?? 50;
  let estadoReconstruido = false;
  /**
   * Obras a releer en la próxima pasada aunque no reciban eventos, con el ledger mínimo que tiene
   * que alcanzar la simulación: la anterior cayó en un nodo atrasado (R1) o falló (R4).
   */
  let pendientes = new Map<number, number>();

  prepararBase(db, config.contratoId, registro);

  async function leerEstado(id: number): Promise<{ obra: ObraContrato; hitos: HitoContrato[]; ledger: number }> {
    const arg = [nativeToScVal(id, { type: 'u32' })];
    const lecturaObra = await cliente.leer('ver_obra', arg);
    const lecturaHitos = await cliente.leer('ver_hitos', arg);
    const { obra, estado } = decodificarObra(lecturaObra.valor);
    const hitos = decodificarHitos(lecturaHitos.valor);
    if (obra.id !== id || hitos.length !== obra.cantidad_hitos) {
      throw new Error(`ver_obra/ver_hitos(${id}) devolvió datos incoherentes`);
    }
    const todosPagados = hitos.every((h) => h.estado === 'Pagado');
    if ((estado === 'Finalizada') !== todosPagados) {
      registro.warn({ obra: id, estado }, 'el estado de la obra no coincide con el de sus hitos');
    }
    return { obra, hitos, ledger: Math.min(lecturaObra.ledger, lecturaHitos.ledger) };
  }

  /** Desde dónde pedir eventos, teniendo en cuenta la ventana de retención del RPC. */
  async function pedidoInicial(): Promise<PedidoEventos> {
    const { ledgerMasViejo } = await cliente.salud();
    const cursor = leerEstadoIndexador(db, CLAVES_ESTADO.cursor);
    if (cursor) {
      const ledger = ledgerDeCursor(cursor);
      if (ledger === undefined || ledger >= ledgerMasViejo) return { cursor };
      registro.warn(
        { ledgerCursor: ledger, ledgerMasViejo },
        'el cursor guardado salió de la ventana de retención del RPC: pueden faltar eventos en la línea de tiempo',
      );
    }
    if (config.ledgerInicial >= ledgerMasViejo) return { desdeLedger: config.ledgerInicial };
    const desde = ledgerMasViejo + MARGEN_RETENCION;
    registro.warn(
      { ledgerInicial: config.ledgerInicial, ledgerMasViejo, desde },
      'el ledger inicial ya no está en el RPC: se indexa desde el más viejo disponible (el estado igual sale de ver_obra/ver_hitos)',
    );
    return { desdeLedger: desde };
  }

  async function sincronizar(): Promise<ResultadoSincronizacion> {
    let pedido = await pedidoInicial();
    const nuevos: EventoIndexado[] = [];
    /** Obra → ledger más alto de sus eventos en esta pasada. */
    const tocadas = new Map<number, number>();
    const tocar = (obra: number, ledger: number) => tocadas.set(obra, Math.max(tocadas.get(obra) ?? 0, ledger));
    let cursor = 'cursor' in pedido ? pedido.cursor : undefined;
    let ultimoLedger = 0;
    let ultimoCierre = 0;
    let alDia = false;

    for (let pagina = 0; pagina < maxPaginas && !alDia; pagina++) {
      const r = await cliente.eventos(pedido, tamanoPagina);
      if (Number.isFinite(r.ultimoCierre)) ultimoCierre = Math.max(ultimoCierre, r.ultimoCierre);
      for (const ev of r.eventos) {
        const t = traducirEvento(ev);
        if (!t.ok) {
          registro.warn({ id: ev.id }, `evento ignorado: ${t.motivo}`);
          // R5: el evento no se guarda, pero su obra cambió: se relee igual.
          if (t.obra !== undefined) tocar(t.obra, ev.ledger);
          continue;
        }
        nuevos.push(t.evento);
        tocar(t.evento.obra_id, ev.ledger);
      }
      cursor = r.cursor;
      ultimoLedger = r.ultimoLedger;
      pedido = { cursor };
      alDia = r.eventos.length < tamanoPagina;
    }

    // Ledger mínimo que tiene que ver la simulación de cada obra a releer.
    const minimos = new Map(pendientes);
    for (const [obra, ledger] of tocadas) minimos.set(obra, Math.max(minimos.get(obra) ?? 0, ledger));
    if (!estadoReconstruido) {
      const cantidad = decodificarCantidadObras((await cliente.leer('cantidad_obras', [])).valor);
      for (let id = 1; id <= cantidad; id++) if (!minimos.has(id)) minimos.set(id, 0);
    }
    const aRefrescar = [...minimos.keys()].sort((a, b) => a - b);
    const estados: { obra: ObraContrato; hitos: HitoContrato[] }[] = [];
    const nuevosPendientes = new Map<number, number>();
    for (const id of aRefrescar) {
      const minimo = minimos.get(id)!;
      try {
        const e = await leerEstado(id);
        if (e.ledger < minimo) {
          // R1: la simulación cayó en un nodo que todavía no vio los eventos de esta pasada.
          // Ese estado es más viejo que la línea de tiempo: no se guarda y se relee después.
          registro.warn({ obra: id, ledgerLectura: e.ledger, ledgerEventos: minimo }, 'estado atrasado: se relee en la próxima pasada');
          nuevosPendientes.set(id, minimo);
          continue;
        }
        estados.push(e);
      } catch (err) {
        // R4: una obra que no se puede leer no frena a las demás; se reintenta sola.
        registro.warn({ obra: id, err }, 'no se pudo leer la obra: se reintenta en la próxima pasada');
        nuevosPendientes.set(id, minimo);
      }
    }

    enTransaccion(db, () => {
      for (const e of nuevos) guardarEvento(db, e);
      for (const { obra, hitos } of estados) {
        guardarObra(db, obra);
        for (const h of hitos) guardarHito(db, obra.id, h);
      }
      if (cursor) guardarEstadoIndexador(db, CLAVES_ESTADO.cursor, cursor);
      guardarEstadoIndexador(db, CLAVES_ESTADO.ultimoLedger, String(ultimoLedger));
      // El RPC está balanceado entre nodos: uno atrasado no hace retroceder el reloj de la red.
      const cierreAnterior = Number(leerEstadoIndexador(db, CLAVES_ESTADO.ultimoCierre) ?? 0);
      if (ultimoCierre > cierreAnterior) {
        guardarEstadoIndexador(db, CLAVES_ESTADO.ultimoCierre, String(ultimoCierre));
      }
    });
    estadoReconstruido = true;
    pendientes = nuevosPendientes;

    const resultado = {
      eventosNuevos: nuevos.length,
      obrasActualizadas: estados.map((e) => e.obra.id),
      obrasPendientes: [...nuevosPendientes.keys()],
      ultimoLedger,
      alDia,
    };
    if (nuevos.length > 0 || estados.length > 0) registro.info(resultado, 'indexador: pasada con cambios');
    return resultado;
  }

  // ---- Polling ----
  let temporizador: NodeJS.Timeout | undefined;
  let pasada: Promise<void> | undefined;
  let detenido = true;
  let fallos = 0;

  function programar(esperaMs: number) {
    if (detenido) return;
    temporizador = setTimeout(() => {
      pasada = ciclo();
    }, esperaMs);
  }

  async function ciclo(): Promise<void> {
    let espera = config.intervaloMs;
    try {
      const r = await sincronizar();
      fallos = 0;
      // Si quedaron páginas pendientes, sigue enseguida.
      if (!r.alDia) espera = 0;
    } catch (err) {
      fallos++;
      espera = Math.min(config.intervaloMs * 2 ** fallos, ESPERA_MAXIMA_MS);
      registro.error({ err, fallos, reintentoEnMs: espera }, 'indexador: falló la pasada, se reintenta');
    }
    programar(espera);
  }

  return {
    sincronizar,
    iniciar() {
      if (!detenido) return;
      detenido = false;
      registro.info(
        { contrato: config.contratoId, ledgerInicial: config.ledgerInicial, intervaloMs: config.intervaloMs },
        'indexador: iniciado',
      );
      programar(0);
    },
    async detener() {
      detenido = true;
      clearTimeout(temporizador);
      await pasada;
    },
  };
}

/** Si la base se indexó con otro contrato (redespliegue), se descarta lo indexado y se empieza de cero. */
function prepararBase(db: DatabaseSync, contratoId: string, registro: Registro): void {
  const anterior = leerEstadoIndexador(db, CLAVES_ESTADO.contrato);
  if (anterior === contratoId) return;
  enTransaccion(db, () => {
    if (anterior !== undefined) {
      registro.warn({ anterior, nuevo: contratoId }, 'cambió el contrato: se borra lo indexado');
    }
    borrarEstadoIndexado(db);
    guardarEstadoIndexador(db, CLAVES_ESTADO.contrato, contratoId);
  });
}
