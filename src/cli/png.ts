import { inflateSync } from "node:zlib";

/** Decodificador PNG mínimo (8 bits, RGB/RGBA, sin entrelazado: lo que produce Remotion). Devuelve escala de grises. */
export const leerPngGris = (buf: Buffer): { ancho: number; alto: number; gris: Uint8Array } => {
  let pos = 8;
  let ancho = 0;
  let alto = 0;
  let canales = 0;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const largo = buf.readUInt32BE(pos);
    const tipo = buf.toString("ascii", pos + 4, pos + 8);
    const datos = buf.subarray(pos + 8, pos + 8 + largo);
    if (tipo === "IHDR") {
      ancho = datos.readUInt32BE(0);
      alto = datos.readUInt32BE(4);
      const prof = datos[8];
      const color = datos[9];
      if (prof !== 8 || (color !== 2 && color !== 6) || datos[12] !== 0) throw new Error("PNG no soportado");
      canales = color === 6 ? 4 : 3;
    } else if (tipo === "IDAT") idat.push(datos);
    else if (tipo === "IEND") break;
    pos += 12 + largo;
  }
  const crudo = inflateSync(Buffer.concat(idat));
  const fila = ancho * canales;
  const px = Buffer.alloc(fila * alto);
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (fila + 1)];
    for (let x = 0; x < fila; x++) {
      const v = crudo[y * (fila + 1) + 1 + x] ?? 0;
      const a = x >= canales ? px[y * fila + x - canales]! : 0;
      const b = y > 0 ? px[(y - 1) * fila + x]! : 0;
      const c = x >= canales && y > 0 ? px[(y - 1) * fila + x - canales]! : 0;
      let r: number;
      if (filtro === 0) r = v;
      else if (filtro === 1) r = v + a;
      else if (filtro === 2) r = v + b;
      else if (filtro === 3) r = v + ((a + b) >> 1);
      else {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      px[y * fila + x] = r & 0xff;
    }
  }
  const gris = new Uint8Array(ancho * alto);
  for (let i = 0; i < ancho * alto; i++) gris[i] = (px[i * canales]! * 299 + px[i * canales + 1]! * 587 + px[i * canales + 2]! * 114) / 1000;
  return { ancho, alto, gris };
};
