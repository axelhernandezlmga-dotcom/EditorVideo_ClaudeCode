import { describe, expect, it } from "vitest";
import { analisisVacio, type Recurso } from "../src/shared/biblioteca";
import { curvaDucking, curvaMusica, DUCKING_CLIP } from "../src/shared/musica";
import { maxClipsPara, OpcionesCrudoSchema, UsoBibliotecaSchema } from "../src/shared/opcionesCrudo";
import { IDS_MODOS_EDICION } from "../src/shared/modos";
import { decidirAudio } from "../src/pipeline/seleccionClips";
import { audioClip } from "../src/pipeline/crudo/clipsCrudo";
import { armarProps } from "../src/pipeline/pasos/render";
import { clipsConSonido } from "../src/remotion/Crudo";
import { intervalosMemes } from "../src/remotion/global/Musica";
import { aRender, escenasDemo } from "../src/remotion/ejemplo";
import { MarcaSchema, type Guion, type Voz } from "../src/shared/schemas";

const meme = (x: Partial<Recurso> = {}): Recurso => ({
  id: "meme01",
  tipo: "video",
  categoria: "memes-varios",
  nombre: "no contaban con mi astucia",
  archivo: "video/meme01.mp4",
  origen: "",
  duracion: 4,
  ancho: 640,
  alto: 360,
  orientacion: "horizontal",
  audio: true,
  transcripcion: "no contaban con mi astucia",
  descripcion: "",
  etiquetas: { lugar: [], personas: [], objetos: [], accion: [], mood: [] },
  descripcionPor: "claude",
  ...analisisVacio(),
  volumenDb: -18,
  mood: null,
  bytes: 1,
  huella: "h",
  importado: "",
  ...x,
});

describe("ducking (la voz y la música bajan mientras suena un meme)", () => {
  const fps = 30;
  const curva = curvaDucking([{ desdeMs: 2000, hastaMs: 4000 }], 6 * fps, fps, DUCKING_CLIP.voz);

  it("baja al nivel pedido durante el meme y vuelve a 1 afuera", () => {
    expect(curva[Math.round(1.5 * fps)]).toBe(1);
    expect(curva[Math.round(3 * fps)]).toBeCloseTo(DUCKING_CLIP.voz, 5);
    expect(curva[Math.round(5 * fps)]).toBe(1);
    // ya está bajo cuando el meme arranca (la rampa termina justo antes)
    expect(curva[Math.round(2 * fps)]).toBeCloseTo(DUCKING_CLIP.voz, 5);
  });

  it("sin saltos bruscos: ningún cambio de un frame a otro supera la mitad del rango", () => {
    const rango = 1 - DUCKING_CLIP.voz;
    for (let f = 1; f < curva.length; f++) expect(Math.abs(curva[f]! - curva[f - 1]!)).toBeLessThan(rango / 2);
  });

  it("la música combina su ducking por la voz con el del meme", () => {
    const habla = [{ desdeMs: 0, hastaMs: 6000 }];
    const base = curvaMusica(habla, 6 * fps, fps, 0.1);
    const duck = curvaDucking([{ desdeMs: 2000, hastaMs: 4000 }], 6 * fps, fps, DUCKING_CLIP.musica);
    const f = Math.round(3 * fps);
    expect(base[f]! * duck[f]!).toBeCloseTo(base[f]! * DUCKING_CLIP.musica, 5);
    expect(base[f]! * duck[f]!).toBeLessThan(base[f]!);
  });

  it("en un crudo, solo los clips con sonido bajan la voz", () => {
    expect(
      clipsConSonido([
        { tipo: "clip", desdeMs: 1000, hastaMs: 3000, video: "a", conAudio: true },
        { tipo: "clip", desdeMs: 5000, hastaMs: 7000, video: "b" },
        { tipo: "tarjeta", desdeMs: 8000, hastaMs: 9000, titulo: "x", texto: null },
      ]),
    ).toEqual([{ desdeMs: 1000, hastaMs: 3000 }]);
  });
});

