// DATO SIMULADO. Simulador en memoria del contrato, solo para armar los datos del modo mock.
// Valida cada operación con las mismas reglas que usa el panel (lib/reglas.ts, que siguen el orden
// de contract.md §3) y aplica los efectos de §3, así el estado de las obras y su línea de tiempo son
// coherentes por construcción. Si un paso del escenario violara una regla, el armado falla.
//
// Igual que el seed del backend: cada operación cierra un ledger nuevo de 5 s y los ids de evento
// imitan el formato del RPC (SUPUESTO): "<TOID en 19 dígitos>-<índice en 10 dígitos>".

import { describirMotivo, type Contexto, type Resultado } from "../../reglas";
import { evaluarAprobar, evaluarDeclarar, evaluarFondear, evaluarLiberarPago } from "../../reglas";
import { evaluarObjetar, evaluarResolver } from "../../reglas";
import { rolesDe } from "../../roles";
import type { Decision } from "../../invocaciones";
import type { Evento, Hito, Obra, TipoEvento } from "../tipos";

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

const SEG_POR_LEDGER = 5;

/** Segundos Unix → ISO 8601 en UTC sin milisegundos, como el backend. */
export function aIso(segundos: number): string {
  return new Date(segundos * 1000).toISOString().replace(".000Z", "Z");
}

const suma = (a: string, b: bigint) => (BigInt(a) + b).toString();

export class SimuladorMock {
  private readonly obras = new Map<number, { obra: Obra; hitos: Hito[] }>();
  private readonly eventosEmitidos: Omit<Evento, "tx_hash">[] = [];
  private ultimaObra = 0;
  private ultimoLedger: number;
  private reloj: number;

  /** `inicio`: segundos Unix del ledger `ledgerInicial`. */
  constructor(
    private readonly inicio: number,
    private readonly ledgerInicial: number,
  ) {
    this.ultimoLedger = ledgerInicial - 1;
    this.reloj = inicio;
  }

  /** Adelanta el reloj (segundos Unix). Nunca retrocede. */
  irA(momento: number): void {
    this.reloj = Math.max(this.reloj, momento);
  }

  get estado(): { obra: Obra; hitos: Hito[] }[] {
    return [...this.obras.values()];
  }

  get eventos(): Omit<Evento, "tx_hash">[] {
    return this.eventosEmitidos;
  }

