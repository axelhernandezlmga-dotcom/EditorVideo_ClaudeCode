import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fichasCatalogo } from "../src/pipeline/ilustracion/catalogo";
import { ACCIONES, poseEnFrame } from "../src/remotion/ilustracion/personajes/acciones";
import { visemaEn, visemasDePalabra } from "../src/remotion/ilustracion/visemas";
import { normalizarIlustradas } from "../src/pipeline/ilustracion/preparar";
import { sanearSvg } from "../src/shared/svg";

const cap = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs, timestampMs: null, confidence: null });

describe("visemas", () => {
  it("reparte una palabra en sus vocales y labiales", () => {
    expect(visemasDePalabra("plata")).toEqual(["M", "A"]);
    expect(visemasDePalabra("jubilación")).toEqual(["U", "M", "I", "A", "I", "O"]);
    expect(visemasDePalabra("mmm")).toEqual(["M"]);
  });

  it("la boca está cerrada fuera de las palabras y abierta en la vocal", () => {
    const c = [cap("hola", 0, 400), cap("che", 600, 900)];
    expect(visemaEn(c, 500)).toBe("X");
    expect(visemaEn(c, 100)).toBe("O");
    expect(visemaEn(c, 300)).toBe("A");
  });
});

describe("acciones", () => {
  it("toda acción da una pose con números válidos en cualquier momento", () => {
    for (const accion of ACCIONES) {
      for (const f of [0, 5, 17, 40, 95]) {
        const p = poseEnFrame([{ desde: 0, accion }], f, 30, 1.5, 3);
        for (const v of [...p.bt, ...p.bd, ...p.pt, ...p.pd, p.torso, p.cabeza, p.x, p.y, p.estira]) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("al cambiar de acción mezcla las poses (sin saltos)", () => {
    const tramos = [
      { desde: 0, accion: "reposo" as const },
      { desde: 30, accion: "festejar" as const },
    ];
    const antes = poseEnFrame(tramos, 29, 30, 1, 1).bd[0];
    const durante = poseEnFrame(tramos, 32, 30, 1, 1).bd[0];
    const despues = poseEnFrame(tramos, 45, 30, 1, 1).bd[0];
    expect(durante).toBeGreaterThan(antes);
    expect(durante).toBeLessThan(despues);
  });
});

describe("catálogo", () => {
  it("assets/ilustracion/catalogo.json está al día con los componentes", () => {
    const enDisco = JSON.parse(readFileSync(path.join(__dirname, "..", "assets", "ilustracion", "catalogo.json"), "utf8")) as { piezas: { id: string; tipo: string }[] };
    const actuales = fichasCatalogo().map((f) => `${f.tipo}:${f.id}`);
    expect(enDisco.piezas.map((f) => `${f.tipo}:${f.id}`).sort()).toEqual(actuales.sort());
  });

  it("el set inicial alcanza: 6 personajes, 25 objetos, 8 escenarios, 10 efectos", () => {
    const n = (tipo: string) => fichasCatalogo().filter((f) => f.tipo === tipo).length;
    expect(n("personaje")).toBeGreaterThanOrEqual(6);
    expect(n("objeto")).toBeGreaterThanOrEqual(25);
    expect(n("escenario")).toBeGreaterThanOrEqual(8);
    expect(n("efecto")).toBeGreaterThanOrEqual(10);
  });

  it("no hay ids repetidos y todos tienen etiquetas", () => {
    const f = fichasCatalogo();
    expect(new Set(f.map((x) => `${x.tipo}:${x.id}`)).size).toBe(f.length);
    for (const x of f) expect(x.etiquetas.length).toBeGreaterThan(0);
  });
});

describe("sanearSvg", () => {
  it("deja solo formas: sin scripts, eventos, enlaces ni imágenes", () => {
    const s = sanearSvg('<svg viewBox="-100 -100 200 200"><script>alert(1)</script><rect x="1" onclick="x()" width="5" height="5"/><image href="http://x/y.png"/><a href="http://x"><circle r="3"/></a><path d="M0 0" style="fill:url(http://x)"/></svg>');
    expect(s).toBe('<rect x="1" width="5" height="5"/><path d="M0 0"/>');
  });
  it("sin formas no sirve", () => {
    expect(sanearSvg("<svg><text>hola</text></svg>")).toBeNull();
  });
});

describe("normalizarIlustradas", () => {
  const escena = (props: object) => ({ plantilla: "escena_ilustrada", narracion: "Hola", palabras_clave_stock: [], palabras_enfasis: [], props }) as never;
  const guion = (props: object) => ({ titulo: "t", gancho: "g", mood: "chill", escenas: [escena(props)], texto_publicacion: "x", titulo_portada: "x", fuentes: [] }) as never;
  it("cambia lo que no existe por lo más parecido y lo anota", () => {
    const r = normalizarIlustradas(
      guion({ escenario: "hospital_publico", personajes: [{ id: "doctora", lugar: "centro", accion: "hablar" }], objetos: [{ id: "chanchito_ahorro", lugar: "centro", accion: "entrar", tam: "normal", cantidad: 1 }], camara: "fija", beats: [{ palabra: "x", efecto: "explotar" }] }),
      {},
    );
    const p = (r.guion as { escenas: { props: { escenario: string; personajes: { id: string }[]; objetos: { id: string }[]; beats: { efecto?: string }[] } }[] }).escenas[0]!.props;
    expect(p.personajes[0]!.id).toBe("medica");
    expect(p.objetos[0]!.id).toBe("alcancia");
    expect(p.beats[0]!.efecto).toBe("explosion");
    expect(r.faltantes.map((f) => f.id)).toEqual(expect.arrayContaining(["hospital_publico", "doctora", "chanchito_ahorro", "explotar"]));
  });
  it("respeta los objetos dibujados para el video", () => {
    const r = normalizarIlustradas(guion({ escenario: "barrio", personajes: [], objetos: [{ id: "semaforo", lugar: "centro", accion: "entrar", tam: "normal", cantidad: 1 }], camara: "fija", beats: [] }), { semaforo: "<rect/>" });
    expect(r.faltantes).toEqual([]);
  });
});
