import type { Evento, Hito, Obra } from "@/lib/api/tipos";
import type { Contexto } from "@/lib/reglas";
import type { ContextoEnvio } from "./envio";
import type { PedidoAccion } from "./ModalAccion";

/** Una obra con sus hitos, para las bandejas que cruzan obras ("Tu bandeja", "Tus obras"). */
export interface ObraConHitos {
  obra: Obra;
  hitos: Hito[];
}

/** Todo lo que necesita una vista de rol. */
export interface ContextoVista {
  obra: Obra;
  hitos: Hito[];
  eventos: Evento[];
  todas: ObraConHitos[];
  /** Contexto de las reglas (espejo del contrato) para la dirección que firmaría. */
  ctx: Contexto;
  direccion: string;
  /** ms: hora del ledger o del navegador. */
  ahora: number;
  /** Simular/firmar contra la red; null = solo vista previa. */
  envio: ContextoEnvio | null;
  abrir: (pedido: PedidoAccion) => void;
}

/** "Probar igual con el contrato": solo con red (si no, no hay contra qué probar). */
export function probador(v: ContextoVista, pedido: () => PedidoAccion): (() => void) | undefined {
  return v.envio ? () => v.abrir({ ...pedido(), soloSimular: true }) : undefined;
}
