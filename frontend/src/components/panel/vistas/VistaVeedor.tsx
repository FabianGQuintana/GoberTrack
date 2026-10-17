"use client";

import { useState } from "react";
import type { Hito } from "@/lib/api/tipos";
import { momentosDeHito } from "@/lib/historial";
import { evaluarAprobar, evaluarObjetar, finPeriodo } from "@/lib/reglas";
import { formatearFechaHora } from "@/lib/tiempo";
import { CuentaRegresiva } from "../../CuentaRegresiva";
import { Icono } from "../../ui/Icono";
import { Insignia } from "../../ui/Insignia";
import { BotonAccion } from "../BotonAccion";
import { CajaArchivo, FilaBandeja } from "../comunes";
import { probador, type ContextoVista } from "../contexto";
import { HASH_DE_PRUEBA } from "../envio";
import { pedidoAprobar, pedidoObjetar } from "../pedidos";
import { SubidaEvidencia } from "../SubidaEvidencia";
import { TarjetaProximaAccion } from "../TarjetaProximaAccion";

const puedeDecidir = (h: Hito) =>
  (h.estado === "Evidencia" || h.estado === "Aprobado") && !h.aprobo_veedor && !h.objecion_usada;

function Bandeja({ v }: { v: ContextoVista }) {
  const mias = v.todas.filter((o) => o.obra.veedor.toUpperCase() === v.direccion.toUpperCase());
  return (
    <section className="tarjeta pila pila--chica" aria-labelledby="titulo-bandeja">
      <h2 id="titulo-bandeja" style={{ marginBottom: 8 }}>
        Tu bandeja
      </h2>
      <ul className="lista-limpia">
        {mias.map(({ obra, hitos }) => {
          const h = hitos.find(puedeDecidir) ?? hitos.find((x) => x.estado !== "Pagado");
          const titulo = `${obra.nombre}${h ? ` · Hito ${h.indice + 1}` : ""}`;
          const enlace = `/panel/${obra.id}?vista=veedor`;
          const actual = obra.id === v.obra.id;
          if (!h) return <FilaBandeja key={obra.id} titulo={titulo} detalle="Todos los hitos están pagados" derecha={<Insignia tono="pa" icono="check-circulo">Finalizada</Insignia>} enlace={enlace} actual={actual} />;
          const fin = finPeriodo(h, obra);
          if (puedeDecidir(h)) {
            return (
              <FilaBandeja
                key={obra.id}
                titulo={titulo}
                detalle={`${h.descripcion} · falta tu decisión`}
                derecha={fin !== null ? <CuentaRegresiva fin={fin} /> : <Insignia tono="ev">Para decidir</Insignia>}
                enlace={enlace}
                actual={actual}
              />
            );
          }
          if (h.estado === "Objetado") {
            return <FilaBandeja key={obra.id} titulo={titulo} detalle="Objetaste: espera la decisión del árbitro" derecha={<Insignia tono="ob" icono="alerta">Objetado</Insignia>} enlace={enlace} actual={actual} />;
          }
          if (h.aprobo_veedor) {
            return <FilaBandeja key={obra.id} titulo={titulo} detalle="Ya decidiste sobre esta declaración" derecha={<Insignia tono="ap" icono="check">Decidido</Insignia>} enlace={enlace} actual={actual} />;
          }
          return <FilaBandeja key={obra.id} titulo={titulo} detalle="Todavía no fue declarado" derecha={<Insignia tono="pe" icono="reloj">Sin novedades</Insignia>} enlace={enlace} actual={actual} />;
        })}
      </ul>
    </section>
  );
}

