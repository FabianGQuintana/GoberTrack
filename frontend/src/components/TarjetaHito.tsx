import { cliente } from "@/lib/api/cliente";
import type { Evento, Hito, Obra } from "@/lib/api/tipos";
import { declaraciones, momentosDeHito } from "@/lib/historial";
import { formatearMonto } from "@/lib/montos";
import { finPeriodo, hitoAnteriorOk } from "@/lib/reglas";
import { formatearFechaHora } from "@/lib/tiempo";
import { CuentaRegresiva } from "./CuentaRegresiva";
import { EstadoPago } from "./EstadoPago";
import { NombreArchivo } from "./obra/NombreArchivo";
import { Huella } from "./ui/Huella";
import { Icono } from "./ui/Icono";
import { EstadoInsignia } from "./ui/Insignia";

function Linea({ icono, tono, children }: { icono: "check" | "alerta" | "guion" | "reloj" | "candado" | "check-circulo"; tono?: "ok" | "alerta" | "suave"; children: React.ReactNode }) {
  const clase = tono === "ok" ? "" : tono === "alerta" ? "marca-alerta" : "suave";
  return (
    <span className={`con-icono ${clase}`}>
      <Icono nombre={icono} tamano={16} style={tono === "ok" ? { color: "var(--apf)" } : undefined} />
      <span>{children}</span>
    </span>
  );
}

const cuando = (momento?: string) => (momento ? ` · ${formatearFechaHora(momento)}` : "");

/** Archivo de una huella: nombre (si el almacén lo tiene), huella copiable y enlace para abrirlo. */
export function ArchivoDeHuella({ hash, alternativo, etiqueta }: { hash: string; alternativo: string; etiqueta: string }) {
  return (
    <span className="fila chico" style={{ gap: 8 }}>
      <Icono nombre="archivo" tamano={16} />
      <NombreArchivo hash={hash} alternativo={alternativo} avisarFaltante />
      <Huella valor={hash} etiqueta={`huella de ${etiqueta}`} />
      <a className="enlace" href={cliente.urlEvidencia(hash)} target="_blank" rel="noreferrer" style={{ minHeight: 32 }}>
        Abrir{" "}<span className="visualmente-oculto">{etiqueta}</span>
        <Icono nombre="externo" tamano={14} />
      </a>
    </span>
  );
}

