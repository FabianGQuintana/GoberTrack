import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AvisoToken } from "@/components/AvisoToken";
import { EnVivo } from "@/components/EnVivo";
import { PanelFirmantes } from "@/components/panel/PanelFirmantes";
import { cargarObra, parsearIdObra } from "@/lib/api/cliente";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parsearIdObra((await params).id);
  return { title: id ? `Panel de firmantes · obra ${id}` : "Panel de firmantes" };
}

export default async function PaginaPanel({ params }: Props) {
  const id = parsearIdObra((await params).id);
  if (id === null) notFound();
  const datos = await cargarObra(id);
  if (!datos) notFound();
  const { obra, hitos, eventos } = datos;

  return (
    <>
      <p className="chico">
        <Link href={`/obras/${obra.id}`}>← Volver a la obra</Link>
      </p>
      <h1>Panel de firmantes</h1>
      <p>
        <strong>{obra.nombre}</strong> (obra {obra.id})
      </p>
      <p className="suave">
        Conectá tu wallet para ver qué acciones te corresponden según tu rol y el estado de cada hito.
        Las que no aplican muestran el error que devolvería el contrato. Con Freighter en testnet se
        firman y se envían a la red; si no, se muestra lo que se enviaría.
      </p>
      <AvisoToken obra={obra} />
      <EnVivo obraId={obra.id} ultimoEventoId={eventos.at(-1)?.id ?? null} />
      <PanelFirmantes obra={obra} hitos={hitos} />
    </>
  );
}
