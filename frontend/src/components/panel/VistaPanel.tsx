"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cliente } from "@/lib/api/cliente";
import type { Evento, Hito, Obra } from "@/lib/api/tipos";
import { NOMBRE_ROL, rolesDe, type Rol } from "@/lib/roles";
import { leerConfigRed, urlTransaccion } from "@/lib/stellar/config";
import type { Red } from "@/lib/stellar/transacciones";
import { MARGENES, useRelojLedger } from "@/lib/stellar/useRelojLedger";
import { formatearFechaHora } from "@/lib/tiempo";
import { firmanteFreighter } from "@/lib/wallet";
import { AvisoToken } from "../AvisoToken";
import { useSesion } from "../sesion/ProveedorSesion";
import { Huella } from "../ui/Huella";
import { Icono } from "../ui/Icono";
import { Insignia } from "../ui/Insignia";
import { PagosParaLiberar } from "./comunes";
import type { ContextoVista, ObraConHitos } from "./contexto";
import type { ContextoEnvio } from "./envio";
import { ModalAccion, type PedidoAccion } from "./ModalAccion";
import { direccionSimulada, SimuladorRol, type RolSimulado } from "./SimuladorRol";
import { VistaArbitro } from "./vistas/VistaArbitro";
import { VistaContratista } from "./vistas/VistaContratista";
import { VistaInspector } from "./vistas/VistaInspector";
import { VistaMunicipio } from "./vistas/VistaMunicipio";
import { VistaVeedor } from "./vistas/VistaVeedor";

const SIMULADOR_HABILITADO = process.env.NODE_ENV !== "production";

/** Configuración de red para firmar: solo con la API real (en mock los datos no están en la red). */
function configuracionDeRed() {
  if (cliente.modo !== "api") return { config: null, problema: "modo de demostración: los datos son simulados y no están en la red." };
  const lectura = leerConfigRed();
  return lectura.ok
    ? { config: lectura.config, problema: null }
    : { config: null, problema: `falta configurar la red (${lectura.problemas.join(" ")})` };
}

/** Vista por defecto entre los roles de la cuenta: la que tiene algo urgente, o la primera. */
function vistaPorDefecto(roles: readonly Rol[], hitos: readonly Hito[]): Rol | null {
  if (roles.includes("arbitro") && hitos.some((h) => h.estado === "Objetado")) return "arbitro";
  const orden: Rol[] = ["contratista", "inspector", "veedor", "municipio", "arbitro"];
  return orden.find((r) => roles.includes(r)) ?? null;
}

const SUBTITULO: Record<Rol, string> = {
  municipio: "Tu vista como municipio",
  contratista: "Tu vista como contratista",
  inspector: "Tu vista como inspector",
  veedor: "Tu vista como veedor independiente",
  arbitro: "Tu vista como árbitro",
};

