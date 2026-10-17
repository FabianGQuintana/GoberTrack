import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Public_Sans } from "next/font/google";
import { Cabecera } from "@/components/sesion/Cabecera";
import { ProveedorSesion } from "@/components/sesion/ProveedorSesion";
import { cliente } from "@/lib/api/cliente";
import { SIMBOLO_TOKEN } from "@/lib/montos";
import "./globals.css";

// Public Sans nació en un sistema de diseño de gobierno; IBM Plex Mono solo para direcciones y huellas.
const publicSans = Public_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--fuente-public-sans" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--fuente-plex-mono" });

export const metadata: Metadata = {
  title: { default: "GoberTrack", template: "%s · GoberTrack" },
  description:
    "Seguí cada obra pública hito por hito: pagos aprobados por inspector y veedor, con reglas que aplica un contrato en Stellar.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const simulado = cliente.modo === "mock";
  return (
    <html lang="es-AR" className={`${publicSans.variable} ${plexMono.variable}`}>
      <body>
        <a className="saltar" href="#principal">
          Saltar al contenido
        </a>
        <ProveedorSesion>
          <Cabecera simulado={simulado} />
          <main id="principal">{children}</main>
        </ProveedorSesion>
        <footer className="contenedor pie chico suave">
          <p>
            {simulado
              ? "DATO SIMULADO: las obras, montos, cuentas y eventos de esta pantalla son datos de ejemplo, no vienen de la red. "
              : "Los datos vienen del contrato en Stellar testnet, a través de nuestro backend; podés comprobarlos contra la red desde cada obra. "}
            Montos en {SIMBOLO_TOKEN}, un token de prueba con 7 decimales (DATO SIMULADO). Horarios en hora de Argentina.
          </p>
        </footer>
      </body>
    </html>
  );
}
