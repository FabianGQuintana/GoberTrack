import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PaginaPanel from "@/app/panel/[id]/page";
import { CUENTAS } from "@/lib/api/mock/escenario";

const freighter = vi.hoisted(() => ({
  isConnected: vi.fn(),
  getAddress: vi.fn(),
  requestAccess: vi.fn(),
  getNetwork: vi.fn(),
}));
vi.mock("@stellar/freighter-api", () => freighter);
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const PASSPHRASE_TESTNET = "Test SDF Network ; September 2015";
const PASSPHRASE_PUBLICA = "Public Global Stellar Network ; September 2015";

async function abrirPanel(id: string) {
  const usuario = userEvent.setup();
  render(await PaginaPanel({ params: Promise.resolve({ id }) }));
  return usuario;
}

async function simular(usuario: ReturnType<typeof userEvent.setup>, rol: string) {
  await usuario.selectOptions(screen.getByLabelText("Rol simulado"), rol);
  // `useAhora` completa el contexto después de montar.
  await screen.findByText(/Rol en esta obra:/);
}

/** El <details> de un hito, por su número en pantalla. */
function hitoPanel(numero: number): HTMLElement {
  const resumen = screen.getByText(new RegExp(`^Hito ${numero}:`), { selector: "summary strong" });
  return resumen.closest("details") as HTMLElement;
}

/** Párrafos "No aplica: <código>. <detalle>" de un ámbito (el código va en un <strong>). */
function motivos(ambito: { getAllByText: typeof screen.getAllByText }, texto: string): HTMLElement[] {
  return ambito.getAllByText((_c, el) => !!el?.matches("p.motivo") && (el.textContent ?? "").includes(`No aplica: ${texto}`));
}

beforeEach(() => {
  for (const f of Object.values(freighter)) f.mockReset();
});

