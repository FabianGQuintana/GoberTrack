"use client";

import Link from "next/link";
import { cliente } from "@/lib/api/cliente";
import type { Hito } from "@/lib/api/tipos";
import { evaluarLiberarPago } from "@/lib/reglas";
import { formatearMonto } from "@/lib/montos";
import { formatearFechaHora } from "@/lib/tiempo";
import { NombreArchivo } from "../obra/NombreArchivo";
import { HuellaExpandible } from "../ui/Huella";
import { Icono } from "../ui/Icono";
import { BotonAccion } from "./BotonAccion";
import { probador, type ContextoVista } from "./contexto";
import { pedidoLiberar } from "./pedidos";

/** Caja con el archivo declarado (o el motivo): nombre, huella completa a pedido y enlace para abrirlo. */
export function CajaArchivo({
  hash,
  etiqueta,
  alternativo,
  pie,
}: {
  hash: string;
  etiqueta: string;
  alternativo: string;
  pie?: React.ReactNode;
}) {
  return (
    <div className="caja pila" style={{ gap: 10 }}>
      <span className="etiqueta">{etiqueta}</span>
      <div className="fila" style={{ gap: 10 }}>
        <span className="circulo fondo-ev" aria-hidden="true">
          <Icono nombre="archivo" tamano={24} />
        </span>
        <b style={{ flex: 1, minWidth: 160 }}>
          <NombreArchivo hash={hash} alternativo={alternativo} avisarFaltante />
        </b>
      </div>
      <div className="fila chico suave" style={{ gap: 8 }}>
        Huella <HuellaExpandible valor={hash} etiqueta={`huella de ${alternativo.toLowerCase()}`} />
      </div>
      {pie}
      <a className="boton" href={cliente.urlEvidencia(hash)} target="_blank" rel="noreferrer" style={{ alignSelf: "flex-start" }}>
        Abrir archivo{" "}<span className="visualmente-oculto">({alternativo})</span>
        <Icono nombre="externo" tamano={16} />
      </a>
    </div>
  );
}

/** Fila de una bandeja que cruza obras: título, detalle y un estado o acción a la derecha. */
export function FilaBandeja({
  titulo,
  detalle,
  derecha,
  enlace,
  actual = false,
}: {
  titulo: string;
  detalle: React.ReactNode;
  derecha: React.ReactNode;
  enlace?: string;
  actual?: boolean;
}) {
  return (
    <li className="renglon">
      <div>
        <b>{enlace && !actual ? <Link href={enlace}>{titulo}</Link> : titulo}</b>
        {actual && <span className="chico suave"> · estás acá</span>}
        <div className="chico suave">{detalle}</div>
      </div>
      <div className="fila" style={{ justifyContent: "flex-end" }}>
        {derecha}
      </div>
    </li>
  );
}

/**
 * "Cualquiera puede liberar el pago": los hitos de esta obra que ya cumplen todas las condiciones,
 * para cualquier cuenta conectada (con o sin rol). El dinero va siempre al contratista.
 */
export function PagosParaLiberar({ v }: { v: ContextoVista }) {
  const listos = v.hitos.filter((h) => evaluarLiberarPago(v.ctx, h.indice).permitida);
  if (listos.length === 0) return null;
  return (
    <section className="tarjeta pila" aria-labelledby="titulo-liberar">
      <div className="pila pila--chica">
        <h2 id="titulo-liberar">Pagos listos para liberar</h2>
        <p className="suave chico">Cumplen todas las reglas del contrato. Cualquiera puede ejecutarlos; el dinero va siempre al contratista.</p>
      </div>
      <ul className="lista-limpia">
        {listos.map((h: Hito) => (
          <li key={h.indice} className="renglon">
            <div>
              <b>
                Hito {h.indice + 1} · {formatearMonto(h.monto_vigente, true)}
              </b>
              <div className="chico suave">
                {h.descripcion}
                {h.momento_aprobacion_completa ? ` · aprobado el ${formatearFechaHora(h.momento_aprobacion_completa)}` : ""}
              </div>
            </div>
            <BotonAccion
              etiqueta={`Liberar pago del hito ${h.indice + 1}`}
              resultado={evaluarLiberarPago(v.ctx, h.indice)}
              alAccionar={() => v.abrir(pedidoLiberar(v.obra, h))}
              alProbar={probador(v, () => pedidoLiberar(v.obra, h))}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
