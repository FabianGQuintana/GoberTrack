import { cliente } from "@/lib/api/cliente";
import { abreviarHash } from "@/lib/hash";

/**
 * Hash SHA-256 de un archivo con el enlace a GET /evidencia/{sha256}, para que cualquiera lo descargue,
 * recalcule el hash y lo compare con el registrado en la cadena.
 */
export function EnlaceArchivo({
  hash,
  etiqueta = "archivo",
  completo = true,
}: {
  hash: string;
  etiqueta?: string;
  /** false: muestra el hash abreviado (el completo queda en el título y en el texto para lectores). */
  completo?: boolean;
}) {
  return (
    <span>
      <code title={hash}>
        {completo ? hash : <span aria-hidden="true">{abreviarHash(hash)}</span>}
        {!completo && <span className="visualmente-oculto">{hash}</span>}
      </code>{" "}
      <a href={cliente.urlEvidencia(hash)} download>
        Descargar {etiqueta}
        <span className="visualmente-oculto"> (SHA-256 {abreviarHash(hash)})</span>
      </a>
    </span>
  );
}
