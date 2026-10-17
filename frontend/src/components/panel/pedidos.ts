// Cómo se le explica a la persona cada acción antes de firmar: pregunta, consecuencias y textos de
// éxito o rechazo. La invocación (función + argumentos) sale de lib/invocaciones, la misma que se
// envía al contrato.

import type { Hito, Obra } from "@/lib/api/tipos";
import { construirCrearObra, construirInvocacion, type DatosNuevaObra, type Decision } from "@/lib/invocaciones";
import { aUnidades, formatearMonto } from "@/lib/montos";
import { formatearPeriodo } from "@/lib/tiempo";
import type { PedidoAccion } from "./ModalAccion";

const NADA_SE_DESHACE = "No se puede deshacer.";

export function pedidoDeclarar(obra: Obra, hito: Hito, evidenciaHash: string, soloSimular = false): PedidoAccion {
  const n = hito.indice + 1;
  return {
    invocacion: construirInvocacion(obra, { accion: "declarar_hito", hito: hito.indice, evidenciaHash }),
    pregunta: `¿Declarar el hito ${n}?`,
    noSePuede: `No se puede declarar el hito ${n}`,
    contexto: `${obra.nombre} · Hito ${n}: ${hito.descripcion}`,
    consecuencias: [
      `Registrás en la red la huella ${evidenciaHash.slice(0, 4)}…${evidenciaHash.slice(-4)} del archivo de evidencia.`,
      `Empieza el período de objeción (${formatearPeriodo(obra.periodo_objecion_seg)}): el veedor puede objetar mientras corre.`,
      NADA_SE_DESHACE,
    ],
    confirmar: "Declarar y firmar",
    hecho: `La declaración del hito ${n} ya figura en la red.`,
    soloSimular,
  };
}

export function pedidoAprobar(
  obra: Obra,
  hito: Hito,
  firmante: string,
  rol: "inspector" | "veedor",
  soloSimular = false,
): PedidoAccion {
  const n = hito.indice + 1;
  return {
    invocacion: construirInvocacion(obra, { accion: "aprobar", hito: hito.indice, firmante, rolFirmante: rol }),
    pregunta: `¿Aprobar el hito ${n}?`,
    noSePuede: `No se puede aprobar el hito ${n}`,
    contexto: `${obra.nombre} · Hito ${n}: ${hito.descripcion}`,
    consecuencias: [
      `Vas a registrar tu aprobación como ${rol}.`,
      rol === "veedor"
        ? "Decidís una sola vez por declaración: después ya no vas a poder objetar este hito."
        : "Tu aprobación no se puede cambiar. Después el veedor tiene el período de objeción para aprobar u objetar.",
    ],
    confirmar: "Aprobar y firmar",
    hecho: "Tu aprobación ya figura en la red.",
    soloSimular,
  };
}

export function pedidoObjetar(obra: Obra, hito: Hito, motivoHash: string, soloSimular = false): PedidoAccion {
  const n = hito.indice + 1;
  return {
    invocacion: construirInvocacion(obra, { accion: "objetar", hito: hito.indice, motivoHash }),
    pregunta: `¿Objetar el hito ${n}?`,
    noSePuede: `No se puede objetar el hito ${n}`,
    contexto: `${obra.nombre} · Hito ${n}: ${hito.descripcion}`,
    consecuencias: [
      "El hito pasa a Objetado y el pago queda congelado hasta que decida el árbitro.",
      "Queda registrada en la red la huella del documento con el motivo.",
      "Decidís una sola vez por declaración.",
    ],
    confirmar: "Objetar y firmar",
    hecho: `Tu objeción del hito ${n} ya figura en la red.`,
    soloSimular,
  };
}

