"use client";

import { useState } from "react";
import type { Hito } from "@/lib/api/tipos";
import { momentosDeHito } from "@/lib/historial";
import type { Decision } from "@/lib/invocaciones";
import { aUnidades, formatearMonto } from "@/lib/montos";
import { evaluarResolver, finPeriodo, hitoAnteriorOk } from "@/lib/reglas";
import { formatearDuracion, formatearFechaHora } from "@/lib/tiempo";
import { Icono } from "../../ui/Icono";
import { Insignia } from "../../ui/Insignia";
import { BotonAccion } from "../BotonAccion";
import { CajaArchivo, FilaBandeja } from "../comunes";
import { probador, type ContextoVista } from "../contexto";
import { consecuenciaDecision, pedidoResolver } from "../pedidos";
import { TarjetaProximaAccion } from "../TarjetaProximaAccion";

function EstadoDelHito({ v, hito }: { v: ContextoVista; hito: Hito }) {
  const n = hito.indice + 1;
  const m = momentosDeHito(v.eventos, v.obra, hito.indice);
  const fin = finPeriodo(hito, v.obra);
  const anterior = v.hitos.find((h) => h.indice === hito.indice - 1);
  const alcanza = aUnidades(v.obra.saldo) >= aUnidades(hito.monto_vigente);
  return (
    <section className="tarjeta pila pila--chica" aria-labelledby="titulo-estado-hito">
      <h2 id="titulo-estado-hito" style={{ marginBottom: 8 }}>
        Estado del hito {n}
      </h2>
      <ul className="lista-limpia">
        <li className="renglon">
          <span className="suave">Monto</span>
          <b className="tabular">{formatearMonto(hito.monto_vigente, true)}</b>
        </li>
        <li className="renglon">
          <span className="suave">Inspector</span>
          {hito.aprobo_inspector ? (
            <Insignia tono="ap" icono="check">
              Aprobó{m.inspector ? ` · ${formatearFechaHora(m.inspector)}` : ""}
            </Insignia>
          ) : (
            <Insignia tono="pe" icono="reloj">
              Sin aprobar
            </Insignia>
          )}
        </li>
        <li className="renglon">
          <span className="suave">Veedor</span>
          <Insignia tono="ob" icono="alerta">
            Objetó{m.objetado ? ` · ${formatearFechaHora(m.objetado)}` : ""}
          </Insignia>
        </li>
        <li className="renglon">
          <span className="suave">Período de objeción</span>
          {fin !== null && fin <= v.ahora ? (
            <Insignia tono="ap" icono="check">
              Terminó {formatearFechaHora(fin)}
            </Insignia>
          ) : (
            <Insignia tono="ev" icono="reloj">
              {fin !== null ? `Termina ${formatearFechaHora(fin)}` : "Sin declaración"}
            </Insignia>
          )}
        </li>
        <li className="renglon">
          <span className="suave">Hito anterior</span>
          {hito.indice === 0 ? (
            <span className="chico suave">Es el primero</span>
          ) : hitoAnteriorOk(v.hitos, hito.indice) ? (
            <Insignia tono={anterior?.estado === "Pagado" ? "pa" : "ap"} icono="check">
              {anterior?.estado ?? "Aprobado"}
            </Insignia>
          ) : (
            <Insignia tono="pe" icono="candado">
              {anterior?.estado ?? "Pendiente"}
            </Insignia>
          )}
        </li>
        <li className="renglon">
          <span className="suave">Saldo depositado</span>
          <Insignia tono={alcanza ? "ap" : "ob"} icono={alcanza ? "check" : "alerta"}>
            {alcanza ? "Alcanza" : "No alcanza"} · {formatearMonto(v.obra.saldo, true)}
          </Insignia>
        </li>
      </ul>
    </section>
  );
}

