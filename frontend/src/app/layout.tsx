import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { cliente } from "@/lib/api/cliente";
import { SIMBOLO_TOKEN } from "@/lib/montos";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Obra Pública Verificable", template: "%s · Obra Pública Verificable" },
  description:
    "Tablero público de obras con pagos por hito aprobados por inspector y veedor, registrados en Stellar.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body>
        <a className="saltar" href="#principal">
          Saltar al contenido
        </a>
        <header className="cabecera">
          <div className="cabecera__interior">
            <Link className="marca" href="/">
              Obra Pública Verificable
            </Link>
            <nav aria-label="Principal">
              <Link href="/">Tablero de obras</Link>
            </nav>
          </div>
        </header>
        <main id="principal" className="contenido">
          {cliente.modo === "mock" && (
            <p className="aviso aviso--alerta" role="note">
              <strong>DATO SIMULADO.</strong> Modo de demostración: las obras, montos, cuentas y
              eventos que ves son datos de prueba, no vienen de la red.
            </p>
          )}
          {children}
        </main>
        <footer className="pie">
          <div className="pie__interior">
            <p>
              Montos en {SIMBOLO_TOKEN} de prueba sobre Stellar testnet (SUPUESTO), con 7 decimales.
              Horarios en hora de Argentina.
            </p>
            <p>
              Origen de los datos:{" "}
              {cliente.modo === "mock" ? "simulados en el frontend (modo mock)" : "backend de la API"}.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
