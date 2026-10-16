import { createHash } from 'node:crypto';
import { aIso } from '../dominio/api.ts';
import type {
  Decision,
  EstadoObra,
  EventoIndexado,
  HitoContrato,
  ObraContrato,
  TipoEvento,
} from '../dominio/tipos.ts';

/*
 * DATO SIMULADO. Simulador en memoria del contrato (interfaces/contract.md §3), solo para el seed:
 * aplica las mismas validaciones en el mismo orden y emite los mismos eventos (§4), así el estado
 * sembrado y su línea de tiempo son coherentes por construcción. No simula firmas (require_auth):
 * los errores de autorización del host no existen acá; `NoAutorizado` sí.
 *
 * Cada operación es una transacción en un ledger nuevo de 5 s. Los ids de evento imitan el formato
 * del RPC (SUPUESTO, sin verificar contra testnet): "<TOID en 19 dígitos>-<índice en 10 dígitos>",
 * con TOID = ledger << 32 | orden_tx << 12 | índice_op. Ordenarlos como texto es ordenarlos en el tiempo.
 */

export type NombreError =
  | 'ObraNoExiste'
  | 'HitoNoExiste'
  | 'NoAutorizado'
  | 'RolesDuplicados'
  | 'MontoInvalido'
  | 'ExcedeMontoTotal'
  | 'FondosInsuficientes'
  | 'EstadoInvalido'
  | 'HitoAnteriorPendiente'
  | 'YaDecidio'
  | 'ObjecionAbierta'
  | 'ObjecionYaUsada'
  | 'FueraDePeriodo'
  | 'PeriodoNoCumplido'
  | 'YaPagado';

export class ErrorContrato extends Error {
  readonly nombre: NombreError;

  constructor(nombre: NombreError, detalle: string) {
    super(`${nombre}: ${detalle}`);
    this.nombre = nombre;
  }
}

export interface NuevaObra {
  municipio: string;
  nombre: string;
  contratista: string;
  inspector: string;
  veedor: string;
  arbitro: string;
  token: string;
  hitos: { descripcion: string; monto: bigint }[];
  periodoObjecion: number;
}

interface ObraSimulada extends ObraContrato {
  estado: EstadoObra;
  hitos: HitoContrato[];
}

const SEG_POR_LEDGER = 5;
const I128_MAX = (1n << 127n) - 1n;

export class SimuladorContrato {
  private readonly obras = new Map<number, ObraSimulada>();
  private readonly eventosEmitidos: EventoIndexado[] = [];
  private readonly inicio: number;
  private readonly ledgerInicial: number;
  private ultimaObra = 0;
  private ultimoLedger: number;
  private reloj: number;

  /** `inicio`: segundos Unix del ledger `ledgerInicial`. */
  constructor(inicio: number, ledgerInicial: number) {
    this.inicio = inicio;
    this.ledgerInicial = ledgerInicial;
    this.ultimoLedger = ledgerInicial - 1;
    this.reloj = inicio;
  }

  /**
   * Adelanta el reloj hasta `momento` (segundos Unix). La próxima operación cierra en ese ledger o
   * en el siguiente libre. Nunca retrocede: una operación ya cerrada puede haberlo pasado.
   */
  irA(momento: number): void {
    this.reloj = Math.max(this.reloj, momento);
  }

  /** Momento actual del reloj simulado (≥ el timestamp del último ledger cerrado). */
  get ultimoMomento(): number {
    return this.reloj;
  }

  get obrasSimuladas(): { obra: ObraContrato; hitos: HitoContrato[] }[] {
    return [...this.obras.values()].map(({ hitos, estado: _estado, ...obra }) => ({
      obra: { ...obra },
      hitos: hitos.map((h) => ({ ...h })),
    }));
  }

  get eventos(): EventoIndexado[] {
    return [...this.eventosEmitidos];
  }

  estadoObra(id: number): EstadoObra {
    return this.obra(id).estado;
  }

  // ---- Funciones del contrato (§3) ----

