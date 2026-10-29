import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { paletaDe, PerfilSchema, SLUG_PERFIL, type Perfil } from "../shared/perfiles";
import type { KitVisual, MarcaVisual } from "../shared/render";
import type { Marca } from "../shared/schemas";
import { DIR_CONFIG, RAIZ } from "./rutas";
import { escribirAtomico, type Trabajo } from "./trabajo";

/** FABRICA_PERFILES solo para pruebas. */
export const DIR_PERFILES = process.env.FABRICA_PERFILES ?? path.join(DIR_CONFIG, "perfiles");

const archivo = (slug: string) => {
  if (!SLUG_PERFIL.test(slug)) throw new Error(`Perfil inválido: ${slug}`);
  return path.join(DIR_PERFILES, `${slug}.json`);
};

/** El primer perfil sale de config/marca.json (el @ y los colores que ya venías usando). */
export const perfilDesdeMarca = (marca: Marca): Perfil => {
  const usuario = marca.usuario.startsWith("@") ? marca.usuario : `@${marca.usuario}`;
  const colores = { ...marca.colores, subtitulos: "#000000" };
  return PerfilSchema.parse({
    slug: usuario.slice(1).replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "") || "mi-perfil",
    nombre: usuario.slice(1).split(/[._]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" "),
    usuario,
    verificado: false,
    paleta: paletaDe(colores),
    colores,
    tipografia: marca.tipografia,
  });
};

export const listarPerfiles = async (marca: Marca): Promise<Perfil[]> => {
  await mkdir(DIR_PERFILES, { recursive: true });
  let nombres = (await readdir(DIR_PERFILES)).filter((n) => n.endsWith(".json"));
  if (!nombres.length) {
    await guardarPerfil(perfilDesdeMarca(marca));
    nombres = (await readdir(DIR_PERFILES)).filter((n) => n.endsWith(".json"));
  }
  const perfiles: Perfil[] = [];
  for (const n of nombres) {
    try {
      perfiles.push(PerfilSchema.parse(JSON.parse(await readFile(path.join(DIR_PERFILES, n), "utf8"))));
    } catch {
      // archivo roto: no se muestra (el resto sigue andando)
    }
  }
  // el perfil por defecto primero, después por nombre
  const def = slugPorDefecto(marca, perfiles);
  return perfiles.sort((a, b) => Number(b.slug === def) - Number(a.slug === def) || a.nombre.localeCompare(b.nombre, "es"));
};

/** El elegido en Configuración; si no se eligió ninguno, el que tiene el @ de la marca (el primero que se creó). */
export const slugPorDefecto = (marca: Marca, perfiles: Perfil[]) =>
  perfiles.find((p) => p.slug === marca.perfilPorDefecto)?.slug ?? perfiles.find((p) => p.usuario === marca.usuario)?.slug ?? perfiles[0]?.slug ?? "";

export const leerPerfil = async (slug: string): Promise<Perfil | null> => {
  const f = archivo(slug);
  if (!existsSync(f)) return null;
  const r = PerfilSchema.safeParse(JSON.parse(await readFile(f, "utf8")));
  return r.success ? r.data : null;
};

export const guardarPerfil = async (p: Perfil): Promise<Perfil> => {
  const perfil = PerfilSchema.parse(p);
  await mkdir(DIR_PERFILES, { recursive: true });
  await escribirAtomico(archivo(perfil.slug), `${JSON.stringify(perfil, null, 2)}\n`);
  return perfil;
};

export const borrarPerfil = async (slug: string) => {
  const p = await leerPerfil(slug);
  if (!p) throw new Error(`No existe el perfil ${slug}`);
  if (p.foto) await rm(path.join(DIR_PERFILES, p.foto), { force: true });
  // el kit de marca también (los trabajos ya hechos guardan su copia de lo que usaron)
  await rm(path.join(DIR_PERFILES, slug), { recursive: true, force: true });
  await rm(archivo(slug), { force: true });
};

/** Guarda la foto o logo del perfil (PNG, JPG o WEBP) y la deja anotada en el perfil. */
export const guardarFotoPerfil = async (slug: string, datos: Buffer): Promise<Perfil> => {
  const p = await leerPerfil(slug);
  if (!p) throw new Error(`No existe el perfil ${slug}`);
  const ext = datos.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ? "png"
    : datos[0] === 0xff && datos[1] === 0xd8
      ? "jpg"
      : datos.toString("ascii", 8, 12) === "WEBP"
        ? "webp"
        : null;
  if (!ext) throw new Error("La foto tiene que ser PNG, JPG o WEBP.");
  if (p.foto) await rm(path.join(DIR_PERFILES, p.foto), { force: true });
  const foto = `${slug}.${ext}`;
  await writeFile(path.join(DIR_PERFILES, foto), datos);
  return guardarPerfil({ ...p, foto });
};

