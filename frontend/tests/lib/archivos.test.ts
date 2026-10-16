import { crc32 as crc32Zlib, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { crc32, detectarTipo, generarPdf, generarPng, TIPOS_EVIDENCIA } from "@/lib/archivos";

const bytes = (...n: number[]) => Uint8Array.from(n);
const latin1 = (b: Uint8Array) => Buffer.from(b).toString("latin1");

describe("detectarTipo", () => {
  it("JPEG, PNG y PDF por los primeros bytes", () => {
    expect(detectarTipo(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00))).toBe("image/jpeg");
    expect(detectarTipo(bytes(0xff, 0xd8, 0xff))).toBe("image/jpeg");
    expect(detectarTipo(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(detectarTipo(Buffer.from("%PDF-1.7\n"))).toBe("application/pdf");
    expect(TIPOS_EVIDENCIA).toEqual(["image/jpeg", "image/png", "application/pdf"]);
  });

  it.each([
    ["vacío", bytes()],
    ["JPEG truncado", bytes(0xff, 0xd8)],
    ["PNG truncado", bytes(0x89, 0x50, 0x4e, 0x47)],
    ["PNG con firma alterada", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b)],
    ["PDF sin guion", Buffer.from("%PDF")],
    ["PDF con basura antes", Buffer.from(" %PDF-1.4")],
    ["GIF", Buffer.from("GIF89a")],
    ["texto", Buffer.from("hola")],
    ["SVG", Buffer.from("<svg/>")],
    ["ceros", new Uint8Array(100)],
  ])("%s → null", (_nombre, contenido) => {
    expect(detectarTipo(contenido)).toBeNull();
  });

  it("reconoce lo que generan generarPng y generarPdf", () => {
    expect(detectarTipo(generarPng("x", [10, 20, 30]))).toBe("image/png");
    expect(detectarTipo(generarPdf("t", []))).toBe("application/pdf");
  });
});

describe("crc32", () => {
  it("coincide con el de zlib", () => {
    const casos = [
      new Uint8Array(0),
      Buffer.from("a"),
      Buffer.from("123456789"),
      Buffer.from("The quick brown fox jumps over the lazy dog"),
      Uint8Array.from({ length: 5000 }, (_, i) => (i * 31 + 7) & 0xff),
    ];
    for (const c of casos) expect(crc32(c)).toBe(crc32Zlib(c));
  });

  it("valor de referencia: crc32('123456789') = 0xCBF43926", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });
});

interface Chunk {
  tipo: string;
  datos: Buffer;
  crc: number;
  crcCalculado: number;
}

/** Recorre los chunks de un PNG, comprobando que no sobren ni falten bytes. */
function chunksDe(png: Uint8Array): Chunk[] {
  const buf = Buffer.from(png);
  const salida: Chunk[] = [];
  let i = 8;
  while (i < buf.length) {
    const largo = buf.readUInt32BE(i);
    const tipo = buf.subarray(i + 4, i + 8).toString("latin1");
    const datos = buf.subarray(i + 8, i + 8 + largo);
    const crc = buf.readUInt32BE(i + 8 + largo);
    salida.push({ tipo, datos, crc, crcCalculado: crc32Zlib(buf.subarray(i + 4, i + 8 + largo)) });
    i += 12 + largo;
  }
  expect(i).toBe(buf.length);
  return salida;
}

