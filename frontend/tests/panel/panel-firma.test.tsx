import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrKey } from "@stellar/stellar-sdk/base";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PaginaPanel from "@/app/panel/[id]/page";
import { CUENTAS } from "@/lib/api/mock/escenario";
import { ErrorTransaccion } from "@/lib/stellar/transacciones";

const PASSPHRASE_TESTNET = "Test SDF Network ; September 2015";
const PASSPHRASE_PUBLICA = "Public Global Stellar Network ; September 2015";
const CONTRATO = StrKey.encodeContract(new Uint8Array(32).fill(8));
const HASH = "cd".repeat(32);

const m = vi.hoisted(() => ({
  modo: "api" as "api" | "mock",
  lectura: { ok: true } as { ok: boolean },
  simular: vi.fn(),
  enviar: vi.fn(),
  horaDelUltimoLedger: vi.fn(),
  listarEventos: vi.fn(),
  freighter: {
    isConnected: vi.fn(),
    getAddress: vi.fn(),
    requestAccess: vi.fn(),
    getNetwork: vi.fn(),
    signTransaction: vi.fn(),
  },
}));

vi.mock("@stellar/freighter-api", () => m.freighter);
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));
// La página lee los datos con el cliente mock (cargarObra usa el suyo); el panel ve el modo configurable.
vi.mock("@/lib/api/cliente", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("@/lib/api/cliente")>();
  return {
    ...real,
    cliente: new Proxy(real.cliente, {
      get: (objetivo, clave) =>
        clave === "modo" ? m.modo : clave === "listarEventos" ? m.listarEventos : Reflect.get(objetivo, clave),
    }),
  };
});
vi.mock("@/lib/stellar/config", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("@/lib/stellar/config")>()),
  leerConfigRed: () =>
    m.lectura.ok
      ? {
          ok: true,
          config: {
            contratoId: CONTRATO,
            rpcUrl: "http://rpc.invalido",
            passphrase: PASSPHRASE_TESTNET,
            tokenSac: CONTRATO,
          },
        }
      : { ok: false, problemas: ["NEXT_PUBLIC_CONTRATO_ID falta o no es un id de contrato (C…)."] },
}));
vi.mock("@/lib/stellar/transacciones", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("@/lib/stellar/transacciones")>()),
  simular: m.simular,
  enviar: m.enviar,
  horaDelUltimoLedger: m.horaDelUltimoLedger,
}));

beforeEach(() => {
  m.modo = "api";
  m.lectura.ok = true;
  for (const f of [m.simular, m.enviar, m.horaDelUltimoLedger, m.listarEventos, ...Object.values(m.freighter)]) f.mockReset();
  m.listarEventos.mockResolvedValue([]);
  m.horaDelUltimoLedger.mockRejectedValue(new Error("sin ledger")); // reloj del navegador
  m.simular.mockResolvedValue({});
  m.freighter.isConnected.mockResolvedValue({ isConnected: true });
  m.freighter.getNetwork.mockResolvedValue({ network: "TESTNET", networkPassphrase: PASSPHRASE_TESTNET });
});

type Usuario = ReturnType<typeof userEvent.setup>;

async function abrirPanel(id: string) {
  const usuario = userEvent.setup();
  render(await PaginaPanel({ params: Promise.resolve({ id }) }));
  return usuario;
}

async function conectarComo(u: Usuario, direccion: string, red = { network: "TESTNET", networkPassphrase: PASSPHRASE_TESTNET }) {
  m.freighter.getAddress.mockResolvedValue({ address: direccion });
  m.freighter.getNetwork.mockResolvedValue(red);
  await u.click(screen.getByRole("button", { name: "Conectar Freighter" }));
  await screen.findByText(/Rol en esta obra:/);
}

async function simularRol(u: Usuario, rol: string) {
  await u.selectOptions(screen.getByLabelText("Rol simulado"), rol);
  await screen.findByText(/Rol en esta obra:/);
}

function hitoPanel(numero: number): HTMLElement {
  return screen.getByText(new RegExp(`^Hito ${numero}:`), { selector: "summary strong" }).closest("details") as HTMLElement;
}

