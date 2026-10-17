"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { conectarFreighter, type EstadoWallet } from "@/lib/wallet";

/**
 * La wallet conectada es de toda la aplicación: la cabecera la muestra y el panel la usa para saber
 * qué rol tiene la cuenta en cada obra. No hay usuarios ni contraseñas: el rol sale de comparar la
 * dirección de Freighter con las direcciones registradas en el contrato.
 */
interface Sesion {
  wallet: EstadoWallet;
  conectar: () => Promise<EstadoWallet>;
  desconectar: () => void;
  modalAbierto: boolean;
  abrirModal: () => void;
  cerrarModal: () => void;
}

const ContextoSesion = createContext<Sesion | null>(null);

export function ProveedorSesion({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<EstadoWallet>({ estado: "desconectada" });
  const [modalAbierto, setModalAbierto] = useState(false);

  const conectar = useCallback(async () => {
    setWallet({ estado: "conectando" });
    const resultado = await conectarFreighter();
    setWallet(resultado);
    return resultado;
  }, []);

  const valor = useMemo<Sesion>(
    () => ({
      wallet,
      conectar,
      desconectar: () => setWallet({ estado: "desconectada" }),
      modalAbierto,
      abrirModal: () => setModalAbierto(true),
      cerrarModal: () => setModalAbierto(false),
    }),
    [wallet, conectar, modalAbierto],
  );

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}

/**
 * Sesión de la wallet. Fuera del proveedor (por ejemplo, en una prueba que renderiza solo una página)
 * devuelve una sesión local equivalente, para que cada pantalla funcione sola.
 */
export function useSesion(): Sesion {
  const contexto = useContext(ContextoSesion);
  const [wallet, setWallet] = useState<EstadoWallet>({ estado: "desconectada" });
  const [modalAbierto, setModalAbierto] = useState(false);
  const conectar = useCallback(async () => {
    setWallet({ estado: "conectando" });
    const resultado = await conectarFreighter();
    setWallet(resultado);
    return resultado;
  }, []);
  if (contexto) return contexto;
  return {
    wallet,
    conectar,
    desconectar: () => setWallet({ estado: "desconectada" }),
    modalAbierto,
    abrirModal: () => setModalAbierto(true),
    cerrarModal: () => setModalAbierto(false),
  };
}
