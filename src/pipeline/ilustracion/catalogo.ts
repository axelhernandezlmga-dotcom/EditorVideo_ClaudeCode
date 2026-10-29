import { writeFile } from "node:fs/promises";
import { ACCIONES_GENERICAS, type CeldaHoja, type TipoPieza } from "../../remotion/ilustracion/biblioteca";
import { EFECTOS } from "../../remotion/ilustracion/efectos";
import { ESCENARIOS } from "../../remotion/ilustracion/escenarios";
import { IDS_ESTILOS, type IdEstilo } from "../../remotion/ilustracion/estilo";
import type { HojaProps, SeccionHoja } from "../../remotion/ilustracion/Hoja";
import { OBJETOS } from "../../remotion/ilustracion/objetos";
import { ACCIONES, NOMBRES_ACCIONES } from "../../remotion/ilustracion/personajes/acciones";
import { IDS_PERSONAJES, NOMBRES_PERSONAJES } from "../../remotion/ilustracion/personajes/elenco";
import { leerGenerados } from "./preparar";

/** Ficha de una pieza de la biblioteca, tal como queda en assets/ilustracion/catalogo.json. */
export type FichaCatalogo = {
  id: string;
  tipo: TipoPieza;
  nombre: string;
  etiquetas: string[];
  acciones: string[];
  estilos: IdEstilo[];
  /** "codigo" = componente dibujado a mano; "svg" = generado y verificado por la app. */
  origen: "codigo" | "svg";
  notas?: string;
};

/** Todas las fichas, armadas desde los registros de componentes (así nunca se desincronizan). */
export const fichasCatalogo = (): FichaCatalogo[] => [
  { id: "narrador", tipo: "personaje", nombre: "Narrador del perfil", etiquetas: ["narrador", "presentador", "yo"], acciones: [...ACCIONES], estilos: [...IDS_ESTILOS], origen: "codigo" },
  ...IDS_PERSONAJES.map((id): FichaCatalogo => ({ id, tipo: "personaje", ...NOMBRES_PERSONAJES[id], acciones: [...ACCIONES], estilos: [...IDS_ESTILOS], origen: "codigo" })),
  ...Object.entries(OBJETOS).map(([id, f]): FichaCatalogo => ({
    id,
    tipo: "objeto",
    nombre: f.nombre,
    etiquetas: f.etiquetas,
    acciones: [...f.acciones, ...ACCIONES_GENERICAS],
    estilos: [...IDS_ESTILOS],
    origen: "codigo",
  })),
  ...Object.entries(ESCENARIOS).map(([id, f]): FichaCatalogo => ({ id, tipo: "escenario", nombre: f.nombre, etiquetas: f.etiquetas, acciones: f.vivos, estilos: [...IDS_ESTILOS], origen: "codigo" })),
  ...Object.entries(EFECTOS).map(([id, f]): FichaCatalogo => ({ id, tipo: "efecto", nombre: f.nombre, etiquetas: f.etiquetas, acciones: [], estilos: [...IDS_ESTILOS], origen: "codigo" })),
  // objetos que la app dibujó (y aprobó mirándolos) en videos anteriores
  ...leerGenerados()
    .filter((g) => !(g.id in OBJETOS))
    .map((g): FichaCatalogo => ({ id: g.id, tipo: "objeto", nombre: g.nombre, etiquetas: g.etiquetas, acciones: [...ACCIONES_GENERICAS], estilos: [...IDS_ESTILOS], origen: "svg", notas: `Dibujado para ${g.video}` })),
];

export const escribirCatalogo = async (ruta: string) => {
  const fichas = fichasCatalogo();
  await writeFile(ruta, `${JSON.stringify({ generado: "npm run ilustracion -- --catalogo", acciones_personaje: NOMBRES_ACCIONES, piezas: fichas }, null, 2)}\n`);
  return fichas;
};

// frames donde cada acción de personaje se ve "en su punto"
const FRAME_ACCION: Record<string, number> = { sorprenderse: 7, festejar: 9, caminar: 8, hablar: 23, encogerse: 13, votar: 14, senalar: 20, saludar: 12 };

const seccion = (titulo: string | undefined, celdas: CeldaHoja[], columnas: number, ancho: number, alto: number): SeccionHoja => ({ titulo, celdas, columnas, ancho, alto });

