// Demo del PRD §4 de punta a punta contra testnet, SIN Freighter: usa el mismo módulo de
// transacciones que el panel (src/lib/stellar/transacciones.ts) con firmantes Keypair.
//
//   npm run demo:testnet            (lee .env.testnet; ver .env.testnet.example)
//
// Variables: las NEXT_PUBLIC_* de la red (contrato, RPC, passphrase, SAC), API_URL (backend para
// subir la evidencia) y, opcional, STELLAR_CLI (ruta de la CLI de Stellar; por defecto "stellar").
//
// Las claves de las identidades (municipio, contratista, inspector, veedor; el árbitro es el
// municipio) se leen en tiempo de ejecución con `stellar keys show <nombre>`. Nunca se escriben en
// archivos ni en la salida.
//
// DATO SIMULADO: obra, montos y archivos de evidencia.

import { execFileSync } from "node:child_process";
import { Address, Keypair, nativeToScVal } from "@stellar/stellar-sdk/base";
import { crearCliente } from "@/lib/api/cliente";
import { generarPdf, generarPng } from "@/lib/archivos";
import { ERRORES, type CodigoError } from "@/lib/errores";
import { construirInvocacion, type ObraInvocable, type ParametrosInvocacion } from "@/lib/invocaciones";
import { formatearMonto } from "@/lib/montos";
import { argumentosCrearObra, argumentosDe } from "@/lib/stellar/argumentos";
import { leerConfigRed } from "@/lib/stellar/config";
import { firmanteKeypair } from "@/lib/stellar/firmantes";
import { enviar, ErrorTransaccion, leer, simular, type Firmar, type Red } from "@/lib/stellar/transacciones";

type Identidad = "municipio" | "contratista" | "inspector" | "veedor";
const IDENTIDADES: Identidad[] = ["municipio", "contratista", "inspector", "veedor"];

const UNIDAD = 10_000_000n;
const HITOS = [
  { descripcion: "Movimiento de suelo y base granular", monto: 10_000n * UNIDAD },
  { descripcion: "Cordón cuneta y desagües pluviales", monto: 15_000n * UNIDAD },
  { descripcion: "Carpeta asfáltica", monto: 10_000n * UNIDAD },
  { descripcion: "Señalización y limpieza final de obra", monto: 5_000n * UNIDAD },
];
const TOTAL = HITOS.reduce((s, h) => s + h.monto, 0n);
const PERIODO_SEG = 60;

// ---- Claves (solo en memoria) ----

function claveDe(nombre: Identidad): Keypair {
  const cli = process.env.STELLAR_CLI || "stellar";
  let secreto: string;
  try {
    secreto = execFileSync(cli, ["keys", "show", nombre], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    }).trim();
  } catch {
    // No se propaga el error original: podría arrastrar la salida del comando.
    throw new Error(`No se pudo leer la identidad "${nombre}" con "${cli} keys show". ¿Está la CLI y la identidad?`);
  }
  try {
    return Keypair.fromSecret(secreto);
  } catch {
    throw new Error(`La identidad "${nombre}" no devolvió una clave secreta válida.`);
  } finally {
    secreto = "";
  }
}

// ---- Archivos de evidencia (DATO SIMULADO): los mismos generadores que usa el mock ----

const archivo = (contenido: Uint8Array, nombre: string, tipo: string) =>
  new File([new Uint8Array(contenido)], nombre, { type: tipo });
// ---- Salida ----

const filas: { paso: string; firma: string; resultado: string }[] = [];

