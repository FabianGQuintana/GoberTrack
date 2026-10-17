"use client";

import Link from "next/link";
import type { Hito } from "@/lib/api/tipos";
import { momentosDeHito } from "@/lib/historial";
import { formatearMonto } from "@/lib/montos";
import { evaluarAprobar, finPeriodo, hitoAnteriorOk } from "@/lib/reglas";
import { formatearFechaHora } from "@/lib/tiempo";
import { CuentaRegresiva } from "../../CuentaRegresiva";
import { Icono } from "../../ui/Icono";
import { Insignia } from "../../ui/Insignia";
import { LineaMotivo } from "../../ui/Motivo";
import { BotonAccion } from "../BotonAccion";
import { CajaArchivo, FilaBandeja } from "../comunes";
import { probador, type ContextoVista } from "../contexto";
import { pedidoAprobar } from "../pedidos";
import { TarjetaProximaAccion } from "../TarjetaProximaAccion";

const paraRevisar = (h: Hito, hitos: readonly Hito[]) =>
  (h.estado === "Evidencia" || h.estado === "Aprobado") && !h.aprobo_inspector && hitoAnteriorOk(hitos, h.indice);

export function VistaInspector({ v }: { v: ContextoVista }) {
  const hito = v.hitos.find((h) => paraRevisar(h, v.hitos));
  const mias = v.todas.filter((o) => o.obra.inspector.toUpperCase() === v.direccion.toUpperCase());

  return (
    <>
      {hito ? (
        <ProximaRevision v={v} hito={hito} />
      ) : (
        <TarjetaProximaAccion
          titulo="No tenés hitos para revisar en esta obra"
          descripcion="Cuando el contratista declare un hito, lo vas a ver acá con su evidencia para aprobarlo."
        />
      )}

      <section className="tarjeta tarjeta--grande pila pila--chica" aria-labelledby="titulo-bandeja">
        <h2 id="titulo-bandeja" style={{ marginBottom: 8 }}>
          Tu bandeja
        </h2>
        <ul className="lista-limpia">
          {mias.map(({ obra, hitos }) => {
            const h = hitos.find((x) => paraRevisar(x, hitos)) ?? hitos.find((x) => x.estado !== "Pagado");
            const actual = obra.id === v.obra.id;
            const enlace = `/panel/${obra.id}?vista=inspector`;
            if (!h) {
              return <FilaBandeja key={obra.id} titulo={obra.nombre} detalle="Todos los hitos están pagados" derecha={<Insignia tono="pa" icono="check-circulo">Finalizada</Insignia>} enlace={enlace} actual={actual} />;
            }
            const titulo = `${obra.nombre} · Hito ${h.indice + 1}`;
            if (paraRevisar(h, hitos)) {
              return (
                <FilaBandeja
                  key={obra.id}
                  titulo={titulo}
                  detalle={`Declarado${h.momento_declaracion ? ` el ${formatearFechaHora(h.momento_declaracion)}` : ""} · ${formatearMonto(h.monto_vigente, true)}`}
                  derecha={
                    actual ? (
                      <Insignia tono="ev" icono="archivo">
                        Para revisar
                      </Insignia>
                    ) : (
                      <Link className="boton boton--primario" href={enlace}>
                        Revisar{" "}<span className="visualmente-oculto">el hito {h.indice + 1} de {obra.nombre}</span>
                      </Link>
                    )
                  }
                  enlace={enlace}
                  actual={actual}
                />
              );
            }
            const motivo = h.aprobo_inspector
              ? "Ya aprobaste este hito"
              : h.estado === "Objetado"
                ? "Tiene una objeción abierta"
                : "El contratista todavía no declaró el hito";
            return (
              <FilaBandeja
                key={obra.id}
                titulo={titulo}
                detalle={h.descripcion}
                derecha={<LineaMotivo>{motivo}</LineaMotivo>}
                enlace={enlace}
                actual={actual}
              />
            );
          })}
        </ul>
      </section>
    </>
  );
}

function ProximaRevision({ v, hito }: { v: ContextoVista; hito: Hito }) {
  const n = hito.indice + 1;
  const m = momentosDeHito(v.eventos, v.obra, hito.indice);
  const fin = finPeriodo(hito, v.obra);
  return (
    <TarjetaProximaAccion
      titulo={`Revisá el hito ${n} de ${v.obra.nombre}`}
      descripcion={`El contratista declaró el hito${m.declarado ? ` el ${formatearFechaHora(m.declarado)}` : ""}. Mirá la evidencia y, si te parece correcta, aprobalo.`}
      lateral={
        <Insignia tono="ev" icono="archivo">
          Evidencia · {formatearMonto(hito.monto_vigente, true)}
        </Insignia>
      }
    >
      <div className="grilla grilla--estirar" style={{ ["--min" as string]: "380px", gap: 20 }}>
        {hito.evidencia_hash && <CajaArchivo hash={hito.evidencia_hash} etiqueta="Evidencia declarada" alternativo="Evidencia declarada" />}
        <div className="pila" style={{ justifyContent: "space-between", gap: 16 }}>
          <div className="pila">
            <h3>Qué pasa si aprobás</h3>
            <p className="suave medio">
              Tu aprobación queda registrada y no se puede cambiar. Después el veedor tiene el período de objeción para aprobar u
              objetar.
            </p>
            {fin !== null && (
              <span className="con-icono chico suave">
                <Icono nombre="reloj" tamano={16} />
                Período de objeción: <CuentaRegresiva fin={fin} />
              </span>
            )}
          </div>
          <div className="pila pila--chica">
            <BotonAccion
              etiqueta={`Aprobar hito ${n}`}
              icono="check"
              resultado={evaluarAprobar(v.ctx, hito.indice)}
              alAccionar={() => v.abrir(pedidoAprobar(v.obra, hito, v.direccion, "inspector"))}
              alProbar={probador(v, () => pedidoAprobar(v.obra, hito, v.direccion, "inspector"))}
            />
            <span className="chico suave">Vas a ver un resumen antes de firmar en Freighter.</span>
          </div>
        </div>
      </div>
    </TarjetaProximaAccion>
  );
}
