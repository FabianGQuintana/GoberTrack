import type { EstadoHito, EstadoObra } from "@/lib/api/tipos";
import { Icono, type NombreIcono } from "./Icono";

export type TonoInsignia = "pe" | "ev" | "ap" | "ob" | "pa" | "er" | "pr";

export function Insignia({
  tono,
  icono,
  children,
  title,
}: {
  tono: TonoInsignia;
  icono?: NombreIcono;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span className={`insignia insignia--${tono}`} title={title}>
      {icono && <Icono nombre={icono} tamano={16} />}
      {children}
    </span>
  );
}

const ESTILO_HITO: Record<EstadoHito, { tono: TonoInsignia; icono: NombreIcono }> = {
  Pendiente: { tono: "pe", icono: "reloj" },
  Evidencia: { tono: "ev", icono: "archivo" },
  Aprobado: { tono: "ap", icono: "check" },
  Objetado: { tono: "ob", icono: "alerta" },
  Pagado: { tono: "pa", icono: "check-circulo" },
};

export const EXPLICACION_ESTADO: Record<EstadoHito | EstadoObra, string> = {
  Pendiente: "Todavía no se declaró terminado.",
  Evidencia: "El contratista presentó la evidencia; esperan las aprobaciones del inspector y del veedor.",
  Aprobado: "Tiene las dos aprobaciones; el pago se libera al terminar el período de objeción.",
  Objetado: "El veedor lo objetó: queda congelado hasta que resuelva el árbitro.",
  Pagado: "El pago ya se transfirió al contratista.",
  Activa: "La obra tiene hitos sin pagar.",
  Finalizada: "Todos los hitos están pagados.",
};

/** Estado de un hito o de una obra: siempre color + ícono + texto. */
export function EstadoInsignia({ estado }: { estado: EstadoHito | EstadoObra }) {
  if (estado === "Activa") {
    return (
      <Insignia tono="pr" title={EXPLICACION_ESTADO.Activa}>
        Activa
      </Insignia>
    );
  }
  if (estado === "Finalizada") {
    return (
      <Insignia tono="ap" icono="check" title={EXPLICACION_ESTADO.Finalizada}>
        Finalizada
      </Insignia>
    );
  }
  const { tono, icono } = ESTILO_HITO[estado];
  return (
    <Insignia tono={tono} icono={icono} title={EXPLICACION_ESTADO[estado]}>
      {estado}
    </Insignia>
  );
}

/** Clase de color del punto del stepper y de la línea de tiempo según el estado del hito. */
export function tonoDeEstado(estado: EstadoHito): TonoInsignia {
  return ESTILO_HITO[estado].tono;
}

export function iconoDeEstado(estado: EstadoHito): NombreIcono {
  return ESTILO_HITO[estado].icono;
}