function registrar(paso: string, firma: string, resultado: string) {
  filas.push({ paso, firma, resultado });
  console.log(`  ✔ ${paso} · ${firma} · ${resultado}`);
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const lectura = leerConfigRed();
  if (!lectura.ok) throw new Error(`Falta configuración:\n${lectura.problemas.join("\n")}`);
  const { config } = lectura;
  const apiUrl = process.env.API_URL?.trim();
  if (!apiUrl) throw new Error("Falta API_URL (el backend donde se sube la evidencia).");
  const api = crearCliente(apiUrl);
  const red: Red = { rpcUrl: config.rpcUrl, passphrase: config.passphrase };

  console.log(`Red: ${config.rpcUrl}\nContrato: ${config.contratoId}\nToken (SAC): ${config.tokenSac}\nBackend: ${apiUrl}\n`);

  const claves = Object.fromEntries(IDENTIDADES.map((n) => [n, claveDe(n)])) as Record<Identidad, Keypair>;
  const dir = Object.fromEntries(IDENTIDADES.map((n) => [n, claves[n].publicKey()])) as Record<Identidad, string>;
  for (const n of IDENTIDADES) console.log(`${n.padEnd(12)} ${dir[n]}`);
  console.log("árbitro      = municipio (MVP)\n");

  let firmasPedidas = 0;
  const firmante = (n: Identidad): Firmar => {
    const firmar = firmanteKeypair(claves[n], config.passphrase);
    return (x) => {
      firmasPedidas++;
      return firmar(x);
    };
  };

  const saldo = async (direccion: string) =>
    (await leer(red, {
      contratoId: config.tokenSac,
      funcion: "balance",
      args: [new Address(direccion).toScVal()],
      origen: dir.municipio,
    })) as bigint;

  // a) crear_obra
  console.log("a) crear_obra");
  const creada = await enviar(red, {
    contratoId: config.contratoId,
    funcion: "crear_obra",
    args: argumentosCrearObra({
      municipio: dir.municipio,
      nombre: "Pavimentación calle Los Aromos – demo",
      contratista: dir.contratista,
      inspector: dir.inspector,
      veedor: dir.veedor,
      arbitro: dir.municipio,
      token: config.tokenSac,
      hitos: HITOS,
      periodoObjecion: PERIODO_SEG,
    }),
    origen: dir.municipio,
    firmar: firmante("municipio"),
  });
  const obraId = Number(creada.retorno);
  registrar(`crear_obra → obra ${obraId}`, "municipio", `tx ${creada.hash} · ledger ${creada.ledger}`);

  const obra: ObraInvocable = {
    id: obraId,
    municipio: dir.municipio,
    contratista: dir.contratista,
    veedor: dir.veedor,
    arbitro: dir.municipio,
  };

  // Las cinco funciones del panel pasan por construirInvocacion → argumentosDe, como en el navegador.
  const invocar = async (titulo: string, quien: Identidad, p: ParametrosInvocacion) => {
    const inv = construirInvocacion(obra, p);
    const r = await enviar(red, {
      contratoId: config.contratoId,
      funcion: inv.funcion,
      args: argumentosDe(inv),
      origen: dir[quien],
      firmar: firmante(quien),
    });
    registrar(titulo, quien, `tx ${r.hash} · ledger ${r.ledger}`);
    return r;
  };

  const trampa = async (titulo: string, quien: Identidad, p: ParametrosInvocacion, esperado: CodigoError) => {
    const inv = construirInvocacion(obra, p);
    const antes = firmasPedidas;
    try {
      await enviar(red, {
        contratoId: config.contratoId,
        funcion: inv.funcion,
        args: argumentosDe(inv),
        origen: dir[quien],
        firmar: firmante(quien),
      });
    } catch (e) {
      if (e instanceof ErrorTransaccion && e.motivo.tipo === "contrato" && e.motivo.codigo === esperado) {
        if (firmasPedidas !== antes) throw new Error(`${titulo}: se pidió una firma antes del rechazo`);
        registrar(
          titulo,
          quien,
          `rechazado en la simulación: ${e.motivo.codigo} (#${e.motivo.numero}) — ${ERRORES[esperado].mensaje} Sin firma ni envío.`,
        );
        return;
      }
      throw e;
    }
    throw new Error(`${titulo}: se esperaba ${esperado} y la transacción pasó`);
  };

  // b) fondear el total
  console.log("\nb) fondear");
  const saldoMunicipio = await saldo(dir.municipio);
  if (saldoMunicipio < TOTAL) {
    throw new Error(
      `El municipio tiene ${formatearMonto(saldoMunicipio)} y hacen falta ${formatearMonto(TOTAL)}: corré contracts/scripts/setup-testnet.sh.`,
    );
  }
  await invocar(`fondear ${formatearMonto(TOTAL, true)}`, "municipio", { accion: "fondear", monto: TOTAL });

  // c) evidencia → backend → declarar_hito 0
  console.log("\nc) evidencia y declarar_hito 0");
  const marca = new Date().toISOString();
  const foto = generarPng(`Obra ${obraId} - hito 1: base granular (${marca})`, [150, 120, 90]);
  const evidencia0 = await api.subirEvidencia(archivo(foto, `obra${obraId}-hito1.png`, "image/png"));
  console.log(`  evidencia subida: ${evidencia0.sha256} (${evidencia0.tipo_mime}, ${evidencia0.tamano_bytes} B)`);
  await invocar("declarar_hito 0", "contratista", {
    accion: "declarar_hito",
    hito: 0,
    evidenciaHash: evidencia0.sha256,
  });

  // d) aprobaciones, período y pago
  console.log("\nd) aprobar, esperar el período y liberar_pago 0");
  await invocar("aprobar 0 (inspector)", "inspector", {
    accion: "aprobar",
    hito: 0,
    firmante: dir.inspector,
    rolFirmante: "inspector",
  });
  await invocar("aprobar 0 (veedor)", "veedor", {
    accion: "aprobar",
    hito: 0,
    firmante: dir.veedor,
    rolFirmante: "veedor",
  });
  const liberar0 = construirInvocacion(obra, { accion: "liberar_pago", hito: 0 });
  for (let intento = 0; ; intento++) {
    try {
      await simular(red, {
        contratoId: config.contratoId,
        funcion: liberar0.funcion,
        args: argumentosDe(liberar0),
        origen: dir.contratista,
      });
      break;
    } catch (e) {
      const esperando = e instanceof ErrorTransaccion && e.motivo.tipo === "contrato" && e.motivo.codigo === "PeriodoNoCumplido";
      if (!esperando || intento >= 30) throw e;
      if (intento === 0) console.log("  liberar_pago todavía da PeriodoNoCumplido: esperando el fin del período…");
      await dormir(5000);
    }
  }
  const antesPago = await saldo(dir.contratista);
  await invocar("liberar_pago 0", "contratista", { accion: "liberar_pago", hito: 0 });
  const despuesPago = await saldo(dir.contratista);
  const cobrado = despuesPago - antesPago;
  if (cobrado !== HITOS[0].monto) {
    throw new Error(`El contratista cobró ${formatearMonto(cobrado)} y se esperaba ${formatearMonto(HITOS[0].monto)}`);
  }
  registrar(
    "saldo del contratista",
    "(lectura)",
    `${formatearMonto(antesPago, true)} → ${formatearMonto(despuesPago, true)} (+${formatearMonto(cobrado, true)})`,
  );

  // e) trampa: el hito 3 (índice 2) sin el 2 aprobado
  console.log("\ne) trampa: hito de índice 2 sin el anterior aprobado");
  await trampa("declarar_hito 2", "contratista", { accion: "declarar_hito", hito: 2, evidenciaHash: evidencia0.sha256 }, "HitoAnteriorPendiente");
  await trampa("liberar_pago 2", "contratista", { accion: "liberar_pago", hito: 2 }, "HitoAnteriorPendiente");

  // f) objeción del hito 1
  console.log("\nf) declarar el hito 1, objeción del veedor y pago congelado");
  const acta = generarPdf(`Acta de medición - obra ${obraId}, hito 2`, [`Cordón cuneta y desagües pluviales.`, `Generada ${marca}`]);
  const evidencia1 = await api.subirEvidencia(archivo(acta, `obra${obraId}-hito2-acta.pdf`, "application/pdf"));
  console.log(`  evidencia subida: ${evidencia1.sha256} (${evidencia1.tipo_mime})`);
  await invocar("declarar_hito 1", "contratista", { accion: "declarar_hito", hito: 1, evidenciaHash: evidencia1.sha256 });
  const motivo = generarPdf(`Objeción del veedor - obra ${obraId}, hito 2`, ["Faltan las rejillas de dos sumideros.", `Generada ${marca}`]);
  const motivo1 = await api.subirEvidencia(archivo(motivo, `obra${obraId}-hito2-objecion.pdf`, "application/pdf"));
  console.log(`  motivo subido: ${motivo1.sha256}`);
  await invocar("objetar 1 (veedor)", "veedor", { accion: "objetar", hito: 1, motivoHash: motivo1.sha256 });
  await trampa("liberar_pago 1", "contratista", { accion: "liberar_pago", hito: 1 }, "ObjecionAbierta");

  // Estado final según el contrato
  const hitos = (await leer(red, {
    contratoId: config.contratoId,
    funcion: "ver_hitos",
    args: [nativeToScVal(obraId, { type: "u32" })],
    origen: dir.municipio,
  })) as { estado: string[] }[];
  console.log(`\nEstado final de la obra ${obraId} en el contrato: ${hitos.map((h, i) => `hito ${i + 1} ${h.estado[0]}`).join(" · ")}`);
  console.log(`Firmas pedidas: ${firmasPedidas} (ninguna en los rechazos).`);
  console.log(`\nObra ${obraId}: ${apiUrl}/obras/${obraId}`);
}

main()
  .then(() => {
    console.log(`\nDemo completa: ${filas.length} pasos.`);
  })
  .catch((e: unknown) => {
    console.error(`\n✘ ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
