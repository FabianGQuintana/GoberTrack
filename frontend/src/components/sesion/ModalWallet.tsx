"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cliente, parsearIdObra } from "@/lib/api/cliente";
import type { Obra } from "@/lib/api/tipos";
import { NOMBRE_ROL, rolesDe, type Rol } from "@/lib/roles";
import type { EstadoWallet } from "@/lib/wallet";
import { Huella } from "../ui/Huella";
import { Icono } from "../ui/Icono";
import { Insignia } from "../ui/Insignia";
import { Modal } from "../ui/Modal";
import { useSesion } from "./ProveedorSesion";

const URL_FREIGHTER = "https://www.freighter.app/";

/** Qué puede hacer cada rol, para elegir con qué vista entrar. */
export const DESCRIPCION_VISTA: Record<Rol, string> = {
  municipio: "Depositar fondos, crear obras y ver tus obras",
  contratista: "Declarar hitos y ver qué falta para cobrar",
  inspector: "Revisar y aprobar los hitos declarados",
  veedor: "Aprobar u objetar cada hito declarado",
  arbitro: "Resolver las objeciones abiertas",
};

/** Obra de la ruta actual (/obras/N o /panel/N), si la hay. */
function obraDeLaRuta(ruta: string | null): number | null {
  const m = /^\/(?:obras|panel)\/([^/?#]+)/.exec(ruta ?? "");
  return m ? parsearIdObra(m[1]) : null;
}

function Conectada({ wallet, alCerrar }: { wallet: Extract<EstadoWallet, { estado: "conectada" }>; alCerrar: () => void }) {
  const ruta = usePathname();
  const router = useRouter();
  const { desconectar } = useSesion();
  const [obras, setObras] = useState<Obra[] | null>(null);
  const [falla, setFalla] = useState(false);
  const idObra = obraDeLaRuta(ruta);

  useEffect(() => {
    let vigente = true;
    cliente
      .listarObras()
      .then((o) => vigente && setObras(o))
      .catch(() => vigente && setFalla(true));
    return () => {
      vigente = false;
    };
  }, []);

  const obraActual = idObra !== null ? obras?.find((o) => o.id === idObra) : undefined;
  const rolesActual = obraActual ? rolesDe(obraActual, wallet.direccion) : [];
  const [elegido, setElegido] = useState<Rol | null>(null);
  const vista = elegido ?? rolesActual[0] ?? null;
  const conRol = (obras ?? []).map((o) => ({ obra: o, roles: rolesDe(o, wallet.direccion) })).filter((x) => x.roles.length > 0);

  return (
    <>
      <div className="fila fila--entre">
        <span className="con-icono">
          <Icono nombre="wallet" style={{ color: "var(--pr)" }} />
          <Huella valor={wallet.direccion} etiqueta="tu dirección" />
        </span>
        <Insignia tono="ap" icono="check">
          Red de prueba
        </Insignia>
      </div>

      {obras === null && !falla && <p className="chico suave">Buscando tus roles en las obras…</p>}
      {falla && (
        <p className="aviso aviso--peligro chico" role="alert">
          <Icono nombre="alerta" />
          No pudimos leer las obras para saber tus roles. Probá de nuevo en unos segundos.
        </p>
      )}

      {obraActual && rolesActual.length > 0 && (
        <>
          <p className="chico suave">
            En <strong style={{ color: "var(--tx)" }}>{obraActual.nombre}</strong> esta cuenta es{" "}
            {rolesActual.map((r) => NOMBRE_ROL[r].toLowerCase()).join(" y ")}.{" "}
            {rolesActual.length > 1 ? "Elegí con qué vista entrar:" : ""}
          </p>
          <div role="radiogroup" aria-label="Vista" className="pila pila--chica">
            {rolesActual.map((r) => (
              <button
                key={r}
                type="button"
                className="opcion"
                role="radio"
                aria-checked={vista === r}
                onClick={() => setElegido(r)}
              >
                <span className="opcion__punto">{vista === r && <Icono nombre="check" tamano={14} />}</span>
                <span style={{ flex: 1 }}>
                  <b>{NOMBRE_ROL[r]}</b>
                  <span className="chico suave" style={{ display: "block" }}>
                    {DESCRIPCION_VISTA[r]}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="fila">
            <button
              type="button"
              className="boton boton--primario"
              onClick={() => {
                alCerrar();
                router.push(`/panel/${obraActual.id}?vista=${vista}`);
              }}
            >
              Entrar como {vista ? NOMBRE_ROL[vista].toLowerCase() : "firmante"}
            </button>
            <button type="button" className="boton boton--texto" onClick={desconectar}>
              Desconectar
            </button>
          </div>
        </>
      )}

      {obraActual && rolesActual.length === 0 && (
        <>
          <div className="aviso aviso--neutro">
            <Icono nombre="info" />
            <div>
              <b>Esta cuenta no participa en esta obra</b>
              <div className="chico">Podés verla como ciudadano: todo lo público sigue disponible. Si un pago está listo, también podés liberarlo.</div>
            </div>
          </div>
          <div className="fila">
            <button
              type="button"
              className="boton boton--primario"
              onClick={() => {
                alCerrar();
                router.push(`/obras/${obraActual.id}`);
              }}
            >
              Ver como ciudadano
            </button>
            <button type="button" className="boton boton--texto" onClick={desconectar}>
              Desconectar
            </button>
          </div>
        </>
      )}

      {!obraActual && obras !== null && (
        <>
          {conRol.length === 0 ? (
            <div className="aviso aviso--neutro">
              <Icono nombre="info" />
              <div>
                <b>Esta cuenta no participa en ninguna obra</b>
                <div className="chico">Podés recorrer todas las obras como ciudadano.</div>
              </div>
            </div>
          ) : (
            <div className="pila pila--chica">
              <p className="chico suave">Tus obras:</p>
              <ul className="lista-limpia pila pila--chica">
                {conRol.map(({ obra, roles }) => (
                  <li key={obra.id}>
                    <Link className="opcion" href={`/panel/${obra.id}?vista=${roles[0]}`} onClick={alCerrar} style={{ textDecoration: "none" }}>
                      <span style={{ flex: 1 }}>
                        <b>{obra.nombre}</b>
                        <span className="chico suave" style={{ display: "block" }}>
                          {roles.map((r) => NOMBRE_ROL[r]).join(" y ")}
                        </span>
                      </span>
                      <Icono nombre="volver" style={{ transform: "rotate(180deg)" }} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="fila">
            <button type="button" className="boton" onClick={alCerrar}>
              Listo
            </button>
            <button type="button" className="boton boton--texto" onClick={desconectar}>
              Desconectar
            </button>
          </div>
        </>
      )}
    </>
  );
}

/** Conectar Freighter y elegir con qué vista entrar (sin Freighter, red equivocada, con rol o sin rol). */
export function ModalWallet() {
  const { wallet, conectar, modalAbierto, cerrarModal } = useSesion();
  if (!modalAbierto) return null;

  const titulo =
    wallet.estado === "sin-freighter"
      ? "Conectá tu wallet"
      : wallet.estado === "conectada" && !wallet.esTestnet
        ? "Cambiá de red en Freighter"
        : wallet.estado === "conectada"
          ? "Wallet conectada"
          : "Conectá tu wallet";

  return (
    <Modal titulo={titulo} alCerrar={cerrarModal}>
      {wallet.estado === "desconectada" && (
        <>
          <p className="suave">
            Freighter es la extensión que firma las acciones por vos. Tu rol en cada obra sale de tu dirección: no hay
            usuarios ni contraseñas.
          </p>
          <button type="button" className="boton boton--primario" onClick={() => void conectar()} style={{ alignSelf: "flex-start" }}>
            <Icono nombre="wallet" />
            Conectar Freighter
          </button>
        </>
      )}
      {wallet.estado === "conectando" && (
        <p className="con-icono" aria-live="polite">
          <span className="giro" /> Esperando a Freighter…
        </p>
      )}
      {wallet.estado === "sin-freighter" && (
        <>
          <div className="aviso aviso--alerta" role="alert">
            <Icono nombre="alerta" />
            <div>
              <b>No encontramos Freighter en este navegador</b>
              <div className="chico">Freighter es la extensión que firma las acciones por vos. Sin ella podés mirar todo, pero no firmar.</div>
            </div>
          </div>
          <div className="fila">
            <a className="boton boton--primario" href={URL_FREIGHTER} target="_blank" rel="noreferrer">
              Instalar Freighter
              <Icono nombre="externo" tamano={16} />
            </a>
            <button type="button" className="boton" onClick={() => void conectar()}>
              Ya la instalé, reintentar
            </button>
          </div>
        </>
      )}
      {wallet.estado === "error" && (
        <>
          <p className="aviso aviso--peligro" role="alert">
            <Icono nombre="alerta" />
            No se pudo conectar con Freighter: {wallet.mensaje}
          </p>
          <button type="button" className="boton" onClick={() => void conectar()} style={{ alignSelf: "flex-start" }}>
            Reintentar
          </button>
        </>
      )}
      {wallet.estado === "conectada" && !wallet.esTestnet && (
        <>
          <p className="suave">Esta aplicación funciona solo en la red de prueba. Abrí Freighter, elegí “Testnet” y volvé acá.</p>
          <div className="grilla" style={{ ["--min" as string]: "160px", gap: 10 }}>
            <div className="aviso aviso--peligro" style={{ flexDirection: "column", gap: 2 }}>
              <span className="etiqueta" style={{ color: "inherit" }}>
                Red actual
              </span>
              <b>{wallet.red || "desconocida"}</b>
            </div>
            <div className="aviso aviso--exito" style={{ flexDirection: "column", gap: 2 }}>
              <span className="etiqueta" style={{ color: "inherit" }}>
                Red esperada
              </span>
              <b>Red de prueba (testnet)</b>
            </div>
          </div>
          <button type="button" className="boton boton--primario" onClick={() => void conectar()} style={{ alignSelf: "flex-start" }}>
            Ya la cambié, reintentar
          </button>
        </>
      )}
      {wallet.estado === "conectada" && wallet.esTestnet && <Conectada wallet={wallet} alCerrar={cerrarModal} />}
    </Modal>
  );
}
