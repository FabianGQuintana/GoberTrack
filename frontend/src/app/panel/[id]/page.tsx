import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EnVivo } from "@/components/EnVivo";
import type { ObraConHitos } from "@/components/panel/contexto";
import { VistaPanel } from "@/components/panel/VistaPanel";
import { cargarObra, cliente, parsearIdObra } from "@/lib/api/cliente";
import { ROLES, type Rol } from "@/lib/roles";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ vista?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parsearIdObra((await params).id);
  return { title: id ? `Panel de firmantes · obra ${id}` : "Panel de firmantes" };
}

function parsearVista(valor: string | string[] | undefined): Rol | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return (ROLES as readonly string[]).includes(v ?? "") ? (v as Rol) : null;
}

/**
 * Panel de firmantes: cada rol ve lo que le toca hacer. Las bandejas ("Tu bandeja", "Tus obras")
 * cruzan obras, así que se cargan todas las obras con sus hitos (la API no tiene un resumen por rol).
 */
export default async function PaginaPanel({ params, searchParams }: Props) {
  const id = parsearIdObra((await params).id);
  if (id === null) notFound();
  const datos = await cargarObra(id);
  if (!datos) notFound();
  const { obra, hitos, eventos } = datos;
  const vista = parsearVista((await searchParams)?.vista);

  const obras = await cliente.listarObras();
  const todas: ObraConHitos[] = await Promise.all(
    obras.map(async (o) =>
      o.id === obra.id
        ? { obra, hitos }
        : { obra: o, hitos: [...(await cliente.listarHitos(o.id))].sort((a, b) => a.indice - b.indice) },
    ),
  );

  return (
    <>
      <div className="contenedor" style={{ paddingTop: 12 }}>
        <EnVivo obraId={obra.id} ultimoEventoId={eventos.at(-1)?.id ?? null} />
      </div>
      <VistaPanel obra={obra} hitos={hitos} eventos={eventos} todas={todas} vistaInicial={vista} />
    </>
  );
}
