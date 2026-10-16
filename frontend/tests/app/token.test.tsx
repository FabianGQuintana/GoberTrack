import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PaginaObra from "@/app/obras/[id]/page";
import PaginaObras from "@/app/page";
import { TOKEN, TOKEN_NO_OFICIAL } from "@/lib/api/mock/cuentas";

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("tablero en modo mock: aviso de token no oficial", () => {
  it("solo la obra 6 lleva 'Token no oficial', y solo ella queda sin 'USDC' en los montos", async () => {
    render(await PaginaObras());
    const tarjetas = within(screen.getByRole("list", { name: "Obras" })).getAllByRole("listitem");
    expect(tarjetas).toHaveLength(6);

    tarjetas.forEach((t, i) => {
      const esObra6 = i === 5;
      const marca = within(t).queryByText("Token no oficial");
      expect(!!marca, `obra ${i + 1}`).toBe(esObra6);
      expect(t.classList.contains("tarjeta--alerta"), `obra ${i + 1}`).toBe(esObra6);
      expect(within(t).queryByText(/Esta obra no usa el token de la demo/) !== null, `obra ${i + 1}`).toBe(esObra6);
      const montos = t.querySelectorAll(".monto");
      expect(montos.length).toBeGreaterThan(0);
      for (const m of montos) expect(m.textContent?.includes("USDC"), `obra ${i + 1}: ${m.textContent}`).toBe(!esObra6);
    });
  });

  it("la obra 6 muestra sus montos sin símbolo y su token marcado como NO oficial", async () => {
    render(await PaginaObras());
    const t6 = within(screen.getByRole("list", { name: "Obras" })).getAllByRole("listitem")[5];
    expect(within(t6).getByRole("link", { name: "Bacheo calle Belgrano" })).toHaveAttribute("href", "/obras/6");
    expect(within(t6).getAllByText("5.000,0000000")).toHaveLength(2); // presupuesto vigente y fondeado
    expect(within(t6).getByText("(NO es el oficial)")).toBeInTheDocument();
    const t1 = within(screen.getByRole("list", { name: "Obras" })).getAllByRole("listitem")[0];
    expect(within(t1).getByText("(oficial)")).toBeInTheDocument();
  });
});

describe("detalle de obra en modo mock: aviso de token", () => {
  it("obra 6: aviso 'no usa el token oficial' y montos como NO oficiales", async () => {
    render(await PaginaObra(params("6")));
    const aviso = screen.getAllByRole("note").find((n) => /no usa el token oficial/.test(n.textContent ?? ""));
    expect(aviso).toBeDefined();
    expect(aviso).toHaveTextContent(TOKEN_NO_OFICIAL);
    expect(aviso).toHaveTextContent(/Token oficial \(SAC\)/);
    expect(screen.getByText(/Montos en un token que NO es el oficial de la demo/)).toBeInTheDocument();
    expect(screen.queryByText(/Montos en USDC/)).not.toBeInTheDocument();
  });

  it("obra 1: sin aviso, con 'Montos en USDC (token oficial de la demo)'", async () => {
    render(await PaginaObra(params("1")));
    expect(screen.queryByText(/no usa el token oficial/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NO es el oficial/)).not.toBeInTheDocument();
    expect(screen.getByText(/Montos en USDC \(token oficial de la demo\)/)).toBeInTheDocument();
    expect(screen.getAllByText(TOKEN).length).toBeGreaterThan(0);
  });
});
