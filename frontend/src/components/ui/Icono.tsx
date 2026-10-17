// Íconos de trazo del sistema de diseño (24 × 24, sin relleno). Siempre acompañan un texto: el ícono
// solo nunca comunica un estado (regla de accesibilidad del diseño), por eso van con aria-hidden.

const TRAZOS = {
  alerta: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17.5v.01" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  "check-circulo": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </>
  ),
  volver: <path d="M15 6l-6 6 6 6" />,
  reloj: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  copiar: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 012-2h9" />
    </>
  ),
  guion: <path d="M6 12h12" />,
  externo: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />,
  archivo: (
    <>
      <path d="M7 3h7l5 5v12a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M14 3v5h5" />
    </>
  ),
  red: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.01" />
    </>
  ),
  candado: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </>
  ),
  firma: <path d="M4 20l4-1L19 8l-3-3L5 16z" />,
  mas: <path d="M12 5v14M5 12h14" />,
  buscar: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </>
  ),
  escudo: (
    <>
      <path d="M12 3l8 3v6c0 4.5-3.4 7.6-8 9-4.6-1.4-8-4.5-8-9V6z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </>
  ),
  papelera: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  subir: <path d="M12 16V5M7 10l5-5 5 5M5 19h14" />,
  wallet: (
    <>
      <path d="M4 7a2 2 0 012-2h11v3" />
      <rect x="4" y="7" width="16" height="12" rx="2" />
      <path d="M16 13h2" />
    </>
  ),
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
  luna: <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />,
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({
  nombre,
  tamano,
  className,
  style,
}: {
  nombre: NombreIcono;
  tamano?: 14 | 16 | 24 | 26 | 28 | 30;
  className?: string;
  style?: React.CSSProperties;
}) {
  const medida = tamano ? { width: tamano, height: tamano } : undefined;
  return (
    <svg
      className={`ic${className ? ` ${className}` : ""}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ ...medida, ...style }}
    >
      {TRAZOS[nombre]}
    </svg>
  );
}
