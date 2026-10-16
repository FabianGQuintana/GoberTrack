// DATO SIMULADO: obras, montos, cuentas, línea de tiempo y archivos de evidencia del modo mock.
// Reproduce el escenario del seed del backend (backend/src/seed/escenario.ts) para que el modo mock
// y el modo API muestren los mismos estados. Las cuentas y el token son las mismas direcciones que
// genera el seed; los archivos de evidencia (y sus hashes) son propios del frontend.
//
// | Obra | Estado final                                                                         |
// |------|--------------------------------------------------------------------------------------|
// | 1    | Pavimentación calle Los Aromos: fondeo parcial; hito 1 Pagado; hito 2 Objetado (el     |
// |      | inspector aprobó y el veedor objetó dentro del período); 3 y 4 Pendiente              |
// | 2    | Red de agua: sin fondos; hito 1 en Evidencia con la aprobación del inspector, dentro   |
// |      | del período de objeción (72 h)                                                        |
// | 3    | Escuela: hito 1 objetado → Aceptar → re-declarado y pagado; hito 2 objetado →         |
// |      | Rechazar → Aprobado por árbitro, período cumplido y con saldo: pagable               |
// | 4    | Plaza: los dos hitos pagados → Finalizada                                            |
// | 5    | Veredas (solo en el frontend, pedido para ensayar la declaración): fondeada por el    |
// |      | total, todos los hitos Pendiente, período de 1 minuto                                |
// | 6    | Bacheo (solo en el frontend): usa un token que NO es el oficial; hito 1 "Pagado"     |
// |      | con ese token, para mostrar el aviso del tablero (contract.md v1.1 §0)               |
//
// En el texto, los hitos se numeran como los ve el usuario (índice + 1).

import { sha256Hex } from "../../hash";
import type { Evento, Hito, Obra } from "../tipos";
import { archivosMock, type ArchivoMock, type ClaveArchivo } from "./archivos";
import { CUENTAS, TOKEN, TOKEN_NO_OFICIAL } from "./cuentas";
import { SimuladorMock } from "./simulador";

export { CUENTAS, TOKEN, TOKEN_NO_OFICIAL };

const MIN = 60;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** La línea de tiempo empieza 8 días antes del momento en que se arma y termina antes de ese momento. */
const DURACION_ESCENARIO = 8 * DIA;
const LEDGER_INICIAL = 1_500_000;

const unidades = (n: number): bigint => BigInt(n) * 10_000_000n;

/** SUPUESTO del MVP (PRD §3): el árbitro es la dirección del municipio. */
const ARBITRO = CUENTAS.municipio;

interface Paso {
  /** Segundos desde el inicio del escenario. */
  en: number;
  hacer: (sim: SimuladorMock) => void;
}

/** Pasos de una obra con demoras relativas al paso anterior. */
function linea(desde: number, pasos: [demora: number, hacer: Paso["hacer"]][]): Paso[] {
  let en = desde;
  return pasos.map(([demora, hacer]) => ({ en: (en += demora), hacer }));
}

