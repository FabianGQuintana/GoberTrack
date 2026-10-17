import { connection } from "next/server";
import { verificarTokenDeObra } from "@/components/AvisoToken";
import { EnVivo } from "@/components/EnVivo";
import { ListaObras, type ResumenObra } from "@/components/inicio/ListaObras";
import { cliente } from "@/lib/api/cliente";
import { avisosDeObra } from "@/lib/atencion";

export default async function PaginaObras() {
  await connection(); // Datos al momento del pedido, nunca prerenderizados en el build.
  const obras = await cliente.listarObras();
  const ahora = Date.now();
  // La API no tiene un resumen por obra: para saber si una obra "requiere atención" se piden sus hitos
  // y eventos (una consulta por obra; ver el listado de faltantes del backend).
  const resumenes: ResumenObra[] = await Promise.all(
    obras.map(async (obra) => {
      const [hitos, eventos] = await Promise.all([cliente.listarHitos(obra.id), cliente.listarEventos(obra.id)]);
      return {
        obra,
        requiereAtencion: avisosDeObra(obra, hitos, eventos, { ahora }).length > 0,
        tokenNoOficial: verificarTokenDeObra(obra).estado === "no-oficial",
      };
    }),
  );

  return (
    <div className="contenedor principal principal--inicio">
      <section className="pila" style={{ gap: 14, maxWidth: 760 }}>
        <h1>Seguí cada obra pública, hito por hito</h1>
        <p className="bajada">
          Mirá cuánto se depositó, qué se aprobó y cuándo se libera cada pago. Las reglas las aplica un contrato en la red
          Stellar, y cualquiera puede comprobarlo, sin wallet.
        </p>
        <EnVivo />
      </section>
      <ListaObras obras={resumenes} />
    </div>
  );
}
