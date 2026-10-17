"use client";

import Link from "next/link";
import { useState } from "react";
import type { Obra } from "@/lib/api/tipos";
import { formatearMonto, porcentaje } from "@/lib/montos";
import { Icono } from "../ui/Icono";
import { EstadoInsignia, Insignia } from "../ui/Insignia";

export interface ResumenObra {
  obra: Obra;
  /** Hay algo que destrabar (lib/atencion). */
  requiereAtencion: boolean;
  /** La obra usa un token que no es el oficial de la demo. */
  tokenNoOficial: boolean;
}

type Filtro = "todas" | "activas" | "finalizadas" | "atencion";

function TarjetaObra({ resumen }: { resumen: ResumenObra }) {
  const { obra, requiereAtencion, tokenNoOficial } = resumen;
  const avance = obra.cantidad_hitos > 0 ? Math.round((obra.hitos_pagados / obra.cantidad_hitos) * 100) : 0;
  const simbolo = !tokenNoOficial;
  return (
    <li className={`tarjeta pila${tokenNoOficial ? " tarjeta--peligro" : ""}`} style={{ padding: 22, gap: 16 }}>
      <div className="fila fila--entre fila--arriba">
        <h3>
          <Link href={`/obras/${obra.id}`} style={{ color: "var(--tx)" }}>
            {obra.nombre}
          </Link>
        </h3>
        <EstadoInsignia estado={obra.estado} />
      </div>
      {(requiereAtencion || tokenNoOficial) && (
        <div className="fila" style={{ gap: 8 }}>
          {requiereAtencion && (
            <Insignia tono="ob" icono="alerta">
              Requiere atención
            </Insignia>
          )}
          {tokenNoOficial && (
            <Insignia tono="er" icono="alerta">
              Token no oficial
            </Insignia>
          )}
        </div>
      )}
      <div className="pila pila--chica">
        <div className="fila fila--entre chico">
          <span className="suave">Avance</span>
          <b>
            {obra.hitos_pagados} de {obra.cantidad_hitos} hitos pagados
          </b>
        </div>
        <div className="barra" role="img" aria-label={`${avance} % de avance`}>
          <i className="barra__pagado" style={{ width: `${avance}%` }} />
        </div>
      </div>
      <dl className="pila pila--chica chico" style={{ margin: 0, gap: 8 }}>
        <div className="fila fila--entre">
          <dt className="suave">Presupuesto</dt>
          <dd style={{ margin: 0 }}>
            <b className="tabular">{formatearMonto(obra.monto_vigente, simbolo)}</b>
          </dd>
        </div>
        <div className="fila fila--entre">
          <dt className="suave">Fondos bloqueados</dt>
          <dd style={{ margin: 0 }}>
            <b className="tabular">{formatearMonto(obra.saldo, simbolo)}</b>
          </dd>
        </div>
        <div className="fila fila--entre">
          <dt className="suave">Pagado</dt>
          <dd style={{ margin: 0 }} className="tabular">
            {formatearMonto(obra.pagado, simbolo)} ({porcentaje(obra.pagado, obra.monto_vigente).toLocaleString("es-AR")} %)
          </dd>
        </div>
      </dl>
      <div className="fila" style={{ marginTop: "auto" }}>
        <Link className="enlace" href={`/obras/${obra.id}`}>
          Ver la obra{" "}<span className="visualmente-oculto">{obra.nombre}</span>
        </Link>
        <Link className="enlace" href={`/panel/${obra.id}`}>
          Panel de firmantes{" "}<span className="visualmente-oculto">de {obra.nombre}</span>
        </Link>
      </div>
    </li>
  );
}

/** Buscador, filtros por estado y tarjetas de obra. */
export function ListaObras({ obras }: { obras: ResumenObra[] }) {
  const [texto, setTexto] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const cuenta: Record<Filtro, number> = {
    todas: obras.length,
    activas: obras.filter((o) => o.obra.estado === "Activa").length,
    finalizadas: obras.filter((o) => o.obra.estado === "Finalizada").length,
    atencion: obras.filter((o) => o.requiereAtencion).length,
  };
  const buscado = texto.trim().toLocaleLowerCase("es-AR");
  const visibles = obras.filter(
    (o) =>
      (filtro === "todas" ||
        (filtro === "activas" && o.obra.estado === "Activa") ||
        (filtro === "finalizadas" && o.obra.estado === "Finalizada") ||
        (filtro === "atencion" && o.requiereAtencion)) &&
      (!buscado || o.obra.nombre.toLocaleLowerCase("es-AR").includes(buscado)),
  );
  const filtros: [Filtro, string][] = [
    ["todas", "Todas"],
    ["activas", "Activas"],
    ["finalizadas", "Finalizadas"],
    ["atencion", "Requieren atención"],
  ];

  return (
    <>
      <section className="pila" style={{ gap: 16 }} aria-label="Buscar y filtrar obras">
        <div className="buscador">
          <Icono nombre="buscar" />
          <label htmlFor="buscar-obra" className="visualmente-oculto">
            Buscar obra por nombre
          </label>
          <input
            id="buscar-obra"
            className="entrada"
            type="search"
            placeholder="Buscar obra por nombre"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>
        <div role="group" aria-label="Filtrar por estado" className="fila" style={{ gap: 10 }}>
          {filtros.map(([clave, nombre]) => (
            <button key={clave} type="button" className="seg" aria-pressed={filtro === clave} onClick={() => setFiltro(clave)}>
              {nombre} · {cuenta[clave]}
            </button>
          ))}
        </div>
      </section>

      {obras.length === 0 ? (
        <p className="suave">Todavía no hay obras registradas.</p>
      ) : visibles.length === 0 ? (
        <p className="suave" role="status">
          Ninguna obra coincide con la búsqueda.
        </p>
      ) : (
        <ul className="grilla lista-limpia grilla--estirar" aria-label="Obras">
          {visibles.map((o) => (
            <TarjetaObra key={o.obra.id} resumen={o} />
          ))}
        </ul>
      )}
    </>
  );
}