export function VistaVeedor({ v }: { v: ContextoVista }) {
  const [hashMotivo, setHashMotivo] = useState<string | null>(null);
  const hito = v.hitos.find(puedeDecidir);

  if (!hito) {
    const objetado = v.hitos.find((h) => h.estado === "Objetado");
    return (
      <>
        <TarjetaProximaAccion
          titulo={objetado ? `Tu objeción del hito ${objetado.indice + 1} espera al árbitro` : "No tenés decisiones pendientes en esta obra"}
          descripcion={
            objetado
              ? "Mientras el árbitro no resuelva, el hito no se puede pagar. No hay nada para firmar ahora."
              : "Cuando el contratista declare un hito, vas a poder aprobarlo u objetarlo durante el período de objeción."
          }
        />
        <Bandeja v={v} />
      </>
    );
  }

  const n = hito.indice + 1;
  const m = momentosDeHito(v.eventos, v.obra, hito.indice);
  const fin = finPeriodo(hito, v.obra);
  const aprobar = evaluarAprobar(v.ctx, hito.indice);
  const objetar = evaluarObjetar(v.ctx, hito.indice);

  return (
    <>
      <TarjetaProximaAccion
        titulo={`Decidí sobre el hito ${n}: ${hito.descripcion}`}
        descripcion={
          <>
            El contratista declaró el hito{m.declarado ? ` el ${formatearFechaHora(m.declarado)}` : ""}
            {hito.aprobo_inspector ? " y el inspector ya lo aprobó" : ""}. Podés aprobarlo u objetarlo; objetar solo mientras
            corre el período de objeción.
          </>
        }
        lateral={fin !== null ? <CuentaRegresiva fin={fin} variante="grande" titulo="Te queda para objetar" /> : undefined}
      >
        <div className="grilla grilla--estirar" style={{ ["--min" as string]: "380px", gap: 20 }}>
          <div className="caja pila" style={{ gap: 14 }}>
            <h3>Aprobar</h3>
            <p className="suave medio">Confirmás que la evidencia te parece correcta. Tu aprobación se suma a la del inspector.</p>
            <div style={{ marginTop: "auto" }}>
              <BotonAccion
                etiqueta={`Aprobar hito ${n}`}
                icono="check"
                resultado={aprobar}
                alAccionar={() => v.abrir(pedidoAprobar(v.obra, hito, v.direccion, "veedor"))}
                alProbar={probador(v, () => pedidoAprobar(v.obra, hito, v.direccion, "veedor"))}
              />
            </div>
          </div>
          <div className="caja pila" style={{ gap: 14 }}>
            <h3>Objetar</h3>
            {objetar.permitida && (
              <SubidaEvidencia titulo="Subí el documento con el motivo" alObtenerHash={setHashMotivo} enFila />
            )}
            <div style={{ marginTop: "auto" }}>
              <BotonAccion
                etiqueta={`Objetar hito ${n}`}
                icono="alerta"
                variante="peligro"
                resultado={objetar}
                faltante={hashMotivo ? null : "Falta subir el documento con el motivo"}
                alAccionar={() => hashMotivo && v.abrir(pedidoObjetar(v.obra, hito, hashMotivo))}
                alProbar={probador(v, () => pedidoObjetar(v.obra, hito, hashMotivo ?? HASH_DE_PRUEBA))}
              />
            </div>
          </div>
        </div>
        <div className="aviso aviso--alerta">
          <Icono nombre="candado" />
          <p className="medio">
            <b>Decidís una sola vez por declaración.</b> Una vez que firmás, no se puede cambiar. Si el contratista vuelve a
            declarar el hito, podés decidir de nuevo.
          </p>
        </div>
      </TarjetaProximaAccion>

      <div className="grilla" style={{ ["--min" as string]: "440px" }}>
        <section className="tarjeta pila" aria-labelledby="titulo-evidencia" style={{ gap: 14 }}>
          <h2 id="titulo-evidencia">Evidencia declarada</h2>
          {hito.evidencia_hash && <CajaArchivo hash={hito.evidencia_hash} etiqueta="Archivo" alternativo="Evidencia declarada" />}
          <ul className="lista-limpia">
            <li className="renglon">
              <span className="suave">Declarado por el contratista</span>
              <b>{m.declarado ? formatearFechaHora(m.declarado) : "—"}</b>
            </li>
            <li className="renglon">
              <span className="suave">Inspector</span>
              {hito.aprobo_inspector ? (
                <Insignia tono="ap" icono="check">
                  Aprobó{m.inspector ? ` · ${formatearFechaHora(m.inspector)}` : ""}
                </Insignia>
              ) : (
                <Insignia tono="pe" icono="reloj">
                  Sin revisar
                </Insignia>
              )}
            </li>
            <li className="renglon">
              <span className="suave">Veedor (vos)</span>
              <Insignia tono="ev" icono="reloj">
                Falta tu decisión
              </Insignia>
            </li>
          </ul>
          <p className="motivo">
            <Icono nombre="info" tamano={16} />
            <span>
              Podés comprobar la huella del archivo en el verificador de la página pública. Eso prueba que no cambió; no
              prueba que la obra esté bien hecha.
            </span>
          </p>
        </section>

        <div className="pila pila--grande">
          <section className="tarjeta pila" aria-labelledby="titulo-decisiones" style={{ gap: 14 }}>
            <h2 id="titulo-decisiones">Qué pasa con cada decisión</h2>
            <div className="con-icono--arriba">
              <span className="circulo circulo--chico fondo-ap" aria-hidden="true">
                <Icono nombre="check" tamano={16} />
              </span>
              <p className="medio">
                <b>Si aprobás:</b> tu aprobación queda registrada. Cuando termine el período y se cumplan las demás condiciones,
                cualquiera podrá liberar el pago al contratista.
              </p>
            </div>
            <div className="con-icono--arriba">
              <span className="circulo circulo--chico fondo-ob" aria-hidden="true">
                <Icono nombre="alerta" tamano={16} />
              </span>
              <p className="medio">
                <b>Si objetás:</b> el hito pasa a Objetado y decide el árbitro. Si acepta tu objeción, el hito vuelve a Pendiente
                y el contratista tiene que declararlo de nuevo. Si la rechaza, cuenta como tu aprobación.
              </p>
            </div>
          </section>
          <Bandeja v={v} />
        </div>
      </div>
    </>
  );
}
