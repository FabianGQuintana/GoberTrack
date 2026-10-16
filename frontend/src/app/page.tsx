import Link from "next/link";
import { connection } from "next/server";
import { AvisoToken, verificarTokenDeObra } from "@/components/AvisoToken";
import { EnVivo } from "@/components/EnVivo";
import { EstadoEtiqueta } from "@/components/EstadoEtiqueta";
import { cliente } from "@/lib/api/cliente";
import { formatearMonto, porcentaje } from "@/lib/montos";
import { abreviarDireccion } from "@/lib/roles";

export default async function PaginaObras() {
  await connection(); // Datos al momento del pedido, nunca prerenderizados en el build.
  const obras = await cliente.listarObras();

  return (
    <>
      <h1>Tablero de obras</h1>
      <p className="suave">
        Cada pago sale del contrato solo cuando el inspector y el veedor aprobaron el hito y pasó el
        período de objeción. Cualquiera puede verificarlo, sin wallet.
      </p>
      <EnVivo />

      {obras.length === 0 ? (
        <p>Todavía no hay obras registradas.</p>
      ) : (
        <ul className="lista-limpia pila" aria-label="Obras">
          {obras.map((obra) => {
            const { estado: token } = verificarTokenDeObra(obra);
            // Con un token que no es el oficial, los montos no se rotulan como USDC.
            const simbolo = token !== "no-oficial";
            return (
              <li key={obra.id} className={`tarjeta${token === "no-oficial" ? " tarjeta--alerta" : ""}`}>
                <div className="fila fila--entre">
                  <h2>
                    <Link href={`/obras/${obra.id}`}>{obra.nombre}</Link>
                  </h2>
                  <span className="fila">
                    {token === "no-oficial" && <span className="estado estado--Objetado">Token no oficial</span>}
                    <EstadoEtiqueta estado={obra.estado} />
                  </span>
                </div>
                <AvisoToken obra={obra} compacto />
                <dl className="datos">
                  <dt>Presupuesto vigente</dt>
                  <dd className="monto">{formatearMonto(obra.monto_vigente, simbolo)}</dd>
                  <dt>Fondeado</dt>
                  <dd className="monto">{formatearMonto(obra.fondeado, simbolo)}</dd>
                  <dt>Pagado</dt>
                  <dd>
                    <span className="monto">{formatearMonto(obra.pagado, simbolo)}</span>{" "}
                    <span className="suave chico">
                      ({porcentaje(obra.pagado, obra.monto_vigente).toLocaleString("es-AR")} %)
                    </span>
                  </dd>
                  <dt>Saldo bloqueado</dt>
                  <dd className="monto">{formatearMonto(obra.saldo, simbolo)}</dd>
                  <dt>Hitos</dt>
                  <dd>
                    {obra.hitos_pagados} de {obra.cantidad_hitos} pagados
                  </dd>
                  <dt>Token</dt>
                  <dd>
                    <code title={obra.token}>{abreviarDireccion(obra.token, 6)}</code>{" "}
                    <span className="suave chico">
                      {token === "oficial" ? "(oficial)" : token === "no-oficial" ? "(NO es el oficial)" : "(sin verificar)"}
                    </span>
                  </dd>
                </dl>
                <p className="fila" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
                  <Link href={`/obras/${obra.id}`}>
                    Ver hitos y línea de tiempo<span className="visualmente-oculto"> de {obra.nombre}</span>
                  </Link>
                  <Link href={`/panel/${obra.id}`}>
                    Panel de firmantes<span className="visualmente-oculto"> de {obra.nombre}</span>
                  </Link>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
