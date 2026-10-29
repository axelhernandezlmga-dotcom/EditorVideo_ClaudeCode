import { describe, expect, it } from "vitest";
import { esquemaParaClaude } from "../src/pipeline/claude";
import { transcripcionNumerada } from "../src/pipeline/crudo/material";
import type { Cortes, Transcripcion } from "../src/shared/cortes";
import { DeteccionSchema, materialEnPantalla, type ItemMaterial } from "../src/shared/material";

const item = (id: string, origenMs: number, origenFinMs: number, extra: Partial<ItemMaterial> = {}): ItemMaterial => ({
  id,
  tipo: "dato",
  frase: "x",
  origenMs,
  origenFinMs,
  estado: "listo",
  dato: { plantilla: "dato_numero", props: { numero: 1, contexto: "algo" }, fuente: null },
  ...extra,
});
const url = (rel: string) => `/jobs/x/${rel}`;

describe("materialEnPantalla", () => {
  const tramos = [
    { inicioMs: 0, finMs: 10_000 },
    { inicioMs: 12_000, finMs: 30_000 },
  ];

  it("ubica cada cosa en el video cortado y le da entre 2,6 y 4,5 s", () => {
    const [a, b] = materialEnPantalla([item("m01", 1000, 1500), item("m02", 13_000, 22_000)], tramos, url);
    expect(a).toMatchObject({ desdeMs: 1000, hastaMs: 3600 });
    expect(b).toMatchObject({ desdeMs: 11_000, hastaMs: 15_500 });
  });

  it("no se pisan: el segundo espera a que termine el primero", () => {
    const [a, b] = materialEnPantalla([item("m01", 1000, 1500), item("m02", 3000, 6000)], tramos, url);
    expect(b!.desdeMs).toBe(a!.hastaMs + 300);
    expect(b!.hastaMs).toBe(3000 + 3800);
  });

  it("si al esperar le queda menos de 1,5 s, no va", () => {
    expect(materialEnPantalla([item("m01", 1000, 1500), item("m02", 2000, 2500)], tramos, url)).toHaveLength(1);
  });

  it("lo pendiente y lo quitado no aparece", () => {
    expect(materialEnPantalla([item("m01", 1000, 1500, { estado: "pendiente" }), item("m02", 5000, 6000, { estado: "quitado" })], tramos, url)).toEqual([]);
  });

  it("una noticia lleva la URL de su captura y el resaltado", () => {
    const [n] = materialEnPantalla(
      [
        item("m01", 1000, 1500, {
          tipo: "noticia",
          dato: undefined,
          noticia: { url: "https://e.com/n", titulo: "T", medio: "M", fecha: "2026-10-24", resaltado: "frase", captura: "capturas/m01.png", rects: [{ x: 0, y: 0, w: 1, h: 0.2 }], ancho: 800, alto: 200, pedirChrome: false },
        }),
      ],
      tramos,
      url,
    );
    expect(n).toMatchObject({ tipo: "noticia", imagen: "/jobs/x/capturas/m01.png", proporcion: 4 });
  });
});

describe("detección con Claude", () => {
  it("el esquema se puede mandar a --json-schema", () => {
    expect(esquemaParaClaude(DeteccionSchema).type).toBe("object");
  });

  it("la transcripción numerada solo muestra lo que queda", () => {
    const tr: Transcripcion = {
      modelo: "base",
      duracionMs: 3000,
      palabras: [
        { texto: "Hola", inicioMs: 0, finMs: 300, prob: 1, sinTranscribir: false },
        { texto: "eh", inicioMs: 400, finMs: 600, prob: 1, sinTranscribir: false },
        { texto: "[...]", inicioMs: 700, finMs: 900, prob: null, sinTranscribir: true },
        { texto: "che", inicioMs: 1000, finMs: 1300, prob: 1, sinTranscribir: false },
      ],
    };
    const cortes: Cortes = { pausaMaxMs: 350, margenMs: 80, automatico: true, sugeridos: { palabras: [{ i: 1, tipo: "muletilla", motivo: "" }] }, manual: { quitar: [], conservar: [], pausasConservadas: [], pausasCortadas: [] } };
    expect(transcripcionNumerada(tr, cortes)).toBe("(0.0 s) [0] Hola [3] che");
  });
});
