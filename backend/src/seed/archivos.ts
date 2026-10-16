import { crc32, deflateSync } from 'node:zlib';

/*
 * DATO SIMULADO. Archivos de evidencia de ejemplo, generados sin dependencias y con contenido
 * fijo: el mismo seed produce siempre los mismos bytes y, por lo tanto, los mismos hashes.
 */

/** PNG RGB con un degradé vertical del color dado y un chunk tEXt que lo marca como simulado. */
export function generarPng(descripcion: string, [r, g, b]: [number, number, number]): Buffer {
  const ancho = 320;
  const alto = 200;
  const filas: Buffer[] = [];
  for (let y = 0; y < alto; y++) {
    const fila = Buffer.alloc(1 + ancho * 3); // byte 0: filtro "None"
    const f = 1 - (0.5 * y) / alto;
    // Una franja diagonal para que la imagen no sea un bloque liso.
    for (let x = 0; x < ancho; x++) {
      const franja = Math.abs(x - y * 1.6) < 12 ? 0.6 : 1;
      fila[1 + x * 3] = Math.round(r * f * franja);
      fila[2 + x * 3] = Math.round(g * f * franja);
      fila[3 + x * 3] = Math.round(b * f * franja);
    }
    filas.push(fila);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB, deflate, filtro estándar, sin entrelazado

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunkPng('IHDR', ihdr),
    chunkPng('tEXt', Buffer.from(`Description\0DATO SIMULADO - ${descripcion}`, 'latin1')),
    chunkPng('IDAT', deflateSync(Buffer.concat(filas))),
    chunkPng('IEND', Buffer.alloc(0)),
  ]);
}

function chunkPng(tipo: string, datos: Buffer): Buffer {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const tipoYDatos = Buffer.concat([Buffer.from(tipo, 'latin1'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tipoYDatos));
  return Buffer.concat([largo, tipoYDatos, crc]);
}

/** PDF de una página A4 con líneas de texto en Helvetica (WinAnsi: admite tildes y eñes). */
export function generarPdf(titulo: string, lineas: string[]): Buffer {
  const escapar = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const texto = [
    'BT',
    '/F1 16 Tf',
    '56 780 Td',
    `(${escapar(titulo)}) Tj`,
    '/F1 11 Tf',
    '15 TL',
    'T*',
    ...['DATO SIMULADO - archivo de ejemplo generado por npm run seed', '', ...lineas].map(
      (l) => `(${escapar(l)}) '`,
    ),
    'ET',
  ].join('\n');

  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(texto, 'latin1')} >>\nstream\n${texto}\nendstream`,
  ];

  // Todo en latin1: un carácter = un byte, así las posiciones de la tabla xref son exactas.
  let pdf = '%PDF-1.4\n%âãÏÓ\n';
  const posiciones: number[] = [];
  objetos.forEach((cuerpo, i) => {
    posiciones.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`;
  });
  const inicioXref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  pdf += posiciones.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
