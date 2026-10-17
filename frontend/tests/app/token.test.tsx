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

describe("inicio en modo mock: obra con token no oficial", () => {
  it("solo la obra 6 lleva 'Token no oficial', y solo ella queda sin 'USDCDEMO' en los montos", async () => {
    render(await PaginaObras());
    const tarjetas = within(screen.getByRole("list", { name: "Obras" })).getAllByRole("listitem");
    expect(tarjetas).toHaveLength(6);

    tarjetas.forEach((t, i) => {
      const esObra6 = i === 5;
      expect(!!within(t).queryByText("Token no oficial"), `obra ${i + 1}`).toBe(esObra6);
      expect(t.classList.contains("tarjeta--peligro"), `obra ${i + 1}`).toBe(esObra6);
      const montos = Array.from(t.querySelectorAll("dd"));
      expect(montos.length).toBeGreaterThan(0);
      for (const m of montos) expect(m.textContent?.includes("USDCDEMO"), `obra ${i + 1}: ${m.textContent}`).toBe(!esObra6);
    });
  });

  it("la obra 6 muestra sus montos sin símbolo", async () => {
    render(await PaginaObras());
    const t6 = within(screen.getByRole("list", { name: "Obras" })).getAllByRole("listitem")[5];
    expect(within(t6).getByRole("link", { name: "Bacheo calle Belgrano" })).toHaveAttribute("href", "/obras/6");
    expect(within(t6).getByText("5.000,0000000")).toBeInTheDocument(); // presupuesto vigente
  });
});

describe("detalle de obra en modo mock: aviso de token", () => {
  it("obra 6: aviso 'no usa el token oficial' y montos como NO oficiales", async () => {
    render(await PaginaObra(params("6")));
    const aviso = screen.getAllByRole("note").find((n) => /no usa el token oficial/.test(n.textContent ?? ""));
    expect(aviso).toBeDefined();
    expect(aviso).toHaveTextContent(TOKEN_NO_OFICIAL);
    expect(aviso).toHaveTextContent(/Token oficial:/);
    expect(screen.getByText(/Montos en un token que NO es el oficial de la demo/)).toBeInTheDocument();
    expect(screen.queryByText(/Montos en USDCDEMO/)).not.toBeInTheDocument();
  });

  it("obra 1: sin aviso, con 'Montos en USDCDEMO (token oficial de la demo…)'", async () => {
    render(await PaginaObra(params("1")));
    expect(screen.queryByText(/no usa el token oficial/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NO es el oficial/)).not.toBeInTheDocument();
    expect(screen.getByText(/Montos en USDCDEMO \(token oficial de la demo/)).toBeInTheDocument();
    expect(screen.getAllByText(TOKEN).length).toBeGreaterThan(0);
  });
});