describe("audio original de los clips", () => {
  it("Automático decide Claude; Activado y Desactivado mandan; sin audio útil nunca suena", () => {
    expect(decidirAudio({ audio: "auto" }, meme(), true)).toBe(true);
    expect(decidirAudio({ audio: "auto" }, meme(), false)).toBe(false);
    expect(decidirAudio({ audio: "si" }, meme(), false)).toBe(true);
    expect(decidirAudio({ audio: "no" }, meme(), true)).toBe(false);
    expect(decidirAudio({ audio: "si" }, meme({ audio: false }), true)).toBe(false);
    expect(decidirAudio({ audio: "si" }, meme({ volumenDb: -70 }), true)).toBe(false);
  });

  it("frecuencia: baja < media < alta, y nunca satura", () => {
    expect(maxClipsPara("baja", 60)).toBeLessThan(maxClipsPara("media", 60));
    expect(maxClipsPara("media", 60)).toBeLessThan(maxClipsPara("alta", 60));
    expect(maxClipsPara("baja", 20)).toBe(1);
    expect(maxClipsPara("alta", 3600)).toBe(12);
  });

  it("las opciones nuevas tienen valores por defecto y conviven con los cuatro modos", () => {
    expect(UsoBibliotecaSchema.parse({})).toMatchObject({ audio: "auto", frecuencia: "media", categorias: [] });
    for (const modo of IDS_MODOS_EDICION) {
      const o = OpcionesCrudoSchema.parse({ modo, clips: { modo: "auto", categorias: ["memes-varios"], audio: "si", frecuencia: "alta" } });
      expect(o.modo).toBe(modo);
      expect(o.clips).toMatchObject({ audio: "si", frecuencia: "alta", categorias: ["memes-varios"] });
    }
  });

  it("el filtro del audio nivela, limita picos y hace fundidos", () => {
    expect(audioClip(3)).toMatch(/loudnorm=I=-16.*alimiter.*afade=t=in.*afade=t=out:st=2\.88/);
  });
});

describe("montaje de un animado con un meme", () => {
  const guion = { escenas: [escenasDemo.titular!, escenasDemo.dato_numero!, escenasDemo.cierre_cta!] } as unknown as Guion;
  const voz = { escenas: guion.escenas.map((e) => ({ archivo: "a.wav", duracionMs: 3000, captions: aRender(e).captions, origenTiempos: "tts" })) } as unknown as Voz;
  const base = { musica: "m.ogg", sfx: null, pop: null, tic: null, stock: {}, fotos: {}, creditos: [], svgs: {} };
  const marca = MarcaSchema.parse({ censurarSubtitulos: false });

  it("con audio: el meme entra cuando termina la narración y la escena se alarga lo que dura", () => {
    const sin = armarProps(guion, voz, { ...base, memes: {} }, marca, ".");
    const con = armarProps(guion, voz, { ...base, memes: { 1: { archivo: "stock/meme-02.mp4", duracionMs: 2000, conAudio: true, clip: "x", nombre: "x", motivo: "x" } } }, marca, ".");
    expect(con.escenas[1]!.duracionFrames - sin.escenas[1]!.duracionFrames).toBe(60);
    expect(con.escenas[1]!.meme).toMatchObject({ conAudio: true, desdeFrame: 90, duracionFrames: 60 });
    // la música baja en ese momento
    const [i] = intervalosMemes(con.escenas, 30);
    expect(i!.hastaMs - i!.desdeMs).toBeCloseTo(2000, 0);
  });

  it("sin audio: va sobre el final de la narración y no alarga la escena", () => {
    const sin = armarProps(guion, voz, { ...base, memes: {} }, marca, ".");
    const con = armarProps(guion, voz, { ...base, memes: { 1: { archivo: "stock/meme-02.mp4", duracionMs: 2000, conAudio: false, clip: "x", nombre: "x", motivo: "x" } } }, marca, ".");
    expect(con.escenas[1]!.duracionFrames).toBe(sin.escenas[1]!.duracionFrames);
    expect(con.escenas[1]!.meme!.conAudio).toBe(false);
    expect(intervalosMemes(con.escenas, 30)).toEqual([]);
  });
});
