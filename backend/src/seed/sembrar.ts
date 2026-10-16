import type { DatabaseSync } from 'node:sqlite';
import { enTransaccion } from '../db/conexion.ts';
import {
  borrarEstadoIndexado,
  guardarEvento,
  guardarHito,
  guardarObra,
} from '../db/repositorio.ts';
import { detectarTipo, guardarArchivoEvidencia } from '../evidencia/almacen.ts';
import { generarPdf, generarPng } from './archivos.ts';
import {
  ARCHIVOS,
  DURACION_ESCENARIO,
  LEDGER_INICIAL,
  pasosEscenario,
  type ClaveArchivo,
  type DefinicionArchivo,
} from './escenario.ts';
import { SimuladorContrato } from './simulador.ts';

export interface OpcionesSiembra {
  dirEvidencia: string;
  /** Fin de la línea de tiempo simulada. Por defecto, el momento actual. */
  ahora?: Date;
}

export interface ResumenSiembra {
  obras: { id: number; nombre: string; estados: string[] }[];
  hitos: number;
  eventos: number;
  evidencias: number;
}

function generarArchivo(def: DefinicionArchivo): Buffer {
  return def.tipo === 'png' ? generarPng(def.descripcion, def.color) : generarPdf(def.titulo, def.lineas);
}

/**
 * DATO SIMULADO. Reemplaza obras, hitos y eventos por el escenario de ejemplo (src/seed/escenario.ts),
 * con una línea de tiempo que termina antes de `ahora`, y guarda sus archivos de evidencia como si
 * se hubieran subido por POST /evidencia. No borra las evidencias subidas de verdad.
 */
export async function sembrar(db: DatabaseSync, opciones: OpcionesSiembra): Promise<ResumenSiembra> {
  const ahoraSeg = Math.floor((opciones.ahora ?? new Date()).getTime() / 1000);

  const hash = {} as Record<ClaveArchivo, string>;
  for (const [clave, def] of Object.entries(ARCHIVOS) as [ClaveArchivo, DefinicionArchivo][]) {
    const contenido = generarArchivo(def);
    const tipo = detectarTipo(contenido);
    if (!tipo) throw new Error(`archivo de ejemplo con tipo no permitido: ${def.nombre}`);
    const evidencia = await guardarArchivoEvidencia(
      db,
      opciones.dirEvidencia,
      contenido,
      tipo,
      def.nombre,
      ahoraSeg,
    );
    hash[clave] = evidencia.sha256;
  }

  const inicio = ahoraSeg - DURACION_ESCENARIO;
  const sim = new SimuladorContrato(inicio, LEDGER_INICIAL);
  // Orden estable: los pasos de distintas obras se intercalan por momento.
  for (const paso of pasosEscenario(hash).sort((a, b) => a.en - b.en)) {
    sim.irA(inicio + paso.en);
    paso.hacer(sim);
  }
  if (sim.ultimoMomento > ahoraSeg) throw new Error('el escenario termina después de `ahora`');

  const obras = sim.obrasSimuladas;
  const eventos = sim.eventos;
  enTransaccion(db, () => {
    borrarEstadoIndexado(db);
    for (const { obra, hitos } of obras) {
      guardarObra(db, obra);
      for (const hito of hitos) guardarHito(db, obra.id, hito);
    }
    for (const evento of eventos) guardarEvento(db, evento);
  });

  return {
    obras: obras.map(({ obra, hitos }) => ({
      id: obra.id,
      nombre: obra.nombre,
      estados: hitos.map((h) => h.estado),
    })),
    hitos: obras.reduce((n, o) => n + o.hitos.length, 0),
    eventos: eventos.length,
    evidencias: Object.keys(hash).length,
  };
}
