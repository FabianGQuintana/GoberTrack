// Fechas en hora argentina con zona fija, para que el HTML del servidor y el del navegador coincidan.

export const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

const FORMATO_MOMENTO = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: ZONA_HORARIA,
});

/** "16/10/2026, 14:32:05" (hora de Argentina, 24 h). */
export function formatearMomento(iso: string | number): string {
  return FORMATO_MOMENTO.format(typeof iso === "number" ? new Date(iso) : new Date(iso));
}

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: ZONA_HORARIA,
});

/** "16/10/2026 14:32" (hora de Argentina, sin segundos): el formato corto de la interfaz. */
export function formatearFechaHora(iso: string | number): string {
  return FORMATO_FECHA_HORA.format(new Date(iso)).replace(",", "");
}

/** Cuenta regresiva tipo reloj: "06:07:42", "00:42", o "2 d 05:07:42" si falta más de un día. */
export function formatearReloj(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const dias = Math.floor(total / 86400);
  const horas = Math.floor((total % 86400) / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;
  const dos = (n: number) => String(n).padStart(2, "0");
  const hms = horas > 0 || dias > 0 ? `${dos(horas)}:${dos(minutos)}:${dos(segundos)}` : `${dos(minutos)}:${dos(segundos)}`;
  return dias > 0 ? `${dias} d ${hms}` : hms;
}

/** Duración legible: "2 d 3 h", "3 h 05 min", "4 min 07 s", "12 s" (sin la unidad menor si es 0). */
export function formatearDuracion(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const dias = Math.floor(total / 86400);
  const horas = Math.floor((total % 86400) / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;
  const dos = (n: number) => String(n).padStart(2, "0");
  if (dias > 0) return horas > 0 ? `${dias} d ${horas} h` : `${dias} d`;
  if (horas > 0) return minutos > 0 ? `${horas} h ${dos(minutos)} min` : `${horas} h`;
  if (minutos > 0) return segundos > 0 ? `${minutos} min ${dos(segundos)} s` : `${minutos} min`;
  return `${segundos} s`;
}

/** Período de objeción en palabras: 60 → "1 min", 259200 → "3 d". */
export function formatearPeriodo(segundos: number): string {
  return formatearDuracion(segundos * 1000);
}
