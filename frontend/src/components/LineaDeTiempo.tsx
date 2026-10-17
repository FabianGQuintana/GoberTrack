import { cliente } from "@/lib/api/cliente";
import type { Evento, Obra, TipoEvento } from "@/lib/api/tipos";
import { describirEvento } from "@/lib/eventos";
import { urlTransaccion } from "@/lib/stellar/config";
import { formatearFechaHora } from "@/lib/tiempo";
import { Huella } from "./ui/Huella";
import { Icono, type NombreIcono } from "./ui/Icono";

const ESTILO: Record<TipoEvento, { icono: NombreIcono; fondo: string }> = {
  ObraCreada: { icono: "escudo", fondo: "fondo-pr" },
  ObraFondeada: { icono: "wallet", fondo: "fondo-pr" },
  HitoDeclarado: { icono: "archivo", fondo: "fondo-ev" },
  HitoAprobado: { icono: "check", fondo: "fondo-ap" },
  HitoObjetado: { icono: "alerta", fondo: "fondo-ob" },
  ObjecionResuelta: { icono: "firma", fondo: "fondo-pe" },
  PagoLiberado: { icono: "check-circulo", fondo: "fondo-pa" },
  AdendaRegistrada: { icono: "firma", fondo: "fondo-pe" },
};

/** "Qué pasó, en orden": los eventos del contrato, del más nuevo al más viejo, en castellano. */
export function LineaDeTiempo({ eventos, obra }: { eventos: readonly Evento[]; obra: Obra }) {
  if (eventos.length === 0) {
    return <p className="suave">Todavía no hay eventos registrados para esta obra.</p>;
  }
  const enlazar = cliente.modo === "api";
  return (
    <ol className="linea" aria-label="Eventos de la obra, del más reciente al más antiguo">
      {[...eventos].reverse().map((evento) => {
        const { titulo, detalle, archivo } = describirEvento(evento, obra);
        const estilo = ESTILO[evento.tipo] ?? { icono: "info", fondo: "fondo-pe" };
        const url = enlazar ? urlTransaccion(evento.tx_hash) : null;
        return (
          <li key={evento.id} className="linea__item">
            <span className={`linea__icono ${estilo.fondo}`} aria-hidden="true">
              <Icono nombre={estilo.icono} />
            </span>
            <div className="pila pila--chica" style={{ gap: 2 }}>
              <h3 style={{ fontSize: 15 }}>{titulo}</h3>
              <p className="chico suave">
                <time dateTime={evento.momento}>{formatearFechaHora(evento.momento)}</time> · ledger {evento.ledger}
              </p>
              {detalle && <p className="chico">{detalle}</p>}
              {archivo && (
                <span className="fila chico" style={{ gap: 8 }}>
                  {archivo.etiqueta}: <Huella valor={archivo.hash} etiqueta={`huella de ${archivo.etiqueta.toLowerCase()}`} />
                </span>
              )}
              {url ? (
                <a className="enlace" href={url} target="_blank" rel="noreferrer" style={{ minHeight: 36 }}>
                  Ver transacción
                  {" "}<span className="visualmente-oculto">{evento.tx_hash} (abre el explorador)</span>
                  <Icono nombre="externo" tamano={14} />
                </a>
              ) : (
                <span className="chico suave">
                  Transacción <Huella valor={evento.tx_hash} etiqueta="identificador de la transacción" />
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
