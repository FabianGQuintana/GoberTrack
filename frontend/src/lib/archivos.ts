// Archivos de evidencia: detección del tipo por los primeros bytes (como el backend) y generadores
// de PNG y PDF de ejemplo sin dependencias, que funcionan en el navegador y en Node.
// DATO SIMULADO: lo que generan es contenido de ejemplo para el modo mock y el script de la demo.

export const TIPOS_EVIDENCIA = ["image/jpeg", "image/png", "application/pdf"] as const;
export type TipoEvidencia = (typeof TIPOS_EVIDENCIA)[number];

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const FIRMA_JPEG = [0xff, 0xd8, 0xff];
const FIRMA_PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** Tipo según la firma del archivo (no según la extensión ni lo que declara el navegador). */
export function detectarTipo(bytes: Uint8Array): TipoEvidencia | null {
  const empieza = (firma: number[]) => bytes.length >= firma.length && firma.every((b, i) => bytes[i] === b);
  if (empieza(FIRMA_JPEG)) return "image/jpeg";
  if (empieza(FIRMA_PNG)) return "image/png";
  if (empieza(FIRMA_PDF)) return "application/pdf";
  return null;
}

// ---- Utilidades de bytes ----

/** Texto → bytes latin1 (un carácter, un byte); lo que no entra en latin1 queda como "?". */
function latin1(texto: string): Uint8Array {
  return Uint8Array.from(texto, (c) => {
    const codigo = c.charCodeAt(0);
    return codigo <= 0xff ? codigo : 0x3f;
  });
}

function unir(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((s, p) => s + p.length, 0);
  const salida = new Uint8Array(total);
  let i = 0;
  for (const p of partes) {
    salida.set(p, i);
    i += p.length;
  }
  return salida;
}

function u32be(n: number): Uint8Array {
  return Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (el de PNG y zlib). */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const x of bytes) {
    a = (a + x) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Flujo zlib con bloques "stored" (sin comprimir): válido para cualquier lector de PNG. */
function zlibSinComprimir(datos: Uint8Array): Uint8Array {
  const partes: Uint8Array[] = [Uint8Array.of(0x78, 0x01)];
  const MAX = 65535;
  let i = 0;
  do {
    const trozo = datos.subarray(i, i + MAX);
    i += trozo.length;
    const final = i >= datos.length ? 1 : 0;
    const n = trozo.length;
    // Cabecera de bloque stored: BFINAL, LEN y NLEN (complemento de LEN), little-endian.
    partes.push(Uint8Array.of(final, n & 0xff, (n >>> 8) & 0xff, ~n & 0xff, (~n >>> 8) & 0xff), trozo);
  } while (i < datos.length);
  partes.push(u32be(adler32(datos)));
  return unir(partes);
}

function chunkPng(tipo: string, datos: Uint8Array): Uint8Array {
  const tipoYDatos = unir([latin1(tipo), datos]);
  return unir([u32be(datos.length), tipoYDatos, u32be(crc32(tipoYDatos))]);
}

// ---- Generadores ----

/** PNG RGB con un degradé del color dado y un chunk tEXt con la descripción. */
export function generarPng(descripcion: string, [r, g, b]: [number, number, number], ancho = 160, alto = 100): Uint8Array {
  const filas = new Uint8Array(alto * (1 + ancho * 3));
  for (let y = 0; y < alto; y++) {
    const base = y * (1 + ancho * 3); // byte 0 de cada fila: filtro "None"
    const f = 1 - (0.5 * y) / alto;
    for (let x = 0; x < ancho; x++) {
      const franja = Math.abs(x - y * 1.6) < 8 ? 0.6 : 1;
      filas[base + 1 + x * 3] = Math.round(r * f * franja);
      filas[base + 2 + x * 3] = Math.round(g * f * franja);
      filas[base + 3 + x * 3] = Math.round(b * f * franja);
    }
  }
  const ihdr = unir([u32be(ancho), u32be(alto), Uint8Array.of(8, 2, 0, 0, 0)]); // 8 bits, RGB
  return unir([
    Uint8Array.from(FIRMA_PNG),
    chunkPng("IHDR", ihdr),
    chunkPng("tEXt", latin1(`Description\0DATO SIMULADO - ${descripcion}`)),
    chunkPng("IDAT", zlibSinComprimir(filas)),
    chunkPng("IEND", new Uint8Array(0)),
  ]);
}

/** PDF de una página A4 con un título y líneas de texto (Helvetica, WinAnsi: admite tildes). */
export function generarPdf(titulo: string, lineas: string[]): Uint8Array {
  const escapar = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const texto = [
    "BT",
    "/F1 16 Tf",
    "56 780 Td",
    `(${escapar(titulo)}) Tj`,
    "/F1 11 Tf",
    "15 TL",
    "T*",
    ...["DATO SIMULADO - archivo de ejemplo", "", ...lineas].map((l) => `(${escapar(l)}) '`),
    "ET",
  ].join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${texto.length} >>\nstream\n${texto}\nendstream`,
  ];
  // Todo en latin1: un carácter = un byte, así las posiciones de la tabla xref son exactas.
  let pdf = "%PDF-1.4\n%âãÏÓ\n";
  const posiciones: number[] = [];
  objetos.forEach((cuerpo, i) => {
    posiciones.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  pdf += posiciones.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return latin1(pdf);
}
