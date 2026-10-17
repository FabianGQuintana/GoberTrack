"use client";

import { useState } from "react";
import { cliente } from "@/lib/api/cliente";
import type { Hito } from "@/lib/api/tipos";
import { condicionesDePago } from "@/lib/condiciones";
import { momentosDeHito } from "@/lib/historial";
import { aUnidades, formatearMonto } from "@/lib/montos";
import { evaluarDeclarar, evaluarLiberarPago } from "@/lib/reglas";
import { urlTransaccion } from "@/lib/stellar/config";
import { formatearFechaHora } from "@/lib/tiempo";
import { Icono } from "../../ui/Icono";
import { EstadoInsignia } from "../../ui/Insignia";
import { BotonAccion } from "../BotonAccion";
import { probador, type ContextoVista } from "../contexto";
import { HASH_DE_PRUEBA } from "../envio";
import { pedidoDeclarar, pedidoLiberar } from "../pedidos";
import { SubidaEvidencia } from "../SubidaEvidencia";
import { TarjetaProximaAccion } from "../TarjetaProximaAccion";

function QueFaltaParaCobrar({ v, hito }: { v: ContextoVista; hito: Hito }) {
  const condiciones = condicionesDePago(v.obra, v.hitos, hito, v.ahora, v.eventos);
  const cumplidas = condiciones.filter((c) => c.cumplida).length;
  const n = hito.indice + 1;
  return (
    <section className="tarjeta pila pila--chica" aria-labelledby="titulo-cobrar">
      <div className="fila fila--entre fila--arriba">
        <div>
          <div className="etiqueta">Qué falta para cobrar</div>
          <h2 id="titulo-cobrar">
            Hito {n} · {formatearMonto(hito.monto_vigente, true)}
          </h2>
        </div>
        <EstadoInsignia estado={hito.estado} />
      </div>
      <p className="chico suave" style={{ margin: "8px 0 12px" }}>
        Se cumplen {cumplidas} de {condiciones.length} condiciones. Para cobrar tienen que cumplirse todas.
      </p>
      <ul className="lista-limpia" aria-label={`Condiciones para cobrar el hito ${n}`}>
        {condiciones.map((c) => (
          <li key={c.clave} className="condicion">
            <span className={`condicion__marca ${c.cumplida ? "fondo-ap" : "fondo-ob"}`} aria-hidden="true">
              <Icono nombre={c.cumplida ? "check" : "cerrar"} tamano={16} />
            </span>
            <div>
              <b>{c.titulo}</b>
              <span className="visualmente-oculto">{c.cumplida ? ": se cumple." : ": todavía no se cumple."}</span>
              <div className="chico suave">{c.detalle}</div>
            </div>
          </li>
        ))}
      </ul>
      <div style={{ paddingTop: 14, borderTop: "1px solid var(--ln)" }}>
        <BotonAccion
          etiqueta={`Liberar pago del hito ${n}`}
          variante="secundario"
          resultado={evaluarLiberarPago(v.ctx, hito.indice)}
          alAccionar={() => v.abrir(pedidoLiberar(v.obra, hito))}
          alProbar={probador(v, () => pedidoLiberar(v.obra, hito))}
        />
      </div>
    </section>
  );
}

function titularSinDeclarar(v: ContextoVista): { titulo: string; descripcion: string } {
  const objetado = v.hitos.find((h) => h.estado === "Objetado");
  if (objetado) {
    return {
      titulo: `Esperá la decisión del árbitro sobre el hito ${objetado.indice + 1}`,
      descripcion: `El veedor objetó el hito ${objetado.indice + 1} y todavía no hay resolución. No hay nada para firmar ahora.`,
    };
  }
  const pagable = v.hitos.find((h) => evaluarLiberarPago(v.ctx, h.indice).permitida);
  if (pagable) {
    return {
      titulo: `Ya se puede liberar el pago del hito ${pagable.indice + 1}`,
      descripcion: "Se cumplen todas las condiciones. Cualquiera puede liberar el pago, y el dinero va siempre a tu cuenta.",
    };
  }
  const enCurso = v.hitos.find((h) => h.estado === "Evidencia" || h.estado === "Aprobado");
  if (enCurso) {
    return {
      titulo: `Esperá las aprobaciones del hito ${enCurso.indice + 1}`,
      descripcion: "Declaraste el hito. Ahora tienen que aprobarlo el inspector y el veedor, y tiene que terminar el período de objeción.",
    };
  }
  return { titulo: "Cobraste todos los hitos de esta obra", descripcion: "No queda nada por declarar." };
}