/** Último perfil usado al crear videos animados (los crudos lo guardan con sus opciones). */
const ARCHIVO_ULTIMO_ANIMADOS = () => process.env.FABRICA_ULTIMO_PERFIL ?? path.join(RAIZ, "data", "ultimo-perfil-animados.json");
export const guardarUltimoPerfilAnimados = async (slug: string) => {
  await mkdir(path.dirname(ARCHIVO_ULTIMO_ANIMADOS()), { recursive: true });
  await writeFile(ARCHIVO_ULTIMO_ANIMADOS(), `${JSON.stringify({ perfil: slug })}\n`);
};
export const leerUltimoPerfilAnimados = async (): Promise<string | null> => {
  try {
    return (JSON.parse(await readFile(ARCHIVO_ULTIMO_ANIMADOS(), "utf8")) as { perfil?: string }).perfil ?? null;
  } catch {
    return null;
  }
};

export const rutaFotoPerfil = (p: Perfil) => (p.foto ? path.join(DIR_PERFILES, p.foto) : null);

/**
 * Guarda en el trabajo una copia del perfil (y de su foto). Se hace al crearlo y cada vez que corre, así
 * los cambios al perfil se aplican, pero si el perfil se borra el video no se rompe.
 */
export const fijarPerfil = async (t: Trabajo, p: Perfil) => {
  const origen = rutaFotoPerfil(p);
  let fotoCopia: string | null = null;
  if (origen && existsSync(origen)) {
    fotoCopia = `perfil-copia${path.extname(origen)}`;
    await copyFile(origen, t.ruta(fotoCopia));
  }
  await t.actualizar((e) => {
    e.perfilCopia = { ...p, fotoCopia };
  });
};

/** Perfil de un trabajo: el elegido al crearlo; si se borró, la copia guardada; si no, el de la configuración. */
export const perfilDeTrabajo = async (t: Trabajo, marca: Marca): Promise<Perfil> => {
  const e = await t.estado();
  const pedido = e.opciones.perfil;
  const vivo = pedido ? await leerPerfil(pedido) : null;
  if (vivo) {
    await fijarPerfil(t, vivo);
    return vivo;
  }
  if (e.perfilCopia && (!pedido || e.perfilCopia.slug === pedido)) {
    const { fotoCopia: _, ...copia } = e.perfilCopia;
    return copia;
  }
  return (await listarPerfiles(marca))[0] ?? perfilDesdeMarca(marca);
};

/** La marca con el @, los colores y la tipografía del perfil (el tono después puede cambiar los acentos). */
export const marcaConPerfil = (marca: Marca, p: Perfil): Marca => {
  const { subtitulos: _, ...colores } = p.colores;
  return { ...marca, usuario: p.usuario, colores, tipografia: p.tipografia };
};

export type ExtrasPerfil = Required<Pick<MarcaVisual, "nombre" | "verificado" | "subtitulos">> & { foto: string | null; ilustracion?: MarcaVisual["ilustracion"]; kit?: KitVisual };

/**
 * Lo que el perfil suma a la marca visual. La foto se copia a la carpeta del trabajo (así la sirve el mismo
 * servidor del render y de la vista previa); `foto` queda relativa a esa carpeta.
 */
export const extrasDePerfil = async (p: Perfil, t: Trabajo | null): Promise<ExtrasPerfil> => {
  let foto: string | null = null;
  const origen = rutaFotoPerfil(p);
  if (t && origen && existsSync(origen)) {
    foto = `perfil${path.extname(origen)}`;
    await copyFile(origen, t.ruta(foto));
  } else if (t) {
    // perfil borrado: la foto que se copió al trabajo
    const copia = (await t.estado()).perfilCopia?.fotoCopia;
    if (copia && t.existe(copia)) foto = copia;
  }
  // con kit de marca, sus fuentes se copian al trabajo y sus SVG van en las props
  const { kitVisualDe } = await import("./marca/kitVisual");
  const kit = t ? await kitVisualDe(p.slug, t) : null;
  return { nombre: p.nombre, verificado: p.verificado, foto, subtitulos: { ...p.subtitulos, fondo: p.colores.subtitulos }, ...(kit ? { kit } : {}) };
};
