import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { censurar, censurarProfundo } from "../../shared/censura";
import { duracionEscenaFrames, FPS, FRAMES_TRANSICION, type Animacion, type EscenaRender, type MarcaVisual, type PortadaProps, type VideoProps } from "../../shared/render";
import type { Guion, Marca, Voz } from "../../shared/schemas";
import { renderizarPortada, renderizarVideo, servirCarpeta } from "../renderizador";
import type { Trabajo } from "../trabajo";
import type { ExtrasPerfil } from "../perfiles";
import type { Visuales } from "./visuales";
import { marcaConKit } from "../marca/kitVisual";
import { verificarYGuardar } from "../marca/verificador";
import { separarFecha } from "../../shared/marca";
import { FRAMES_APERTURA } from "../../remotion/marca/Apertura";

/** Props del video con rutas relativas a la carpeta del trabajo; `base` las convierte en URLs. */
export const armarProps = (guion: Guion, voz: Voz, visuales: Visuales, marca: Marca, base: string, animacion: Animacion = "normal", perfil?: ExtrasPerfil, cierre = false): VideoProps => {
  const url = (rel: string | null | undefined) => (rel ? `${base}/${rel.split("/").map(encodeURIComponent).join("/")}` : null);
  const escenas: EscenaRender[] = guion.escenas.map((e, i) => {
    const a = voz.escenas[i];
    if (!a) throw new Error(`Falta el audio de la escena ${i + 1}`);
    const foto = visuales.fotos[i];
    // un meme con audio entra en una pausa después de la narración: la escena se alarga lo que dura el meme
    const meme = visuales.memes[i];
    const framesVoz = duracionEscenaFrames(a.duracionMs);
    const framesMeme = meme ? Math.round((meme.duracionMs / 1000) * FPS) : 0;
    const escena: EscenaRender = {
      ...e,
      duracionFrames: framesVoz + (meme?.conAudio ? framesMeme : 0),
      ...(meme
        ? { meme: { src: url(meme.archivo)!, conAudio: meme.conAudio, duracionFrames: framesMeme, desdeFrame: meme.conAudio ? Math.round((a.duracionMs / 1000) * FPS) : Math.max(0, framesVoz - framesMeme - FRAMES_TRANSICION) } }
        : {}),
      audioSrc: url(a.archivo),
      captions: a.captions,
      stockSrc: url(visuales.stock[i]),
      foto: foto ? { src: url(foto.archivo)!, credito: foto.credito } : null,
      ...(foto?.extras?.length ? { fotosExtra: foto.extras.map((x) => ({ src: url(x.archivo)!, credito: x.credito })) } : {}),
      ...(e.plantilla === "escena_ilustrada" ? { svgs: Object.fromEntries(e.props.objetos.filter((o) => visuales.svgs[o.id]).map((o) => [o.id, visuales.svgs[o.id]!])) } : {}),
    };
    // lo que se lee en pantalla va censurado; la voz (ya generada) las dice completas
    if (!marca.censurarSubtitulos) return escena;
    return {
      ...escena,
      props: censurarProfundo(escena.props),
      captions: escena.captions.map((c) => ({ ...c, text: censurar(c.text) })),
      palabras_enfasis: escena.palabras_enfasis.map(censurar),
    } as EscenaRender;
  });
  const { kit, ...extras } = perfil ?? {};
  // con kit: las fechas que quedaron al final de un título van a su línea de Plex Mono (corrección de marca)
  const correccionesMarca: string[] = [];
  if (kit) {
    for (const [i, e] of escenas.entries()) {
      const p = e.props as Record<string, unknown>;
      for (const campo of ["titulo", "texto", "subtitulo", "contexto", "dato"]) {
        if (typeof p[campo] !== "string") continue;
        const r = separarFecha(p[campo] as string);
        if (!r.fecha) continue;
        escenas[i] = { ...escenas[i]!, props: { ...(escenas[i]!.props as object), [campo]: r.texto }, fechaMarca: r.fecha } as EscenaRender;
        correccionesMarca.push(`escena ${i + 1}: «${p[campo] as string}» → la fecha (${r.fecha}) va en Plex Mono`);
      }
    }
  }
  const visual: MarcaVisual = { usuario: marca.usuario, colores: marca.colores, tipografia: marca.tipografia, animacion, ...(perfil ? { ...extras, foto: url(perfil.foto) } : {}) };
  return {
    // con kit de marca: sus fuentes, su paleta por rol y la apertura con el "tic"
    marca: kit ? marcaConKit(visual, kit, url, guion.fuentes) : visual,
    ...(kit ? { apertura: FRAMES_APERTURA, ticSrc: url(visuales.tic), correccionesMarca } : {}),
    escenas,
    musicaSrc: url(visuales.musica),
    volumenMusica: marca.volumenMusica,
    sfxSrc: url(visuales.sfx),
    popSrc: url(visuales.pop),
    paginaSubtitulosMs: marca.paginaSubtitulosMs,
    cierre,
  };
};

/** Escena más "llamativa" para el fondo de la portada: un número, un gráfico, o la segunda. */
export const escenaParaPortada = (escenas: EscenaRender[]): EscenaRender | null =>
  escenas.find((e) => e.plantilla === "dato_numero") ?? escenas.find((e) => e.plantilla === "grafico" || e.plantilla === "comparacion") ?? escenas[1] ?? escenas[0] ?? null;

/** Paso 8: render del MP4 (a un temporal, y se renombra solo si terminó bien) + portada. */
export const pasoRender = async (t: Trabajo, guion: Guion, voz: Voz, visuales: Visuales, marca: Marca, animacion: Animacion, signal?: AbortSignal, perfil?: ExtrasPerfil, cierre = false) => {
  const servidor = await servirCarpeta(t.dir);
  try {
    const props = armarProps(guion, voz, visuales, marca, servidor.url, animacion, perfil, cierre);
    await t.escribir("render-props.json", armarProps(guion, voz, visuales, marca, ".", animacion, perfil, cierre));
    const tmp = t.ruta("video.parcial.mp4");
    let ultimo = -1;
    await renderizarVideo({
      props,
      salida: tmp,
      signal,
      onProgreso: (p) => {
        t.progreso("render", p);
        const pct = Math.floor(p * 10) * 10;
        if (pct !== ultimo) {
          ultimo = pct;
          t.actividad(`Renderizando… ${Math.round(p * 100)} %`);
        }
      },
    });
    if (existsSync(t.ruta("video.mp4"))) await rm(t.ruta("video.mp4"));
    await rename(tmp, t.ruta("video.mp4"));
    // perfil con kit: el verificador de marca revisa el video y deja marca-reporte.json
    t.actividad("Verificando la marca…");
    await verificarYGuardar(t, props);

    t.actividad("Generando portada…");
    const portada: PortadaProps = { marca: props.marca, titulo: marca.censurarSubtitulos ? censurar(guion.titulo_portada) : guion.titulo_portada, escena: escenaParaPortada(props.escenas) };
    await renderizarPortada({ props: portada, salida: t.ruta("portada.png") });
  } finally {
    await servidor.cerrar();
  }
};