export function VistaContratista({ v }: { v: ContextoVista }) {
  const [hash, setHash] = useState<string | null>(null);
  const declarable = v.hitos.find((h) => evaluarDeclarar(v.ctx, h.indice).permitida);
  const siguientePendiente = v.hitos.find((h) => h.estado === "Pendiente");
  const objetivo = v.hitos.find((h) => h.estado !== "Pagado" && h.estado !== "Pendiente") ?? v.hitos.find((h) => h.estado !== "Pagado");
  const pagados = v.hitos.filter((h) => h.estado === "Pagado");
  const cobrado = pagados.reduce((s, h) => s + aUnidades(h.monto_vigente), 0n);
  const falta = v.hitos.filter((h) => h.estado !== "Pagado").reduce((s, h) => s + aUnidades(h.monto_vigente), 0n);
  const sinDeclarar = titularSinDeclarar(v);

  return (
    <>
      {declarable ? (
        <TarjetaProximaAccion
          titulo={`Declará el hito ${declarable.indice + 1}: ${declarable.descripcion}`}
          descripcion="Subí la evidencia del avance. Cuando firmes, su huella queda registrada en la red y empieza el período de objeción."
        >
          <div className="grilla grilla--estirar" style={{ ["--min" as string]: "380px", gap: 20 }}>
            <SubidaEvidencia titulo={`Arrastrá la evidencia del hito ${declarable.indice + 1}`} alObtenerHash={setHash} />
            <div className="pila" style={{ justifyContent: "center" }}>
              <BotonAccion
                etiqueta={`Declarar hito ${declarable.indice + 1}`}
                resultado={evaluarDeclarar(v.ctx, declarable.indice)}
                faltante={hash ? null : "Primero subí la evidencia para obtener su huella"}
                alAccionar={() => hash && v.abrir(pedidoDeclarar(v.obra, declarable, hash))}
              />
            </div>
          </div>
        </TarjetaProximaAccion>
      ) : (
        <TarjetaProximaAccion titulo={sinDeclarar.titulo} descripcion={sinDeclarar.descripcion}>
          {siguientePendiente && (
            <BotonAccion
              etiqueta={`Declarar hito ${siguientePendiente.indice + 1}`}
              resultado={evaluarDeclarar(v.ctx, siguientePendiente.indice)}
              alAccionar={() => undefined}
              alProbar={probador(v, () => pedidoDeclarar(v.obra, siguientePendiente, HASH_DE_PRUEBA))}
            />
          )}
        </TarjetaProximaAccion>
      )}

      <div className="grilla" style={{ ["--min" as string]: "440px" }}>
        <div className="pila pila--grande">
          {objetivo && <QueFaltaParaCobrar v={v} hito={objetivo} />}
        </div>
        <div className="pila pila--grande">
          <section className="tarjeta pila pila--chica" aria-labelledby="titulo-cobros">
            <h2 id="titulo-cobros" style={{ marginBottom: 8 }}>
              Historial de cobros
            </h2>
            <ul className="lista-limpia">
              {pagados.length === 0 && <li className="renglon chico suave">Todavía no cobraste ningún hito.</li>}
              {pagados.map((h) => {
                const m = momentosDeHito(v.eventos, v.obra, h.indice);
                const url = cliente.modo === "api" && m.txPago ? urlTransaccion(m.txPago) : null;
                return (
                  <li key={h.indice} className="renglon renglon--arriba">
                    <div>
                      <b>
                        Hito {h.indice + 1} · {h.descripcion}
                      </b>
                      <div className="chico suave">{h.momento_pago ? formatearFechaHora(h.momento_pago) : "Pagado"}</div>
                      {url && (
                        <a className="enlace" href={url} target="_blank" rel="noreferrer" style={{ minHeight: 32 }}>
                          Ver transacción
                          <Icono nombre="externo" tamano={14} />
                        </a>
                      )}
                    </div>
                    <div className="pila pila--chica" style={{ alignItems: "flex-end" }}>
                      <b className="tabular">{formatearMonto(h.monto_vigente, true)}</b>
                      <EstadoInsignia estado="Pagado" />
                    </div>
                  </li>
                );
              })}
              <li className="renglon">
                <span className="suave">Total cobrado</span>
                <b className="tabular">{formatearMonto(cobrado, true)}</b>
              </li>
              <li className="renglon">
                <span className="suave">Falta cobrar</span>
                <b className="tabular">{formatearMonto(falta, true)}</b>
              </li>
            </ul>
          </section>

          <section className="tarjeta pila pila--chica" aria-labelledby="titulo-tus-hitos">
            <h2 id="titulo-tus-hitos" style={{ marginBottom: 8 }}>
              Tus hitos
            </h2>
            <ul className="lista-limpia">
              {v.hitos.map((h) => (
                <li key={h.indice} className="renglon">
                  <div>
                    <b>Hito {h.indice + 1}</b>
                    <div className="chico suave">{h.descripcion}</div>
                  </div>
                  <EstadoInsignia estado={h.estado} />
                </li>
              ))}
            </ul>
          </section>

          <div className="tarjeta con-icono--arriba" style={{ padding: "20px 24px" }}>
            <Icono nombre="info" style={{ color: "var(--pr)" }} />
            <p className="chico suave">
              Si el árbitro acepta una objeción, el hito vuelve a Pendiente y tenés que declararlo de nuevo, con la misma
              evidencia o con otra. Si repetís la misma, el tablero público lo marca.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
