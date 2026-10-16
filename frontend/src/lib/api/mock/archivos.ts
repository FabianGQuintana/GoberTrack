// DATO SIMULADO: archivos de evidencia y de motivos de objeción del modo mock.
// Mismas claves, nombres y textos que el seed del backend (backend/src/seed/archivos.ts y
// escenario.ts): fotos en PNG y actas en PDF, generados acá con lib/archivos.ts. Los bytes no son
// idénticos a los del backend, así que los hashes tampoco.

import { generarPdf, generarPng } from "../../archivos";

export interface ArchivoMock {
  nombre: string;
  tipoMime: "image/png" | "application/pdf";
  contenido: Uint8Array;
}

type Definicion =
  | { tipo: "png"; nombre: string; descripcion: string; color: [number, number, number] }
  | { tipo: "pdf"; nombre: string; titulo: string; lineas: string[] };

const DEFINICIONES = {
  aromosHito1: {
    tipo: "png",
    nombre: "aromos-hito1-base-granular.png",
    descripcion: "Pavimentación calle Los Aromos - hito 1: base granular compactada",
    color: [150, 120, 90],
  },
  aromosHito2: {
    tipo: "pdf",
    nombre: "aromos-hito2-acta-medicion.pdf",
    titulo: "Acta de medición - Hito 2",
    lineas: [
      "Obra: Pavimentación calle Los Aromos",
      "Hito 2: cordón cuneta y desagües pluviales",
      "Cordón cuneta ejecutado: 420 m lineales (cuadras 100 a 400).",
      "Sumideros instalados: 6 de 6.",
    ],
  },
  aromosHito2Objecion: {
    tipo: "pdf",
    nombre: "aromos-hito2-objecion-veedor.pdf",
    titulo: "Objeción del veedor - Hito 2",
    lineas: [
      "Obra: Pavimentación calle Los Aromos",
      "En la recorrida del veedor vecinal faltan las rejillas de dos sumideros",
      "de la cuadra 300. El acta declara 6 de 6 instalados.",
    ],
  },
  aguaHito1: {
    tipo: "png",
    nombre: "esperanza-hito1-zanja-troncal.png",
    descripcion: "Red de agua potable barrio Esperanza - hito 1: cañería troncal tendida",
    color: [70, 110, 160],
  },
  escuelaHito1v1: {
    tipo: "png",
    nombre: "escuela-hito1-techos.png",
    descripcion: "Escuela N° 512 - hito 1: techos (primera declaración)",
    color: [180, 80, 60],
  },
  escuelaHito1Objecion: {
    tipo: "pdf",
    nombre: "escuela-hito1-objecion-veedor.pdf",
    titulo: "Objeción del veedor - Hito 1",
    lineas: ["Obra: Refacción Escuela Primaria N° 512", "La foto declarada no muestra la cubierta del ala norte terminada."],
  },
  escuelaHito1v2: {
    tipo: "png",
    nombre: "escuela-hito1-techos-ala-norte.png",
    descripcion: "Escuela N° 512 - hito 1: techos con ala norte terminada (segunda declaración)",
    color: [190, 100, 70],
  },
  escuelaHito2: {
    tipo: "pdf",
    nombre: "escuela-hito2-certificado-electrico.pdf",
    titulo: "Certificado de instalación eléctrica - Hito 2",
    lineas: [
      "Obra: Refacción Escuela Primaria N° 512",
      "Tablero seccional, circuitos de aulas y sanitarios: medición de aislación aprobada.",
    ],
  },
  escuelaHito2Objecion: {
    tipo: "pdf",
    nombre: "escuela-hito2-objecion-veedor.pdf",
    titulo: "Objeción del veedor - Hito 2",
    lineas: [
      "Obra: Refacción Escuela Primaria N° 512",
      "Falta el certificado de la instalación de gas.",
      "(El árbitro la rechaza: el gas no forma parte de este hito.)",
    ],
  },
  plazaHito1: {
    tipo: "png",
    nombre: "plaza-hito1-luminarias.png",
    descripcion: "Iluminación LED Plaza 25 de Mayo - hito 1: luminarias en depósito",
    color: [220, 190, 60],
  },
  plazaHito2: {
    tipo: "pdf",
    nombre: "plaza-hito2-acta-puesta-en-marcha.pdf",
    titulo: "Acta de puesta en marcha - Hito 2",
    lineas: ["Obra: Iluminación LED Plaza 25 de Mayo", "48 luminarias LED instaladas y encendidas."],
  },
  bacheoHito1: {
    tipo: "png",
    nombre: "bacheo-hito1-calle-belgrano.png",
    descripcion: "Bacheo calle Belgrano (token no oficial) - hito 1: baches sellados",
    color: [110, 110, 110],
  },
} satisfies Record<string, Definicion>;

export type ClaveArchivo = keyof typeof DEFINICIONES;

export function archivosMock(): Record<ClaveArchivo, ArchivoMock> {
  const salida = {} as Record<ClaveArchivo, ArchivoMock>;
  for (const clave of Object.keys(DEFINICIONES) as ClaveArchivo[]) {
    const def: Definicion = DEFINICIONES[clave];
    salida[clave] =
      def.tipo === "png"
        ? { nombre: def.nombre, tipoMime: "image/png", contenido: generarPng(def.descripcion, def.color) }
        : { nombre: def.nombre, tipoMime: "application/pdf", contenido: generarPdf(def.titulo, def.lineas) };
  }
  return salida;
}
