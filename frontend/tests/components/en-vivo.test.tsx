import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnVivo, INTERVALO_EN_VIVO_MS } from "@/components/EnVivo";

const m = vi.hoisted(() => ({
  refresh: vi.fn(),
  listarEventos: vi.fn(),
  cliente: { modo: "api" as "api" | "mock" },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/lib/api/cliente", () => ({
  cliente: new Proxy(m.cliente, {
    get: (objetivo, clave) => (clave === "listarEventos" ? m.listarEventos : Reflect.get(objetivo, clave)),
  }),
}));

const evento = (id: string) => ({ id, tipo: "HitoAprobado", obra_id: 3 });

async function avanzar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-10-16T12:00:00Z"));
  m.refresh.mockReset();
  m.listarEventos.mockReset();
  m.listarEventos.mockResolvedValue([]);
  m.cliente.modo = "api";
});
afterEach(() => vi.useRealTimers());

describe("EnVivo con obraId", () => {
  it("el intervalo es de 5 s", () => {
    expect(INTERVALO_EN_VIVO_MS).toBe(5000);
  });

  it("no consulta antes de los 5 s; después, listarEventos(obraId, últimoId) cada 5 s", async () => {
    render(<EnVivo obraId={3} ultimoEventoId="42" />);
    await avanzar(4999);
    expect(m.listarEventos).not.toHaveBeenCalled();
    await avanzar(1);
    expect(m.listarEventos).toHaveBeenCalledTimes(1);
    expect(m.listarEventos).toHaveBeenLastCalledWith(3, "42");
    await avanzar(5000);
    expect(m.listarEventos).toHaveBeenCalledTimes(2);
  });

  it("sin eventos nuevos no llama a refresh y muestra la última consulta sin novedades", async () => {
    render(<EnVivo obraId={3} ultimoEventoId="42" />);
    await avanzar(5000);
    expect(m.refresh).not.toHaveBeenCalled();
    expect(screen.getByText(/Última consulta/)).toBeInTheDocument();
    expect(screen.getByText(/Última consulta.*\.$/)).not.toHaveTextContent("nuevo");
  });

  it("con eventos nuevos llama a refresh una vez y actualiza `desde` con el último id recibido", async () => {
    m.listarEventos.mockResolvedValueOnce([evento("43"), evento("44")]);
    render(<EnVivo obraId={3} ultimoEventoId="42" />);
    await avanzar(5000);
    expect(m.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/2 eventos nuevos/)).toBeInTheDocument();

    await avanzar(5000);
    expect(m.listarEventos).toHaveBeenLastCalledWith(3, "44");
    expect(m.refresh).toHaveBeenCalledTimes(1); // la segunda consulta no trajo nada
  });

  it("un solo evento nuevo se muestra en singular", async () => {
    m.listarEventos.mockResolvedValueOnce([evento("43")]);
    render(<EnVivo obraId={3} ultimoEventoId="42" />);
    await avanzar(5000);
    expect(screen.getByText(/1 evento nuevo/)).toBeInTheDocument();
  });

  it("sin ultimoEventoId consulta sin `desde`", async () => {
    render(<EnVivo obraId={3} ultimoEventoId={null} />);
    await avanzar(5000);
    expect(m.listarEventos).toHaveBeenLastCalledWith(3, undefined);
  });

  it("si la página trae un último id más nuevo (tras el refresh), se usa ese", async () => {
    const { rerender } = render(<EnVivo obraId={3} ultimoEventoId="42" />);
    rerender(<EnVivo obraId={3} ultimoEventoId="50" />);
    await avanzar(5000);
    expect(m.listarEventos).toHaveBeenLastCalledWith(3, "50");
  });

  it("si la consulta falla, avisa que se reintenta, no refresca y sigue consultando", async () => {
    m.listarEventos.mockRejectedValueOnce(new Error("sin conexión"));
    render(<EnVivo obraId={3} ultimoEventoId="42" />);
    await avanzar(5000);
    expect(screen.getByText(/No se pudo consultar el backend/)).toBeInTheDocument();
    expect(m.refresh).not.toHaveBeenCalled();
    await avanzar(5000);
    expect(m.listarEventos).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Última consulta/)).toBeInTheDocument();
  });

  it("no solapa consultas: si la anterior sigue en curso, la siguiente se salta", async () => {
    let terminar: (e: unknown[]) => void = () => undefined;
    m.listarEventos.mockImplementationOnce(() => new Promise((r) => (terminar = r)));
    render(<EnVivo obraId={3} ultimoEventoId="42" />);
    await avanzar(5000);
    await avanzar(5000);
    expect(m.listarEventos).toHaveBeenCalledTimes(1);
    await act(async () => terminar([]));
    await avanzar(5000);
    expect(m.listarEventos).toHaveBeenCalledTimes(2);
  });

  it("al desmontar deja de consultar", async () => {
    const { unmount } = render(<EnVivo obraId={3} ultimoEventoId="42" />);
    unmount();
    await avanzar(30_000);
    expect(m.listarEventos).not.toHaveBeenCalled();
  });

  it("avisa que se actualiza cada 5 s", () => {
    render(<EnVivo obraId={3} ultimoEventoId="42" />);
    expect(screen.getByText(/En vivo: se actualiza cada 5 s/)).toBeInTheDocument();
  });
});

describe("EnVivo sin obraId (listado)", () => {
  it("refresca siempre, cada 5 s, sin pedir eventos", async () => {
    render(<EnVivo />);
    await avanzar(5000);
    expect(m.refresh).toHaveBeenCalledTimes(1);
    await avanzar(5000);
    expect(m.refresh).toHaveBeenCalledTimes(2);
    expect(m.listarEventos).not.toHaveBeenCalled();
  });
});

describe("EnVivo en modo mock", () => {
  it("no renderiza nada ni consulta", async () => {
    m.cliente.modo = "mock";
    const { container } = render(<EnVivo obraId={3} ultimoEventoId="42" />);
    expect(container).toBeEmptyDOMElement();
    await avanzar(30_000);
    expect(m.listarEventos).not.toHaveBeenCalled();
    expect(m.refresh).not.toHaveBeenCalled();
  });

  it("el listado tampoco refresca", async () => {
    m.cliente.modo = "mock";
    const { container } = render(<EnVivo />);
    expect(container).toBeEmptyDOMElement();
    await avanzar(30_000);
    expect(m.refresh).not.toHaveBeenCalled();
  });
});
