import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { createHash } from 'node:crypto';
import type { SimuladorContrato } from './simulador.ts';

/*
 * DATO SIMULADO: obras, montos, cuentas, línea de tiempo y archivos de evidencia.
 *
 * | Obra | Estado final                                                                       |
 * |------|------------------------------------------------------------------------------------|
 * | 1    | Pavimentación calle Los Aromos (consigna): fondeo parcial; hito 1 Pagado; hito 2    |
 * |      | Objetado (el inspector aprobó y el veedor objetó dentro del período); 3 y 4 Pendiente |
 * | 2    | Red de agua: sin fondos; hito 1 en Evidencia con la aprobación del inspector, dentro |
 * |      | del período de objeción                                                            |
 * | 3    | Escuela: hito 1 objetado → Aceptar → re-declarado y pagado; hito 2 objetado →       |
 * |      | Rechazar → Aprobado por árbitro, período cumplido y con saldo: pagable             |
 * | 4    | Plaza: los dos hitos pagados → Finalizada                                          |
 * | 5    | Demo: fondeada por el total, 4 hitos Pendiente, para ensayar declarar_hito         |
 *
 * En el texto, los hitos se numeran como los ve el usuario (índice + 1).
 */

const MIN = 60;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** La línea de tiempo empieza 8 días antes de `ahora` y termina antes de `ahora`. */
export const DURACION_ESCENARIO = 8 * DIA;
/** Ledger del inicio del escenario (DATO SIMULADO). */
export const LEDGER_INICIAL = 1_500_000;

/** Montos con los 7 decimales del token: unidades(1500) = 15000000000n. */
const unidades = (n: number): bigint => BigInt(n) * 10_000_000n;

const sha256 = (texto: string): Buffer => createHash('sha256').update(texto).digest();

/** Cuenta G... determinística a partir de una etiqueta (misma etiqueta → misma dirección). */
function cuenta(etiqueta: string): string {
  return Keypair.fromRawEd25519Seed(sha256(`opv-dato-simulado:cuenta:${etiqueta}`)).publicKey();
}

const MUNICIPIO = cuenta('municipio');
// SUPUESTO del MVP (PRD §3): el árbitro es la dirección del municipio.
const ARBITRO = MUNICIPIO;
/** Contrato del activo de prueba tipo USDC en testnet (C...). */
const TOKEN = StrKey.encodeContract(sha256('opv-dato-simulado:token:usdc-prueba'));
const INSPECTOR_A = cuenta('inspector-a');
const INSPECTOR_B = cuenta('inspector-b');

export type DefinicionArchivo =
  | { tipo: 'png'; nombre: string; descripcion: string; color: [number, number, number] }
  | { tipo: 'pdf'; nombre: string; titulo: string; lineas: string[] };

export const ARCHIVOS = {
  aromosHito1: {
    tipo: 'png',
    nombre: 'aromos-hito1-base-granular.png',
    descripcion: 'Pavimentación calle Los Aromos - hito 1: base granular compactada',
    color: [150, 120, 90],
  },
  aromosHito2: {
    tipo: 'pdf',
    nombre: 'aromos-hito2-acta-medicion.pdf',
    titulo: 'Acta de medición - Hito 2',
    lineas: [
      'Obra: Pavimentación calle Los Aromos',
      'Hito 2: cordón cuneta y desagües pluviales',
      'Cordón cuneta ejecutado: 420 m lineales (cuadras 100 a 400).',
      'Sumideros instalados: 6 de 6.',
    ],
  },
  aromosHito2Objecion: {
    tipo: 'pdf',
    nombre: 'aromos-hito2-objecion-veedor.pdf',
    titulo: 'Objeción del veedor - Hito 2',
    lineas: [
      'Obra: Pavimentación calle Los Aromos',
      'En la recorrida del veedor vecinal faltan las rejillas de dos sumideros',
      'de la cuadra 300. El acta declara 6 de 6 instalados.',
    ],
  },
  aguaHito1: {
    tipo: 'png',
    nombre: 'esperanza-hito1-zanja-troncal.png',
    descripcion: 'Red de agua potable barrio Esperanza - hito 1: cañería troncal tendida',
    color: [70, 110, 160],
  },
  escuelaHito1v1: {
    tipo: 'png',
    nombre: 'escuela-hito1-techos.png',
    descripcion: 'Escuela N° 512 - hito 1: techos (primera declaración)',
    color: [180, 80, 60],
  },
  escuelaHito1Objecion: {
    tipo: 'pdf',
    nombre: 'escuela-hito1-objecion-veedor.pdf',
    titulo: 'Objeción del veedor - Hito 1',
    lineas: [
      'Obra: Refacción Escuela Primaria N° 512',
      'La foto declarada no muestra la cubierta del ala norte terminada.',
    ],
  },
  escuelaHito1v2: {
    tipo: 'png',
    nombre: 'escuela-hito1-techos-ala-norte.png',
    descripcion: 'Escuela N° 512 - hito 1: techos con ala norte terminada (segunda declaración)',
    color: [190, 100, 70],
  },
  escuelaHito2: {
    tipo: 'pdf',
    nombre: 'escuela-hito2-certificado-electrico.pdf',
    titulo: 'Certificado de instalación eléctrica - Hito 2',
    lineas: [
      'Obra: Refacción Escuela Primaria N° 512',
      'Tablero seccional, circuitos de aulas y sanitarios: medición de aislación aprobada.',
    ],
  },
  escuelaHito2Objecion: {
    tipo: 'pdf',
    nombre: 'escuela-hito2-objecion-veedor.pdf',
    titulo: 'Objeción del veedor - Hito 2',
    lineas: [
      'Obra: Refacción Escuela Primaria N° 512',
      'Falta el certificado de la instalación de gas.',
      '(El árbitro la rechaza: el gas no forma parte de este hito.)',
    ],
  },
  plazaHito1: {
    tipo: 'png',
    nombre: 'plaza-hito1-luminarias.png',
    descripcion: 'Iluminación LED Plaza 25 de Mayo - hito 1: luminarias en depósito',
    color: [220, 190, 60],
  },
  plazaHito2: {
    tipo: 'pdf',
    nombre: 'plaza-hito2-acta-puesta-en-marcha.pdf',
    titulo: 'Acta de puesta en marcha - Hito 2',
    lineas: ['Obra: Iluminación LED Plaza 25 de Mayo', '48 luminarias LED instaladas y encendidas.'],
  },
} satisfies Record<string, DefinicionArchivo>;

