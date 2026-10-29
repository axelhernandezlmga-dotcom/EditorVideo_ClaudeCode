import { describe, expect, it } from "vitest";
import { analisisVacio, type Recurso } from "../src/shared/biblioteca";
import { buscarClips, candidatosParaVideo, enTramos, indexarClips, raiz, tokens } from "../src/shared/busqueda";

let n = 0;
const clip = (x: Partial<Recurso>): Recurso => ({
  id: `c${String(n++).padStart(6, "0")}`,
  tipo: "video",
  categoria: "memes-varios",
  nombre: "x",
  archivo: "video/x.mp4",
  origen: "",
  duracion: 3,
  ancho: 640,
  alto: 360,
  orientacion: "horizontal",
  audio: true,
  transcripcion: null,
  descripcion: "",
  etiquetas: { lugar: [], personas: [], objetos: [], accion: [], mood: [] },
  descripcionPor: "claude",
  ...analisisVacio(),
  mood: null,
  bytes: 1,
  huella: `h${n}`,
  importado: "2026-10-29T00:00:00.000Z",
  ...x,
});

const contando = clip({ nombre: "escena 12", descripcion: "Un hombre cuenta un fajo de billetes sobre la mesa y sonríe", usos: ["cuando alguien gasta mucha plata o se hace rico"], semantica: ["dinero", "riqueza"] });
const confundido = clip({ nombre: "meme 7", descripcion: "Un señor mira a cámara sin entender nada", usos: ["cuando alguien comete un error o no entiende lo que pasó"], semantica: ["confusión", "error"] });
const festejo = clip({ nombre: "gol", descripcion: "Jugadores festejan un gol abrazados", usos: ["cuando se habla de una gran victoria"], semantica: ["victoria", "celebración"] });
const incredulo = clip({ nombre: "no puede ser", descripcion: "Una mujer se tapa la cara, incrédula", usos: ["reacción a una decisión absurda"], semantica: ["incredulidad", "absurdo"] });
// un clip cuyo NOMBRE engaña: se llama "plata" pero es un paisaje
const engaño = clip({ nombre: "plata", descripcion: "Un río tranquilo al atardecer", usos: ["para un momento calmo o de reflexión"], semantica: ["naturaleza", "calma"] });
const todos = [contando, confundido, festejo, incredulo, engaño];

describe("búsqueda contextual de clips", () => {
  it("normaliza: raíces, sinónimos rioplatenses y palabras vacías", () => {
    expect(raiz("billetes")).toBe("dinero");
    expect(raiz("guita")).toBe("dinero");
    expect(raiz("gastando")).toBe("gastar");
    expect(tokens("equivocó")).toEqual(tokens("equivocación"));
    expect(tokens("Se gastó TODA la plata en pavadas")).toEqual(expect.arrayContaining(["gastar", "dinero"]));
    expect(tokens("de la que en")).toEqual([]);
  });

  it("elige por el significado de lo que se dice, no por el nombre del archivo", () => {
    const i = indexarClips(todos);
    expect(buscarClips(i, "el gobierno se gastó millones de pesos en publicidad")[0]!.r).toBe(contando);
    expect(buscarClips(i, "y el ministro se equivocó otra vez con las cifras")[0]!.r).toBe(confundido);
    expect(buscarClips(i, "ganamos el campeonato, un triunfo histórico")[0]!.r).toBe(festejo);
    expect(buscarClips(i, "una decisión totalmente absurda")[0]!.r).toBe(incredulo);
    // "plata" como nombre de archivo pesa menos que lo que el clip muestra
    expect(buscarClips(i, "tanta plata gastada")[0]!.r).toBe(contando);
  });

  it("junta candidatos por tramo y castiga los usados en videos recientes", () => {
    const muchos = [...todos, ...Array.from({ length: 100 }, (_, k) => clip({ nombre: `relleno ${k}`, descripcion: "un gato duerme" }))];
    const tramos = enTramos("primero gastaron toda la plata y después se equivocaron con las cuentas, una decisión absurda", 8);
    expect(tramos.length).toBeGreaterThan(1);
    const c = candidatosParaVideo(muchos, tramos, { max: 3 });
    expect(c).toEqual(expect.arrayContaining([contando, confundido, incredulo]));
    const sinRecientes = candidatosParaVideo(muchos, ["se gastó la plata"], { max: 2 });
    const conRecientes = candidatosParaVideo([...muchos, clip({ descripcion: "alguien tira billetes", usos: ["cuando se gasta plata"] })], ["se gastó la plata"], { max: 2, recientes: [contando.id] });
    expect(sinRecientes[0]).toBe(contando);
    expect(conRecientes[0]).not.toBe(contando);
  });

  it("con una biblioteca chica van todos los clips", () => {
    expect(candidatosParaVideo(todos, ["cualquier cosa"], { max: 60 })).toHaveLength(todos.length);
  });
});
