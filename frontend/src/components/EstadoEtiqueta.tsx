import type { EstadoHito, EstadoObra } from "@/lib/api/tipos";

const EXPLICACION: Record<EstadoHito | EstadoObra, string> = {
  Pendiente: "Todavía no se declaró terminado.",
  Evidencia: "El contratista presentó la evidencia; esperan las aprobaciones del inspector y del veedor.",
  Aprobado: "Tiene las dos aprobaciones; el pago se libera al terminar el período de objeción.",
  Objetado: "El veedor lo objetó: queda congelado hasta que resuelva el árbitro.",
  Pagado: "El pago ya se transfirió al contratista.",
  Activa: "La obra tiene hitos sin pagar.",
  Finalizada: "Todos los hitos están pagados.",
};

export function EstadoEtiqueta({ estado }: { estado: EstadoHito | EstadoObra }) {
  return (
    <span className={`estado estado--${estado}`} title={EXPLICACION[estado]}>
      {estado}
    </span>
  );
}

export function explicarEstado(estado: EstadoHito | EstadoObra): string {
  return EXPLICACION[estado];
}
