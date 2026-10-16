import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { AvisoToken } from "@/components/AvisoToken";
import { EnVivo } from "@/components/EnVivo";
import { EstadoEtiqueta } from "@/components/EstadoEtiqueta";
import { LineaDeTiempo } from "@/components/LineaDeTiempo";
import { ResumenObra } from "@/components/ResumenObra";
import { TarjetaHito } from "@/components/TarjetaHito";
import { cargarObra, parsearIdObra } from "@/lib/api/cliente";
import { NOMBRE_ROL, ROLES } from "@/lib/roles";
import { formatearMomento, formatearPeriodo } from "@/lib/tiempo";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parsearIdObra((await params).id);
  return { title: id ? `Obra ${id}` : "Obra" };
}

const SEVERIDAD = { info: "aviso--info", advertencia: "aviso--alerta", critica: "aviso--peligro" } as const;

export default async function PaginaObra({ params }: Props) {
  const id = parsearIdObra((await params).id);
  if (id === null) notFound();
  const datos = await cargarObra(id);
  if (!datos) notFound();
  const { obra, hitos, eventos, alertas } = datos;

  return (
    <>
      <p className="chico">
        <Link href="/">← Todas las obras</Link>
      </p>
      <div className="fila fila--entre">
        <h1>{obra.nombre}</h1>
        <EstadoEtiqueta estado={obra.estado} />
      </div>
      <p className="suave">
        Obra {obra.id} · creada el {formatearMomento(obra.creada_en)} · período de objeción de{" "}
        {formatearPeriodo(obra.periodo_objecion_seg)} desde cada declaración.{" "}
        <Link href={`/panel/${obra.id}`}>Ir al panel de firmantes</Link>
      </p>
      <AvisoToken obra={obra} />
      <EnVivo obraId={obra.id} ultimoEventoId={eventos.at(-1)?.id ?? null} />

      <section className="seccion" aria-labelledby="titulo-fondos">
        <h2 id="titulo-fondos">Fondos</h2>
        <ResumenObra obra={obra} />
      </section>

      {alertas.length > 0 && (
        <section className="seccion" aria-labelledby="titulo-alertas">
          <h2 id="titulo-alertas">Alertas</h2>
          <ul className="lista-limpia pila">
            {alertas.map((a, i) => (
              <li key={`${a.tipo}-${a.momento}-${i}`} className={`aviso ${SEVERIDAD[a.severidad]}`}>
                {a.mensaje}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="seccion" aria-labelledby="titulo-hitos">
        <h2 id="titulo-hitos">Hitos</h2>
        <ol className="lista-limpia pila hitos">
          {hitos.map((hito) => (
            <TarjetaHito key={hito.indice} hito={hito} obra={obra} hitos={hitos} eventos={eventos} />
          ))}
        </ol>
      </section>

      <section className="seccion" aria-labelledby="titulo-linea">
        <h2 id="titulo-linea">Línea de tiempo</h2>
        <LineaDeTiempo eventos={eventos} obra={obra} />
      </section>

      <section className="seccion" aria-labelledby="titulo-roles">
        <h2 id="titulo-roles">Participantes</h2>
        <p className="suave chico">Direcciones de Stellar de cada rol, tal como están en el contrato.</p>
        <dl className="datos tarjeta">
          {ROLES.map((rol) => (
            <Fragment key={rol}>
              <dt>{NOMBRE_ROL[rol]}</dt>
              <dd>
                <code>{obra[rol]}</code>
                {rol === "arbitro" && obra.arbitro === obra.municipio && (
                  <span className="suave chico"> (en el MVP, la misma dirección del municipio)</span>
                )}
              </dd>
            </Fragment>
          ))}
          <dt>Token</dt>
          <dd>
            <code>{obra.token}</code>
            <AvisoToken obra={obra} compacto />
          </dd>
        </dl>
      </section>
    </>
  );
}
