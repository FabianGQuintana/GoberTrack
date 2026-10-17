import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PaginaObra from "@/app/obras/[id]/page";
import PaginaObras from "@/app/page";
import { CUENTAS } from "@/lib/api/mock/escenario";

// `connection()` solo existe dentro del servidor de Next.
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
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

const tarjetas = () => within(screen.getByRole("list", { name: "Obras" })).getAllByRole("listitem");

describe("inicio (/)", () => {
  it("muestra las seis obras con avance, montos, estado y enlaces", async () => {
    render(await PaginaObras());
    expect(screen.getByRole("heading", { level: 1, name: "Seguí cada obra pública, hito por hito" })).toBeInTheDocument();
    expect(tarjetas()).toHaveLength(6);

    const t1 = tarjetas()[0];
    expect(within(t1).getByRole("link", { name: "Pavimentación calle Los Aromos" })).toHaveAttribute("href", "/obras/1");
    expect(within(t1).getByText("1 de 4 hitos pagados")).toBeInTheDocument();
    expect(valorDe(t1, "Presupuesto")).toBe("40.000,0000000 USDCDEMO");
    expect(valorDe(t1, "Fondos bloqueados")).toBe("15.000,0000000 USDCDEMO");
    expect(valorDe(t1, "Pagado")).toBe("10.000,0000000 USDCDEMO (25 %)");
    expect(within(t1).getByText("Activa")).toBeInTheDocument();
    expect(within(t1).getByRole("link", { name: /Panel de firmantes/ })).toHaveAttribute("href", "/panel/1");
    // Obra 1: el hito 2 tiene una objeción abierta.
    expect(within(t1).getByText("Requiere atención")).toBeInTheDocument();

    expect(within(tarjetas()[3]).getByText("Finalizada")).toBeInTheDocument();
    expect(within(tarjetas()[3]).getByText("2 de 2 hitos pagados")).toBeInTheDocument();
    expect(within(tarjetas()[3]).queryByText("Requiere atención")).not.toBeInTheDocument();
    // Obra 2: sin fondos (el saldo no alcanza para el próximo pago).
    expect(valorDe(tarjetas()[1], "Fondos bloqueados")).toBe("0,0000000 USDCDEMO");
    expect(within(tarjetas()[1]).getByText("Requiere atención")).toBeInTheDocument();
  });

  it("el buscador y los filtros por estado acotan las tarjetas", async () => {
    const u = userEvent.setup();
    render(await PaginaObras());
    expect(screen.getByRole("button", { name: "Todas · 6" })).toHaveAttribute("aria-pressed", "true");

    await u.click(screen.getByRole("button", { name: /^Finalizadas · / }));
    expect(tarjetas().every((t) => within(t).queryByText("Finalizada"))).toBe(true);

    await u.click(screen.getByRole("button", { name: "Todas · 6" }));
    await u.type(screen.getByLabelText("Buscar obra por nombre"), "escuela");
    expect(tarjetas()).toHaveLength(1);
    expect(within(tarjetas()[0]).getByRole("link", { name: "Refacción Escuela Primaria N° 512" })).toBeInTheDocument();

    await u.clear(screen.getByLabelText("Buscar obra por nombre"));
    await u.type(screen.getByLabelText("Buscar obra por nombre"), "no existe");
    expect(screen.getByText("Ninguna obra coincide con la búsqueda.")).toBeInTheDocument();
  });

  it("el filtro 'Requieren atención' deja solo las obras con algo para destrabar", async () => {
    const u = userEvent.setup();
    render(await PaginaObras());
    await u.click(screen.getByRole("button", { name: /^Requieren atención · / }));
    expect(tarjetas().length).toBeGreaterThan(0);
    for (const t of tarjetas()) expect(within(t).getByText("Requiere atención")).toBeInTheDocument();
  });
});