/** Situación del pago del hito, para la tarjeta pública (se actualiza sola al vencer el período). */
function SituacionPago({ hito, obra, hitos }: { hito: Hito; obra: Obra; hitos: readonly Hito[] }) {
  if (hito.estado === "Pendiente" && !hitoAnteriorOk(hitos, hito.indice)) {
    return <Linea icono="candado">Bloqueado: espera que se apruebe el hito {hito.indice}</Linea>;
  }
  return (
    <span className="con-icono--arriba">
      <Icono nombre={hito.estado === "Pagado" ? "check-circulo" : "wallet"} tamano={16} />
      <span>
        <span className="visualmente-oculto">Pago:</span>{" "}
        <span>
          <EstadoPago hito={hito} obra={obra} />
        </span>
      </span>
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
  const n = hito.indice + 1;
  const m = momentosDeHito(eventos, obra, hito.indice);
  const declarado = hito.momento_declaracion !== null;
  const fin = finPeriodo(hito, obra);
  // Historial de declaraciones (contract.md §3.3: se puede re-declarar con la misma evidencia). Se saca
  // la última si es la vigente, y se marca cada hash que repite el de la declaración anterior.
  const decl = declaraciones(eventos, hito.indice).map((d, i, todas) => ({
    ...d,
    repiteAnterior: i > 0 && todas[i - 1].hash === d.hash,
  }));
  const hayVigente = hito.evidencia_hash !== null && decl.at(-1)?.hash === hito.evidencia_hash;
  const anteriores = hayVigente ? decl.slice(0, -1) : decl;
  const repite = hayVigente && (decl.at(-1)?.repiteAnterior ?? false);

  return (
    <li className={`tarjeta tarjeta--chica hito${hito.estado === "Objetado" ? " tarjeta--alerta" : ""}`}>
      <div>
        <div className="etiqueta" aria-hidden="true">
          Hito {n}
        </div>
        <h3>
          <span className="visualmente-oculto">Hito {n}:</span>{" "}
          {hito.descripcion}
        </h3>
      </div>
      <EstadoInsignia estado={hito.estado} />
      <b className="tabular">
        {formatearMonto(hito.monto_vigente, true)}
        {hito.monto_original !== hito.monto_vigente && (
          <span className="chico suave" style={{ fontWeight: 400 }}>
            {" "}
            (original: {formatearMonto(hito.monto_original, true)})
          </span>
        )}
      </b>

      <div className="pila pila--chica chico">
        {declarado || hito.estado === "Pagado" ? (
          <>
            {hito.aprobo_inspector ? (
              <Linea icono="check" tono="ok">
                Inspector aprobó{cuando(m.inspector)}
              </Linea>
            ) : (
              <Linea icono="guion">Inspector: sin revisar</Linea>
            )}
            {hito.aprobo_veedor ? (
              <Linea icono="check" tono="ok">
                {hito.veedor_por_arbitro ? `Veedor: el árbitro rechazó su objeción${cuando(m.resuelta?.momento)}` : `Veedor aprobó${cuando(m.veedor)}`}
              </Linea>
            ) : hito.estado === "Objetado" ? (
              <Linea icono="alerta" tono="alerta">
                Veedor objetó{cuando(m.objetado)}
              </Linea>
            ) : (
              <Linea icono="guion">Veedor: sin decidir</Linea>
            )}
            {fin !== null && hito.estado !== "Pagado" && hito.estado !== "Objetado" && (
              <span className="con-icono--arriba suave">
                <Icono nombre="reloj" tamano={16} />
                <span>
                  Período de objeción: <CuentaRegresiva fin={fin} variante="texto" />
                </span>
              </span>
            )}
          </>
        ) : (
          <>
            <Linea icono="guion">Inspector: sin revisar</Linea>
            <Linea icono="guion">Veedor: sin revisar</Linea>
          </>
        )}
        <SituacionPago hito={hito} obra={obra} hitos={hitos} />
      </div>

      <div className="hito__pie pila pila--chica">
        {hito.evidencia_hash ? (
          <ArchivoDeHuella hash={hito.evidencia_hash} alternativo="Evidencia declarada" etiqueta={`la evidencia del hito ${n}`} />
        ) : (
          <span className="con-icono chico suave">
            <Icono nombre="archivo" tamano={16} />
            Todavía sin evidencia
          </span>
        )}
        {repite && (
          <span className="aviso aviso--alerta chico" style={{ padding: "8px 10px" }}>
            <Icono nombre="alerta" tamano={16} />
            Misma evidencia que la declaración anterior.
          </span>
        )}
        {hito.motivo_objecion_hash && (
          <ArchivoDeHuella hash={hito.motivo_objecion_hash} alternativo="Motivo de la objeción" etiqueta={`el motivo de la objeción del hito ${n}`} />
        )}
        {anteriores.length > 0 && (
          <details className="detalles chico">
            <summary>Declaraciones anteriores ({anteriores.length})</summary>
            <ul className="lista-limpia pila pila--chica" style={{ marginTop: 6 }}>
              {anteriores.map((d) => (
                <li key={`${d.hash}-${d.momento}`} className="fila" style={{ gap: 8 }}>
                  <span className="suave">{formatearFechaHora(d.momento)}</span>
                  <Huella valor={d.hash} etiqueta="huella de una declaración anterior" />
                  <a className="enlace" href={cliente.urlEvidencia(d.hash)} target="_blank" rel="noreferrer" style={{ minHeight: 32 }}>
                    Abrir{" "}<span className="visualmente-oculto">la evidencia de esa declaración</span>
                  </a>
                  {d.repiteAnterior && <span className="marca-alerta">(misma evidencia que la declaración anterior)</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </li>
  );
}
