/** Bloque destacado "Tu próxima acción": una sola acción principal por pantalla. */
export function TarjetaProximaAccion({
  titulo,
  descripcion,
  lateral,
  children,
}: {
  titulo: string;
  descripcion?: React.ReactNode;
  lateral?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="tarjeta tarjeta--grande tarjeta--accion pila pila--grande" aria-label="Tu próxima acción">
      <div className="fila fila--entre fila--arriba" style={{ gap: 24 }}>
        <div className="pila pila--chica" style={{ maxWidth: 700, gap: 8 }}>
          <span className="etiqueta" style={{ color: "var(--pr)" }}>
            Tu próxima acción
          </span>
          <h2>{titulo}</h2>
          {descripcion && <p className="suave">{descripcion}</p>}
        </div>
        {lateral}
      </div>
      {children}
    </section>
  );
}