/** Cuenta conectada (o simulada) y en qué modo se firma. */
function Cuenta({
  sesion,
  direccion,
  simulado,
  motivoSinFirma,
  rolSimulado,
  setRolSimulado,
  reloj,
}: {
  sesion: ReturnType<typeof useSesion>;
  direccion: string | null;
  simulado: boolean;
  motivoSinFirma: string | null;
  rolSimulado: RolSimulado | null;
  setRolSimulado: (r: RolSimulado | null) => void;
  reloj: { ahora: number | null; fuente: "ledger" | "navegador"; secuencia?: number };
}) {
  const { wallet, conectar, desconectar } = sesion;
  return (
    <section className="tarjeta pila" aria-labelledby="titulo-cuenta" style={{ padding: 20 }}>
      <h2 id="titulo-cuenta" className="visualmente-oculto">
        Tu cuenta
      </h2>
      {wallet.estado === "conectada" && !simulado ? (
        <div className="fila fila--entre">
          <span className="fila" style={{ gap: 8 }}>
            <Icono nombre="wallet" style={{ color: "var(--pr)" }} />
            <span>
              Conectada: <Huella valor={wallet.direccion} etiqueta="tu dirección" />
              {" "}<span className="visualmente-oculto">{wallet.direccion}</span>
            </span>
            <span className="chico suave">· red {wallet.red || "desconocida"}</span>
          </span>
          <button type="button" className="boton boton--texto" onClick={desconectar}>
            Desconectar
          </button>
        </div>
      ) : (
        !simulado && (
          <div className="fila">
            <button type="button" className="boton boton--primario" onClick={() => void conectar()} disabled={wallet.estado === "conectando"}>
              <Icono nombre="wallet" />
              {wallet.estado === "conectando" ? "Conectando…" : "Conectar Freighter"}
            </button>
            <span className="chico suave">Tu rol sale de tu dirección: no hay usuarios ni contraseñas.</span>
          </div>
        )
      )}

      <div aria-live="polite">
        {wallet.estado === "sin-freighter" && !simulado && (
          <p className="aviso aviso--alerta" role="alert">
            <Icono nombre="alerta" />
            <span>
              <b>No encontramos Freighter en este navegador.</b> Sin la extensión podés mirar todo, pero no firmar.{" "}
              <a href="https://www.freighter.app/" target="_blank" rel="noreferrer">
                Instalar Freighter
              </a>
            </span>
          </p>
        )}
        {wallet.estado === "error" && !simulado && (
          <p className="aviso aviso--peligro" role="alert">
            <Icono nombre="alerta" />
            No se pudo conectar con Freighter: {wallet.mensaje}
          </p>
        )}
        {wallet.estado === "conectada" && !wallet.esTestnet && !simulado && (
          <p className="aviso aviso--alerta" role="alert">
            <Icono nombre="alerta" />
            <span>
              Freighter está en la red <strong>{wallet.red || "desconocida"}</strong>. Esta aplicación funciona solo en la red de
              prueba (testnet): cambiá la red en Freighter y volvé a conectar.
            </span>
          </p>
        )}
      </div>

      {SIMULADOR_HABILITADO && <SimuladorRol valor={rolSimulado} alCambiar={setRolSimulado} />}

      {direccion && (
        <p className={`chico ${motivoSinFirma === null ? "aviso aviso--info" : "suave"}`}>
          {motivoSinFirma === null ? (
            <>
              <Icono nombre="firma" tamano={16} />
              <span>Las acciones se firman con Freighter y se envían a testnet. Antes de pedir la firma se comprueban con el contrato: si las rechaza, no se firma nada.</span>
            </>
          ) : (
            <>Solo vista previa{motivoSinFirma.startsWith("modo") ? "" : " y comprobación con el contrato"}: {motivoSinFirma}</>
          )}
        </p>
      )}
      {cliente.modo === "api" && direccion && reloj.ahora !== null && (
        <p className="chico suave">
          {reloj.fuente === "ledger"
            ? `Hora del ledger ${reloj.secuencia}: ${formatearFechaHora(reloj.ahora)} (la que usa el contrato para los plazos).`
            : "Plazos evaluados con el reloj del navegador, con un margen de 10 s (no se pudo leer el ledger)."}
        </p>
      )}
    </section>
  );
}

