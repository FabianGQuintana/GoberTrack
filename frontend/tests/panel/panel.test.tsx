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
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const PASSPHRASE_TESTNET = "Test SDF Network ; September 2015";
const PASSPHRASE_PUBLICA = "Public Global Stellar Network ; September 2015";

type Usuario = ReturnType<typeof userEvent.setup>;

async function abrirPanel(id: string, vista?: string) {
  const usuario = userEvent.setup();
  render(
    await PaginaPanel({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(vista ? { vista } : {}),
    }),
  );
  return usuario;
}

async function simular(usuario: Usuario, rol: string) {
  await usuario.selectOptions(screen.getByLabelText("Rol simulado"), rol);
  // `useAhora` completa el contexto después de montar.
  await screen.findByText(/Rol en esta obra:/);
}

const proximaAccion = () => screen.getByRole("region", { name: "Tu próxima acción" });
/** El modal de confirmación de una acción. */
const modal = () => screen.getByRole("dialog");

beforeEach(() => {
  for (const f of Object.values(freighter)) f.mockReset();
});

describe("panel: antes de elegir cuenta", () => {
  it("no hay acciones y se explica qué hacer", async () => {
    await abrirPanel("1");
    expect(screen.getByRole("heading", { level: 1, name: "Panel de firmantes" })).toBeInTheDocument();
    expect(screen.getByText(/Conectá Freighter \(o simulá un rol\) para ver tu vista/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Tu próxima acción" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Rol simulado")).toBeInTheDocument(); // NODE_ENV !== "production"
  });

  it("volver a 'No simular' oculta la vista", async () => {
    const u = await abrirPanel("2");
    await simular(u, "veedor");
    expect(proximaAccion()).toBeInTheDocument();
    await u.selectOptions(screen.getByLabelText("Rol simulado"), "");
    expect(screen.queryByRole("region", { name: "Tu próxima acción" })).not.toBeInTheDocument();
  });

  it.each(["99", "abc"])("id %j → notFound", async (id) => {
    await expect(PaginaPanel({ params: Promise.resolve({ id }) })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
  });
});

describe("vista del veedor", () => {
  it("obra 2 (Evidencia, dentro del período): aprobar habilitado; objetar pide el documento del motivo", async () => {
    const u = await abrirPanel("2");
    await simular(u, "veedor");
    expect(screen.getByText("Tu vista como veedor independiente")).toBeInTheDocument();
    const accion = within(proximaAccion());
    expect(accion.getByRole("heading", { name: /Decidí sobre el hito 1/ })).toBeInTheDocument();
    expect(accion.getByText("Te queda para objetar")).toBeInTheDocument();
    expect(accion.getByRole("button", { name: "Aprobar hito 1" })).toBeEnabled();
    const objetar = accion.getByRole("button", { name: "Objetar hito 1" });
    expect(objetar).toBeDisabled();
    expect(objetar).toHaveAccessibleDescription("Falta subir el documento con el motivo");
    expect(accion.getByText(/Decidís una sola vez por declaración/)).toBeInTheDocument();
  });

  it("aprobar abre la confirmación con lo que se enviaría: aprobar(", async () => {
    const u = await abrirPanel("2");
    await simular(u, "veedor");
    await u.click(screen.getByRole("button", { name: "Aprobar hito 1" }));
    expect(modal()).toHaveAccessibleName("¿Aprobar el hito 1?");
    expect(modal()).toHaveTextContent("Vas a registrar tu aprobación como veedor.");
    expect(modal()).toHaveTextContent("aprobar(");
    expect(modal()).toHaveTextContent(`firmante: Address = ${CUENTAS.veedorAgua}`);
    expect(modal()).toHaveTextContent("Vista previa: no se firmó ni se envió nada");
    await u.click(within(modal()).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("obra 1 (hito 2 objetado por el veedor): no hay decisión pendiente, espera al árbitro", async () => {
    const u = await abrirPanel("1");
    await simular(u, "veedor");
    expect(within(proximaAccion()).getByRole("heading", { name: "Tu objeción del hito 2 espera al árbitro" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aprobar hito/ })).not.toBeInTheDocument();
  });
});

describe("vista del árbitro", () => {
  it("obra 1: la cuenta del municipio es 'Municipio y Árbitro' y entra como árbitro por la objeción abierta", async () => {
    const u = await abrirPanel("1");
    await simular(u, "arbitro");
    expect(screen.getByText("Municipio y Árbitro", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("Tu vista como árbitro")).toBeInTheDocument();
    const confirmar = within(proximaAccion()).getByRole("button", { name: "Confirmar decisión" });
    expect(confirmar).toBeDisabled();
    expect(confirmar).toHaveAccessibleDescription("Elegí Aceptar o Rechazar para continuar");
  });

  it("elegir Rechazar explica la consecuencia y abre resolver_objecion(…Rechazar)", async () => {
    const u = await abrirPanel("1");
    await simular(u, "arbitro");
    const rechazar = screen.getByRole("radio", { name: /Rechazar la objeción/ });
    expect(rechazar).toHaveTextContent("Cuenta como la aprobación del veedor");
    await u.click(rechazar);
    expect(rechazar).toHaveAttribute("aria-checked", "true");
    await u.click(screen.getByRole("button", { name: "Confirmar decisión" }));
    expect(modal()).toHaveAccessibleName("¿Rechazar la objeción del hito 2?");
    expect(modal()).toHaveTextContent("resolver_objecion(");
    expect(modal()).toHaveTextContent("decision: Decision = Rechazar");
    expect(modal()).toHaveTextContent("hito: u32 = 1");
    expect(modal()).toHaveTextContent(CUENTAS.municipio);
  });

  it("la misma cuenta puede cambiar a la vista de municipio", async () => {
    const u = await abrirPanel("1");
    await simular(u, "arbitro");
    await u.click(screen.getByRole("button", { name: "Esta cuenta también es municipio: cambiar a esa vista" }));
    expect(screen.getByRole("heading", { level: 1, name: "Tus obras" })).toBeInTheDocument();
    expect(screen.getByText("Tu vista como municipio")).toBeInTheDocument();
  });

  it("?vista=municipio entra directo a esa vista", async () => {
    const u = await abrirPanel("1", "municipio");
    await simular(u, "municipio");
    expect(screen.getByRole("heading", { level: 1, name: "Tus obras" })).toBeInTheDocument();
  });
});

describe("vista del inspector", () => {
  it("obra 2: ya aprobó el hito 1, no tiene nada para revisar y la bandeja lo dice", async () => {
    const u = await abrirPanel("2");
    await simular(u, "inspector");
    expect(screen.getByRole("heading", { level: 1, name: "Hitos para revisar" })).toBeInTheDocument();
    expect(within(proximaAccion()).getByRole("heading", { name: "No tenés hitos para revisar en esta obra" })).toBeInTheDocument();
    const bandeja = screen.getByRole("heading", { name: "Tu bandeja" }).closest("section") as HTMLElement;
    expect(within(bandeja).getByText("Ya aprobaste este hito")).toBeInTheDocument();
  });
});

describe("vista del contratista", () => {
  it("obra 1: declarar el hito 3 → HitoAnteriorPendiente, y la lista de condiciones para cobrar el hito 2", async () => {
    const u = await abrirPanel("1");
    await simular(u, "contratista");
    expect(within(proximaAccion()).getByRole("heading", { name: "Esperá la decisión del árbitro sobre el hito 2" })).toBeInTheDocument();
    const declarar = screen.getByRole("button", { name: "Declarar hito 3" });
    expect(declarar).toBeDisabled();
    expect(declarar).toHaveAccessibleDescription(/HitoAnteriorPendiente/);

    const condiciones = within(screen.getByRole("list", { name: "Condiciones para cobrar el hito 2" })).getAllByRole("listitem");
    expect(condiciones).toHaveLength(6);
    expect(screen.getByText("Se cumplen 4 de 6 condiciones. Para cobrar tienen que cumplirse todas.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Liberar pago del hito 2" })).toHaveAccessibleDescription(/ObjecionAbierta/);
  });

  it("obra 5 (todo Pendiente): declarar el hito 1 pide primero la evidencia", async () => {
    const u = await abrirPanel("5");
    await simular(u, "contratista");
    const declarar = within(proximaAccion()).getByRole("button", { name: "Declarar hito 1" });
    expect(declarar).toBeDisabled();
    expect(declarar).toHaveAccessibleDescription("Primero subí la evidencia para obtener su huella");
  });

  it("no ve el formulario de depósito del municipio", async () => {
    const u = await abrirPanel("1");
    await simular(u, "contratista");
    expect(screen.queryByLabelText("Monto a depositar")).not.toBeInTheDocument();
  });
});

describe("vista del municipio: depositar", () => {
  it("propone el faltante y valida el monto en vivo con el motivo del contrato", async () => {
    const u = await abrirPanel("1", "municipio"); // fondeado 25.000 de 40.000
    await simular(u, "municipio");
    const campo = screen.getByLabelText("Monto a depositar");
    const boton = screen.getByRole("button", { name: "Depositar y firmar" });
    expect(campo).toHaveValue("15000");
    expect(boton).toBeEnabled();

    await u.clear(campo);
    expect(boton).toBeDisabled(); // vacío → MontoInvalido
    expect(boton).toHaveAccessibleDescription(/MontoInvalido/);

    await u.type(campo, "15000,5");
    expect(boton).toHaveAccessibleDescription(/ExcedeMontoTotal/);
    expect(screen.getByText(/^= 15\.000,5000000 USDCDEMO/)).toBeInTheDocument();

    await u.clear(campo);
    await u.type(campo, "15000");
    await u.click(boton);
    expect(modal()).toHaveTextContent("fondear(");
    expect(modal()).toHaveTextContent("monto: i128 = 150000000000");
    expect(modal()).toHaveTextContent("El saldo bloqueado pasa de 15.000,0000000 USDCDEMO a 30.000,0000000 USDCDEMO.");
  });

  it("un monto con formato inválido avisa y no habilita", async () => {
    const u = await abrirPanel("1", "municipio");
    await simular(u, "municipio");
    await u.clear(screen.getByLabelText("Monto a depositar"));
    await u.type(screen.getByLabelText("Monto a depositar"), "1.500,5");
    expect(screen.getByText(/No es un monto válido/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Depositar y firmar" })).toBeDisabled();
  });

  it("muestra el resumen financiero de sus obras con el total", async () => {
    const u = await abrirPanel("1", "municipio");
    await simular(u, "municipio");
    const tabla = screen.getByRole("table");
    expect(within(tabla).getByRole("link", { name: "Pavimentación calle Los Aromos" })).toBeInTheDocument();
    expect(within(tabla).getByText("Total")).toBeInTheDocument();
  });
});

describe("vista del municipio: crear obra", () => {
  const PRUEBA = "GALW3CGSZ3GBRSWLYYHXBBVICM2H6U5JASVMGQQBEBIRIYGQQTAIFK5H";

  async function completar(u: Usuario, roles: { contratista: string; inspector: string; veedor: string }) {
    await u.type(screen.getByLabelText("Nombre de la obra"), "Bacheo avenida Mitre");
    await u.type(screen.getByLabelText("Contratista"), roles.contratista);
    await u.type(screen.getByLabelText("Inspector"), roles.inspector);
    await u.type(screen.getByLabelText("Veedor independiente"), roles.veedor);
    for (const [i, monto] of ["6000", "9000", "9000", "6000"].entries()) {
      await u.type(screen.getByLabelText(`Descripción del hito ${i + 1}`), `Tramo ${i + 1}`);
      await u.type(screen.getByLabelText(`Monto del hito ${i + 1}`), monto);
    }
  }

  it("con roles repetidos no deja crear y muestra RolesDuplicados", async () => {
    const u = await abrirPanel("1", "municipio");
    await simular(u, "municipio");
    await completar(u, { contratista: CUENTAS.contratistaAromos, inspector: CUENTAS.inspectorA, veedor: CUENTAS.contratistaAromos });
    const crear = screen.getByRole("button", { name: "Crear obra y firmar" });
    expect(crear).toBeDisabled();
    expect(crear).toHaveAccessibleDescription(/RolesDuplicados/);
  });

  it("con datos válidos suma el presupuesto y abre crear_obra(", async () => {
    const u = await abrirPanel("1", "municipio");
    await simular(u, "municipio");
    await completar(u, { contratista: CUENTAS.contratistaAromos, inspector: CUENTAS.inspectorA, veedor: PRUEBA });
    expect(screen.getByText("30.000,0000000 USDCDEMO")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Crear obra y firmar" }));
    expect(modal()).toHaveAccessibleName("¿Crear la obra «Bacheo avenida Mitre»?");
    expect(modal()).toHaveTextContent("crear_obra(");
    expect(modal()).toHaveTextContent('"monto":"60000000000"');
    expect(modal()).toHaveTextContent("periodo_objecion: u64 = 60");
  });
});

describe("cuenta sin rol", () => {
  it("obra 3: no participa, pero puede liberar el pago listo del hito 2: liberar_pago(", async () => {
    const u = await abrirPanel("3");
    await simular(u, "sin-rol");
    expect(screen.getByText("Sin rol", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("Esta cuenta no participa en esta obra")).toBeInTheDocument();
    const liberar = screen.getByRole("button", { name: "Liberar pago del hito 2" });
    expect(liberar).toBeEnabled();
    await u.click(liberar);
    expect(modal()).toHaveTextContent("liberar_pago(");
    expect(modal()).toHaveTextContent("obra: u32 = 3");
    expect(modal()).toHaveTextContent("hito: u32 = 1");
    expect(modal()).toHaveTextContent(/No pide la firma de un rol/);
    expect(modal()).toHaveTextContent(/El dinero va siempre al contratista de la obra/);
  });
});

describe("panel: Freighter", () => {
  const conectar = async (u: Usuario) => u.click(screen.getByRole("button", { name: "Conectar Freighter" }));

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

  it("dirección del inspector en testnet → rol Inspector y su vista, sin aviso de red", async () => {
    freighter.isConnected.mockResolvedValue({ isConnected: true });
    freighter.getAddress.mockResolvedValue({ address: CUENTAS.inspectorA });
    freighter.getNetwork.mockResolvedValue({ network: "TESTNET", networkPassphrase: PASSPHRASE_TESTNET });
    const u = await abrirPanel("1");
    await conectar(u);
    expect(await screen.findByText("Inspector", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/Conectada:/)).toHaveTextContent(CUENTAS.inspectorA);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/\(simulado\)/)).not.toBeInTheDocument();
    expect(screen.getByText("Tu vista como inspector")).toBeInTheDocument();
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

  it("una dirección sin rol en la obra → 'Sin rol' y solo puede liberar pagos", async () => {
    freighter.isConnected.mockResolvedValue({ isConnected: true });
    freighter.getAddress.mockResolvedValue({ address: "GALW3CGSZ3GBRSWLYYHXBBVICM2H6U5JASVMGQQBEBIRIYGQQTAIFK5H" });
    freighter.getNetwork.mockResolvedValue({ network: "TESTNET", networkPassphrase: PASSPHRASE_TESTNET });
    const u = await abrirPanel("3");
    await conectar(u);
    expect(await screen.findByText("Sin rol", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/Sin rol solo podés liberar pagos/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Liberar pago del hito 2" })).toBeEnabled();
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
    expect(screen.queryByRole("region", { name: "Tu próxima acción" })).not.toBeInTheDocument();
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