export type ClaveArchivo = keyof typeof ARCHIVOS;

export interface Paso {
  /** Segundos desde el inicio del escenario. */
  en: number;
  hacer: (sim: SimuladorContrato) => void;
}

/** Pasos de una obra con demoras relativas al paso anterior. */
function linea(desde: number, pasos: [demora: number, hacer: Paso['hacer']][]): Paso[] {
  let en = desde;
  return pasos.map(([demora, hacer]) => ({ en: (en += demora), hacer }));
}

/** Todos los pasos del escenario, sin ordenar. `hash` da el SHA-256 de cada archivo ya guardado. */
export function pasosEscenario(hash: Record<ClaveArchivo, string>): Paso[] {
  let aromos = 0;
  let agua = 0;
  let escuela = 0;
  let plaza = 0;
  let demo = 0;

  // Obra 1. Período de 1 minuto, como en la demo (PRD §4).
  const contratistaAromos = cuenta('contratista-vial-litoral');
  const veedorAromos = cuenta('veedor-vecinal-los-aromos');
  const obra1 = linea(0, [
    [0, (s) => {
      aromos = s.crearObra({
        municipio: MUNICIPIO,
        nombre: 'Pavimentación calle Los Aromos',
        contratista: contratistaAromos,
        inspector: INSPECTOR_A,
        veedor: veedorAromos,
        arbitro: ARBITRO,
        token: TOKEN,
        hitos: [
          { descripcion: 'Movimiento de suelo y base granular', monto: unidades(10_000) },
          { descripcion: 'Cordón cuneta y desagües pluviales', monto: unidades(15_000) },
          { descripcion: 'Carpeta asfáltica', monto: unidades(10_000) },
          { descripcion: 'Señalización y limpieza final de obra', monto: unidades(5_000) },
        ],
        periodoObjecion: MIN,
      });
    }],
    [2 * HORA, (s) => s.fondear(aromos, unidades(10_000))],
    [DIA, (s) => s.declararHito(aromos, 0, hash.aromosHito1)],
    [20 * MIN, (s) => s.aprobar(aromos, 0, INSPECTOR_A)],
    [40 * MIN, (s) => s.aprobar(aromos, 0, veedorAromos)],
    [2 * HORA, (s) => s.liberarPago(aromos, 0)],
    [DIA, (s) => s.fondear(aromos, unidades(15_000))],
    [2 * HORA, (s) => s.declararHito(aromos, 1, hash.aromosHito2)],
    [20, (s) => s.aprobar(aromos, 1, INSPECTOR_A)],
    [25, (s) => s.objetar(aromos, 1, hash.aromosHito2Objecion)],
  ]);

  // Obra 2. Período de 72 horas para que el hito siga dentro del período al sembrar.
  const veedorAgua = cuenta('veedor-barrio-esperanza');
  const obra2 = linea(3 * DIA, [
    [0, (s) => {
      agua = s.crearObra({
        municipio: MUNICIPIO,
        nombre: 'Red de agua potable barrio Esperanza',
        contratista: cuenta('cooperativa-agua-esperanza'),
        inspector: INSPECTOR_B,
        veedor: veedorAgua,
        arbitro: ARBITRO,
        token: TOKEN,
        hitos: [
          { descripcion: 'Excavación y tendido de cañería troncal', monto: unidades(18_000) },
          { descripcion: 'Conexiones domiciliarias', monto: unidades(12_000) },
          { descripcion: 'Prueba hidráulica y habilitación', monto: unidades(6_000) },
        ],
        periodoObjecion: 72 * HORA,
      });
    }],
    [5 * DIA - HORA, (s) => s.declararHito(agua, 0, hash.aguaHito1)],
    [30 * MIN, (s) => s.aprobar(agua, 0, INSPECTOR_B)],
  ]);

  // Obra 3. Las dos resoluciones del árbitro.
  const veedorEscuela = cuenta('veedor-cooperadora-escuela-512');
  const obra3 = linea(4 * DIA, [
    [0, (s) => {
      escuela = s.crearObra({
        municipio: MUNICIPIO,
        nombre: 'Refacción Escuela Primaria N° 512',
        contratista: cuenta('constructora-del-nea'),
        inspector: INSPECTOR_A,
        veedor: veedorEscuela,
        arbitro: ARBITRO,
        token: TOKEN,
        hitos: [
          { descripcion: 'Reparación de techos y cubiertas', monto: unidades(8_000) },
          { descripcion: 'Instalación eléctrica y sanitarios', monto: unidades(6_000) },
        ],
        periodoObjecion: MIN,
      });
    }],
    [HORA, (s) => s.fondear(escuela, unidades(14_000))],
    [DIA, (s) => s.declararHito(escuela, 0, hash.escuelaHito1v1)],
    [30, (s) => s.objetar(escuela, 0, hash.escuelaHito1Objecion)],
    [3 * HORA, (s) => s.resolverObjecion(escuela, 0, 'Aceptar')],
    [DIA, (s) => s.declararHito(escuela, 0, hash.escuelaHito1v2)],
    [10 * MIN, (s) => s.aprobar(escuela, 0, INSPECTOR_A)],
    [15 * MIN, (s) => s.aprobar(escuela, 0, veedorEscuela)],
    [HORA, (s) => s.liberarPago(escuela, 0)],
    [2 * HORA, (s) => s.declararHito(escuela, 1, hash.escuelaHito2)],
    [10, (s) => s.aprobar(escuela, 1, INSPECTOR_A)],
    [20, (s) => s.objetar(escuela, 1, hash.escuelaHito2Objecion)],
    [2 * HORA, (s) => s.resolverObjecion(escuela, 1, 'Rechazar')],
  ]);

  // Obra 4. Completa.
  const veedorPlaza = cuenta('veedor-vecinal-plaza-25-de-mayo');
  const obra4 = linea(5 * DIA, [
    [0, (s) => {
      plaza = s.crearObra({
        municipio: MUNICIPIO,
        nombre: 'Iluminación LED Plaza 25 de Mayo',
        contratista: cuenta('electro-litoral'),
        inspector: INSPECTOR_B,
        veedor: veedorPlaza,
        arbitro: ARBITRO,
        token: TOKEN,
        hitos: [
          { descripcion: 'Provisión de luminarias LED', monto: unidades(4_500) },
          { descripcion: 'Instalación y puesta en marcha', monto: unidades(3_000) },
        ],
        periodoObjecion: MIN,
      });
    }],
    [30 * MIN, (s) => s.fondear(plaza, unidades(7_500))],
    [6 * HORA, (s) => s.declararHito(plaza, 0, hash.plazaHito1)],
    [10 * MIN, (s) => s.aprobar(plaza, 0, INSPECTOR_B)],
    [20 * MIN, (s) => s.aprobar(plaza, 0, veedorPlaza)],
    [HORA, (s) => s.liberarPago(plaza, 0)],
    [DIA, (s) => s.declararHito(plaza, 1, hash.plazaHito2)],
    [10 * MIN, (s) => s.aprobar(plaza, 1, INSPECTOR_B)],
    [15 * MIN, (s) => s.aprobar(plaza, 1, veedorPlaza)],
    [HORA, (s) => s.liberarPago(plaza, 1)],
  ]);

  // Obra 5. Fondeada por el total y sin declaraciones: para ensayar declarar_hito en el modo seed.
  const obra5 = linea(7 * DIA, [
    [0, (s) => {
      demo = s.crearObra({
        municipio: MUNICIPIO,
        nombre: 'Demo: obra fondeada',
        contratista: cuenta('contratista-demo'),
        inspector: INSPECTOR_A,
        veedor: cuenta('veedor-demo'),
        arbitro: ARBITRO,
        token: TOKEN,
        hitos: [
          { descripcion: 'Replanteo y obrador', monto: unidades(6_000) },
          { descripcion: 'Estructura', monto: unidades(5_000) },
          { descripcion: 'Terminaciones', monto: unidades(5_000) },
          { descripcion: 'Entrega final', monto: unidades(4_000) },
        ],
        periodoObjecion: MIN,
      });
    }],
    [HORA, (s) => s.fondear(demo, unidades(20_000))],
  ]);

  return [...obra1, ...obra2, ...obra3, ...obra4, ...obra5];
}
