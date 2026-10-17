import { describirMotivo, type Motivo as MotivoRegla } from "@/lib/reglas";
import { Icono, type NombreIcono } from "./Icono";

/** Una línea de motivo debajo de una acción deshabilitada, con ícono de candado (o el que se pida). */
export function LineaMotivo({ id, icono = "candado", children }: { id?: string; icono?: NombreIcono; children: React.ReactNode }) {
  return (
    <p className="motivo" id={id}>
      <Icono nombre={icono} tamano={16} />
      <span>{children}</span>
    </p>
  );
}

/**
 * Por qué una acción no aplica, en castellano, con el código del error que devolvería el contrato
 * (o el error de autorización del host) para quien quiera verificarlo.
 */
export function MotivoRegla({ motivo, id }: { motivo: MotivoRegla; id?: string }) {
  const { titulo, detalle } = describirMotivo(motivo);
  return (
    <LineaMotivo id={id}>
      {detalle} <span className="mono">({titulo})</span>
    </LineaMotivo>
  );
}
