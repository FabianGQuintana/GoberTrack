"use client";

import { useState } from "react";
import { cliente } from "@/lib/api/cliente";
import type { Hito, Obra } from "@/lib/api/tipos";
import type { Contexto } from "@/lib/reglas";
import { describirRoles, rolesDe } from "@/lib/roles";
import { leerConfigRed, urlTransaccion } from "@/lib/stellar/config";
import type { Red } from "@/lib/stellar/transacciones";
import { MARGENES, useRelojLedger } from "@/lib/stellar/useRelojLedger";
import { formatearMomento } from "@/lib/tiempo";
import { firmanteFreighter, type EstadoWallet } from "@/lib/wallet";
import { AccionesHito } from "./AccionesHito";
import { AccionFondear } from "./AccionFondear";
import { ConexionWallet } from "./ConexionWallet";
import type { ContextoEnvio } from "./envio";
import { direccionSimulada, SimuladorRol, type RolSimulado } from "./SimuladorRol";

const SIMULADOR_HABILITADO = process.env.NODE_ENV !== "production";

/** Configuración de red para firmar: solo con la API real (en mock los datos no están en la red). */
function configuracionDeRed() {
  if (cliente.modo !== "api") return { config: null, problema: "modo mock: los datos son simulados y no están en la red." };
  const lectura = leerConfigRed();
  return lectura.ok
    ? { config: lectura.config, problema: null }
    : { config: null, problema: `falta configurar la red (${lectura.problemas.join(" ")})` };
}

export function PanelFirmantes({ obra, hitos }: { obra: Obra; hitos: Hito[] }) {
  const [wallet, setWallet] = useState<EstadoWallet>({ estado: "desconectada" });
  const [rolSimulado, setRolSimulado] = useState<RolSimulado | null>(null);

  const { config, problema } = configuracionDeRed();
  const red: Red | null = config ? { rpcUrl: config.rpcUrl, passphrase: config.passphrase } : null;
  const reloj = useRelojLedger(red);

  const simulado = SIMULADOR_HABILITADO && rolSimulado !== null;
  const conectada = !simulado && wallet.estado === "conectada" ? wallet : null;
  const direccion = simulado && rolSimulado ? direccionSimulada(obra, rolSimulado) : (conectada?.direccion ?? null);
  const roles = rolesDe(obra, direccion);

  // Revisión F3: la firma queda bloqueada si Freighter no está en la red de la demo.
  const motivoSinFirma = problema
    ? problema
    : simulado
      ? "es un rol simulado (solo se puede simular, no firmar)."
      : !conectada
        ? "conectá Freighter."
        : !conectada.esTestnet
          ? `Freighter está en la red ${conectada.red || "desconocida"}, no en testnet: cambiá la red y volvé a conectar.`
          : null;
  const envio: ContextoEnvio | null =
    config && red && direccion
      ? {
          red,
          contratoId: config.contratoId,
          origen: direccion,
          firmar: motivoSinFirma === null && conectada ? firmanteFreighter(conectada.direccion, config.passphrase) : null,
          motivoSinFirma,
          urlTransaccion: (hash) => urlTransaccion(hash),
        }
      : null;

  // Revisión F4: con datos reales, la hora del último ledger (o el navegador con márgenes).
  const margenes = cliente.modo === "api" ? MARGENES[reloj.fuente] : { margenObjecionMs: 0, margenPagoMs: 0 };
  const sesion: { ctx: Contexto; firmante: string } | null =
    direccion && reloj.ahora !== null
      ? { ctx: { obra, hitos, roles, ahora: reloj.ahora, ...margenes }, firmante: direccion }
      : null;
  // Abierto por defecto: el primer hito sin pagar (el "actual").
  const indiceActual = hitos.find((h) => h.estado !== "Pagado")?.indice;

  return (
    <div className="pila">
      <section className="tarjeta pila" aria-labelledby="titulo-cuenta">
        <h2 id="titulo-cuenta">Tu cuenta</h2>
        <ConexionWallet wallet={wallet} alCambiar={setWallet} />
        {SIMULADOR_HABILITADO && <SimuladorRol valor={rolSimulado} alCambiar={setRolSimulado} />}
        {direccion && (
          <p aria-live="polite">
            Rol en esta obra: <strong>{describirRoles(roles)}</strong>
            {rolSimulado && <span className="suave"> (simulado)</span>}
            <br />
            <span className="chico suave">
              Dirección: <code>{direccion}</code>
            </span>
            {roles.length === 0 && (
              <>
                <br />
                <span className="chico">Sin rol solo podés liberar pagos, que no piden firma de un rol.</span>
              </>
            )}
          </p>
        )}
        {direccion && (
          <p className={`chico ${envio?.firmar ? "aviso aviso--info" : "suave"}`}>
            {envio?.firmar
              ? "Las acciones se firman con Freighter y se envían a testnet. Antes de pedir la firma se simulan: si el contrato las rechaza, no se firma nada."
              : `Solo vista previa${envio ? " y simulación en la red" : ""}: ${motivoSinFirma ?? ""}`}
          </p>
        )}
        {cliente.modo === "api" && reloj.ahora !== null && (
          <p className="chico suave">
            {reloj.fuente === "ledger"
              ? `Hora del ledger ${reloj.secuencia}: ${formatearMomento(reloj.ahora)} (la que usa el contrato para los plazos).`
              : "Plazos evaluados con el reloj del navegador, con un margen de 10 s (no se pudo leer el ledger)."}
          </p>
        )}
      </section>

      {!sesion ? (
        <p className="aviso aviso--info">
          Conectá Freighter{SIMULADOR_HABILITADO ? " (o simulá un rol)" : ""} para ver qué acciones podés firmar
          en esta obra según tu rol y el estado de cada hito.
        </p>
      ) : (
        <>
          <section className="tarjeta" aria-labelledby="titulo-fondos-panel">
            <h2 id="titulo-fondos-panel" className="visualmente-oculto">
              Fondos
            </h2>
            <AccionFondear key={sesion.firmante} ctx={sesion.ctx} envio={envio} />
          </section>

          <section aria-labelledby="titulo-hitos-panel" className="pila">
            <h2 id="titulo-hitos-panel">Hitos</h2>
            {hitos.map((hito) => (
              <details
                key={`${sesion.firmante}-${hito.indice}`}
                className="tarjeta hito-panel"
                open={hito.indice === indiceActual}
              >
                <summary>
                  <strong>
                    Hito {hito.indice + 1}: {hito.descripcion}
                  </strong>{" "}
                  <span className="suave">({hito.estado})</span>
                </summary>
                <AccionesHito ctx={sesion.ctx} hito={hito} direccion={sesion.firmante} envio={envio} />
              </details>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