const botonFirmar = () => screen.getByRole("button", { name: "Firmar con Freighter y enviar" });
const vista = () => screen.getByRole("region", { name: "Lo que se enviaría al contrato" });

/** Obra 2 (Evidencia, dentro del período, el inspector ya aprobó): el veedor puede aprobar el hito 1. */
async function abrirAprobar(u: Usuario) {
  await u.click(within(hitoPanel(1)).getByRole("button", { name: "Aprobar hito 1" }));
}

describe("panel que firma: Freighter conectado en testnet", () => {
  it("a) Aprobar abre la vista, firmar queda habilitado, llama a `enviar` con `firmar` y muestra la confirmación", async () => {
    m.enviar.mockImplementation(async (_red, p) => {
      p.alAvanzar("simulando");
      p.alAvanzar("firmando");
      m.freighter.signTransaction.mockResolvedValue({ signedTxXdr: "FIRMADO", signerAddress: CUENTAS.veedorAgua });
      expect(await p.firmar("SIN_FIRMAR")).toBe("FIRMADO");
      return { hash: HASH, ledger: 4321, retorno: undefined };
    });
    const u = await abrirPanel("2");
    await conectarComo(u, CUENTAS.veedorAgua);
    expect(screen.getByText(/Las acciones se firman con Freighter y se envían a testnet/)).toBeInTheDocument();

    await abrirAprobar(u);
    expect(vista()).toHaveTextContent("aprobar(");
    expect(vista()).toHaveTextContent(`firmante: Address = ${CUENTAS.veedorAgua}`);
    expect(botonFirmar()).toBeEnabled();
    expect(screen.getByRole("button", { name: "Simular en la red" })).toBeEnabled();

    await u.click(botonFirmar());

    expect(m.enviar).toHaveBeenCalledTimes(1);
    const [red, pedido] = m.enviar.mock.calls[0];
    expect(red).toMatchObject({ rpcUrl: "http://rpc.invalido", passphrase: PASSPHRASE_TESTNET });
    expect(pedido).toMatchObject({ contratoId: CONTRATO, funcion: "aprobar", origen: CUENTAS.veedorAgua });
    expect(pedido.args).toHaveLength(3);
    expect(pedido.firmar).toBeTypeOf("function");
    // El firmante es el de Freighter: pasa passphrase y address de la cuenta conectada.
    expect(m.freighter.signTransaction).toHaveBeenCalledWith("SIN_FIRMAR", {
      networkPassphrase: PASSPHRASE_TESTNET,
      address: CUENTAS.veedorAgua,
    });

    expect(await screen.findByText(/Confirmada en el ledger 4321/)).toBeInTheDocument();
    expect(screen.getByText(HASH)).toBeInTheDocument();
    expect(botonFirmar()).toBeDisabled(); // no se reenvía lo ya confirmado
  });

  it("R6: volver a abrir la acción después de una confirmación muestra una vista nueva", async () => {
    m.enviar.mockResolvedValue({ hash: HASH, ledger: 4321, retorno: undefined });
    const u = await abrirPanel("2");
    await conectarComo(u, CUENTAS.veedorAgua);
    await abrirAprobar(u);
    await u.click(botonFirmar());
    expect(await screen.findByText(/Confirmada en el ledger 4321/)).toBeInTheDocument();

    await abrirAprobar(u);
    expect(vista()).not.toHaveTextContent("Confirmada en el ledger");
    expect(botonFirmar()).toBeEnabled();
  });

  it("R6: cambiar de decisión (Aceptar → Rechazar) no conserva el resultado de la simulación anterior", async () => {
    m.simular.mockResolvedValue({ tx: {}, sim: {}, retorno: undefined });
    const u = await abrirPanel("1");
    await simularRol(u, "arbitro");
    const hito = hitoPanel(2);
    await u.click(within(hito).getByRole("button", { name: "Aceptar objeción del hito 2" }));
    await u.click(screen.getByRole("button", { name: "Simular en la red" }));
    expect(await screen.findByText(/La simulación pasó/)).toBeInTheDocument();

    await u.click(within(hito).getByRole("button", { name: "Rechazar objeción del hito 2" }));
    expect(vista()).toHaveTextContent("decision: Decision = Rechazar");
    expect(vista()).not.toHaveTextContent("La simulación pasó");
  });

  it("muestra la etapa en curso mientras espera la firma y deshabilita los botones", async () => {
    let seguir: (r: unknown) => void = () => undefined;
    m.enviar.mockImplementation(
      (_red, p) =>
        new Promise((resolver) => {
          p.alAvanzar("firmando");
          seguir = resolver;
        }),
    );
    const u = await abrirPanel("2");
    await conectarComo(u, CUENTAS.veedorAgua);
    await abrirAprobar(u);
    await u.click(botonFirmar());
    expect(await screen.findByText("Esperando tu firma en Freighter…")).toBeInTheDocument();
    expect(botonFirmar()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Simular en la red" })).toBeDisabled();
    seguir({ hash: HASH, ledger: 1, retorno: undefined });
    expect(await screen.findByText(/Confirmada en el ledger 1/)).toBeInTheDocument();
  });

  it("b) rechazo del contrato en la simulación: se explica el error y nadie firmó", async () => {
    m.enviar.mockRejectedValue(
      new ErrorTransaccion({ tipo: "contrato", codigo: "HitoAnteriorPendiente", numero: 9 }, "simulando"),
    );
    const u = await abrirPanel("2");
    await conectarComo(u, CUENTAS.veedorAgua);
    await abrirAprobar(u);
    await u.click(botonFirmar());

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("El contrato rechaza la operación (en la simulación: no se pidió ninguna firma).");
    expect(alerta).toHaveTextContent("HitoAnteriorPendiente");
    expect(alerta).toHaveTextContent("Error del contrato #9");
    expect(m.freighter.signTransaction).not.toHaveBeenCalled();
    expect(botonFirmar()).toBeEnabled(); // se puede reintentar
  });

  it("un rechazo del contrato después de firmar no dice que no se pidió firma", async () => {
    m.enviar.mockRejectedValue(new ErrorTransaccion({ tipo: "contrato", codigo: "YaPagado", numero: 15 }, "confirmando", HASH));
    const u = await abrirPanel("2");
    await conectarComo(u, CUENTAS.veedorAgua);
    await abrirAprobar(u);
    await u.click(botonFirmar());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("El contrato rechaza la operación.");
    expect(alerta).not.toHaveTextContent("no se pidió ninguna firma");
  });

  it("otros rechazos (firma cancelada, envío) muestran el texto de describirRechazo", async () => {
    m.enviar.mockRejectedValue(new ErrorTransaccion({ tipo: "firma", detalle: "User declined access" }, "firmando"));
    const u = await abrirPanel("2");
    await conectarComo(u, CUENTAS.veedorAgua);
    await abrirAprobar(u);
    await u.click(botonFirmar());
    expect(await screen.findByRole("alert")).toHaveTextContent("No se firmó: User declined access");
  });

  it("un error que no es de transacción se muestra con su mensaje", async () => {
    m.enviar.mockRejectedValue(new Error("fallo inesperado"));
    const u = await abrirPanel("2");
    await conectarComo(u, CUENTAS.veedorAgua);
    await abrirAprobar(u);
    await u.click(botonFirmar());
    expect(await screen.findByRole("alert")).toHaveTextContent("fallo inesperado");
  });

  it("e) motivo 'autorizacion': dice qué rol tiene que firmar y con qué dirección", async () => {
    m.enviar.mockRejectedValue(new ErrorTransaccion({ tipo: "autorizacion", direcciones: [CUENTAS.municipio] }, "simulando"));
    const u = await abrirPanel("1"); // el árbitro de la obra 1 es la dirección del municipio
    await conectarComo(u, CUENTAS.municipio);
    await u.click(within(hitoPanel(2)).getByRole("button", { name: "Aceptar objeción del hito 2" }));
    await u.click(botonFirmar());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/Error de autorización: esta operación la tiene que firmar el árbitro/);
    expect(alerta).toHaveTextContent(CUENTAS.municipio);
    expect(alerta).toHaveTextContent("No se pidió ninguna firma.");
  });
});