export function VistaArbitro({ v }: { v: ContextoVista }) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const hito = v.hitos.find((h) => h.estado === "Objetado");
  const mias = v.todas.filter((o) => o.obra.arbitro.toUpperCase() === v.direccion.toUpperCase());
  const abiertas = mias.flatMap(({ obra, hitos }) => hitos.filter((h) => h.estado === "Objetado").map((h) => ({ obra, h })));

  const bandeja = (
    <section className="tarjeta pila pila--chica" aria-labelledby="titulo-bandeja">
      <h2 id="titulo-bandeja" style={{ marginBottom: 8 }}>
        Tu bandeja
      </h2>
      {abiertas.length > 0 ? (
        <ul className="lista-limpia">
          {abiertas.map(({ obra, h }) => (
            <FilaBandeja
              key={`${obra.id}-${h.indice}`}
              titulo={`${obra.nombre} · Hito ${h.indice + 1}`}
              detalle="Objeción abierta esperando tu decisión"
              derecha={
                <Insignia tono="ob" icono="alerta">
                  Para resolver
                </Insignia>
              }
              enlace={`/panel/${obra.id}?vista=arbitro`}
              actual={obra.id === v.obra.id}
            />
          ))}
        </ul>
      ) : (
        <p className="chico suave">No tenés objeciones abiertas.</p>
      )}
      <p className="chico suave" style={{ paddingTop: 12, borderTop: "1px solid var(--ln)" }}>
        Las objeciones que ya resolviste quedan en la línea de tiempo de cada obra.
      </p>
    </section>
  );

  if (!hito) {
    return (
      <>
        <TarjetaProximaAccion
          titulo="No hay objeciones para resolver en esta obra"
          descripcion="Si el veedor objeta un hito, lo vas a ver acá con la evidencia y el motivo, uno al lado del otro."
        />
        {bandeja}
      </>
    );
  }

  const n = hito.indice + 1;
  const m = momentosDeHito(v.eventos, v.obra, hito.indice);
  const fin = finPeriodo(hito, v.obra);
  const periodoTerminado = fin !== null && fin <= v.ahora;
  const resultado = evaluarResolver(v.ctx, hito.indice);
  const opciones: { valor: Decision; titulo: string }[] = [
    { valor: "Aceptar", titulo: "Aceptar la objeción" },
    { valor: "Rechazar", titulo: "Rechazar la objeción" },
  ];

  return (
    <>
      <TarjetaProximaAccion
        titulo={`Resolvé la objeción del hito ${n}: ${hito.descripcion}`}
        descripcion={`El veedor objetó este hito${m.objetado ? ` el ${formatearFechaHora(m.objetado)}` : ""}. Mientras no decidas, el hito no se puede pagar y los siguientes quedan en espera.`}
        lateral={
          m.objetado ? (
            <Insignia tono="ob" icono="reloj">
              Abierta hace {formatearDuracion(v.ahora - Date.parse(m.objetado))}
            </Insignia>
          ) : undefined
        }
      >
        <div className="grilla grilla--estirar" style={{ ["--min" as string]: "380px", gap: 20 }}>
          {hito.evidencia_hash && (
            <CajaArchivo
              hash={hito.evidencia_hash}
              etiqueta="Evidencia del contratista"
              alternativo="Evidencia declarada"
              pie={<span className="chico suave">Declarada{m.declarado ? ` el ${formatearFechaHora(m.declarado)}` : ""} por el contratista</span>}
            />
          )}
          {hito.motivo_objecion_hash && (
            <CajaArchivo
              hash={hito.motivo_objecion_hash}
              etiqueta="Motivo de la objeción"
              alternativo="Motivo de la objeción"
              pie={<span className="chico suave">Subido{m.objetado ? ` el ${formatearFechaHora(m.objetado)}` : ""} por el veedor</span>}
            />
          )}
        </div>

        <div className="pila" style={{ gap: 14 }}>
          <h3>¿Qué decidís?</h3>
          <div role="radiogroup" aria-label="Decisión del árbitro" className="grilla" style={{ ["--min" as string]: "380px", gap: 16 }}>
            {opciones.map((o) => (
              <button
                key={o.valor}
                type="button"
                className="opcion opcion--grande"
                role="radio"
                aria-checked={decision === o.valor}
                disabled={!resultado.permitida}
                onClick={() => setDecision(o.valor)}
              >
                <span className="con-icono" style={{ gap: 12 }}>
                  <span className="opcion__punto">{decision === o.valor && <Icono nombre="check" tamano={14} />}</span>
                  <b className="grande">{o.titulo}</b>
                </span>
                <span className="suave medio">{consecuenciaDecision(v.obra, hito, o.valor, periodoTerminado)}</span>
              </button>
            ))}
          </div>
          <BotonAccion
            etiqueta="Confirmar decisión"
            resultado={resultado}
            faltante={decision ? null : "Elegí Aceptar o Rechazar para continuar"}
            alAccionar={() => decision && v.abrir(pedidoResolver(v.obra, hito, decision, periodoTerminado))}
            alProbar={probador(v, () => pedidoResolver(v.obra, hito, decision ?? "Aceptar", periodoTerminado))}
          />
          <p className="motivo">
            <Icono nombre="info" tamano={16} />
            <span>Antes de firmar vas a ver un resumen de lo que va a pasar. La decisión queda registrada y no se puede cambiar.</span>
          </p>
        </div>
      </TarjetaProximaAccion>

      <div className="grilla" style={{ ["--min" as string]: "440px" }}>
        <EstadoDelHito v={v} hito={hito} />
        {bandeja}
      </div>
    </>
  );
}
