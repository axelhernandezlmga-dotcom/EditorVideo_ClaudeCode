import path from "node:path";
import { z } from "zod";
import { contarPalabras, esMaterial } from "../../shared/entrada";
import { estiloIlustracionDe, GuionSchema, IdeasSchema, RespuestaEscenaSchema, type Escena, type Estado, type Guion, type Idea, type Marca } from "../../shared/schemas";
import { instruccionesIlustracion } from "../ilustracion/preparar";
import { leerPerfil } from "../perfiles";
import { leerKit } from "../kit";
import { pedirAClaude } from "../claude";
import { DIR_PROMPTS, RAIZ } from "../rutas";
import { instruccionesModo, promptConTono, tonoDelTrabajo } from "../tonos";
import { cantidadIlustracionDeModo, faltaDelModo, MODOS_EDICION, type ModoEdicion } from "../../shared/modos";
import { clipsRelacionados, type Recurso } from "../../shared/biblioteca";
import { leerBiblioteca, recursosDe } from "../biblioteca";
import { lineaClip } from "../crudo/clipsCrudo";
import type { Trabajo } from "../trabajo";

/** Variante del español según la voz elegida (para que el guion suene natural con esa voz). */
export const varianteDeVoz = (voz: string): string => {
  const locale = voz.slice(0, 5);
  const variantes: Record<string, string> = {
    "es-UY": "español rioplatense de Uruguay, con voseo",
    "es-AR": "español rioplatense de Argentina, con voseo",
    "es-ES": "español de España, con tuteo",
    "es-MX": "español de México, con tuteo",
  };
  return variantes[locale] ?? (voz.startsWith("e") && voz.includes("_") ? "español de España, con tuteo" : "español neutro latinoamericano, con tuteo");
};

const fechaHoy = () => new Date().toLocaleDateString("es-UY", { day: "numeric", month: "long", year: "numeric" });

const contexto = (marca: Marca, voz: string, tono?: string, ilustracion?: string) =>
  [
    ...(ilustracion ? [ilustracion, ""] : []),
    ...(tono ? [`Tono del video: ${tono} (ver "Tono del video" en tus instrucciones).`] : []),
    `Fecha de hoy: ${fechaHoy()}.`,
    `Nicho de la cuenta: ${marca.nicho}.`,
    `Variante de idioma: ${varianteDeVoz(voz)}.`,
    `Duración objetivo: entre ${marca.duracionMin} y ${marca.duracionMax} segundos (≈ ${Math.round(marca.duracionMin * 2.5)}–${Math.round(marca.duracionMax * 2.55)} palabras de narración).`,
    `Usuario de la cuenta (para el cierre): ${marca.usuario}.`,
  ].join("\n");

/** Estilo, cantidad y catálogo de ilustración para el guionista (el modo de edición puede pedir más o ninguna). */
const ilustracionDelTrabajo = (opciones: Estado["opciones"], tono?: string) =>
  instruccionesIlustracion(estiloIlustracionDe(opciones.estiloIlustracion, tono), cantidadIlustracionDeModo(opciones.modoEdicion ?? "normal", opciones.cantidadIlustracion ?? "media"));

/** Clips de la biblioteca que este video puede usar (solo de las categorías elegidas), o [] si no lleva. */
export const clipsDelTrabajo = async (opciones: Estado["opciones"], texto: string): Promise<Recurso[]> => {
  const uso = opciones.biblioteca;
  if (!uso || uso.modo === "no") return [];
  const todos = await recursosDe("video", uso.modo === "manual" ? [] : uso.categorias);
  return uso.modo === "manual" ? todos.filter((c) => uso.elegidos.includes(c.id)) : clipsRelacionados(todos, texto, 80);
};

/** Bloque del pedido con los clips de la biblioteca disponibles. */
const bloqueClips = async (clips: Recurso[], manual: boolean) => {
  if (!clips.length) return "";
  const nombres = new Map((await leerBiblioteca()).categorias.map((c) => [c.id, c.nombre]));
  return [
    "Clips de la biblioteca (plantilla `clip_biblioteca`, `clip` = el id). Usalos SOLO donde lo que se dice coincide de verdad con el clip (la misma persona, el mismo hecho o la frase); un meme o una reacción solo si remata con gracia algo y el tono lo permite, nunca en un momento serio. No hay mínimo: si ninguno encaja, no uses ninguno.",
    manual ? "Estos clips los eligió el usuario: ubicá cada uno donde mejor encaje (podés dejar afuera el que no encaje)." : "",
    clips.map((c) => lineaClip(c, nombres)).join("\n"),
  ].join("\n");
};

