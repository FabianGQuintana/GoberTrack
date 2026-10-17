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
const HASH_DE_PRUEBA = "0".repeat(64);

const m = vi.hoisted(() => ({
  modo: "api" as "api" | "mock",
  lectura: { ok: true } as { ok: boolean },
  simular: vi.fn(),
  enviar: vi.fn(),
  horaDelUltimoLedger: vi.fn(),
  listarEventos: vi.fn(),
  refresh: vi.fn(),
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
  useRouter: () => ({ refresh: m.refresh, push: vi.fn() }),
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
  for (const f of [m.simular, m.enviar, m.horaDelUltimoLedger, m.listarEventos, m.refresh, ...Object.values(m.freighter)]) f.mockReset();
  m.listarEventos.mockResolvedValue([]);
  m.horaDelUltimoLedger.mockRejectedValue(new Error("sin ledger")); // reloj del navegador
  m.simular.mockResolvedValue({});
  m.freighter.isConnected.mockResolvedValue({ isConnected: true });
  m.freighter.getNetwork.mockResolvedValue({ network: "TESTNET", networkPassphrase: PASSPHRASE_TESTNET });
});

type Usuario = ReturnType<typeof userEvent.setup>;

async function abrirPanel(id: string, vista?: string) {
  const usuario = userEvent.setup();
  render(await PaginaPanel({ params: Promise.resolve({ id }), searchParams: Promise.resolve(vista ? { vista } : {}) }));
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

const modal = () => screen.getByRole("dialog");
const dialogoAlerta = () => screen.getByRole("alertdialog");
const botonFirmar = (nombre = "Aprobar y firmar") => screen.getByRole("button", { name: nombre });
const comprobar = () => screen.getByRole("button", { name: "Comprobar con el contrato" });

/** Obra 2 (Evidencia, dentro del período, el inspector ya aprobó): el veedor puede aprobar el hito 1. */
async function abrirAprobar(u: Usuario) {
  await u.click(screen.getByRole("button", { name: "Aprobar hito 1" }));
}

describe("firma con Freighter conectado en testnet", () => {
  it("a) Aprobar abre la confirmación, firma con Freighter vía `enviar` y muestra 'Confirmado' recién con la red", async () => {
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
    expect(modal()).toHaveAccessibleName("¿Aprobar el hito 1?");
    expect(modal()).toHaveTextContent(`firmante: Address = ${CUENTAS.veedorAgua}`);
    expect(botonFirmar()).toBeEnabled();
    expect(comprobar()).toBeEnabled();

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

    expect(await screen.findByText("Tu aprobación ya figura en la red.")).toBeInTheDocument();
    expect(modal()).toHaveAccessibleName("Confirmado");
    expect(screen.getByText(/Confirmado en el ledger 4321/)).toBeInTheDocument();
    expect(within(modal()).getByText(HASH)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprobar y firmar" })).not.toBeInTheDocument(); // no se reenvía
    expect(m.refresh).toHaveBeenCalled(); // la página vuelve a pedir los datos
  });

  it("R6: volver a abrir la acción después de una confirmación muestra una confirmación nueva", async () => {
    m.enviar.mockResolvedValue({ hash: HASH, ledger: 4321, retorno: undefined });
    const u = await abrirPanel("2");
    await conectarComo(u, CUENTAS.veedorAgua);
    await abrirAprobar(u);
    await u.click(botonFirmar());
    await screen.findByText("Tu aprobación ya figura en la red.");
    await u.click(screen.getByRole("button", { name: "Listo" }));

    await abrirAprobar(u);
    expect(modal()).not.toHaveTextContent("ya figura en la red");
    expect(botonFirmar()).toBeEnabled();
  });

  it("R6: cambiar de decisión (Aceptar → Rechazar) no conserva el resultado de la comprobación anterior", async () => {
    m.simular.mockResolvedValue({ tx: {}, sim: {}, retorno: undefined });
    const u = await abrirPanel("1");
    await simularRol(u, "arbitro");
    await u.click(screen.getByRole("radio", { name: /Aceptar la objeción/ }));
    await u.click(screen.getByRole("button", { name: "Confirmar decisión" }));
    await u.click(comprobar());
    expect(await screen.findByText(/El contrato aceptaría esta acción ahora/)).toBeInTheDocument();
    await u.click(within(modal()).getByRole("button", { name: "Cerrar" }));

    await u.click(screen.getByRole("radio", { name: /Rechazar la objeción/ }));
    await u.click(screen.getByRole("button", { name: "Confirmar decisión" }));
    expect(modal()).toHaveTextContent("decision: Decision = Rechazar");
    expect(modal()).not.toHaveTextContent("El contrato aceptaría");
  });

  it("muestra los pasos mientras espera la firma y no deja cerrar el modal", async () => {
    let seguir: (r: unknown) => void = () => undefined;
    m.enviar.mockImplementation(
      (_red, p) =>
        new Promise((resolver) => {
          p.alAvanzar("simulando");
          p.alAvanzar("firmando");
          seguir = resolver;
        }),
    );
    const u = await abrirPanel("2");
    await conectarComo(u, CUENTAS.veedorAgua);
    await abrirAprobar(u);
    await u.click(botonFirmar());
    expect(await screen.findByRole("dialog", { name: "Firmá en Freighter" })).toBeInTheDocument();
    expect(within(modal()).getByText("Comprobado con el contrato")).toBeInTheDocument();
    expect(within(modal()).getByText(/\(en curso\)/)).toHaveTextContent("(en curso)");
    expect(within(modal()).queryByRole("button", { name: "Cerrar ventana" })).not.toBeInTheDocument();
    expect(within(modal()).queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    await u.keyboard("{Escape}");
    expect(modal()).toBeInTheDocument();
    seguir({ hash: HASH, ledger: 1, retorno: undefined });
    expect(await screen.findByText(/Confirmado en el ledger 1/)).toBeInTheDocument();
  });

  it("b) rechazo del contrato en la simulación: se explica el error y nadie firmó", async () => {
    m.enviar.mockRejectedValue(new ErrorTransaccion({ tipo: "contrato", codigo: "HitoAnteriorPendiente", numero: 9 }, "simulando"));
    const u = await abrirPanel("2");
    await conectarComo(u, CUENTAS.veedorAgua);
    await abrirAprobar(u);
    await u.click(botonFirmar());

    expect(await screen.findByRole("alertdialog", { name: "No se puede aprobar el hito 1" })).toBeInTheDocument();
    const alerta = within(dialogoAlerta()).getByRole("alert");
    expect(alerta).toHaveTextContent("El hito anterior todavía no está aprobado ni pagado.");
    expect(alerta).toHaveTextContent("(HitoAnteriorPendiente, error del contrato #9)");
    expect(alerta).toHaveTextContent("no te pedimos la firma y no se movió ningún fondo");
    expect(m.freighter.signTransaction).not.toHaveBeenCalled();
  });

  it("un rechazo del contrato después de firmar no dice que no se pidió firma", async () => {
    m.enviar.mockRejectedValue(new ErrorTransaccion({ tipo: "contrato", codigo: "YaPagado", numero: 15 }, "confirmando", HASH));
    const u = await abrirPanel("2");
    await conectarComo(u, CUENTAS.veedorAgua);
    await abrirAprobar(u);
    await u.click(botonFirmar());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("La red rechazó la transacción ya firmada");
    expect(alerta).not.toHaveTextContent("no te pedimos");
    expect(dialogoAlerta()).toHaveAccessibleName("No se pudo completar");
  });

  it("firma cancelada en Freighter: 'No se pudo completar: no se firmó' y no se registró nada", async () => {
    m.enviar.mockRejectedValue(new ErrorTransaccion({ tipo: "firma", detalle: "User declined access" }, "firmando"));
    const u = await abrirPanel("2");
    await conectarComo(u, CUENTAS.veedorAgua);
    await abrirAprobar(u);
    await u.click(botonFirmar());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("No se pudo completar: no se firmó");
    expect(alerta).toHaveTextContent("No se firmó: User declined access");
    expect(alerta).toHaveTextContent("No se registró nada.");
  });

  it("sin confirmación todavía: no dice 'Confirmado' y avisa que revise antes de repetir", async () => {
    m.enviar.mockRejectedValue(new ErrorTransaccion({ tipo: "sin-confirmar", detalle: "todavía no" }, "confirmando", HASH));
    const u = await abrirPanel("2");
    await conectarComo(u, CUENTAS.veedorAgua);
    await abrirAprobar(u);
    await u.click(botonFirmar());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Sin confirmación todavía");
    expect(alerta).toHaveTextContent("revisá la línea de tiempo en unos segundos antes de repetir");
    expect(screen.queryByText("Tu aprobación ya figura en la red.")).not.toBeInTheDocument();
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
    await u.click(screen.getByRole("radio", { name: /Aceptar la objeción/ }));
    await u.click(screen.getByRole("button", { name: "Confirmar decisión" }));
    await u.click(botonFirmar("Confirmar y firmar"));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Esta acción la tiene que firmar el árbitro de la obra.");
    expect(alerta).toHaveTextContent(CUENTAS.municipio);
    expect(alerta).toHaveTextContent("No te pedimos ninguna firma.");
  });
});

describe("firma: red equivocada o rol simulado (F3)", () => {
  it("c) Freighter en PUBLIC: firmar deshabilitado con el motivo; comprobar con el contrato sigue disponible", async () => {
    const u = await abrirPanel("2");
    await conectarComo(u, CUENTAS.veedorAgua, { network: "PUBLIC", networkPassphrase: PASSPHRASE_PUBLICA });
    expect(screen.getByText(/Solo vista previa y comprobación con el contrato: Freighter está en la red PUBLIC/)).toBeInTheDocument();
    await abrirAprobar(u);
    expect(botonFirmar()).toBeDisabled();
    expect(within(modal()).getByText(/No se puede firmar: Freighter está en la red PUBLIC, no en testnet/)).toBeInTheDocument();

    await u.click(comprobar());
    expect(await screen.findByText(/El contrato aceptaría esta acción ahora/)).toBeInTheDocument();
    expect(m.simular).toHaveBeenCalledTimes(1);
    expect(m.enviar).not.toHaveBeenCalled();
    expect(m.freighter.signTransaction).not.toHaveBeenCalled();
  });

  it("c) rol simulado: firmar deshabilitado y la comprobación usa la dirección del rol", async () => {
    const u = await abrirPanel("2");
    await simularRol(u, "veedor");
    await abrirAprobar(u);
    expect(botonFirmar()).toBeDisabled();
    expect(within(modal()).getByText(/No se puede firmar: es un rol simulado/)).toBeInTheDocument();

    await u.click(comprobar());
    expect(await screen.findByText(/El contrato aceptaría esta acción ahora/)).toBeInTheDocument();
    expect(m.simular.mock.calls[0][1]).toMatchObject({ funcion: "aprobar", origen: CUENTAS.veedorAgua, contratoId: CONTRATO });
    expect(m.enviar).not.toHaveBeenCalled();
  });

  it("comprobar con rechazo del contrato: muestra el error y que no se pidió firma", async () => {
    m.simular.mockRejectedValue(new ErrorTransaccion({ tipo: "contrato", codigo: "YaDecidio", numero: 10 }, "simulando"));
    const u = await abrirPanel("2");
    await simularRol(u, "veedor");
    await abrirAprobar(u);
    await u.click(comprobar());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("YaDecidio");
    expect(alerta).toHaveTextContent("no te pedimos la firma");
  });

  it("sin Freighter conectado ni rol simulado no hay acciones", async () => {
    await abrirPanel("2");
    expect(screen.queryByRole("button", { name: /Aprobar hito/ })).not.toBeInTheDocument();
  });
});

describe("'Probar igual con el contrato' (d)", () => {
  it("en una acción deshabilitada comprueba al abrir y muestra el resultado, sin botón para firmar", async () => {
    const u = await abrirPanel("1");
    await simularRol(u, "contratista"); // declarar el hito 3 está deshabilitado (HitoAnteriorPendiente)
    expect(screen.getByRole("button", { name: "Declarar hito 3" })).toBeDisabled();

    await u.click(screen.getByRole("button", { name: "Probar igual con el contrato: Declarar hito 3" }));

    expect(await screen.findByText(/El contrato aceptaría esta acción ahora/)).toBeInTheDocument();
    expect(m.simular).toHaveBeenCalledTimes(1);
    expect(m.simular.mock.calls[0][1]).toMatchObject({ funcion: "declarar_hito", origen: CUENTAS.contratistaAromos });
    expect(modal()).toHaveTextContent(HASH_DE_PRUEBA);
    expect(screen.queryByRole("button", { name: /y firmar/ })).not.toBeInTheDocument();
    expect(m.enviar).not.toHaveBeenCalled();
  });

  it("si el contrato rechaza, lo dice con su código y aclara que no se firmó ni envió nada", async () => {
    m.simular.mockRejectedValue(new ErrorTransaccion({ tipo: "contrato", codigo: "HitoAnteriorPendiente", numero: 9 }, "simulando"));
    const u = await abrirPanel("1");
    await simularRol(u, "contratista");
    await u.click(screen.getByRole("button", { name: "Probar igual con el contrato: Declarar hito 3" }));
    expect(await screen.findByRole("alertdialog", { name: "El contrato la rechazó" })).toBeInTheDocument();
    expect(dialogoAlerta()).toHaveTextContent("(HitoAnteriorPendiente, error del contrato #9)");
    expect(dialogoAlerta()).toHaveTextContent("la rechazó la regla del contrato, no solo esta pantalla. No se firmó ni se envió nada.");
  });

  it("también en 'Liberar pago' con una objeción abierta", async () => {
    m.simular.mockRejectedValue(new ErrorTransaccion({ tipo: "contrato", codigo: "ObjecionAbierta", numero: 11 }, "simulando"));
    const u = await abrirPanel("1");
    await simularRol(u, "contratista");
    await u.click(screen.getByRole("button", { name: "Probar igual con el contrato: Liberar pago del hito 2" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("ObjecionAbierta");
    expect(m.simular.mock.calls[0][1]).toMatchObject({ funcion: "liberar_pago" });
  });

  it("también en 'Depositar' con un monto que el panel rechaza", async () => {
    const u = await abrirPanel("1", "municipio");
    await simularRol(u, "municipio");
    await u.clear(screen.getByLabelText("Monto a depositar"));
    await u.type(screen.getByLabelText("Monto a depositar"), "15000,5"); // excede el presupuesto
    expect(screen.getByRole("button", { name: "Depositar y firmar" })).toBeDisabled();
    await u.click(screen.getByRole("button", { name: "Probar igual con el contrato: Depositar y firmar" }));
    expect(await screen.findByText(/El contrato aceptaría esta acción ahora/)).toBeInTheDocument();
    expect(m.simular.mock.calls[0][1]).toMatchObject({ funcion: "fondear", origen: CUENTAS.municipio });
  });

  it("el botón no existe cuando la acción está habilitada", async () => {
    const u = await abrirPanel("2");
    await simularRol(u, "veedor");
    expect(screen.queryByRole("button", { name: /Probar igual con el contrato: Aprobar hito 1/ })).not.toBeInTheDocument();
  });
});

describe("reloj del ledger", () => {
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

describe("modo de demostración o sin configuración de red (f)", () => {
  it("modo mock: solo vista previa, sin botones de red", async () => {
    m.modo = "mock";
    const u = await abrirPanel("2");
    await simularRol(u, "veedor");
    await abrirAprobar(u);
    expect(modal()).toHaveTextContent("Vista previa: no se firmó ni se envió nada");
    expect(screen.queryByRole("button", { name: "Comprobar con el contrato" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprobar y firmar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Probar igual con el contrato/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Solo vista previa: modo de demostración/)).toBeInTheDocument();
    expect(m.horaDelUltimoLedger).not.toHaveBeenCalled();
    expect(m.simular).not.toHaveBeenCalled();
  });

  it("modo api sin configuración de red: vista previa y el motivo", async () => {
    m.lectura.ok = false;
    const u = await abrirPanel("2");
    await simularRol(u, "veedor");
    expect(screen.getByText(/falta configurar la red \(NEXT_PUBLIC_CONTRATO_ID falta/)).toBeInTheDocument();
    await abrirAprobar(u);
    expect(modal()).toHaveTextContent("Vista previa: no se firmó ni se envió nada");
    expect(screen.queryByRole("button", { name: "Comprobar con el contrato" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprobar y firmar" })).not.toBeInTheDocument();
  });
});
