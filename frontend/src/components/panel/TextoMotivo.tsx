import { describirMotivo, type Motivo } from "@/lib/reglas";

/** Por qué una acción no aplica: el nombre del error que devolvería el contrato y su explicación. */
export function TextoMotivo({ motivo, id, prefijo = "No aplica" }: { motivo: Motivo; id?: string; prefijo?: string }) {
  const { titulo, detalle } = describirMotivo(motivo);
  return (
    <p className="motivo" id={id}>
      {prefijo}: <strong>{titulo}</strong>. {detalle}
    </p>
  );
}
