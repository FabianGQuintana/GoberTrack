import { cliente } from "@/lib/api/cliente";
import type { Evento, Obra } from "@/lib/api/tipos";
import { urlTransaccion } from "@/lib/stellar/config";
import { describirEvento } from "@/lib/eventos";
import { abreviarHash } from "@/lib/hash";
import { formatearMomento } from "@/lib/tiempo";
import { EnlaceArchivo } from "./EnlaceArchivo";

/** Eventos de la obra en orden cronológico, en castellano. */
export function LineaDeTiempo({ eventos, obra }: { eventos: readonly Evento[]; obra: Obra }) {
  if (eventos.length === 0) {
    return <p className="suave">Todavía no hay eventos registrados para esta obra.</p>;
  }
  return (
    <ol className="linea">
      {eventos.map((evento) => {
        const { titulo, detalle, archivo } = describirEvento(evento, obra);
        return (
          <li key={evento.id} className="linea__item">
            <p className="chico suave" style={{ marginBottom: "0.15rem" }}>
              <time dateTime={evento.momento}>{formatearMomento(evento.momento)}</time> · ledger{" "}
              {evento.ledger}
            </p>
            <h3>{titulo}</h3>
            {detalle && <p style={{ marginBottom: "0.25rem" }}>{detalle}</p>}
            {archivo && (
              <p className="chico" style={{ marginBottom: "0.25rem" }}>
                {archivo.etiqueta}: <EnlaceArchivo hash={archivo.hash} etiqueta={archivo.etiqueta.toLowerCase()} completo={false} />
              </p>
            )}
            <p className="chico suave">
              Transacción{" "}
              {cliente.modo === "api" && urlTransaccion(evento.tx_hash) ? (
                <a href={urlTransaccion(evento.tx_hash) ?? undefined} target="_blank" rel="noreferrer">
                  <code title={evento.tx_hash}>{abreviarHash(evento.tx_hash)}</code>
                  <span className="visualmente-oculto"> (abre el explorador)</span>
                </a>
              ) : (
                <code title={evento.tx_hash}>{abreviarHash(evento.tx_hash)}</code>
              )}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
