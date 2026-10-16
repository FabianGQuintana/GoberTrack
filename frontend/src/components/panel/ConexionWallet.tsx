"use client";

import { conectarFreighter, type EstadoWallet } from "@/lib/wallet";

export function ConexionWallet({
  wallet,
  alCambiar,
}: {
  wallet: EstadoWallet;
  alCambiar: (wallet: EstadoWallet) => void;
}) {
  async function conectar() {
    alCambiar({ estado: "conectando" });
    alCambiar(await conectarFreighter());
  }

  return (
    <div className="pila">
      {wallet.estado === "conectada" ? (
        <div className="fila">
          <span>
            Conectada: <code>{wallet.direccion}</code> · red {wallet.red || "desconocida"}
          </span>
          <button type="button" className="boton boton--secundario" onClick={() => alCambiar({ estado: "desconectada" })}>
            Desconectar
          </button>
        </div>
      ) : (
        <div>
          <button type="button" className="boton" onClick={conectar} disabled={wallet.estado === "conectando"}>
            {wallet.estado === "conectando" ? "Conectando…" : "Conectar Freighter"}
          </button>
        </div>
      )}

      <div aria-live="polite">
        {wallet.estado === "sin-freighter" && (
          <p className="aviso aviso--peligro" role="alert">
            No encontramos Freighter en este navegador. Instalá la extensión desde{" "}
            <a href="https://www.freighter.app/" target="_blank" rel="noreferrer">
              freighter.app
            </a>{" "}
            y recargá la página.
          </p>
        )}
        {wallet.estado === "error" && (
          <p className="aviso aviso--peligro" role="alert">
            No se pudo conectar con Freighter: {wallet.mensaje}
          </p>
        )}
        {wallet.estado === "conectada" && !wallet.esTestnet && (
          <p className="aviso aviso--alerta" role="alert">
            Freighter está en la red <strong>{wallet.red || "desconocida"}</strong>. Esta demo funciona en
            Stellar <strong>testnet</strong>: cambiá la red en Freighter y volvé a conectar.
          </p>
        )}
      </div>
    </div>
  );
}
