import type { Evento, Hito, Obra } from "@/lib/api/tipos";
import { historialEvidencia } from "@/lib/eventos";
import { formatearMonto } from "@/lib/montos";
import { hitoAnteriorOk } from "@/lib/reglas";
import { formatearMomento } from "@/lib/tiempo";
import { CuentaRegresiva } from "./CuentaRegresiva";
import { EnlaceArchivo } from "./EnlaceArchivo";
import { EstadoEtiqueta } from "./EstadoEtiqueta";
import { EstadoPago } from "./EstadoPago";

function Aprobaciones({ hito }: { hito: Hito }) {
  const veedor = hito.aprobo_veedor ? (
    <span className="marca-si">
      ✓ {hito.veedor_por_arbitro ? "Veedor por resolución del árbitro" : "Veedor aprobó"}
    </span>
  ) : hito.estado === "Objetado" ? (
    <span className="marca-objeto">✗ Veedor objetó (espera al árbitro)</span>
  ) : (
    <span className="marca-no">Veedor: sin decidir</span>
  );
  return (
    <span className="aprobaciones">
      {hito.aprobo_inspector ? (
        <span className="marca-si">✓ Inspector aprobó</span>
      ) : (
        <span className="marca-no">Inspector: sin aprobar</span>
      )}
      {veedor}
    </span>
  );
}

export function TarjetaHito({
  hito,
  obra,
  hitos,
  eventos,
}: {
  hito: Hito;
  obra: Obra;
  hitos: readonly Hito[];
  eventos: readonly Evento[];
}) {
  const numero = hito.indice + 1;
  const declarado = hito.momento_declaracion !== null;
  const bloqueado = hito.estado === "Pendiente" && !hitoAnteriorOk(hitos, hito.indice);
  // Historial de declaraciones (contract.md §3.3: se puede re-declarar con la misma evidencia).
  // Se saca solo la última, que es la vigente, y se marca cuando un hash repite el de la anterior.
  const declaraciones = historialEvidencia(eventos, hito.indice).map((d, i, todas) => ({
    ...d,
    repiteAnterior: i > 0 && todas[i - 1].hash === d.hash,
  }));
  const ultima = declaraciones.at(-1);
  const hayVigente = hito.evidencia_hash !== null && ultima?.hash === hito.evidencia_hash;
  const anteriores = hayVigente ? declaraciones.slice(0, -1) : declaraciones;
  const vigenteRepite = hayVigente && ultima !== undefined && ultima.repiteAnterior;
  const idTitulo = `hito-${hito.indice}`;

  return (
    <li className={`tarjeta hito hito--${hito.estado}`}>
      <div className="fila fila--entre">
        <h3 id={idTitulo}>
          Hito {numero}: {hito.descripcion}
        </h3>
        <EstadoEtiqueta estado={hito.estado} />
      </div>
      <dl className="datos">
        <dt>Monto</dt>
        <dd>
          <span className="monto">{formatearMonto(hito.monto_vigente)}</span>
          {hito.monto_original !== hito.monto_vigente && (
            <span className="suave chico"> (original: {formatearMonto(hito.monto_original)})</span>
          )}
        </dd>

        {bloqueado && (
          <>
            <dt>Orden</dt>
            <dd>Bloqueado: el hito {numero - 1} todavía no está aprobado ni pagado.</dd>
          </>
        )}

        {(declarado || hito.estado === "Pagado") && (
          <>
            <dt>Aprobaciones</dt>
            <dd>
              <Aprobaciones hito={hito} />
            </dd>
          </>
        )}

        {declarado && hito.momento_declaracion && (
          <>
            <dt>Declarado</dt>
            <dd>{formatearMomento(hito.momento_declaracion)}</dd>
          </>
        )}

        {hito.fin_periodo_objecion && (
          <>
            <dt>Período de objeción</dt>
            <dd>
              <CuentaRegresiva fin={hito.fin_periodo_objecion} />
            </dd>
          </>
        )}

        {hito.evidencia_hash && (
          <>
            <dt>Evidencia (SHA-256)</dt>
            <dd>
              <EnlaceArchivo hash={hito.evidencia_hash} etiqueta="evidencia" />
              {vigenteRepite && (
                <span className="aviso aviso--alerta chico" style={{ display: "block", marginTop: "0.35rem" }}>
                  Misma evidencia que la declaración anterior.
                </span>
              )}
            </dd>
          </>
        )}

        {hito.motivo_objecion_hash && (
          <>
            <dt>Motivo de la objeción</dt>
            <dd>
              <EnlaceArchivo hash={hito.motivo_objecion_hash} etiqueta="motivo" />
            </dd>
          </>
        )}

        {anteriores.length > 0 && (
          <>
            <dt>Declaraciones anteriores</dt>
            <dd>
              <ul className="lista-limpia pila">
                {anteriores.map((d) => (
                  <li key={`${d.hash}-${d.momento}`} className="chico">
                    {formatearMomento(d.momento)}:{" "}
                    <EnlaceArchivo hash={d.hash} etiqueta="evidencia" completo={false} />
                    {d.repiteAnterior && <span className="suave"> (misma evidencia que la declaración anterior)</span>}
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}

        <dt>Pago</dt>
        <dd>
          <EstadoPago hito={hito} obra={obra} />
        </dd>
      </dl>
    </li>
  );
}
