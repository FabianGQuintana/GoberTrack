import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AvisoToken, verificarTokenDeObra } from "@/components/AvisoToken";
import { EnVivo } from "@/components/EnVivo";
import { LineaDeTiempo } from "@/components/LineaDeTiempo";
import { BloqueFondos } from "@/components/obra/BloqueFondos";
import { ComprobarStellar } from "@/components/obra/ComprobarStellar";
import { Participantes } from "@/components/obra/Participantes";
import { PasosHitos } from "@/components/obra/PasosHitos";
import { RequiereAtencion } from "@/components/obra/RequiereAtencion";
import { VerificadorEvidencia } from "@/components/obra/VerificadorEvidencia";
import { TarjetaHito } from "@/components/TarjetaHito";
import { Icono } from "@/components/ui/Icono";
import { EstadoInsignia } from "@/components/ui/Insignia";
import { cargarObra, parsearIdObra } from "@/lib/api/cliente";
import { formatearFechaHora, formatearPeriodo } from "@/lib/tiempo";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parsearIdObra((await params).id);
  return { title: id ? `Obra ${id}` : "Obra" };
}

const SEVERIDAD = { info: "aviso--info", advertencia: "aviso--alerta", critica: "aviso--peligro" } as const;

/** Vista ciudadana de una obra: sin wallet, sin jerga, y comprobable contra la red. */
export default async function PaginaObra({ params }: Props) {
  const id = parsearIdObra((await params).id);
  if (id === null) notFound();
  const datos = await cargarObra(id);
  if (!datos) notFound();
  const { obra, hitos, eventos, alertas } = datos;
  const estadoToken = verificarTokenDeObra(obra).estado;

  return (
    <div className="contenedor principal">
      <section className="encabezado-pagina">
        <Link className="enlace" href="/">
          <Icono nombre="volver" tamano={16} />
          Todas las obras
        </Link>
        <div className="fila" style={{ gap: 14 }}>
          <h1>{obra.nombre}</h1>
          <EstadoInsignia estado={obra.estado} />
        </div>
        <p className="suave">
          Obra {obra.id} · creada el {formatearFechaHora(obra.creada_en)} · período de objeción de{" "}
          {formatearPeriodo(obra.periodo_objecion_seg)} desde cada declaración ·{" "}
          <Link href={`/panel/${obra.id}`}>Panel de firmantes</Link>
        </p>
        <EnVivo obraId={obra.id} ultimoEventoId={eventos.at(-1)?.id ?? null} />
      </section>

      <AvisoToken obra={obra} />
      <BloqueFondos obra={obra} estadoToken={estadoToken} />
      <RequiereAtencion obra={obra} hitos={hitos} eventos={eventos} />

      {alertas.length > 0 && (
        <section aria-labelledby="titulo-alertas" className="pila">
          <h2 id="titulo-alertas">Alertas del backend</h2>
          <ul className="lista-limpia pila">
            {alertas.map((a, i) => (
              <li key={`${a.tipo}-${a.momento}-${i}`} className={`aviso ${SEVERIDAD[a.severidad]}`}>
                <Icono nombre="alerta" />
                {a.mensaje}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="titulo-hitos" className="pila" style={{ gap: 22 }}>
        <h2 id="titulo-hitos">Hitos de la obra</h2>
        <PasosHitos hitos={hitos} />
        <ol className="hitos lista-limpia" aria-label="Hitos">
          {hitos.map((hito) => (
            <TarjetaHito key={hito.indice} hito={hito} obra={obra} hitos={hitos} eventos={eventos} />
          ))}
        </ol>
      </section>

      <div className="grilla grilla--estirar" style={{ ["--min" as string]: "440px" }}>
        <ComprobarStellar obra={obra} hitos={hitos} />
        <VerificadorEvidencia obra={obra} hitos={hitos} />
      </div>

      <div className="grilla" style={{ ["--min" as string]: "440px" }}>
        <section className="tarjeta tarjeta--grande pila" aria-labelledby="titulo-linea" style={{ gap: 18 }}>
          <h2 id="titulo-linea">Qué pasó, en orden</h2>
          <LineaDeTiempo eventos={eventos} obra={obra} />
        </section>
        <Participantes obra={obra} />
      </div>
    </div>
  );
}