function pasosEscenario(hash: Record<ClaveArchivo, string>): Paso[] {
  let aromos = 0;
  let agua = 0;
  let escuela = 0;
  let plaza = 0;
  const c = CUENTAS;

  // Obra 1. Período de 1 minuto, como en la demo (PRD §4).
  const obra1 = linea(0, [
    [0, (s) => {
      aromos = s.crearObra({
        municipio: c.municipio,
        nombre: "Pavimentación calle Los Aromos",
        contratista: c.contratistaAromos,
        inspector: c.inspectorA,
        veedor: c.veedorAromos,
        arbitro: ARBITRO,
        token: TOKEN,
        hitos: [
          { descripcion: "Movimiento de suelo y base granular", monto: unidades(10_000) },
          { descripcion: "Cordón cuneta y desagües pluviales", monto: unidades(15_000) },
          { descripcion: "Carpeta asfáltica", monto: unidades(10_000) },
          { descripcion: "Señalización y limpieza final de obra", monto: unidades(5_000) },
        ],
        periodoObjecion: MIN,
      });
    }],
    [2 * HORA, (s) => s.fondear(aromos, unidades(10_000))],
    [DIA, (s) => s.declararHito(aromos, 0, hash.aromosHito1)],
    [20 * MIN, (s) => s.aprobar(aromos, 0, c.inspectorA)],
    [40 * MIN, (s) => s.aprobar(aromos, 0, c.veedorAromos)],
    [2 * HORA, (s) => s.liberarPago(aromos, 0)],
    [DIA, (s) => s.fondear(aromos, unidades(15_000))],
    [2 * HORA, (s) => s.declararHito(aromos, 1, hash.aromosHito2)],
    [20, (s) => s.aprobar(aromos, 1, c.inspectorA)],
    [25, (s) => s.objetar(aromos, 1, hash.aromosHito2Objecion)],
  ]);

  // Obra 2. Período de 72 horas para que el hito siga dentro del período.
  const obra2 = linea(3 * DIA, [
    [0, (s) => {
      agua = s.crearObra({
        municipio: c.municipio,
        nombre: "Red de agua potable barrio Esperanza",
        contratista: c.contratistaAgua,
        inspector: c.inspectorB,
        veedor: c.veedorAgua,
        arbitro: ARBITRO,
        token: TOKEN,
        hitos: [
          { descripcion: "Excavación y tendido de cañería troncal", monto: unidades(18_000) },
          { descripcion: "Conexiones domiciliarias", monto: unidades(12_000) },
          { descripcion: "Prueba hidráulica y habilitación", monto: unidades(6_000) },
        ],
        periodoObjecion: 72 * HORA,
      });
    }],
    [5 * DIA - HORA, (s) => s.declararHito(agua, 0, hash.aguaHito1)],
    [30 * MIN, (s) => s.aprobar(agua, 0, c.inspectorB)],
  ]);

  // Obra 3. Las dos resoluciones del árbitro.
  const obra3 = linea(4 * DIA, [
    [0, (s) => {
      escuela = s.crearObra({
        municipio: c.municipio,
        nombre: "Refacción Escuela Primaria N° 512",
        contratista: c.contratistaEscuela,
        inspector: c.inspectorA,
        veedor: c.veedorEscuela,
        arbitro: ARBITRO,
        token: TOKEN,
        hitos: [
          { descripcion: "Reparación de techos y cubiertas", monto: unidades(8_000) },
          { descripcion: "Instalación eléctrica y sanitarios", monto: unidades(6_000) },
        ],
        periodoObjecion: MIN,
      });
    }],
    [HORA, (s) => s.fondear(escuela, unidades(14_000))],
    [DIA, (s) => s.declararHito(escuela, 0, hash.escuelaHito1v1)],
    [30, (s) => s.objetar(escuela, 0, hash.escuelaHito1Objecion)],
    [3 * HORA, (s) => s.resolverObjecion(escuela, 0, "Aceptar")],
    [DIA, (s) => s.declararHito(escuela, 0, hash.escuelaHito1v2)],
    [10 * MIN, (s) => s.aprobar(escuela, 0, c.inspectorA)],
    [15 * MIN, (s) => s.aprobar(escuela, 0, c.veedorEscuela)],
    [HORA, (s) => s.liberarPago(escuela, 0)],
    [2 * HORA, (s) => s.declararHito(escuela, 1, hash.escuelaHito2)],
    [10, (s) => s.aprobar(escuela, 1, c.inspectorA)],
    [20, (s) => s.objetar(escuela, 1, hash.escuelaHito2Objecion)],
    [2 * HORA, (s) => s.resolverObjecion(escuela, 1, "Rechazar")],
  ]);

  // Obra 4. Completa.
  const obra4 = linea(5 * DIA, [
    [0, (s) => {
      plaza = s.crearObra({
        municipio: c.municipio,
        nombre: "Iluminación LED Plaza 25 de Mayo",
        contratista: c.contratistaPlaza,
        inspector: c.inspectorB,
        veedor: c.veedorPlaza,
        arbitro: ARBITRO,
        token: TOKEN,
        hitos: [
          { descripcion: "Provisión de luminarias LED", monto: unidades(4_500) },
          { descripcion: "Instalación y puesta en marcha", monto: unidades(3_000) },
        ],
        periodoObjecion: MIN,
      });
    }],
    [30 * MIN, (s) => s.fondear(plaza, unidades(7_500))],
    [6 * HORA, (s) => s.declararHito(plaza, 0, hash.plazaHito1)],
    [10 * MIN, (s) => s.aprobar(plaza, 0, c.inspectorB)],
    [20 * MIN, (s) => s.aprobar(plaza, 0, c.veedorPlaza)],
    [HORA, (s) => s.liberarPago(plaza, 0)],
    [DIA, (s) => s.declararHito(plaza, 1, hash.plazaHito2)],
    [10 * MIN, (s) => s.aprobar(plaza, 1, c.inspectorB)],
    [15 * MIN, (s) => s.aprobar(plaza, 1, c.veedorPlaza)],
    [HORA, (s) => s.liberarPago(plaza, 1)],
  ]);

  // Obra 5. Fondeada y sin declaraciones: para ensayar declarar con subida de evidencia.
  let veredas = 0;
  const obra5 = linea(5 * DIA + 12 * HORA, [
    [0, (s) => {
      veredas = s.crearObra({
        municipio: c.municipio,
        nombre: "Veredas y rampas accesibles barrio San Martín",
        contratista: c.contratistaVeredas,
        inspector: c.inspectorB,
        veedor: c.veedorVeredas,
        arbitro: ARBITRO,
        token: TOKEN,
        hitos: [
          { descripcion: "Demolición y retiro de veredas rotas", monto: unidades(6_000) },
          { descripcion: "Contrapiso y baldosas", monto: unidades(9_000) },
          { descripcion: "Rampas en esquinas y señalización", monto: unidades(4_000) },
        ],
        periodoObjecion: MIN,
      });
    }],
    [HORA, (s) => s.fondear(veredas, unidades(19_000))],
  ]);

  // Obra 6. Token que no es el oficial: queda "Pagada" sin que eso valga nada (contract.md §0).
  let bacheo = 0;
  const obra6 = linea(6 * DIA, [
    [0, (s) => {
      bacheo = s.crearObra({
        municipio: c.municipio,
        nombre: "Bacheo calle Belgrano",
        contratista: c.contratistaBacheo,
        inspector: c.inspectorA,
        veedor: c.veedorBacheo,
        arbitro: ARBITRO,
        token: TOKEN_NO_OFICIAL,
        hitos: [
          { descripcion: "Sellado de baches", monto: unidades(3_000) },
          { descripcion: "Repavimentación de esquinas", monto: unidades(2_000) },
        ],
        periodoObjecion: MIN,
      });
    }],
    [30 * MIN, (s) => s.fondear(bacheo, unidades(5_000))],
    [2 * HORA, (s) => s.declararHito(bacheo, 0, hash.bacheoHito1)],
    [10 * MIN, (s) => s.aprobar(bacheo, 0, c.inspectorA)],
    [20 * MIN, (s) => s.aprobar(bacheo, 0, c.veedorBacheo)],
    [HORA, (s) => s.liberarPago(bacheo, 0)],
  ]);

  return [...obra1, ...obra2, ...obra3, ...obra4, ...obra5, ...obra6];
}

