"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { abreviar } from "../ui/Huella";
import { Icono } from "../ui/Icono";
import { ModalWallet } from "./ModalWallet";
import { useSesion } from "./ProveedorSesion";

type Tema = "claro" | "oscuro" | null;

/** Modo claro/oscuro: sigue al sistema hasta que la persona elige; la elección queda en este navegador. */
function BotonTema() {
  const [tema, setTema] = useState<Tema>(null);

  useEffect(() => {
    try {
      const guardado = localStorage.getItem("opv-tema");
      if (guardado === "claro" || guardado === "oscuro") setTema(guardado);
    } catch {
      // Sin almacenamiento: sigue al sistema.
    }
  }, []);

  useEffect(() => {
    if (tema) document.documentElement.dataset.tema = tema;
  }, [tema]);

  function alternar() {
    const actual =
      tema ?? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro");
    const nuevo = actual === "oscuro" ? "claro" : "oscuro";
    setTema(nuevo);
    try {
      localStorage.setItem("opv-tema", nuevo);
    } catch {
      // Sin almacenamiento: vale solo para esta visita.
    }
  }

  return (
    <button type="button" className="boton boton--icono" onClick={alternar} aria-label="Cambiar entre modo claro y oscuro">
      <Icono nombre="luna" />
    </button>
  );
}

export function Cabecera({ simulado }: { simulado: boolean }) {
  const { wallet, abrirModal } = useSesion();

  return (
    <header className="cabecera">
      <div className="contenedor cabecera__interior">
        <Link className="marca" href="/">
          <span className="marca__logo">
            <Icono nombre="escudo" tamano={24} />
          </span>
          Obra Pública Verificable
        </Link>
        <div className="cabecera__lado">
          {simulado && <span className="tag-simulado">DATO SIMULADO</span>}
          <span className="tag-red">
            <i aria-hidden="true" />
            Red de prueba (testnet)
          </span>
          <BotonTema />
          {wallet.estado === "conectada" ? (
            <button type="button" className="chip-wallet" onClick={abrirModal} aria-label={`Wallet conectada: ${wallet.direccion}. Ver roles`}>
              <Icono nombre="wallet" style={{ color: "var(--pr)" }} />
              <span className="mono" aria-hidden="true">
                {abreviar(wallet.direccion)}
              </span>
              {!wallet.esTestnet && <span className="insignia insignia--er">Red equivocada</span>}
            </button>
          ) : (
            <button type="button" className="boton" onClick={abrirModal}>
              <Icono nombre="wallet" />
              Conectar wallet
            </button>
          )}
        </div>
      </div>
      <ModalWallet />
    </header>
  );
}
