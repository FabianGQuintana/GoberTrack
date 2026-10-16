"use client"; // Los límites de error tienen que ser componentes de cliente.

import { useEffect } from "react";

export default function ErrorDePagina({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="aviso aviso--peligro" role="alert">
      <h1>No se pudieron cargar los datos</h1>
      <p>
        Puede que el backend no esté disponible. Si estás usando el modo API, revisá que esté
        corriendo en la dirección de <code>NEXT_PUBLIC_API_URL</code>.
      </p>
      <button type="button" className="boton" onClick={() => retry()}>
        Reintentar
      </button>
    </div>
  );
}