describe("panel que firma: red equivocada o rol simulado (F3)", () => {
  it("c) Freighter en PUBLIC: firmar deshabilitado con el motivo; simular sigue disponible", async () => {
    const u = await abrirPanel("2");
    await conectarComo(u, CUENTAS.veedorAgua, { network: "PUBLIC", networkPassphrase: PASSPHRASE_PUBLICA });
    await abrirAprobar(u);
    expect(botonFirmar()).toBeDisabled();
    expect(screen.getByText(/No se puede firmar: Freighter está en la red PUBLIC, no en testnet/)).toBeInTheDocument();
    expect(screen.getByText(/Solo vista previa y simulación en la red: Freighter está en la red PUBLIC/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simular en la red" })).toBeEnabled();

    await u.click(screen.getByRole("button", { name: "Simular en la red" }));
    expect(await screen.findByText(/La simulación pasó/)).toBeInTheDocument();
    expect(m.simular).toHaveBeenCalledTimes(1);
    expect(m.enviar).not.toHaveBeenCalled();
    expect(m.freighter.signTransaction).not.toHaveBeenCalled();
  });

  it("c) rol simulado: firmar deshabilitado, 'Simular en la red' habilitado y usa la dirección del rol", async () => {
    const u = await abrirPanel("2");
    await simularRol(u, "veedor");
    await abrirAprobar(u);
    expect(botonFirmar()).toBeDisabled();
    expect(screen.getByText(/No se puede firmar: es un rol simulado/)).toBeInTheDocument();
    const simulacion = screen.getByRole("button", { name: "Simular en la red" });
    expect(simulacion).toBeEnabled();

    await u.click(simulacion);
    expect(await screen.findByText("La simulación pasó: el contrato aceptaría esta operación ahora.")).toBeInTheDocument();
    expect(m.simular.mock.calls[0][1]).toMatchObject({ funcion: "aprobar", origen: CUENTAS.veedorAgua, contratoId: CONTRATO });
    expect(m.enviar).not.toHaveBeenCalled();
  });

  it("simular con rechazo del contrato: muestra el error", async () => {
    m.simular.mockRejectedValue(new ErrorTransaccion({ tipo: "contrato", codigo: "YaDecidio", numero: 10 }, "simulando"));
    const u = await abrirPanel("2");
    await simularRol(u, "veedor");
    await abrirAprobar(u);
    await u.click(screen.getByRole("button", { name: "Simular en la red" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("YaDecidio");
    expect(alerta).toHaveTextContent("no se pidió ninguna firma");
  });

  it("sin Freighter conectado ni rol simulado no hay acciones", async () => {
    await abrirPanel("2");
    expect(screen.queryByRole("button", { name: /Aprobar hito/ })).not.toBeInTheDocument();
  });
});

describe("panel que firma: 'Probar igual con el contrato' (d)", () => {
  const probar = (numero: number, titulo: string) =>
    within(hitoPanel(numero)).getByRole("button", { name: new RegExp(`Probar igual con el contrato: ${titulo}`) });

  it("en una acción deshabilitada simula al abrir y muestra 'La simulación pasó'", async () => {
    const u = await abrirPanel("2");
    await simularRol(u, "inspector"); // el inspector ya aprobó: 'Aprobar hito 1' está deshabilitado (YaDecidio)
    expect(within(hitoPanel(1)).getByRole("button", { name: "Aprobar hito 1" })).toBeDisabled();

    await u.click(probar(1, "Aprobar el hito 1"));

    expect(await screen.findByText("La simulación pasó: el contrato aceptaría esta operación ahora.")).toBeInTheDocument();
    expect(m.simular).toHaveBeenCalledTimes(1);
    expect(m.simular.mock.calls[0][1]).toMatchObject({ funcion: "aprobar", origen: CUENTAS.inspectorB });
    expect(screen.getByRole("region", { name: "Lo que se enviaría al contrato" })).toHaveTextContent("Prueba contra el contrato");
    // Solo simula: no hay botón para firmar ni se envía nada.
    expect(screen.queryByRole("button", { name: "Firmar con Freighter y enviar" })).not.toBeInTheDocument();
    expect(m.enviar).not.toHaveBeenCalled();
  });

  it("si el contrato rechaza, muestra el rechazo con su código", async () => {
    m.simular.mockRejectedValue(new ErrorTransaccion({ tipo: "contrato", codigo: "YaDecidio", numero: 10 }, "simulando"));
    const u = await abrirPanel("2");
    await simularRol(u, "inspector");
    await u.click(probar(1, "Aprobar el hito 1"));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("El contrato rechaza la operación (en la simulación: no se pidió ninguna firma).");
    expect(alerta).toHaveTextContent("YaDecidio");
  });

  it("e) en 'resolver objeción' sin ser árbitro, un motivo de autorización nombra al árbitro de la obra", async () => {
    m.simular.mockRejectedValue(new ErrorTransaccion({ tipo: "autorizacion", direcciones: [] }, "simulando"));
    const u = await abrirPanel("1");
    await simularRol(u, "inspector");
    await u.click(probar(2, "Resolver la objeción del hito 2"));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/Error de autorización: esta operación la tiene que firmar el árbitro/);
    expect(alerta).toHaveTextContent(CUENTAS.municipio); // el árbitro de la obra 1
    expect(m.simular.mock.calls[0][1]).toMatchObject({ funcion: "resolver_objecion" });
  });

  it("también en 'Fondear' con un monto que el panel rechaza", async () => {
    const u = await abrirPanel("1");
    await simularRol(u, "municipio");
    await u.type(screen.getByLabelText("Monto a depositar"), "15000,5"); // excede el presupuesto
    expect(screen.getByRole("button", { name: "Fondear la obra" })).toBeDisabled();
    await u.click(screen.getByRole("button", { name: /Probar igual con el contrato: fondear la obra/ }));
    expect(await screen.findByText(/La simulación pasó/)).toBeInTheDocument();
    expect(m.simular.mock.calls[0][1]).toMatchObject({ funcion: "fondear", origen: CUENTAS.municipio });
  });

  it("el botón no existe cuando la acción está habilitada", async () => {
    const u = await abrirPanel("2");
    await simularRol(u, "veedor");
    expect(within(hitoPanel(1)).queryByRole("button", { name: /Probar igual con el contrato: Aprobar el hito 1/ })).not.toBeInTheDocument();
  });
});

describe("panel que firma: reloj del ledger", () => {
  it("con el ledger disponible, el panel dice qué hora usa", async () => {
    m.horaDelUltimoLedger.mockResolvedValue({ ms: Date.now(), secuencia: 5555 });
    const u = await abrirPanel("2");
    await simularRol(u, "veedor");
    expect(await screen.findByText(/Hora del ledger 5555/)).toBeInTheDocument();
  });

  it("sin ledger, usa el reloj del navegador y lo dice", async () => {
    const u = await abrirPanel("2");
    await simularRol(u, "veedor");
    expect(await screen.findByText(/Plazos evaluados con el reloj del navegador, con un margen de 10 s/)).toBeInTheDocument();
  });
});

describe("panel en modo mock o sin configuración de red (f)", () => {
  it("modo mock: solo vista previa, sin botones de red", async () => {
    m.modo = "mock";
    const u = await abrirPanel("2");
    await simularRol(u, "veedor");
    await abrirAprobar(u);
    expect(vista()).toHaveTextContent("Vista previa: no se firmó ni se envió nada");
    expect(screen.queryByRole("button", { name: "Simular en la red" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Firmar con Freighter y enviar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Probar igual con el contrato/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Solo vista previa: modo mock/)).toBeInTheDocument();
    expect(m.horaDelUltimoLedger).not.toHaveBeenCalled();
    expect(m.simular).not.toHaveBeenCalled();
  });

  it("modo api sin configuración de red: vista previa y el motivo", async () => {
    m.lectura.ok = false;
    const u = await abrirPanel("2");
    await simularRol(u, "veedor");
    await abrirAprobar(u);
    expect(vista()).toHaveTextContent("Vista previa: no se firmó ni se envió nada");
    expect(screen.getByText(/falta configurar la red \(NEXT_PUBLIC_CONTRATO_ID falta/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Simular en la red" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Firmar con Freighter y enviar" })).not.toBeInTheDocument();
  });
});