  crearObra(p: NuevaObra): number {
    const ahora = this.nuevoLedger();
    const roles = [p.contratista, p.inspector, p.veedor, p.arbitro];
    if (
      new Set(roles).size !== roles.length ||
      [p.contratista, p.inspector, p.veedor].includes(p.municipio)
    ) {
      throw new ErrorContrato('RolesDuplicados', p.nombre);
    }
    if (p.hitos.length === 0 || p.hitos.some((h) => h.monto <= 0n)) {
      throw new ErrorContrato('MontoInvalido', p.nombre);
    }
    const total = p.hitos.reduce((s, h) => s + h.monto, 0n);
    if (total > I128_MAX) throw new ErrorContrato('MontoInvalido', 'la suma desborda');

    const id = ++this.ultimaObra;
    this.obras.set(id, {
      id,
      nombre: p.nombre,
      municipio: p.municipio,
      contratista: p.contratista,
      inspector: p.inspector,
      veedor: p.veedor,
      arbitro: p.arbitro,
      token: p.token,
      monto_original: total,
      monto_vigente: total,
      fondeado: 0n,
      pagado: 0n,
      periodo_objecion: p.periodoObjecion,
      cantidad_hitos: p.hitos.length,
      estado: 'Activa',
      creada_en: ahora,
      hitos: p.hitos.map((h, indice) => ({
        indice,
        descripcion: h.descripcion,
        monto_original: h.monto,
        monto_vigente: h.monto,
        estado: 'Pendiente',
        evidencia_hash: null,
        momento_declaracion: null,
        aprobo_inspector: false,
        aprobo_veedor: false,
        veedor_por_arbitro: false,
        objecion_usada: false,
        motivo_objecion_hash: null,
        momento_aprobacion_completa: null,
        momento_pago: null,
      })),
    });
    this.emitir('ObraCreada', id, null, {
      nombre: p.nombre,
      municipio: p.municipio,
      contratista: p.contratista,
      inspector: p.inspector,
      veedor: p.veedor,
      arbitro: p.arbitro,
      token: p.token,
      monto_original: total.toString(),
      cantidad_hitos: p.hitos.length,
      periodo_objecion: p.periodoObjecion,
    });
    return id;
  }

  fondear(obraId: number, monto: bigint): void {
    this.nuevoLedger();
    const obra = this.obra(obraId);
    if (monto <= 0n) throw new ErrorContrato('MontoInvalido', `fondear ${monto}`);
    if (obra.fondeado + monto > obra.monto_vigente) {
      throw new ErrorContrato('ExcedeMontoTotal', `obra ${obraId}`);
    }
    obra.fondeado += monto;
    this.emitir('ObraFondeada', obraId, null, {
      monto: monto.toString(),
      fondeado: obra.fondeado.toString(),
    });
  }

  declararHito(obraId: number, indice: number, evidenciaHash: string): void {
    const ahora = this.nuevoLedger();
    const obra = this.obra(obraId);
    const hito = this.hito(obra, indice);
    this.exigirAnteriorOk(obra, indice);
    if (hito.estado !== 'Pendiente') throw new ErrorContrato('EstadoInvalido', `declarar en ${hito.estado}`);

    Object.assign(hito, {
      estado: 'Evidencia',
      evidencia_hash: evidenciaHash,
      momento_declaracion: ahora,
      aprobo_inspector: false,
      aprobo_veedor: false,
      veedor_por_arbitro: false,
      objecion_usada: false,
      motivo_objecion_hash: null,
      momento_aprobacion_completa: null,
    } satisfies Partial<HitoContrato>);
    this.emitir('HitoDeclarado', obraId, indice, {
      evidencia_hash: evidenciaHash,
      // SUPUESTO: los u64 que son momentos se exponen en ISO 8601, como el resto de la API.
      fin_periodo: aIso(ahora + obra.periodo_objecion),
    });
  }

  aprobar(obraId: number, indice: number, firmante: string): void {
    const ahora = this.nuevoLedger();
    const obra = this.obra(obraId);
    const hito = this.hito(obra, indice);
    const esInspector = firmante === obra.inspector;
    if (!esInspector && firmante !== obra.veedor) throw new ErrorContrato('NoAutorizado', firmante);
    this.exigirAnteriorOk(obra, indice);
    if (hito.estado === 'Pagado') throw new ErrorContrato('YaPagado', `hito ${indice}`);
    if (hito.estado === 'Objetado') throw new ErrorContrato('ObjecionAbierta', `hito ${indice}`);
    if (hito.estado === 'Pendiente') throw new ErrorContrato('EstadoInvalido', `aprobar en Pendiente`);
    if (esInspector ? hito.aprobo_inspector : hito.aprobo_veedor) {
      throw new ErrorContrato('YaDecidio', firmante);
    }

    if (esInspector) hito.aprobo_inspector = true;
    else hito.aprobo_veedor = true;
    const completo = hito.aprobo_inspector && hito.aprobo_veedor;
    if (completo) {
      hito.estado = 'Aprobado';
      hito.momento_aprobacion_completa = ahora;
    }
    this.emitir('HitoAprobado', obraId, indice, { firmante, completo });
  }

  objetar(obraId: number, indice: number, motivoHash: string): void {
    const ahora = this.nuevoLedger();
    const obra = this.obra(obraId);
    const hito = this.hito(obra, indice);
    if (hito.estado === 'Pagado') throw new ErrorContrato('YaPagado', `hito ${indice}`);
    if (hito.estado === 'Objetado') throw new ErrorContrato('ObjecionAbierta', `hito ${indice}`);
    if (hito.estado === 'Pendiente') throw new ErrorContrato('EstadoInvalido', 'objetar en Pendiente');
    if (hito.objecion_usada) throw new ErrorContrato('ObjecionYaUsada', `hito ${indice}`);
    if (hito.aprobo_veedor) throw new ErrorContrato('YaDecidio', 'el veedor ya aprobó');
    if (ahora >= hito.momento_declaracion! + obra.periodo_objecion) {
      throw new ErrorContrato('FueraDePeriodo', `hito ${indice}`);
    }

    hito.estado = 'Objetado';
    hito.objecion_usada = true;
    hito.motivo_objecion_hash = motivoHash;
    this.emitir('HitoObjetado', obraId, indice, { motivo_hash: motivoHash });
  }

