import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { colorDeRol, type Kit } from "../../shared/kit";
import { fechaMarca } from "../../shared/marca";
import type { KitVisual, MarcaVisual } from "../../shared/render";
import { dirKit, leerKit, leerReglas, reglasPorDefecto } from "../kit";
import type { Trabajo } from "../trabajo";

const leer = async (slug: string, rel: string | null | undefined) => {
  if (!rel) return null;
  const p = path.join(dirKit(slug), rel);
  return existsSync(p) ? readFile(p, "utf8") : null;
};

/** El contenido de un <symbol id> del sprite como un SVG suelto (para íconos que solo vienen en el sprite). */
const deSprite = (sprite: string, id: string) => {
  const m = new RegExp(`<symbol[^>]*id="${id}"[^>]*viewBox="([^"]+)"[^>]*>([\\s\\S]*?)</symbol>`).exec(sprite);
  return m ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${m[1]}">${m[2]!.replaceAll("currentColor", "#202124")}</svg>` : null;
};

const dominio = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * El kit de un perfil listo para Remotion. Las fuentes se copian a la carpeta del trabajo (kit/) y van como ruta
 * relativa (armarProps las convierte en URL); los SVG van en texto. Sin trabajo, `urlArchivo` da la URL de cada
 * archivo del kit (vista previa, hoja de marca).
 */
export const kitVisualDe = async (slug: string, t: Trabajo | null, opciones: { urlArchivo?: (rel: string) => string; fuentes?: { titulo: string; url: string }[]; fecha?: Date } = {}): Promise<KitVisual | null> => {
  const kit = await leerKit(slug);
  if (!kit) return null;
  const reglas = (await leerReglas(slug)) ?? reglasPorDefecto(kit);
  const fuente = async (uso: "titulos" | "datos") => {
    const f = kit.fuentes.find((x) => x.uso === uso) ?? (uso === "titulos" ? kit.fuentes[0] : undefined);
    if (!f) return null;
    if (t) {
      const rel = `kit/${path.basename(f.archivo)}`;
      await mkdir(t.ruta("kit"), { recursive: true });
      await copyFile(path.join(dirKit(slug), f.archivo), t.ruta(rel));
      return { url: rel, variable: f.variable };
    }
    return { url: opciones.urlArchivo?.(f.archivo) ?? f.archivo, variable: f.variable };
  };
  const svgs = async <K extends string>(r: Partial<Record<K, { svg: string | null }>>) => {
    const out: Partial<Record<K, string>> = {};
    for (const [k, a] of Object.entries(r) as [K, { svg: string | null }][]) {
      const s = await leer(slug, a.svg);
      if (s) out[k] = s;
    }
    return out;
  };
  const sprite = await leer(slug, kit.sprite);
  const iconos: Record<string, string> = {};
  for (const [id, a] of Object.entries(kit.iconos)) {
    const s = (await leer(slug, a.svg)) ?? (sprite ? deSprite(sprite, id) : null);
    if (s) iconos[id] = s;
  }
  for (const [id, e] of Object.entries(kit.extendidos)) iconos[id] ??= e.svg;
  return {
    colores: coloresKit(kit, reglas.apoyoAcento, reglas.linea),
    fuentes: { titulos: await fuente("titulos"), datos: await fuente("datos") },
    logos: await svgs(kit.logos),
    simbolos: await svgs(kit.simbolos),
    iconos,
    reglas,
    fecha: fechaMarca(opciones.fecha ?? new Date()),
    fuentesGuion: (opciones.fuentes ?? []).map((f) => ({ titulo: f.titulo, dominio: dominio(f.url) })),
  };
};

export const coloresKit = (kit: Pick<Kit, "colores">, apoyo: string | null, linea: string | null): KitVisual["colores"] => {
  const acento = colorDeRol(kit, "acento") ?? "#D92D38";
  return {
    acento,
    texto: colorDeRol(kit, "texto") ?? "#202124",
    fondo: colorDeRol(kit, "fondo") ?? "#FFFFFF",
    fondo2: colorDeRol(kit, "fondo2") ?? colorDeRol(kit, "fondo") ?? "#F4F2EE",
    secundario: colorDeRol(kit, "secundario") ?? "#5F6368",
    apoyo: apoyo ?? "#FCEAEC",
    linea: linea ?? "#D9D9D6",
  };
};

/**
 * Los colores "genéricos" de la marca visual cuando hay kit: fondo papel, texto tinta, acento rojo. Así las
 * plantillas que no tienen versión de marca también salen con la paleta del kit.
 */
export const coloresMarcaConKit = (k: KitVisual): MarcaVisual["colores"] => ({ fondo: k.colores.fondo2, fondo2: k.colores.fondo, texto: k.colores.texto, acento: k.colores.acento, acento2: k.colores.texto });

/**
 * La marca visual con el kit aplicado (animados y crudos): tipografía "kit", la paleta por rol, las fuentes
 * como URL, las fuentes del guion para "FUENTE 01" y sin el "rebote" de los tonos (la marca es sobria).
 */
export const marcaConKit = (base: MarcaVisual, kit: KitVisual, url: (rel: string) => string | null, fuentesGuion?: { titulo: string; url: string }[]): MarcaVisual => ({
  ...base,
  kit: {
    ...kit,
    fuentes: {
      titulos: kit.fuentes.titulos ? { ...kit.fuentes.titulos, url: url(kit.fuentes.titulos.url) ?? kit.fuentes.titulos.url } : null,
      datos: kit.fuentes.datos ? { ...kit.fuentes.datos, url: url(kit.fuentes.datos.url) ?? kit.fuentes.datos.url } : null,
    },
    ...(fuentesGuion ? { fuentesGuion: fuentesGuion.map((f) => ({ titulo: f.titulo, dominio: dominio(f.url) })) } : {}),
  },
  tipografia: "kit",
  colores: coloresMarcaConKit(kit),
  animacion: base.animacion === "rebote" ? "normal" : base.animacion,
  // los tonos con animación "rebote" ponen la energía en el punto rojo, no en rebotes ni sacudidas
  ...(base.animacion === "rebote" ? { energia: "alta" as const } : {}),
  subtitulos: base.subtitulos ? { ...base.subtitulos, fondo: kit.colores.fondo } : undefined,
});