export interface Escenario {
  obras: Obra[];
  hitos: Map<number, Hito[]>;
  eventos: Evento[];
  /** Archivos de evidencia y motivos por SHA-256, para servirlos en GET /evidencia/{sha256}. */
  archivos: Map<string, ArchivoMock>;
}

/** Arma el escenario terminando en `ahoraMs` (por defecto, ahora). */
export async function armarEscenario(ahoraMs: number = Date.now()): Promise<Escenario> {
  const archivos = archivosMock();
  const hash = {} as Record<ClaveArchivo, string>;
  const porHash = new Map<string, ArchivoMock>();
  for (const clave of Object.keys(archivos) as ClaveArchivo[]) {
    hash[clave] = await sha256Hex(archivos[clave].contenido);
    porHash.set(hash[clave], archivos[clave]);
  }

  const inicio = Math.floor(ahoraMs / 1000) - DURACION_ESCENARIO;
  const sim = new SimuladorMock(inicio, LEDGER_INICIAL);
  const pasos = pasosEscenario(hash).sort((a, b) => a.en - b.en);
  for (const paso of pasos) {
    sim.irA(inicio + paso.en);
    paso.hacer(sim);
  }

  const eventos: Evento[] = await Promise.all(
    sim.eventos.map(async (e) => ({
      ...e,
      tx_hash: await sha256Hex(`opv-dato-simulado:tx:${e.ledger}`),
    })),
  );
  const estado = sim.estado;
  return {
    obras: estado.map((o) => o.obra).sort((a, b) => a.id - b.id),
    hitos: new Map(estado.map((o) => [o.obra.id, o.hitos])),
    eventos,
    archivos: porHash,
  };
}

// Next empaqueta cada ruta por separado: el escenario se guarda en globalThis para que todas las
// páginas y la ruta de evidencia del mismo proceso vean exactamente los mismos datos y momentos.
const CLAVE = Symbol.for("opv.escenarioMock");
type ConEscenario = typeof globalThis & { [CLAVE]?: Promise<Escenario> };

/** Escenario único del proceso: se arma la primera vez que se pide y queda fijo. */
export function obtenerEscenario(): Promise<Escenario> {
  const global = globalThis as ConEscenario;
  return (global[CLAVE] ??= armarEscenario());
}