/** Saca las escenas de clip que no son de la lista permitida (Claude inventó un id o la categoría no se eligió). */
export const soloClipsPermitidos = (g: Guion, permitidos: Recurso[]): Guion => ({
  ...g,
  escenas: g.escenas.map((e): Escena => (e.plantilla === "clip_biblioteca" && !permitidos.some((c) => c.id === e.props.clip) ? { ...e, plantilla: "titular", props: { texto: e.props.texto || e.narracion.split(/[.!?]/)[0]!.slice(0, 90) } } : e)),
});

const nombreModo = (m: ModoEdicion) => MODOS_EDICION.find((x) => x.id === m)!.nombre;

/**
 * Línea editorial Hechos → Contexto → Opinión: los hechos se verifican como siempre; la opinión es del
 * creador (la que escribió al crear el video), nunca de la IA.
 */
export const instruccionesLineaEditorial = (opinion?: string) =>
  [
    "LÍNEA EDITORIAL DEL PERFIL: Hechos → Contexto → Opinión, con bloques etiquetados. Cada escena lleva el campo `bloque`:",
    '- Primero los HECHOS: `"dato"` para cifras y lo que pasó, `"fuente"` para lo que dice un documento, una resolución o un medio (verificados con fuentes, como siempre).',
    '- Después el CONTEXTO: `"contexto"` (por qué pasa, antecedentes, qué cambia). El gancho (la primera escena) puede ir con el bloque de lo que presenta.',
    opinion
      ? `- Al final, el bloque OPINIÓN (\`"opinion"\`, 1 o 2 escenas, antes del cierre): es la opinión DEL CREADOR, no tuya. Decí EXACTAMENTE esta idea, en primera persona y en su voz, sin agregar argumentos, datos ni matices que no estén: «${opinion}». Dejá claro que es una opinión ("Mi opinión:", "Yo creo que…").`
      : '- NO hay bloque de opinión: el creador no dio la suya. No opines ni tomes partido: el video termina en el contexto o con una pregunta al espectador (en el cierre). Ninguna escena lleva `"opinion"`.',
    "- Nunca mezcles opinión con hechos en la misma escena.",
  ].join("\n");

/** Sin opinión del creador, ninguna escena puede ser de opinión: se sacan (y el cierre queda con su pregunta). */
export const sinOpinionDeLaIa = (g: Guion, opinion?: string): Guion => {
  if (opinion?.trim()) return g;
  const escenas = g.escenas.filter((e, i) => e.bloque !== "opinion" || i === g.escenas.length - 1).map((e) => (e.bloque === "opinion" ? { ...e, bloque: undefined } : e));
  return escenas.length >= 3 ? { ...g, escenas } : g;
};

/** Paso 2: investigación + guion con `claude -p`. */
export const generarGuion = async (t: Trabajo, entrada: string, marca: Marca, signal?: AbortSignal, instruccion?: string): Promise<Guion> => {
  const { opciones } = await t.estado();
  const voz = opciones.voz ?? marca.voz;
  const tono = await tonoDelTrabajo(marca, opciones.tono, (l) => void t.log(l, "error"));
  const material = esMaterial(entrada);
  const perfil = opciones.perfil ? await leerPerfil(opciones.perfil) : null;
  const editorial = perfil?.lineaEditorial === "hechos_contexto_opinion";
  const modo = opciones.modoEdicion ?? "normal";
  const clips = await clipsDelTrabajo(opciones, entrada);
  const prompt = [
    contexto(marca, voz, tono?.nombre, ilustracionDelTrabajo(opciones, tono?.id)),
    modo !== "normal" ? `\nModo de edición: ${nombreModo(modo)} (ver "Modo de edición" en tus instrucciones).` : "",
    clips.length ? `\n${await bloqueClips(clips, opciones.biblioteca?.modo === "manual")}` : "",
    editorial ? `\n${instruccionesLineaEditorial(opciones.opinion)}` : "",
    perfil && (await leerKit(perfil.slug))
      ? "\nEste perfil tiene manual de marca: los textos de pantalla van en minúscula normal (nada en MAYÚSCULAS) y SIN fechas ni fuentes adentro (la app muestra la fecha y la fuente en su propia línea); el cierre termina en el contexto o en una pregunta, no en «Fuente: …»."
      : "",
    "",
    material
      ? `El usuario pegó un texto de ${contarPalabras(entrada)} palabras. Es el MATERIAL PRINCIPAL del video (ver "Si recibís material largo"):\n<material>\n${entrada}\n</material>`
      : `Idea del video: ${entrada}`,
    instruccion ? `\nIndicaciones extra del usuario: ${instruccion}` : "",
    "",
    material
      ? "Resumí y adaptá el material al video. Buscá en la web solo para verificar y completar datos, y devolvé el guion completo por la salida estructurada."
      : "Investigá en la web, verificá los datos y devolvé el guion completo por la salida estructurada.",
  ].join("\n");
  const sistema = await promptConTono(t.dir, "guionista.md", tono, marca, [await instruccionesModo(modo)]);
  const pedir = (texto: string) =>
    pedirAClaude({
      prompt: texto,
      schema: GuionSchema,
      cwd: t.dir,
      systemPromptFile: sistema,
      model: marca.modeloClaude,
      signal,
      onActividad: (a) => t.actividad(a),
      onLog: (l) => void t.log(l),
    });
  let guion = await pedir(prompt);
  // el modo se tiene que notar: si el guion no lo cumple, se le pide una vez que lo corrija
  const falta = faltaDelModo(modo, guion.escenas);
  if (falta) {
    await t.log(`El guion no respetaba el modo «${nombreModo(modo)}» (${falta}): se lo pido de nuevo.`);
    guion = await pedir(`${prompt}\n\nTu guion anterior no cumplía el modo de edición: ${falta}. Reescribilo cumpliéndolo, con los mismos datos verificados.\nGuion anterior (JSON):\n${JSON.stringify(guion)}`);
  }
  guion = soloClipsPermitidos(guion, clips);
  return asegurarCierre(editorial ? sinOpinionDeLaIa(guion, opciones.opinion) : guion);
};