  crearObra(p: NuevaObra): number {
    const ahora = this.nuevoLedger();
    const total = p.hitos.reduce((s, h) => s + h.monto, 0n);
    const id = ++this.ultimaObra;
    const obra: Obra = {
      id,
      nombre: p.nombre,
      municipio: p.municipio,
      contratista: p.contratista,
      inspector: p.inspector,
      veedor: p.veedor,
      arbitro: p.arbitro,
      token: p.token,
      monto_original: total.toString(),
      monto_vigente: total.toString(),
      fondeado: "0",
      pagado: "0",
      saldo: "0",
      periodo_objecion_seg: p.periodoObjecion,
      estado: "Activa",
      cantidad_hitos: p.hitos.length,
      hitos_pagados: 0,
      creada_en: aIso(ahora),
    };
    const hitos: Hito[] = p.hitos.map((h, indice) => ({
      obra_id: id,
      indice,
      descripcion: h.descripcion,
      monto_original: h.monto.toString(),
      monto_vigente: h.monto.toString(),
      estado: "Pendiente",
      evidencia_hash: null,
      momento_declaracion: null,
      fin_periodo_objecion: null,
      aprobo_inspector: false,
      aprobo_veedor: false,
      veedor_por_arbitro: false,
      objecion_usada: false,
      motivo_objecion_hash: null,
      momento_aprobacion_completa: null,
      momento_pago: null,
      pagable: false,
    }));
    this.obras.set(id, { obra, hitos });
    this.emitir("ObraCreada", id, null, {
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
    const ahora = this.nuevoLedger();
    const { obra } = this.buscar(obraId);
    this.exigir(evaluarFondear(this.contexto(obraId, obra.municipio, ahora), monto), "fondear");
    obra.fondeado = suma(obra.fondeado, monto);
    obra.saldo = suma(obra.saldo, monto);
    this.emitir("ObraFondeada", obraId, null, { monto: monto.toString(), fondeado: obra.fondeado });
  }

  declararHito(obraId: number, indice: number, evidenciaHash: string): void {
    const ahora = this.nuevoLedger();
    const { obra, hitos } = this.buscar(obraId);
    this.exigir(evaluarDeclarar(this.contexto(obraId, obra.contratista, ahora), indice), "declarar_hito");
    const fin = ahora + obra.periodo_objecion_seg;
    Object.assign(hitos[indice], {
      estado: "Evidencia",
      evidencia_hash: evidenciaHash,
      momento_declaracion: aIso(ahora),
      fin_periodo_objecion: aIso(fin),
      aprobo_inspector: false,
      aprobo_veedor: false,
      veedor_por_arbitro: false,
      objecion_usada: false,
      motivo_objecion_hash: null,
      momento_aprobacion_completa: null,
    } satisfies Partial<Hito>);
    this.emitir("HitoDeclarado", obraId, indice, { evidencia_hash: evidenciaHash, fin_periodo: aIso(fin) });
  }

  aprobar(obraId: number, indice: number, firmante: string): void {
    const ahora = this.nuevoLedger();
    const { obra, hitos } = this.buscar(obraId);
    this.exigir(evaluarAprobar(this.contexto(obraId, firmante, ahora), indice), "aprobar");
    const hito = hitos[indice];
    if (firmante === obra.inspector) hito.aprobo_inspector = true;
    else hito.aprobo_veedor = true;
    const completo = hito.aprobo_inspector && hito.aprobo_veedor;
    if (completo) {
      hito.estado = "Aprobado";
      hito.momento_aprobacion_completa = aIso(ahora);
    }
    this.emitir("HitoAprobado", obraId, indice, { firmante, completo });
  }

  objetar(obraId: number, indice: number, motivoHash: string): void {
    const ahora = this.nuevoLedger();
    const { obra, hitos } = this.buscar(obraId);
    this.exigir(evaluarObjetar(this.contexto(obraId, obra.veedor, ahora), indice), "objetar");
    Object.assign(hitos[indice], {
      estado: "Objetado",
      objecion_usada: true,
      motivo_objecion_hash: motivoHash,
    } satisfies Partial<Hito>);
    this.emitir("HitoObjetado", obraId, indice, { motivo_hash: motivoHash });
  }

  resolverObjecion(obraId: number, indice: number, decision: Decision): void {
    const ahora = this.nuevoLedger();
    const { obra, hitos } = this.buscar(obraId);
    this.exigir(evaluarResolver(this.contexto(obraId, obra.arbitro, ahora), indice), "resolver_objecion");
    const hito = hitos[indice];
    if (decision === "Aceptar") {
      Object.assign(hito, {
        estado: "Pendiente",
        aprobo_inspector: false,
        aprobo_veedor: false,
        veedor_por_arbitro: false,
        evidencia_hash: null,
        momento_declaracion: null,
        fin_periodo_objecion: null,
        objecion_usada: false,
        motivo_objecion_hash: null,
        momento_aprobacion_completa: null,
      } satisfies Partial<Hito>);
    } else {
      hito.aprobo_veedor = true;
      hito.veedor_por_arbitro = true;
      if (hito.aprobo_inspector) {
        hito.estado = "Aprobado";
        hito.momento_aprobacion_completa = aIso(ahora);
      } else {
        hito.estado = "Evidencia";
      }
    }
    this.emitir("ObjecionResuelta", obraId, indice, { decision, estado: hito.estado });
  }

  liberarPago(obraId: number, indice: number): void {
    const ahora = this.nuevoLedger();
    const { obra, hitos } = this.buscar(obraId);
    // Sin firma de rol: la llama cualquiera.
    this.exigir(evaluarLiberarPago(this.contexto(obraId, null, ahora), indice), "liberar_pago");
    const hito = hitos[indice];
    hito.estado = "Pagado";
    hito.momento_pago = aIso(ahora);
    const monto = BigInt(hito.monto_vigente);
    obra.pagado = suma(obra.pagado, monto);
    obra.saldo = suma(obra.saldo, -monto);
    obra.hitos_pagados += 1;
    if (hitos.every((h) => h.estado === "Pagado")) obra.estado = "Finalizada";
    this.emitir("PagoLiberado", obraId, indice, {
      contratista: obra.contratista,
      monto: hito.monto_vigente,
      pagado: obra.pagado,
    });
  }

  // ---- Internos ----

  private buscar(obraId: number): { obra: Obra; hitos: Hito[] } {
    const encontrada = this.obras.get(obraId);
    if (!encontrada) throw new Error(`Escenario mock inválido: ObraNoExiste (obra ${obraId})`);
    return encontrada;
  }

  private contexto(obraId: number, firmante: string | null, ahoraSeg: number): Contexto {
    const { obra, hitos } = this.buscar(obraId);
    return { obra, hitos, roles: rolesDe(obra, firmante), ahora: ahoraSeg * 1000 };
  }

  private exigir(resultado: Resultado, funcion: string): void {
    if (!resultado.permitida) {
      throw new Error(`Escenario mock inválido: ${funcion} → ${describirMotivo(resultado.motivo).titulo}`);
    }
  }

  private nuevoLedger(): number {
    const segun = this.ledgerInicial + Math.ceil((this.reloj - this.inicio) / SEG_POR_LEDGER);
    this.ultimoLedger = Math.max(segun, this.ultimoLedger + 1);
    this.reloj = this.inicio + (this.ultimoLedger - this.ledgerInicial) * SEG_POR_LEDGER;
    return this.reloj;
  }

  private emitir(tipo: TipoEvento, obra: number, hito: number | null, datos: Record<string, unknown>): void {
    const ledger = this.ultimoLedger;
    const toid = (BigInt(ledger) << 32n) | (1n << 12n);
    this.eventosEmitidos.push({
      id: `${toid.toString().padStart(19, "0")}-${"0".padStart(10, "0")}`,
      tipo,
      obra_id: obra,
      hito,
      ledger,
      momento: aIso(this.reloj),
      datos,
    });
  }
}