describe("detalle de obra (/obras/[id])", () => {
  it("obra 1: nombre, fondos, aviso, hitos con número y estado, y línea de tiempo", async () => {
    render(await PaginaObra(params("1")));
    expect(screen.getByRole("heading", { level: 1, name: "Pavimentación calle Los Aromos" })).toBeInTheDocument();

    // Fondos
    const fondos = screen.getByRole("region", { name: "Fondos de la obra" });
    expect(valorDe(fondos, "Presupuesto original")).toBe("40.000,0000000 USDCDEMO");
    expect(valorDe(fondos, "Presupuesto vigente")).toBe("40.000,0000000 USDCDEMO");
    expect(valorDe(fondos, "Depositado")).toBe("25.000,0000000 USDCDEMO");
    expect(valorDe(fondos, "Pagado")).toBe("10.000,0000000 USDCDEMO");
    expect(valorDe(fondos, "Saldo bloqueado")).toBe("15.000,0000000 USDCDEMO");
    expect(within(fondos).getByRole("img", { name: /25 % pagado, 37,5 % retenido en el contrato, 37,5 % sin depositar/ })).toBeInTheDocument();

    // Requiere atención: objeción abierta
    const atencion = screen.getByRole("region", { name: "Requiere atención" });
    expect(within(atencion).getByRole("heading", { name: "Hay una objeción abierta esperando al árbitro" })).toBeInTheDocument();

    // Hitos
    const hitos = within(screen.getByRole("list", { name: "Hitos" })).getAllByRole("listitem").filter((li) => li.matches("li.hito"));
    expect(hitos).toHaveLength(4);
    expect(within(hitos[0]).getByRole("heading", { name: "Hito 1: Movimiento de suelo y base granular" })).toBeInTheDocument();
    expect(within(hitos[0]).getByText("Pagado")).toBeInTheDocument();
    expect(within(hitos[1]).getByRole("heading", { name: "Hito 2: Cordón cuneta y desagües pluviales" })).toBeInTheDocument();
    expect(within(hitos[1]).getByText("Objetado")).toBeInTheDocument();
    expect(within(hitos[1]).getByText(/^Inspector aprobó/)).toBeInTheDocument();
    expect(within(hitos[1]).getByText(/^Veedor objetó/)).toBeInTheDocument();
    expect(within(hitos[1]).getByText(/Congelado por la objeción/)).toBeInTheDocument();
    expect(within(hitos[1]).getByText("15.000,0000000 USDCDEMO")).toBeInTheDocument();
    expect(within(hitos[2]).getByText("Pendiente")).toBeInTheDocument();
    expect(within(hitos[2]).getByText(/Bloqueado: espera que se apruebe el hito 2/)).toBeInTheDocument();
    expect(within(hitos[3]).getByRole("heading", { name: /Hito 4: Señalización/ })).toBeInTheDocument();

    // Enlaces para abrir la evidencia y el motivo del hito 2
    expect(within(hitos[1]).getAllByRole("link", { name: /Abrir (la evidencia|el motivo)/ })).toHaveLength(2);

    // Línea de tiempo
    const linea = screen.getByRole("list", { name: /Eventos de la obra/ });
    expect(within(linea).getAllByRole("listitem")).toHaveLength(10);
    expect(within(linea).getByRole("heading", { name: "Obra creada por el municipio" })).toBeInTheDocument();
    expect(within(linea).getByRole("heading", { name: "Hito 1 aprobado por el inspector" })).toBeInTheDocument();
    expect(within(linea).getByRole("heading", { name: "Hito 1 aprobado por el veedor" })).toBeInTheDocument();
    expect(within(linea).getByRole("heading", { name: "Pago del hito 1 liberado" })).toBeInTheDocument();
    // Del más reciente al más antiguo: lo último fue la objeción.
    expect(within(linea).getAllByRole("heading")[0]).toHaveTextContent("Hito 2 objetado por el veedor");
  });

  it("obra 3: el árbitro rechazó la objeción del hito 2, que queda listo para liberar", async () => {
    render(await PaginaObra(params("3")));
    expect(screen.getByText(/Veedor: el árbitro rechazó su objeción/)).toBeInTheDocument();
    expect(screen.getByText(/Listo para liberar el pago/)).toBeInTheDocument();
    // El hito 1 fue declarado dos veces: aparece la declaración anterior.
    expect(screen.getByText("Declaraciones anteriores (1)")).toBeInTheDocument();
    const linea = screen.getByRole("list", { name: /Eventos de la obra/ });
    expect(within(linea).getAllByRole("heading", { name: "Hito 1 declarado por el contratista" })).toHaveLength(2);
    expect(within(linea).getByRole("heading", { name: "Objeción del hito 1 aceptada por el árbitro" })).toBeInTheDocument();
    expect(within(linea).getByRole("heading", { name: "Objeción del hito 2 rechazada por el árbitro" })).toBeInTheDocument();
    // Y el aviso de un pago listo que nadie liberó.
    expect(within(screen.getByRole("region", { name: "Requiere atención" })).getByText(/listo para pagar que nadie liberó/)).toBeInTheDocument();
  });

  it("obra 2: hito 1 en Evidencia con período de 3 d y sin fondos", async () => {
    render(await PaginaObra(params("2")));
    expect(screen.getByRole("heading", { name: /Hito 1: Excavación/ })).toBeInTheDocument();
    expect(screen.getAllByText("Evidencia").length).toBeGreaterThan(0);
    expect(screen.getByText(/^Inspector aprobó/)).toBeInTheDocument();
    expect(screen.getByText("Veedor: sin decidir")).toBeInTheDocument();
    expect(screen.getByText(/período de objeción de 3 d/)).toBeInTheDocument();
    expect(screen.getByText(/El saldo depositado no alcanza para el próximo pago/)).toBeInTheDocument();
  });

  it("obra 4: Finalizada, con los dos pagos y sin avisos", async () => {
    render(await PaginaObra(params("4")));
    expect(screen.getAllByText("Finalizada").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Pagado el \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)).toHaveLength(2);
    expect(screen.queryByRole("region", { name: "Requiere atención" })).not.toBeInTheDocument();
  });

  it("participantes: direcciones de cada rol y nota de árbitro = municipio", async () => {
    render(await PaginaObra(params("1")));
    const part = screen.getByRole("region", { name: "Participantes" });
    expect(within(part).getByText(CUENTAS.inspectorA)).toBeInTheDocument();
    expect(within(part).getByText(CUENTAS.veedorAromos)).toBeInTheDocument();
    expect(within(part).getByText(/la misma dirección del municipio/)).toBeInTheDocument();
    expect(within(part).getByRole("button", { name: `Copiar dirección del inspector: ${CUENTAS.inspectorA}` })).toBeInTheDocument();
  });

  it("modo de demostración: 'Comprobar contra Stellar' deshabilitado con el motivo, verificador disponible", async () => {
    render(await PaginaObra(params("1")));
    const comprobar = screen.getByRole("button", { name: "Comprobar contra Stellar" });
    expect(comprobar).toBeDisabled();
    expect(comprobar).toHaveAccessibleDescription(/DATO SIMULADO/);
    expect(screen.getByRole("heading", { name: "Verificá un archivo de evidencia" })).toBeInTheDocument();
    expect(screen.getByText("Esto prueba que el archivo no cambió; no prueba que la obra esté bien hecha.")).toBeInTheDocument();
  });

  it.each(["99", "abc", "0", "-1", "01", "1.5", "4294967296"])("id %j → notFound", async (id) => {
    expect(await esNotFound(PaginaObra(params(id)))).toBe(true);
  });

  it("un id válido que existe no dispara notFound", async () => {
    expect(await esNotFound(PaginaObra(params("1")))).toBe(false);
  });
});
