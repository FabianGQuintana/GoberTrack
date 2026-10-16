import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PaginaObra from "@/app/obras/[id]/page";
import PaginaObras from "@/app/page";
import { CUENTAS } from "@/lib/api/mock/escenario";

// `connection()` solo existe dentro del servidor de Next.
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));

/** Texto del <dd> que sigue al <dt> con ese texto. */
function valorDe(dentro: HTMLElement, etiqueta: RegExp | string): string | null {
  return within(dentro).getByText(etiqueta, { selector: "dt" }).nextElementSibling?.textContent ?? null;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

/** `notFound()` lanza un error con este `digest` también fuera de Next. */
async function esNotFound(promesa: Promise<unknown>): Promise<boolean> {
  try {
    await promesa;
    return false;
  } catch (e) {
    return String((e as { digest?: string }).digest ?? "").includes("NEXT_HTTP_ERROR_FALLBACK;404");
  }
}

describe("listado de obras (/)", () => {
  it("muestra las seis obras con montos formateados, estados y enlaces", async () => {
    render(await PaginaObras());
    expect(screen.getByRole("heading", { level: 1, name: "Tablero de obras" })).toBeInTheDocument();
    const lista = screen.getByRole("list", { name: "Obras" });
    const tarjetas = within(lista).getAllByRole("listitem");
    expect(tarjetas).toHaveLength(6);

    const t1 = tarjetas[0];
    expect(within(t1).getByRole("link", { name: "Pavimentación calle Los Aromos" })).toHaveAttribute("href", "/obras/1");
    expect(within(t1).getByText("40.000,0000000 USDC")).toBeInTheDocument(); // presupuesto vigente
    expect(within(t1).getByText("25.000,0000000 USDC")).toBeInTheDocument(); // fondeado
    expect(within(t1).getByText("10.000,0000000 USDC")).toBeInTheDocument(); // pagado
    expect(within(t1).getByText("15.000,0000000 USDC")).toBeInTheDocument(); // saldo
    expect(within(t1).getByText("(25 %)")).toBeInTheDocument();
    expect(within(t1).getByText("1 de 4 pagados")).toBeInTheDocument();
    expect(within(t1).getByText("Activa")).toBeInTheDocument();
    expect(within(t1).getByRole("link", { name: /Panel de firmantes/ })).toHaveAttribute("href", "/panel/1");

    expect(within(tarjetas[3]).getByText("Finalizada")).toBeInTheDocument();
    expect(within(tarjetas[3]).getByText("2 de 2 pagados")).toBeInTheDocument();
    // Obra 2: sin fondos
    expect(valorDe(tarjetas[1], "Presupuesto vigente")).toBe("36.000,0000000 USDC");
    expect(valorDe(tarjetas[1], "Fondeado")).toBe("0,0000000 USDC");
    expect(valorDe(tarjetas[1], "Saldo bloqueado")).toBe("0,0000000 USDC");
  });
});

describe("detalle de obra (/obras/[id])", () => {
  it("obra 1: nombre, montos, hitos con número y estado, y línea de tiempo", async () => {
    render(await PaginaObra(params("1")));
    expect(screen.getByRole("heading", { level: 1, name: "Pavimentación calle Los Aromos" })).toBeInTheDocument();

    // Fondos
    const fondos = screen.getByRole("region", { name: "Fondos" });
    expect(valorDe(fondos, "Presupuesto original")).toBe("40.000,0000000");
    expect(valorDe(fondos, "Presupuesto vigente")).toBe("40.000,0000000");
    expect(valorDe(fondos, "Fondeado por el municipio")).toBe("25.000,0000000");
    expect(valorDe(fondos, "Pagado al contratista")).toBe("10.000,0000000");
    expect(valorDe(fondos, "Saldo bloqueado en el contrato")).toBe("15.000,0000000");
    expect(within(fondos).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");

    // Hitos
    const seccion = screen.getByRole("region", { name: "Hitos" });
    const hitos = within(seccion).getAllByRole("listitem", { name: "" }).filter((li) => li.matches("li.hito"));
    expect(hitos).toHaveLength(4);
    expect(within(hitos[0]).getByRole("heading", { name: "Hito 1: Movimiento de suelo y base granular" })).toBeInTheDocument();
    expect(within(hitos[0]).getByText("Pagado")).toBeInTheDocument();
    expect(within(hitos[1]).getByRole("heading", { name: "Hito 2: Cordón cuneta y desagües pluviales" })).toBeInTheDocument();
    expect(within(hitos[1]).getByText("Objetado")).toBeInTheDocument();
    expect(within(hitos[1]).getByText("✓ Inspector aprobó")).toBeInTheDocument();
    expect(within(hitos[1]).getByText(/Veedor objetó/)).toBeInTheDocument();
    expect(within(hitos[1]).getByText(/Congelado por la objeción/)).toBeInTheDocument();
    expect(within(hitos[1]).getByText("15.000,0000000")).toBeInTheDocument();
    expect(within(hitos[2]).getByText("Pendiente")).toBeInTheDocument();
    expect(within(hitos[2]).getByText(/Bloqueado: el hito 2 todavía no está aprobado ni pagado/)).toBeInTheDocument();
    expect(within(hitos[3]).getByRole("heading", { name: /Hito 4: Señalización/ })).toBeInTheDocument();

    // Enlaces de descarga con el hash completo y el hash del motivo
    expect(within(hitos[1]).getAllByRole("link", { name: /Descargar (evidencia|motivo)/ })).toHaveLength(2);

    // Línea de tiempo
    const linea = screen.getByRole("region", { name: "Línea de tiempo" });
    const items = within(linea).getAllByRole("listitem");
    expect(items.length).toBe(10); // creada, 2 fondeos, 2 declaraciones, 2 aprobaciones, 1 pago, 1 objeción... ver escenario
    expect(within(linea).getByRole("heading", { name: "Obra creada por el municipio" })).toBeInTheDocument();
    expect(within(linea).getByRole("heading", { name: "Hito 1 aprobado por el inspector" })).toBeInTheDocument();
    expect(within(linea).getByRole("heading", { name: "Hito 1 aprobado por el veedor" })).toBeInTheDocument();
    expect(within(linea).getByRole("heading", { name: "Pago del hito 1 liberado" })).toBeInTheDocument();
    expect(within(linea).getByRole("heading", { name: "Hito 2 objetado por el veedor" })).toBeInTheDocument();
  });

  it("obra 3: 'Veedor por resolución del árbitro' y el hito 2 listo para liberar", async () => {
    render(await PaginaObra(params("3")));
    expect(screen.getByText(/Veedor por resolución del árbitro/)).toBeInTheDocument(); // con la marca ✓ delante
    expect(screen.getByText(/Listo para liberar el pago/)).toBeInTheDocument();
    // El hito 1 fue declarado dos veces: aparece la declaración anterior.
    expect(screen.getByText("Declaraciones anteriores")).toBeInTheDocument();
    const linea = screen.getByRole("region", { name: "Línea de tiempo" });
    expect(within(linea).getAllByRole("heading", { name: "Hito 1 declarado por el contratista" })).toHaveLength(2);
    expect(within(linea).getByRole("heading", { name: "Objeción del hito 1 aceptada por el árbitro" })).toBeInTheDocument();
    expect(within(linea).getByRole("heading", { name: "Objeción del hito 2 rechazada por el árbitro" })).toBeInTheDocument();
  });

  it("obra 2: hito 1 en Evidencia con cuenta regresiva y sin fondos (saldo 0)", async () => {
    render(await PaginaObra(params("2")));
    expect(screen.getByRole("heading", { name: /Hito 1: Excavación/ })).toBeInTheDocument();
    expect(screen.getByText("Evidencia")).toBeInTheDocument();
    expect(screen.getByText("✓ Inspector aprobó")).toBeInTheDocument();
    expect(screen.getByText("Veedor: sin decidir")).toBeInTheDocument();
    expect(screen.getByText(/período de objeción de 3 d/)).toBeInTheDocument();
  });

  it("obra 4: Finalizada", async () => {
    render(await PaginaObra(params("4")));
    expect(screen.getAllByText("Finalizada").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Pagado el /)).toHaveLength(2);
  });

  it("participantes: direcciones de cada rol y nota de árbitro = municipio", async () => {
    render(await PaginaObra(params("1")));
    const part = screen.getByRole("region", { name: "Participantes" });
    expect(within(part).getByText(CUENTAS.inspectorA)).toBeInTheDocument();
    expect(within(part).getByText(CUENTAS.veedorAromos)).toBeInTheDocument();
    expect(within(part).getByText(/la misma dirección del municipio/)).toBeInTheDocument();
  });

  it.each(["99", "abc", "0", "-1", "01", "1.5", "4294967296"])("id %j → notFound", async (id) => {
    expect(await esNotFound(PaginaObra(params(id)))).toBe(true);
  });

  it("un id válido que existe no dispara notFound", async () => {
    expect(await esNotFound(PaginaObra(params("1")))).toBe(false);
  });
});