/** Qué pasa con cada decisión del árbitro, según el estado actual del hito. */
export function consecuenciaDecision(obra: Obra, hito: Hito, decision: Decision, periodoTerminado: boolean): string {
  const n = hito.indice + 1;
  if (decision === "Aceptar") {
    return `El hito ${n} vuelve a Pendiente. El contratista tiene que declararlo otra vez y empieza un nuevo período de objeción.`;
  }
  if (!hito.aprobo_inspector) {
    return `Cuenta como la aprobación del veedor. Todavía falta la del inspector para que el hito ${n} quede aprobado.`;
  }
  const saldoAlcanza = aUnidades(obra.saldo) >= aUnidades(hito.monto_vigente);
  return periodoTerminado && saldoAlcanza
    ? `Cuenta como la aprobación del veedor. Como el inspector ya aprobó y el período terminó, el hito queda listo para que cualquiera libere los ${formatearMonto(hito.monto_vigente, true)} al contratista.`
    : `Cuenta como la aprobación del veedor. Como el inspector ya aprobó, el hito queda Aprobado; el pago se podrá liberar cuando ${periodoTerminado ? "haya saldo suficiente" : "termine el período de objeción"}.`;
}

export function pedidoResolver(
  obra: Obra,
  hito: Hito,
  decision: Decision,
  periodoTerminado: boolean,
  soloSimular = false,
): PedidoAccion {
  const n = hito.indice + 1;
  return {
    invocacion: construirInvocacion(obra, { accion: "resolver_objecion", hito: hito.indice, decision }),
    pregunta: `¿${decision === "Aceptar" ? "Aceptar" : "Rechazar"} la objeción del hito ${n}?`,
    noSePuede: `No se puede resolver la objeción del hito ${n}`,
    contexto: `${obra.nombre} · Hito ${n}: ${hito.descripcion}`,
    consecuencias: [consecuenciaDecision(obra, hito, decision, periodoTerminado), "La decisión queda registrada y no se puede cambiar."],
    confirmar: "Confirmar y firmar",
    hecho: `Tu decisión sobre la objeción del hito ${n} ya figura en la red.`,
    soloSimular,
  };
}

export function pedidoLiberar(obra: Obra, hito: Hito, soloSimular = false): PedidoAccion {
  const n = hito.indice + 1;
  return {
    invocacion: construirInvocacion(obra, { accion: "liberar_pago", hito: hito.indice }),
    pregunta: `¿Liberar el pago del hito ${n}?`,
    noSePuede: `No se puede liberar el pago del hito ${n}`,
    contexto: obra.nombre,
    consecuencias: [
      `Se pagan ${formatearMonto(hito.monto_vigente, true)} desde el contrato.`,
      `El dinero va siempre al contratista de la obra (${obra.contratista.slice(0, 4)}…${obra.contratista.slice(-4)}), no a quien firma.`,
      NADA_SE_DESHACE,
    ],
    confirmar: "Liberar pago",
    hecho: `La red ya registró el pago del hito ${n}: ${formatearMonto(hito.monto_vigente, true)} al contratista.`,
    soloSimular,
  };
}

export function pedidoFondear(obra: Obra, monto: bigint, soloSimular = false): PedidoAccion {
  const despues = aUnidades(obra.saldo) + monto;
  return {
    invocacion: construirInvocacion(obra, { accion: "fondear", monto }),
    pregunta: `¿Depositar ${formatearMonto(monto, true)}?`,
    noSePuede: "No se puede depositar ese monto",
    contexto: obra.nombre,
    consecuencias: [
      "Sale de tu cuenta y queda bloqueado en el contrato para esta obra.",
      `El saldo bloqueado pasa de ${formatearMonto(obra.saldo, true)} a ${formatearMonto(despues, true)}.`,
      "Solo se puede usar para pagar los hitos de esta obra.",
    ],
    confirmar: "Depositar y firmar",
    hecho: `El depósito de ${formatearMonto(monto, true)} ya figura en la red.`,
    soloSimular,
  };
}

export function pedidoCrearObra(datos: DatosNuevaObra, total: bigint): PedidoAccion {
  return {
    invocacion: construirCrearObra(datos),
    pregunta: `¿Crear la obra «${datos.nombre}»?`,
    noSePuede: "No se puede crear la obra",
    contexto: `${datos.hitos.length} hitos · presupuesto total ${formatearMonto(total, true)}`,
    consecuencias: [
      "Los participantes, los hitos y los montos quedan registrados y no se pueden modificar.",
      `Período de objeción de ${formatearPeriodo(datos.periodoObjecion)} desde cada declaración.`,
      "Después vas a tener que depositar los fondos para que se puedan pagar los hitos.",
    ],
    confirmar: "Crear obra y firmar",
    hecho: "La obra ya figura en la red.",
  };
}