describe("panel de firmantes: acciones con rol simulado", () => {
  it("antes de elegir rol no hay acciones y se explica qué hacer", async () => {
    await abrirPanel("1");
    expect(screen.getByRole("heading", { level: 1, name: "Panel de firmantes" })).toBeInTheDocument();
    expect(screen.getByText(/Conectá Freighter \(o simulá un rol\)/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aprobar hito/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Rol simulado")).toBeInTheDocument(); // NODE_ENV !== "production"
  });

  it("obra 1 como Veedor: 'Aprobar hito 2' deshabilitado con ObjecionAbierta visible", async () => {
    const u = await abrirPanel("1");
    await simular(u, "veedor");
    expect(screen.getByText("Veedor", { selector: "strong" })).toBeInTheDocument();
    const h2 = within(hitoPanel(2));
    const boton = h2.getByRole("button", { name: "Aprobar hito 2" });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAccessibleDescription(/ObjecionAbierta/);
    expect(motivos(h2, "ObjecionAbierta")[0]).toBeVisible();
    // El veedor tampoco puede declarar ni resolver.
    expect(h2.getByRole("button", { name: "Declarar hito 2" })).toBeDisabled();
    expect(motivos(h2, "Error de autorización del host").length).toBeGreaterThan(0);
    expect(h2.getByRole("button", { name: "Aceptar objeción del hito 2" })).toBeDisabled();
    expect(h2.getByRole("button", { name: "Liberar pago del hito 2" })).toBeDisabled();
    expect(h2.getByRole("button", { name: "Objetar hito 2" })).toBeDisabled();
  });

  it("obra 1 como Árbitro (dirección del municipio): rol 'Municipio y Árbitro' y 'Aceptar objeción' habilitado", async () => {
    const u = await abrirPanel("1");
    await simular(u, "arbitro");
    expect(screen.getByText("Municipio y Árbitro", { selector: "strong" })).toBeInTheDocument();
    const h2 = within(hitoPanel(2));
    expect(h2.getByRole("button", { name: "Aceptar objeción del hito 2" })).toBeEnabled();
    expect(h2.getByRole("button", { name: "Rechazar objeción del hito 2" })).toBeEnabled();
    // En el hito 1 (Pagado) no hay nada que resolver: EstadoInvalido.
    const h1 = within(hitoPanel(1));
    expect(h1.getByRole("button", { name: "Aceptar objeción del hito 1" })).toBeDisabled();
    expect(motivos(h1, "EstadoInvalido")[0]).toBeInTheDocument();
  });

  it("al hacer clic en 'Aceptar objeción' muestra lo que se enviaría: resolver_objecion(", async () => {
    const u = await abrirPanel("1");
    await simular(u, "arbitro");
    await u.click(within(hitoPanel(2)).getByRole("button", { name: "Aceptar objeción del hito 2" }));
    const vista = screen.getByRole("region", { name: "Lo que se enviaría al contrato" });
    expect(vista).toHaveTextContent("resolver_objecion(");
    expect(vista).toHaveTextContent("decision: Decision = Aceptar");
    expect(vista).toHaveTextContent("hito: u32 = 1");
    expect(vista).toHaveTextContent(CUENTAS.municipio);
    await u.click(within(vista).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("region", { name: "Lo que se enviaría al contrato" })).not.toBeInTheDocument();
  });

  it("obra 3 'Sin rol': 'Liberar pago del hito 2' habilitado y el clic muestra liberar_pago(", async () => {
    const u = await abrirPanel("3");
    await simular(u, "sin-rol");
    expect(screen.getByText("Sin rol", { selector: "strong" })).toBeInTheDocument();
    const h2 = within(hitoPanel(2));
    const liberar = h2.getByRole("button", { name: "Liberar pago del hito 2" });
    expect(liberar).toBeEnabled();
    await u.click(liberar);
    const vista = screen.getByRole("region", { name: "Lo que se enviaría al contrato" });
    expect(vista).toHaveTextContent("liberar_pago(");
    expect(vista).toHaveTextContent("obra: u32 = 3");
    expect(vista).toHaveTextContent("hito: u32 = 1");
    expect(vista).toHaveTextContent(/No pide la firma de un rol/);
    // Sin rol no puede firmar nada más.
    expect(h2.getByRole("button", { name: "Aprobar hito 2" })).toBeDisabled();
    expect(h2.getByRole("button", { name: "Aprobar hito 2" })).toHaveAccessibleDescription(/NoAutorizado/);
  });

  it("obra 1 como Inspector: aprobar el hito 2 → ObjecionAbierta (el inspector ya aprobó, pero manda el estado)", async () => {
    const u = await abrirPanel("1");
    await simular(u, "inspector");
    const h2 = within(hitoPanel(2));
    expect(h2.getByRole("button", { name: "Aprobar hito 2" })).toBeDisabled();
    expect(h2.getByRole("button", { name: "Aprobar hito 2" })).toHaveAccessibleDescription(/ObjecionAbierta/);
    // El hito 3 depende del 2 (Objetado): HitoAnteriorPendiente.
    expect(within(hitoPanel(3)).getByRole("button", { name: "Aprobar hito 3" })).toHaveAccessibleDescription(
      /HitoAnteriorPendiente/,
    );
  });

  it("obra 2 como Veedor: puede aprobar el hito 1 (Evidencia, dentro del período)", async () => {
    const u = await abrirPanel("2");
    await simular(u, "veedor");
    const h1 = within(hitoPanel(1));
    expect(h1.getByRole("button", { name: "Aprobar hito 1" })).toBeEnabled();
    await u.click(h1.getByRole("button", { name: "Aprobar hito 1" }));
    expect(screen.getByRole("region", { name: "Lo que se enviaría al contrato" })).toHaveTextContent("aprobar(");
  });

  it("obra 2 como Inspector: ya aprobó → YaDecidio", async () => {
    const u = await abrirPanel("2");
    await simular(u, "inspector");
    const boton = within(hitoPanel(1)).getByRole("button", { name: "Aprobar hito 1" });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAccessibleDescription(/YaDecidio/);
  });

  it("obra 1 como Contratista: declarar el hito 3 → HitoAnteriorPendiente", async () => {
    const u = await abrirPanel("1");
    await simular(u, "contratista");
    const boton = within(hitoPanel(3)).getByRole("button", { name: "Declarar hito 3" });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAccessibleDescription(/HitoAnteriorPendiente/);
  });

  it("el municipio puede fondear: el monto se valida en vivo con el motivo del contrato", async () => {
    const u = await abrirPanel("1"); // fondeado 25.000 de 40.000
    await simular(u, "municipio");
    const campo = screen.getByLabelText("Monto a depositar");
    const boton = screen.getByRole("button", { name: "Fondear la obra" });
    expect(boton).toBeDisabled(); // vacío → MontoInvalido
    expect(motivos(screen, "MontoInvalido")[0]).toBeInTheDocument();

    await u.type(campo, "15000,5");
    expect(boton).toBeDisabled();
    expect(motivos(screen, "ExcedeMontoTotal")[0]).toBeInTheDocument();
    expect(screen.getByText("= 15.000,5000000 USDC")).toBeInTheDocument();

    await u.clear(campo);
    await u.type(campo, "15000");
    expect(boton).toBeEnabled();
    await u.click(boton);
    const vista = screen.getByRole("region", { name: "Lo que se enviaría al contrato" });
    expect(vista).toHaveTextContent("fondear(");
    expect(vista).toHaveTextContent("monto: i128 = 150000000000");
  });

  it("un monto con formato inválido avisa y no habilita", async () => {
    const u = await abrirPanel("1");
    await simular(u, "municipio");
    await u.type(screen.getByLabelText("Monto a depositar"), "1.500,5");
    expect(screen.getByText(/No es un monto válido/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fondear la obra" })).toBeDisabled();
  });

  it("sin ser municipio, fondear queda con el motivo de autorización del host", async () => {
    const u = await abrirPanel("1");
    await simular(u, "contratista");
    expect(screen.getByRole("button", { name: "Fondear la obra" })).toBeDisabled();
    const fondear = screen.getByRole("button", { name: "Fondear la obra" }).closest(".accion") as HTMLElement;
    expect(within(fondear).getByText(/Error de autorización del host/, { selector: "strong" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Monto a depositar")).not.toBeInTheDocument();
  });

  it("volver a 'No simular' oculta las acciones", async () => {
    const u = await abrirPanel("1");
    await simular(u, "veedor");
    await u.selectOptions(screen.getByLabelText("Rol simulado"), "");
    expect(screen.queryByRole("button", { name: /Aprobar hito/ })).not.toBeInTheDocument();
  });

  it("el hito actual (primero sin pagar) viene abierto y los pagados cerrados", async () => {
    const u = await abrirPanel("1");
    await simular(u, "veedor");
    expect(hitoPanel(1)).not.toHaveAttribute("open");
    expect(hitoPanel(2)).toHaveAttribute("open");
  });

  it.each(["99", "abc"])("id %j → notFound", async (id) => {
    await expect(PaginaPanel({ params: Promise.resolve({ id }) })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
  });
});

describe("panel de firmantes: Freighter", () => {
  const conectar = async (u: ReturnType<typeof userEvent.setup>) =>
    u.click(screen.getByRole("button", { name: "Conectar Freighter" }));

  it("no instalado → aviso 'No encontramos Freighter'", async () => {
    freighter.isConnected.mockResolvedValue({ isConnected: false });
    const u = await abrirPanel("1");
    await conectar(u);
    expect(await screen.findByText(/No encontramos Freighter/)).toBeInTheDocument();
    expect(freighter.getAddress).not.toHaveBeenCalled();
  });

  it("isConnected con error → también 'No encontramos Freighter'", async () => {
    freighter.isConnected.mockResolvedValue({ isConnected: false, error: { code: -1, message: "x" } });
    const u = await abrirPanel("1");
    await conectar(u);
    expect(await screen.findByText(/No encontramos Freighter/)).toBeInTheDocument();
  });

  it("red PUBLIC → aviso de testnet", async () => {
    freighter.isConnected.mockResolvedValue({ isConnected: true });
    freighter.getAddress.mockResolvedValue({ address: CUENTAS.inspectorA });
    freighter.getNetwork.mockResolvedValue({ network: "PUBLIC", networkPassphrase: PASSPHRASE_PUBLICA });
    const u = await abrirPanel("1");
    await conectar(u);
    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent(/testnet/);
    expect(aviso).toHaveTextContent("PUBLIC");
  });

  it("dirección del inspector en testnet → rol Inspector y sin aviso de red", async () => {
    freighter.isConnected.mockResolvedValue({ isConnected: true });
    freighter.getAddress.mockResolvedValue({ address: CUENTAS.inspectorA });
    freighter.getNetwork.mockResolvedValue({ network: "TESTNET", networkPassphrase: PASSPHRASE_TESTNET });
    const u = await abrirPanel("1");
    await conectar(u);
    expect(await screen.findByText("Inspector", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/Conectada:/)).toHaveTextContent(CUENTAS.inspectorA);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/\(simulado\)/)).not.toBeInTheDocument();
    // Y las reglas se aplican a esa dirección: el inspector ya aprobó el hito 2 (Objetado).
    expect(within(hitoPanel(2)).getByRole("button", { name: "Aprobar hito 2" })).toBeDisabled();
  });

  it("sin permiso previo (address vacío) pide acceso con requestAccess", async () => {
    freighter.isConnected.mockResolvedValue({ isConnected: true });
    freighter.getAddress.mockResolvedValue({ address: "" });
    freighter.requestAccess.mockResolvedValue({ address: CUENTAS.veedorAromos });
    freighter.getNetwork.mockResolvedValue({ network: "TESTNET", networkPassphrase: PASSPHRASE_TESTNET });
    const u = await abrirPanel("1");
    await conectar(u);
    expect(await screen.findByText("Veedor", { selector: "strong" })).toBeInTheDocument();
    expect(freighter.requestAccess).toHaveBeenCalledOnce();
  });

  it("el usuario rechaza el acceso → mensaje de error de Freighter", async () => {
    freighter.isConnected.mockResolvedValue({ isConnected: true });
    freighter.getAddress.mockResolvedValue({ address: "" });
    freighter.requestAccess.mockResolvedValue({ address: "", error: { code: -4, message: "El usuario rechazó el pedido" } });
    const u = await abrirPanel("1");
    await conectar(u);
    expect(await screen.findByRole("alert")).toHaveTextContent("El usuario rechazó el pedido");
  });

  it("una dirección sin rol en la obra → 'Sin rol' y solo se puede liberar pagos", async () => {
    freighter.isConnected.mockResolvedValue({ isConnected: true });
    freighter.getAddress.mockResolvedValue({ address: "GALW3CGSZ3GBRSWLYYHXBBVICM2H6U5JASVMGQQBEBIRIYGQQTAIFK5H" });
    freighter.getNetwork.mockResolvedValue({ network: "TESTNET", networkPassphrase: PASSPHRASE_TESTNET });
    const u = await abrirPanel("3");
    await conectar(u);
    expect(await screen.findByText("Sin rol", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/Sin rol solo podés liberar pagos/)).toBeInTheDocument();
    expect(within(hitoPanel(2)).getByRole("button", { name: "Liberar pago del hito 2" })).toBeEnabled();
  });

  it("Desconectar vuelve al estado inicial", async () => {
    freighter.isConnected.mockResolvedValue({ isConnected: true });
    freighter.getAddress.mockResolvedValue({ address: CUENTAS.inspectorA });
    freighter.getNetwork.mockResolvedValue({ network: "TESTNET", networkPassphrase: PASSPHRASE_TESTNET });
    const u = await abrirPanel("1");
    await conectar(u);
    await screen.findByText(/Conectada:/);
    await u.click(screen.getByRole("button", { name: "Desconectar" }));
    expect(screen.getByRole("button", { name: "Conectar Freighter" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aprobar hito/ })).not.toBeInTheDocument();
  });

  it("el simulador de rol tiene prioridad sobre la wallet conectada", async () => {
    freighter.isConnected.mockResolvedValue({ isConnected: true });
    freighter.getAddress.mockResolvedValue({ address: CUENTAS.inspectorA });
    freighter.getNetwork.mockResolvedValue({ network: "TESTNET", networkPassphrase: PASSPHRASE_TESTNET });
    const u = await abrirPanel("1");
    await conectar(u);
    await screen.findByText("Inspector", { selector: "strong" });
    await u.selectOptions(screen.getByLabelText("Rol simulado"), "veedor");
    expect(await screen.findByText("Veedor", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("(simulado)")).toBeInTheDocument();
  });
});