/** Hoja de prueba de una pieza: varias poses o frames de la misma. */
const hojaPrueba = (tipo: TipoPieza, id: string, estilo: IdEstilo): HojaProps => {
  if (tipo === "personaje") {
    const celdas = ACCIONES.map((accion): CeldaHoja => ({ tipo, id, estilo, accion, frame: FRAME_ACCION[accion] ?? 20, etiqueta: accion }));
    return { secciones: [seccion(`${id} (${estilo})`, celdas, 7, 300, 345)] };
  }
  if (tipo === "objeto" && !OBJETOS[id]) {
    const g = leerGenerados().find((x) => x.id === id);
    const celdas = (["quieto", "entrar", "rebotar", "flotar"] as const).map((accion, k): CeldaHoja => ({ tipo, id, estilo, accion, frame: [0, 5, 14, 20][k]!, etiqueta: accion, svg: g?.svg }));
    return { secciones: [seccion(`${id} (${estilo}, dibujado por la app)`, celdas, 4, 300, 300)] };
  }
  if (tipo === "objeto") {
    const f = OBJETOS[id]!;
    const propias = f.acciones.slice(0, 3);
    const celdas: CeldaHoja[] = [
      { tipo, id, estilo, accion: "quieto", frame: 0, etiqueta: "quieto" },
      ...propias.flatMap((accion): CeldaHoja[] => [12, 40].map((frame) => ({ tipo, id, estilo, accion, frame, etiqueta: `${accion} f${frame}` }))),
      { tipo, id, estilo, accion: "caer", frame: 16, etiqueta: "caer f16 (aterriza)" },
    ];
    return { secciones: [seccion(`${id} (${estilo})`, celdas, Math.min(4, celdas.length), 300, 300)] };
  }
  if (tipo === "escenario") {
    const celdas = [0, 30, 60, 90].map((frame): CeldaHoja => ({ tipo, id, estilo, frame, accion: "paneo", etiqueta: `f${frame} (paneo)` }));
    return { secciones: [seccion(`${id} (${estilo})`, celdas, 4, 270, 480)] };
  }
  const dur = Math.round(EFECTOS[id]!.duracion * 30);
  const celdas = [0.1, 0.35, 0.6, 0.85].map((u): CeldaHoja => ({ tipo, id, estilo, frame: Math.round(dur * u), etiqueta: `f${Math.round(dur * u)}` }));
  return { secciones: [seccion(`${id} (${estilo})`, celdas, 4, 260, 260)] };
};

const todas = (): [TipoPieza, string][] => fichasCatalogo().map((f) => [f.tipo, f.id]);

export const celdasPrueba = {
  /** "todo" o "personaje:jubilado,objeto:alcancia" (o solo un tipo: "objeto"). */
  listar: (pedido: string): [TipoPieza, string][] =>
    pedido === "todo"
      ? todas()
      : pedido.split(",").flatMap((p): [TipoPieza, string][] => {
          const [tipo, id] = p.split(":") as [TipoPieza, string | undefined];
          return id ? [[tipo, id]] : todas().filter(([t]) => t === tipo);
        }),
  hoja: hojaPrueba,
};

/** Hoja de catálogo: todo junto, en plano editorial, más el jubilado en cartoon y en documental. */
export const celdasCatalogo = (): HojaProps => {
  const fichas = fichasCatalogo();
  const de = (tipo: TipoPieza) => fichas.filter((f) => f.tipo === tipo);
  const accionesVitrina = ["hablar", "senalar", "festejar", "pensar", "contar_plata", "sorprenderse", "caminar", "enojarse", "votar"];
  const personajes = de("personaje").map((f, i): CeldaHoja => {
    const accion = accionesVitrina[i % accionesVitrina.length]!;
    return { tipo: "personaje", id: f.id, estilo: "plano", accion, frame: FRAME_ACCION[accion] ?? 20, etiqueta: `${f.nombre} · ${accion}` };
  });
  const variantes: CeldaHoja[] = (["cartoon", "documental"] as const).flatMap((estilo) =>
    ["hablar", "festejar"].map((accion): CeldaHoja => ({ tipo: "personaje", id: "jubilado", estilo, accion, frame: FRAME_ACCION[accion] ?? 20, etiqueta: `Jubilado ${estilo} · ${accion}` })),
  );
  return {
    secciones: [
      seccion(`Personajes (${personajes.length}) + estilos`, [...personajes, ...variantes], 7, 300, 345),
      seccion(`Objetos (${de("objeto").length})`, de("objeto").map((f): CeldaHoja => ({ tipo: "objeto", id: f.id, estilo: "plano", frame: 30, accion: f.acciones[0], etiqueta: f.nombre, svg: f.origen === "svg" ? leerGenerados().find((g) => g.id === f.id)?.svg : undefined })), 7, 300, 250),
      seccion(`Escenarios (${de("escenario").length})`, de("escenario").map((f): CeldaHoja => ({ tipo: "escenario", id: f.id, estilo: "plano", frame: 30, etiqueta: f.nombre })), 8, 262, 466),
      seccion(`Efectos (${de("efecto").length})`, de("efecto").map((f): CeldaHoja => ({ tipo: "efecto", id: f.id, estilo: "plano", frame: Math.round(EFECTOS[f.id]!.duracion * 30 * 0.4), etiqueta: f.nombre })), 10, 210, 210),
    ],
  };
};
