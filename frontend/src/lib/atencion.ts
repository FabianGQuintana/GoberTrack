// "Requiere atención": situaciones de una obra que alguien tiene que destrabar. Se calculan en el
// frontend a partir del estado y de la línea de tiempo, sin pasar por la API de alertas: el OpenAPI
// congelado (v1.0.1) solo admite alertas de tipo `Sobrecosto`. Son avisos de lectura, no reglas: no
// cambian lo que el contrato permite.

import type { Evento, Hito, Obra } from "./api/tipos";
import { declaraciones, momentosDeHito } from "./historial";
import { aUnidades, formatearMonto } from "./montos";
import { finPeriodo } from "./reglas";
import { formatearFechaHora } from "./tiempo";

export type TipoAviso =
  | "objecion-abierta"
  | "pago-sin-liberar"
  | "veedor-sin-decidir"
  | "evidencia-no-disponible"
  | "misma-evidencia"
  | "saldo-insuficiente";

export interface Aviso {
  tipo: TipoAviso;
  /** Índice del hito (0…), o null si es de la obra. */
  hito: number | null;
  titulo: string;
  detalle: string;
}

export interface OpcionesAtencion {
  /** ms Unix. Sin reloj (null) no se evalúan los avisos que dependen del período. */
  ahora: number | null;
  /** Hashes declarados cuyo archivo no está en el almacén de evidencias (lo averigua el navegador). */
  evidenciasFaltantes?: ReadonlySet<string>;
}

export function avisosDeObra(
  obra: Obra,
  hitos: readonly Hito[],
  eventos: readonly Evento[],
  { ahora, evidenciasFaltantes }: OpcionesAtencion,
): Aviso[] {
  const avisos: Aviso[] = [];
  const ordenados = [...hitos].sort((a, b) => a.indice - b.indice);

  for (const h of ordenados) {
    const n = h.indice + 1;
    const m = momentosDeHito(eventos, obra, h.indice);
    if (h.estado === "Objetado") {
      avisos.push({
        tipo: "objecion-abierta",
        hito: h.indice,
        titulo: "Hay una objeción abierta esperando al árbitro",
        detalle:
          `El veedor objetó el hito ${n}${m.objetado ? ` el ${formatearFechaHora(m.objetado)}` : ""}. ` +
          "Mientras no se resuelva, ese hito no se puede pagar y los siguientes quedan en espera.",
      });
    }
    if (h.estado === "Aprobado" && h.pagable) {
      avisos.push({
        tipo: "pago-sin-liberar",
        hito: h.indice,
        titulo: "Hay un hito listo para pagar que nadie liberó",
        detalle: `El hito ${n} cumple todas las condiciones. Cualquiera puede liberar el pago, que va siempre al contratista.`,
      });
    }
    const fin = finPeriodo(h, obra);
    if (
      ahora !== null &&
      fin !== null &&
      ahora >= fin &&
      (h.estado === "Evidencia" || h.estado === "Aprobado") &&
      !h.aprobo_veedor &&
      !h.objecion_usada
    ) {
      avisos.push({
        tipo: "veedor-sin-decidir",
        hito: h.indice,
        titulo: "El veedor no decidió y el período de objeción ya terminó",
        detalle: `Hito ${n}: el veedor ya no puede objetar, pero sin su aprobación el pago queda trabado.`,
      });
    }
    if (h.evidencia_hash && evidenciasFaltantes?.has(h.evidencia_hash)) {
      avisos.push({
        tipo: "evidencia-no-disponible",
        hito: h.indice,
        titulo: "Se declaró un hito, pero el archivo de evidencia no está disponible",
        detalle: `La huella del hito ${n} está registrada en la red, pero el archivo no está en el almacén de evidencias: nadie puede revisarlo.`,
      });
    }
    const decl = declaraciones(eventos, h.indice);
    const vigente = decl.at(-1);
    const previa = decl.at(-2);
    if (vigente && previa && vigente.hash === previa.hash && h.evidencia_hash === vigente.hash) {
      avisos.push({
        tipo: "misma-evidencia",
        hito: h.indice,
        titulo: "El contratista volvió a declarar un hito con la misma evidencia",
        detalle: `Hito ${n}: la nueva declaración usa el mismo archivo que la anterior, que había sido objetada.`,
      });
    }
  }

  const proximo = ordenados.find((h) => h.estado !== "Pagado");
  if (proximo && aUnidades(obra.saldo) < aUnidades(proximo.monto_vigente)) {
    avisos.push({
      tipo: "saldo-insuficiente",
      hito: proximo.indice,
      titulo: "El saldo depositado no alcanza para el próximo pago",
      detalle: `El hito ${proximo.indice + 1} necesita ${formatearMonto(proximo.monto_vigente, true)} y hay ${formatearMonto(obra.saldo, true)} bloqueados.`,
    });
  }
  return avisos;
}