export function VistaPanel({
  obra,
  hitos,
  eventos,
  todas,
  vistaInicial,
}: {
  obra: Obra;
  hitos: Hito[];
  eventos: Evento[];
  todas: ObraConHitos[];
  vistaInicial?: Rol | null;
}) {
  const router = useRouter();
  // Una sola sesión para todo el panel (fuera del proveedor, useSesion crea una local por llamada).
  const sesion = useSesion();
  const { wallet } = sesion;
  const [rolSimulado, setRolSimulado] = useState<RolSimulado | null>(null);
  const [vistaElegida, setVistaElegida] = useState<Rol | null>(vistaInicial ?? null);
  const [pedido, setPedido] = useState<PedidoAccion | null>(null);
  const [apertura, setApertura] = useState(0);

  const { config, problema } = configuracionDeRed();
  const red: Red | null = config ? { rpcUrl: config.rpcUrl, passphrase: config.passphrase } : null;
  const reloj = useRelojLedger(red);

  const simulado = SIMULADOR_HABILITADO && rolSimulado !== null;
  const conectada = !simulado && wallet.estado === "conectada" ? wallet : null;
  const direccion = simulado && rolSimulado ? direccionSimulada(obra, rolSimulado) : (conectada?.direccion ?? null);
  const roles = rolesDe(obra, direccion);
  const vista = vistaElegida && roles.includes(vistaElegida) ? vistaElegida : vistaPorDefecto(roles, hitos);

  // Revisión F3: la firma queda bloqueada si Freighter no está en la red de la demo.
  const motivoSinFirma = problema
    ? problema
    : simulado
      ? "es un rol simulado (solo se puede comprobar con el contrato, no firmar)."
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
  const v: ContextoVista | null =
    direccion && reloj.ahora !== null
      ? {
          obra,
          hitos,
          eventos,
          todas,
          ctx: { obra, hitos, roles, ahora: reloj.ahora, ...margenes },
          direccion,
          ahora: reloj.ahora,
          envio,
          abrir: (p) => {
            setApertura((n) => n + 1);
            setPedido(p);
          },
        }
      : null;

  const titulo = vista === "municipio" ? "Tus obras" : vista === "inspector" ? "Hitos para revisar" : obra.nombre;

  return (
    <div className="contenedor principal">
      <section className="encabezado-pagina">
        <div className="fila" style={{ gap: "0 20px" }}>
          <Link className="enlace" href={`/obras/${obra.id}`}>
            <Icono nombre="volver" tamano={16} />
            Ver como ciudadano
          </Link>
          {roles
            .filter((r) => r !== vista)
            .map((r) => (
              <button key={r} type="button" className="boton boton--texto" onClick={() => setVistaElegida(r)}>
                Esta cuenta también es {NOMBRE_ROL[r].toLowerCase()}: cambiar a esa vista
              </button>
            ))}
        </div>
        <div className="titulo-con-estado">
          <h1>{direccion && vista ? titulo : "Panel de firmantes"}</h1>
          {direccion && vista ? (
            <span className="suave grande">{SUBTITULO[vista]}</span>
          ) : (
            <span className="suave grande">{obra.nombre}</span>
          )}
        </div>
        {direccion && (
          <p className="chico" aria-live="polite">
            Rol en esta obra:{" "}
            <strong>{roles.length === 0 ? "Sin rol" : roles.map((r) => NOMBRE_ROL[r]).join(" y ")}</strong>
            {simulado && <span className="suave"> (simulado)</span>}
            {vista && (vista === "municipio" || vista === "inspector") && <span className="suave"> · {obra.nombre}</span>}
          </p>
        )}
      </section>

      <Cuenta
        sesion={sesion}
        direccion={direccion}
        simulado={simulado}
        motivoSinFirma={motivoSinFirma}
        rolSimulado={rolSimulado}
        setRolSimulado={setRolSimulado}
        reloj={reloj}
      />
      <AvisoToken obra={obra} />

      {!v ? (
        <p className="aviso aviso--info">
          <Icono nombre="info" />
          <span>
            Conectá Freighter{SIMULADOR_HABILITADO ? " (o simulá un rol)" : ""} para ver tu vista: qué te toca hacer en esta obra
            según tu rol y el estado de cada hito.
          </span>
        </p>
      ) : roles.length === 0 ? (
        <>
          <div className="aviso aviso--neutro">
            <Icono nombre="info" />
            <div>
              <b>Esta cuenta no participa en esta obra</b>
              <div className="chico">
                Sin rol solo podés liberar pagos, que no piden la firma de un rol: el dinero va siempre al contratista.{" "}
                <Link href={`/obras/${obra.id}`}>Ver la obra como ciudadano</Link>
              </div>
            </div>
          </div>
          <PagosParaLiberar v={v} />
          {!hitos.some((h) => h.pagable) && (
            <p className="chico suave">Ahora no hay pagos listos para liberar en esta obra.</p>
          )}
        </>
      ) : (
        <>
          {vista === "veedor" && <VistaVeedor v={v} />}
          {vista === "inspector" && <VistaInspector v={v} />}
          {vista === "arbitro" && <VistaArbitro v={v} />}
          {vista === "contratista" && <VistaContratista v={v} />}
          {vista === "municipio" && <VistaMunicipio v={v} />}
          {vista !== "contratista" && <PagosParaLiberar v={v} />}
        </>
      )}

      {pedido && (
        <ModalAccion
          key={apertura}
          pedido={pedido}
          envio={envio}
          alCerrar={() => setPedido(null)}
          alConfirmar={() => router.refresh()}
        />
      )}

      {direccion && roles.length > 0 && (
        <p className="chico suave">
          <Insignia tono="pr">{NOMBRE_ROL[vista ?? roles[0]]}</Insignia> Las reglas de esta pantalla son una ayuda: el que decide
          es el contrato.
        </p>
      )}
    </div>
  );
}
