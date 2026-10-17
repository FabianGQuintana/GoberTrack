// Las seis condiciones que exige el contrato para liberar el pago de un hito, explicadas en castellano
// para el contratista ("Qué falta para cobrar") y para quien mira la obra. Es una ayuda de lectura:
// el orden de validación y el error exacto los da `reglas.ts` (espejo de contract.md §3), y la regla
// la aplica el contrato.

import type { Hito, Obra } from "./api/tipos";
import { momentosDeHito, type MomentosHito } from "./historial";
import type { Evento } from "./api/tipos";
import { aUnidades, formatearMonto } from "./montos";
import { finPeriodo, hitoAnteriorOk } from "./reglas";
import { formatearFechaHora } from "./tiempo";

export type ClaveCondicion = "inspector" | "veedor" | "periodo" | "sin-objecion" | "anterior" | "saldo";

export interface Condicion {
  clave: ClaveCondicion;
  titulo: string;
  cumplida: boolean;
  detalle: string;
}

const conMomento = (texto: string, momento?: string) => (momento ? `${texto} · ${formatearFechaHora(momento)}` : texto);

export function condicionesDePago(
  obra: Obra,
  hitos: readonly Hito[],
  hito: Hito,
  ahora: number | null,
  eventos: readonly Evento[] = [],
): Condicion[] {
  const m: MomentosHito = momentosDeHito(eventos, obra, hito.indice);
  const declarado = hito.momento_declaracion !== null;
  const fin = finPeriodo(hito, obra);
  const periodoCumplido = fin !== null && (hito.pagable || (ahora !== null && ahora >= fin));
  const saldo = aUnidades(obra.saldo);
  const necesita = aUnidades(hito.monto_vigente);
  const anterior = hitos.find((h) => h.indice === hito.indice - 1);

  const veedor: Condicion = {
    clave: "veedor",
    titulo: "Aprobó el veedor, o el árbitro rechazó su objeción",
    cumplida: hito.aprobo_veedor,
    detalle: hito.aprobo_veedor
      ? hito.veedor_por_arbitro
        ? conMomento("El árbitro rechazó la objeción del veedor", m.resuelta?.momento)
        : conMomento("El veedor aprobó", m.veedor)
      : hito.estado === "Objetado"
        ? `El veedor objetó${m.objetado ? ` el ${formatearFechaHora(m.objetado)}` : ""}. Falta la decisión del árbitro.`
        : declarado
          ? "Falta la decisión del veedor."
          : "Todavía no se declaró el hito.",
  };

  return [
    {
      clave: "inspector",
      titulo: "Aprobó el inspector",
      cumplida: hito.aprobo_inspector,
      detalle: hito.aprobo_inspector
        ? conMomento("El inspector aprobó", m.inspector)
        : declarado
          ? "Falta la aprobación del inspector."
          : "Todavía no se declaró el hito.",
    },
    veedor,
    {
      clave: "periodo",
      titulo: "Terminó el período de objeción",
      cumplida: periodoCumplido,
      detalle:
        fin === null
          ? "Empieza cuando el contratista declara el hito."
          : periodoCumplido
            ? `Terminó el ${formatearFechaHora(fin)}`
            : `Termina el ${formatearFechaHora(fin)}`,
    },
    {
      clave: "sin-objecion",
      titulo: "No hay ninguna objeción abierta",
      cumplida: hito.estado !== "Objetado",
      detalle: hito.estado === "Objetado" ? "Hay una objeción abierta esperando al árbitro." : "No hay objeciones abiertas.",
    },
    {
      clave: "anterior",
      titulo: "El hito anterior ya está aprobado o pagado",
      cumplida: hitoAnteriorOk(hitos, hito.indice),
      detalle:
        hito.indice === 0
          ? "Es el primer hito."
          : hitoAnteriorOk(hitos, hito.indice)
            ? `El hito ${hito.indice} está ${anterior?.estado === "Pagado" ? "pagado" : "aprobado"}.`
            : `El hito ${hito.indice} todavía no está aprobado.`,
    },
    {
      clave: "saldo",
      titulo: "Hay saldo depositado suficiente",
      cumplida: saldo >= necesita,
      detalle: `Hay ${formatearMonto(saldo, true)} y el hito necesita ${formatearMonto(necesita, true)}.`,
    },
  ];
}