describe("generarPng", () => {
  const ANCHO = 160;
  const ALTO = 100;
  const png = generarPng("Baches sellados", [200, 120, 60]);

  it("firma de 8 bytes y chunks IHDR, tEXt, IDAT, IEND en orden", () => {
    expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(chunksDe(png).map((c) => c.tipo)).toEqual(["IHDR", "tEXt", "IDAT", "IEND"]);
  });

  it("cada chunk tiene un CRC correcto", () => {
    for (const c of chunksDe(png)) expect(c.crc, c.tipo).toBe(c.crcCalculado);
  });

  it("IHDR: dimensiones, 8 bits, RGB, sin entrelazado", () => {
    const ihdr = chunksDe(png)[0].datos;
    expect(ihdr.length).toBe(13);
    expect(ihdr.readUInt32BE(0)).toBe(ANCHO);
    expect(ihdr.readUInt32BE(4)).toBe(ALTO);
    expect(Array.from(ihdr.subarray(8))).toEqual([8, 2, 0, 0, 0]);
  });

  it("IDAT inflado mide alto*(1+ancho*3) y cada fila empieza con filtro 0", () => {
    const idat = chunksDe(png).find((c) => c.tipo === "IDAT")!.datos;
    const crudo = inflateSync(idat);
    expect(crudo.length).toBe(ALTO * (1 + ANCHO * 3));
    for (let y = 0; y < ALTO; y++) expect(crudo[y * (1 + ANCHO * 3)]).toBe(0);
  });

  it("tamaños propios: el IDAT inflado sigue la fórmula (incluso con más de un bloque stored)", () => {
    const grande = generarPng("g", [1, 2, 3], 300, 120); // 120 * 901 = 108120 > 65535
    const chunks = chunksDe(grande);
    for (const c of chunks) expect(c.crc).toBe(c.crcCalculado);
    expect(inflateSync(chunks.find((c) => c.tipo === "IDAT")!.datos).length).toBe(120 * (1 + 300 * 3));
    const ihdr = chunks[0].datos;
    expect([ihdr.readUInt32BE(0), ihdr.readUInt32BE(4)]).toEqual([300, 120]);
  });

  it("el texto de descripción va en tEXt y marca el dato como simulado", () => {
    const texto = chunksDe(png).find((c) => c.tipo === "tEXt")!.datos.toString("latin1");
    expect(texto).toBe("Description\0DATO SIMULADO - Baches sellados");
  });

  it("es determinista y el color cambia el contenido", () => {
    expect(Buffer.from(generarPng("a", [1, 2, 3])).equals(Buffer.from(generarPng("a", [1, 2, 3])))).toBe(true);
    expect(Buffer.from(generarPng("a", [1, 2, 3])).equals(Buffer.from(generarPng("a", [9, 2, 3])))).toBe(false);
  });
});

describe("generarPdf", () => {
  const pdf = generarPdf("Certificado (ñandú)", ["Línea uno", "con \\ barra y (paréntesis)"]);
  const texto = latin1(pdf);

  it("empieza con %PDF- y termina con %%EOF", () => {
    expect(texto.startsWith("%PDF-")).toBe(true);
    expect(texto.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("la tabla xref apunta con offsets exactos (en bytes latin1) a cada 'N 0 obj'", () => {
    const inicioXref = Number(/startxref\n(\d+)\n%%EOF/.exec(texto)![1]);
    expect(texto.slice(inicioXref, inicioXref + 4)).toBe("xref");

    const [cabecera, ...resto] = texto.slice(inicioXref).split("\n");
    expect(cabecera).toBe("xref");
    const [desde, cantidad] = resto[0].split(" ").map(Number);
    expect([desde, cantidad]).toEqual([0, 6]);
    const entradas = resto.slice(1, 1 + cantidad);
    expect(entradas[0]).toBe("0000000000 65535 f ");
    expect(entradas).toHaveLength(6);
    for (let n = 1; n < cantidad; n++) {
      expect(entradas[n]).toMatch(/^\d{10} 00000 n $/);
      const offset = Number(entradas[n].slice(0, 10));
      expect(texto.startsWith(`${n} 0 obj\n`, offset), `objeto ${n}`).toBe(true);
    }
    expect(texto).toContain(`trailer\n<< /Size ${cantidad} /Root 1 0 R >>`);
  });

  it("las tildes ocupan un byte (latin1) y los caracteres especiales se escapan", () => {
    expect(pdf.includes(0xf1)).toBe(true); // ñ
    expect(pdf.includes(0xc3)).toBe(false); // sin UTF-8
    expect(texto).toContain("(Certificado \\(ñandú\\)) Tj");
    expect(texto).toContain("(con \\\\ barra y \\(paréntesis\\)) '");
  });

  it("incluye la marca de dato simulado y es determinista", () => {
    expect(texto).toContain("DATO SIMULADO");
    expect(Buffer.from(generarPdf("a", ["b"])).equals(Buffer.from(generarPdf("a", ["b"])))).toBe(true);
  });
});
