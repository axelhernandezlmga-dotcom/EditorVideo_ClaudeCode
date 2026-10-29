import { aEditado, aEditadoCercano, calcularTramos, CortesSchema, TranscripcionSchema } from "../../shared/cortes";
import { ETIQUETA_BLOQUE } from "../../shared/schemas";
import { BloquesCrudoSchema } from "./bloques";
import { captionsEditadas, CarasSchema, momentosSeguir, posicionSubtitulos, posicionTarjetaSeguir, sfxEnPantalla, type CrudoProps, type MaterialRender, type SfxRender } from "../../shared/crudo";
import { censurar } from "../../shared/censura";
import { materialEnPantalla, MaterialSchema } from "../../shared/material";
import { desfaseAlPulso } from "../../shared/musica";
import { INTENSIDADES, OpcionesCrudoSchema } from "../../shared/opcionesCrudo";
import { MusicaTrabajoSchema } from "../musica";
import { PALETAS } from "../../shared/perfiles";
import type { Marca } from "../../shared/schemas";
import { extrasDePerfil, marcaConPerfil, perfilDeTrabajo } from "../perfiles";
import { marcaConKit } from "../marca/kitVisual";
import { duracionMs } from "../proceso";
import type { Trabajo } from "../trabajo";
import { InfoVideoSchema } from "./medios";
import { SfxSchema } from "./sfx";

/**
 * Props de la composición "Crudo" a partir de lo que hay en la carpeta del trabajo. `base` convierte las
 * rutas relativas en URLs (un servidor local al renderizar, `/jobs/<id>` en la vista previa de la app).
 * `proxy: true` usa el video de 720p (vista previa); el render usa el original.
 */
export const armarPropsCrudo = async (
  t: Trabajo,
  marcaGeneral: Marca,
  base: string,
  extra: { material?: MaterialRender[]; sfx?: SfxRender[]; enfasis?: string[]; proxy?: boolean } = {},
): Promise<CrudoProps> => {
  const elegidas = (await t.estado()).opciones.crudo;
  const opciones = OpcionesCrudoSchema.parse(elegidas ?? {});
  const perfilBase = await perfilDeTrabajo(t, marcaGeneral);
  // paleta y subtítulos elegidos para este video en el formulario (si no, los del perfil)
  const paleta = PALETAS.find((p) => p.id === opciones.paleta);
  const perfil = { ...perfilBase, colores: paleta ? { ...paleta.colores } : perfilBase.colores, subtitulos: opciones.subtitulos ?? perfilBase.subtitulos };
  const marca = marcaConPerfil(marcaGeneral, perfil);
  const extras = await extrasDePerfil(perfil, t);
  const video = await t.leer("video.json", InfoVideoSchema);
  const tr = await t.leer("transcripcion.json", TranscripcionSchema);
  const cortes = await t.leer("cortes.json", CortesSchema);
  if (!video || !tr || !cortes) throw new Error("Faltan el video, la transcripción o los cortes.");
  const caras = await t.leer("caras.json", CarasSchema);
  const url = (rel: string) => `${base}/${rel.split("/").map(encodeURIComponent).join("/")}`;
  const tramos = calcularTramos(tr.palabras, cortes, tr.duracionMs);
  const captions = captionsEditadas(tr.palabras, cortes, tramos);
  const material = extra.material ?? materialEnPantalla((await t.leer("material.json", MaterialSchema))?.items ?? [], tramos, url);
  const sfx = await t.leer("sfx.json", SfxSchema);
  const riser = sfx?.archivos.riser;
  const duracionRiser = riser && t.existe(riser) ? await duracionMs(t.ruta(riser)) : undefined;
  const musica = await t.leer("musica.json", MusicaTrabajoSchema);
  // el pulso de la música cae en el primer golpe (o riser): los efectos acompañan el ritmo
  const primerGolpe = sfx?.efectos.map((e) => aEditado(tramos, e.origenMs)).find((ms): ms is number => ms !== null) ?? null;
  const efectos = sfx ? sfxEnPantalla(sfx.efectos, material, tramos, (n) => (sfx.archivos[n] ? url(sfx.archivos[n]) : null), duracionRiser) : [];
  const subtitulosY = posicionSubtitulos(caras, video);
  // cierre "Seguir": solo en los crudos que pasaron por el formulario (los viejos quedan como estaban)
  const cierre = elegidas && opciones.cierre
    ? {
        placa: true,
        momentos: momentosSeguir(captions),
        tarjetaY: posicionTarjetaSeguir(caras, video, subtitulosY),
        texto: "Seguime para más",
        pop: opciones.sfx && sfx?.archivos.pop ? url(sfx.archivos.pop) : null,
      }
    : null;
  const { kit, ...resto } = extras;
  const visual = { usuario: marca.usuario, colores: marca.colores, tipografia: marca.tipografia, ...resto, foto: resto.foto ? url(resto.foto) : null, sobreVideo: true };
  return {
    // con kit de marca: sus fuentes, colores, subtítulos, noticias y cierre de marca (sobre el video)
    // las fuentes de la línea "FUENTE 01 · …" son los medios de las noticias que aparecen en el crudo
    marca: kit ? marcaConKit(visual, kit, url, material.flatMap((m) => (m.tipo === "noticia" ? [{ titulo: m.medio, url: m.medio }] : [])).filter((f, i, a) => a.findIndex((g) => g.titulo === f.titulo) === i)) : visual,
    video: { src: url(extra.proxy ? video.proxy.archivo : video.archivo), ancho: video.ancho, alto: video.alto, fps: video.fps },
    audioSrc: t.existe("audio", "limpio.wav") ? url("audio/limpio.wav") : null,
    tramos,
    zoom: elegidas ? INTENSIDADES[opciones.intensidad].zoom : marca.crudo.zoomAlternado,
    captions: marca.censurarSubtitulos ? captions.map((c) => ({ ...c, text: censurar(c.text) })) : captions,
    enfasis: extra.enfasis ?? sfx?.enfasis ?? [],
    subtitulosY,
    paginaSubtitulosMs: marca.paginaSubtitulosMs,
    material,
    sfx: extra.sfx ?? efectos,
    volumenSfx: marca.crudo.volumenSfx,
    cierre,
    // marcadores de bloque en el video cortado (si el bloque cae en un tramo cortado, en el siguiente)
    bloques: perfilBase.lineaEditorial === "hechos_contexto_opinion" ? ((await t.leer("bloques.json", BloquesCrudoSchema))?.bloques ?? []).map((b) => ({ ms: aEditadoCercano(tramos, b.desdeMs), etiqueta: ETIQUETA_BLOQUE[b.bloque] })) : [],
    musica: musica?.activa && musica.archivo && t.existe(musica.archivo) ? { src: url(musica.archivo), volumen: musica.volumen, desdeMs: desfaseAlPulso(musica.bpm, primerGolpe) } : null,
  };
};