/** Si el guion no termina con `cierre_cta`, convierte la última escena para que siempre haya llamado a la acción. */
const asegurarCierre = (g: Guion): Guion => {
  const ultima = g.escenas.at(-1);
  if (!ultima || ultima.plantilla === "cierre_cta") return g;
  const remate = "texto" in ultima.props && typeof ultima.props.texto === "string" ? ultima.props.texto : ultima.narracion.split(/[.!?]/)[0]!.slice(0, 90);
  const nueva: Escena = { ...ultima, plantilla: "cierre_cta", props: { remate } };
  return { ...g, escenas: [...g.escenas.slice(0, -1), nueva] };
};

/** "Regenerar esta escena". */
export const regenerarEscena = async (t: Trabajo, guion: Guion, indice: number, marca: Marca, instruccion?: string, signal?: AbortSignal): Promise<Escena> => {
  const { opciones } = await t.estado();
  const voz = opciones.voz ?? marca.voz;
  const tono = await tonoDelTrabajo(marca, opciones.tono);
  const modo = opciones.modoEdicion ?? "normal";
  const clips = await clipsDelTrabajo(opciones, guion.escenas.map((e) => e.narracion).join(" "));
  // la escena es una unión: se envuelve en un objeto porque la raíz del esquema tiene que ser "type":"object"
  const { escena } = await pedirAClaude({
    prompt: [
      contexto(marca, voz, tono?.nombre, ilustracionDelTrabajo(opciones, tono?.id)),
      modo !== "normal" ? `Modo de edición: ${nombreModo(modo)}.` : "",
      clips.length ? await bloqueClips(clips, opciones.biblioteca?.modo === "manual") : "",
      "",
      `Guion actual (JSON):\n${JSON.stringify(guion)}`,
      "",
      `Reescribí la escena número ${indice + 1} (plantilla actual: ${guion.escenas[indice]?.plantilla}).`,
      instruccion ? `Instrucción del usuario: ${instruccion}` : "Hacela más impactante, manteniendo los datos verificados.",
    ].join("\n"),
    schema: RespuestaEscenaSchema,
    cwd: t.dir,
    systemPromptFile: await promptConTono(t.dir, "escena.md", tono, marca, [await instruccionesModo(modo)]),
    model: marca.modeloClaude,
    signal,
    onActividad: (a) => t.actividad(a),
    onLog: (l) => void t.log(l),
  });
  return soloClipsPermitidos({ ...guion, escenas: [escena] }, clips).escenas[0]!;
};

/** "Dame ideas": 10 ideas para el nicho. */
export const pedirIdeas = async (marca: Marca, opts: { cantidad?: number; tema?: string; signal?: AbortSignal; onActividad?: (a: string) => void } = {}): Promise<Idea[]> => {
  const cantidad = opts.cantidad ?? 10;
  const { ideas } = await pedirAClaude({
    prompt: [
      contexto(marca, marca.voz),
      opts.tema ? `Tema o enfoque pedido: ${opts.tema}` : "",
      `Dame exactamente ${cantidad} ideas de videos con potencial viral para esta cuenta.`,
    ].join("\n"),
    schema: IdeasSchema,
    cwd: path.join(RAIZ, ".cache", "claude-ideas"),
    systemPromptFile: path.join(DIR_PROMPTS, "ideas.md"),
    model: marca.modeloClaude,
    signal: opts.signal,
    onActividad: opts.onActividad,
  });
  return ideas.slice(0, cantidad);
};

