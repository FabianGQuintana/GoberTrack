import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EstadoPago, MARGEN_RELOJ_MS } from "@/components/EstadoPago";
import { finPeriodo } from "@/lib/reglas";
import { AHORA, declaradoHace, hito, hitoEnEstado, obra, UNIDAD } from "../helpers/fixtures";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
});
afterEach(() => vi.useRealTimers());

const LISTO = /Listo para liberar el pago/;
const ESPERA = /Aprobado: el pago se puede liberar cuando termine el período de objeción/;

/** Hito Aprobado cuyo período (60 s en la obra de prueba) termina `enMs` después de AHORA. */
const aprobadoQueTerminaEn = (enMs: number) =>
  hito(1, "Aprobado", {
    ...declaradoHace(60_000 - enMs),
    aprobo_inspector: true,
    aprobo_veedor: true,
  });

async function montar(h = aprobadoQueTerminaEn(30_000), o = obra()) {
  const r = render(<EstadoPago hito={h} obra={o} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return r;
}

describe("EstadoPago: Aprobado con saldo", () => {
  it("fin en el futuro → todavía no está listo", async () => {
    const h = aprobadoQueTerminaEn(30_000);
    expect(finPeriodo(h, obra())).toBe(AHORA + 30_000);
    await montar(h);
    expect(screen.getByText(ESPERA)).toBeInTheDocument();
    expect(screen.queryByText(LISTO)).not.toBeInTheDocument();
  });

  it("pasa a 'Listo' recién cuando ahora - 10 s >= fin, sin recargar", async () => {
    await montar(aprobadoQueTerminaEn(30_000));
    // fin = AHORA + 30 s → listo cuando el reloj llega a AHORA + 40 s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByText(ESPERA)).toBeInTheDocument(); // el período terminó, pero falta el margen
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MARGEN_RELOJ_MS - 1000);
    });
    expect(screen.getByText(ESPERA)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText(LISTO)).toBeInTheDocument();
    expect(screen.queryByText(ESPERA)).not.toBeInTheDocument();
  });

  it("el margen vale 10 s", () => {
    expect(MARGEN_RELOJ_MS).toBe(10_000);
  });

  it("período vencido hace exactamente el margen → listo", async () => {
    await montar(aprobadoQueTerminaEn(-MARGEN_RELOJ_MS));
    expect(screen.getByText(LISTO)).toBeInTheDocument();
  });

  it("período vencido hace menos del margen → todavía no", async () => {
    await montar(aprobadoQueTerminaEn(-MARGEN_RELOJ_MS + 1000));
    expect(screen.getByText(ESPERA)).toBeInTheDocument();
  });

  it("pagable: true lo muestra listo aunque el reloj local diga que no", async () => {
    await montar({ ...aprobadoQueTerminaEn(30_000), pagable: true });
    expect(screen.getByText(LISTO)).toBeInTheDocument();
  });
});

describe("EstadoPago: otros casos", () => {
  it("falta fondear: Aprobado con saldo menor al monto vigente", async () => {
    await montar(aprobadoQueTerminaEn(-600_000), obra({ saldo: (5n * UNIDAD).toString() }));
    expect(screen.getByText(/el saldo bloqueado no alcanza: falta fondear/)).toBeInTheDocument();
    expect(screen.queryByText(LISTO)).not.toBeInTheDocument();
  });

  it("falta fondear tiene prioridad sobre pagable", async () => {
    await montar({ ...aprobadoQueTerminaEn(-600_000), pagable: true }, obra({ saldo: "0" }));
    expect(screen.getByText(/falta fondear/)).toBeInTheDocument();
    expect(screen.queryByText(LISTO)).not.toBeInTheDocument();
  });

  it("saldo igual al monto vigente alcanza", async () => {
    await montar(aprobadoQueTerminaEn(-600_000), obra({ saldo: (10n * UNIDAD).toString() }));
    expect(screen.getByText(LISTO)).toBeInTheDocument();
  });

  it("Objetado: congelado hasta que resuelva el árbitro", async () => {
    await montar(hitoEnEstado(1, "Objetado"));
    expect(screen.getByText(/Congelado por la objeción hasta que resuelva el árbitro/)).toBeInTheDocument();
  });

  it("Pagado con momento_pago: 'Pagado el …'; sin momento, 'Pagado'", async () => {
    const { unmount } = await montar(hitoEnEstado(1, "Pagado"));
    expect(screen.getByText(/^Pagado el \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)).toBeInTheDocument();
    unmount();
    await montar({ ...hitoEnEstado(1, "Pagado"), momento_pago: null });
    expect(screen.getByText("Pagado")).toBeInTheDocument();
  });

  it.each(["Pendiente", "Evidencia"] as const)("%s: requiere las dos aprobaciones y el período cumplido", async (estado) => {
    await montar(hitoEnEstado(1, estado));
    expect(screen.getByText("Requiere las dos aprobaciones y el período cumplido")).toBeInTheDocument();
  });
});
