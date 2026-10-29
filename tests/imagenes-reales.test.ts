import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creditoCorto, imagenDePagina } from "../src/pipeline/crudo/imagenesReales";
import { materialEnPantalla, type ItemMaterial } from "../src/shared/material";

let base = "";
const servidor = createServer((req, res) => {
  if (req.url === "/nota") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end('<html><head><meta content="/fotos/inau.jpg?w=1200&amp;h=800" property="og:image"></head><body>Nota</body></html>');
  } else if (req.url === "/sin-foto") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html><head><title>x</title></head></html>");
  } else {
    res.writeHead(404);
    res.end();
  }
});
beforeAll(async () => {
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(() => servidor.close());

describe("imágenes reales", () => {
  it("saca la foto principal de una nota (og:image, con la URL resuelta)", async () => {
    expect(await imagenDePagina(`${base}/nota`)).toBe(`${base}/fotos/inau.jpg?w=1200&h=800`);
    expect(await imagenDePagina(`${base}/sin-foto`)).toBeNull();
    expect(await imagenDePagina(`${base}/no-existe`)).toBeNull();
  });

  it("crédito chiquito: el que trae, o el sitio", () => {
    expect(creditoCorto({ url: "https://x.gub.uy/a.jpg", pagina: null, origen: "oficial", credito: "Presidencia" })).toBe("Foto: Presidencia");
    expect(creditoCorto({ url: "https://www.elpais.com.uy/nota", pagina: null, origen: "prensa", credito: "" })).toBe("Foto: elpais.com.uy");
  });

  it("sin imagen real verificada va la tarjeta de texto, nunca una imagen", () => {
    const it0: ItemMaterial = {
      id: "m01",
      tipo: "lugar",
      frase: "los centros del INAU",
      origenMs: 3000,
      origenFinMs: 5000,
      estado: "listo",
      imagen: { busqueda: "INAU", archivo: null, etiqueta: "Centros del INAU", credito: null, licencia: null, paginaFuente: null, proveedor: null, origen: null, queDebeVerse: "un centro del INAU", verificacion: null, candidatas: [] },
      tarjeta: { titulo: "Centros del INAU", texto: "3.000 niños en centros de 24 horas" },
    };
    const [r] = materialEnPantalla([it0], [{ inicioMs: 0, finMs: 60000 }], (x) => x);
    expect(r).toMatchObject({ tipo: "tarjeta", titulo: "Centros del INAU", texto: "3.000 niños en centros de 24 horas" });
    const conFoto = materialEnPantalla([{ ...it0, imagen: { ...it0.imagen!, archivo: "material/m01-1.jpg" } }], [{ inicioMs: 0, finMs: 60000 }], (x) => x);
    expect(conFoto[0]).toMatchObject({ tipo: "imagen", imagen: "material/m01-1.jpg" });
  });
});