  resolverObjecion(obraId: number, indice: number, decision: Decision): void {
    const ahora = this.nuevoLedger();
    const obra = this.obra(obraId);
    const hito = this.hito(obra, indice);
    if (hito.estado !== 'Objetado') throw new ErrorContrato('EstadoInvalido', `resolver en ${hito.estado}`);

    if (decision === 'Aceptar') {
      Object.assign(hito, {
        estado: 'Pendiente',
        aprobo_inspector: false,
        aprobo_veedor: false,
        veedor_por_arbitro: false,
        evidencia_hash: null,
        momento_declaracion: null,
        objecion_usada: false,
        motivo_objecion_hash: null,
        momento_aprobacion_completa: null,
      } satisfies Partial<HitoContrato>);
    } else {
      hito.aprobo_veedor = true;
      hito.veedor_por_arbitro = true;
      if (hito.aprobo_inspector) {
        hito.estado = 'Aprobado';
        hito.momento_aprobacion_completa = ahora;
      } else {
        hito.estado = 'Evidencia';
      }
    }
    this.emitir('ObjecionResuelta', obraId, indice, { decision, estado: hito.estado });
  }

  liberarPago(obraId: number, indice: number): void {
    const ahora = this.nuevoLedger();
    const obra = this.obra(obraId);
    const hito = this.hito(obra, indice);
    if (hito.estado === 'Pagado') throw new ErrorContrato('YaPagado', `hito ${indice}`);
    if (hito.estado === 'Objetado') throw new ErrorContrato('ObjecionAbierta', `hito ${indice}`);
    this.exigirAnteriorOk(obra, indice);
    if (hito.estado !== 'Aprobado') throw new ErrorContrato('EstadoInvalido', `pagar en ${hito.estado}`);
    if (ahora < hito.momento_declaracion! + obra.periodo_objecion) {
      throw new ErrorContrato('PeriodoNoCumplido', `hito ${indice}`);
    }
    if (obra.fondeado - obra.pagado < hito.monto_vigente) {
      throw new ErrorContrato('FondosInsuficientes', `hito ${indice}`);
    }

    hito.estado = 'Pagado';
    hito.momento_pago = ahora;
    obra.pagado += hito.monto_vigente;
    if (obra.hitos.every((h) => h.estado === 'Pagado')) obra.estado = 'Finalizada';
    this.emitir('PagoLiberado', obraId, indice, {
      contratista: obra.contratista,
      monto: hito.monto_vigente.toString(),
      pagado: obra.pagado.toString(),
    });
  }

  // ---- Internos ----

  private obra(id: number): ObraSimulada {
    const obra = this.obras.get(id);
    if (!obra) throw new ErrorContrato('ObraNoExiste', `obra ${id}`);
    return obra;
  }

  private hito(obra: ObraSimulada, indice: number): HitoContrato {
    const hito = obra.hitos[indice];
    if (!hito) throw new ErrorContrato('HitoNoExiste', `obra ${obra.id} hito ${indice}`);
    return hito;
  }

  /** "Hito anterior OK": índice 0, o el anterior está Aprobado o Pagado. */
  private exigirAnteriorOk(obra: ObraSimulada, indice: number): void {
    const anterior = obra.hitos[indice - 1];
    if (anterior && anterior.estado !== 'Aprobado' && anterior.estado !== 'Pagado') {
      throw new ErrorContrato('HitoAnteriorPendiente', `obra ${obra.id} hito ${indice}`);
    }
  }

  /** Cierra un ledger nuevo en el momento del reloj (o el siguiente libre) y devuelve su timestamp. */
  private nuevoLedger(): number {
    const segun = this.ledgerInicial + Math.ceil((this.reloj - this.inicio) / SEG_POR_LEDGER);
    this.ultimoLedger = Math.max(segun, this.ultimoLedger + 1);
    this.reloj = this.inicio + (this.ultimoLedger - this.ledgerInicial) * SEG_POR_LEDGER;
    return this.reloj;
  }

  private emitir(
    tipo: TipoEvento,
    obra: number,
    hito: number | null,
    datos: Record<string, unknown>,
  ): void {
    const ledger = this.ultimoLedger;
    const toid = (BigInt(ledger) << 32n) | (1n << 12n);
    this.eventosEmitidos.push({
      id: `${toid.toString().padStart(19, '0')}-${'0'.padStart(10, '0')}`,
      tipo,
      obra_id: obra,
      hito,
      ledger,
      momento: this.reloj,
      tx_hash: createHash('sha256').update(`opv-dato-simulado:tx:${ledger}`).digest('hex'),
      datos,
    });
  }
}
