import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { KitSchema, ReglasMarcaSchema, RECURSOS_KIT, VARIANTES_LOGO, VARIANTES_SIMBOLO, type ArchivoKit, type ColorKit, type FuenteKit, type Kit, type RecursoKit, type ReglasMarca, type RolColor, type VarianteLogo, type VarianteSimbolo } from "../shared/kit";
import { pedirAClaude } from "./claude";
import { DIR_PERFILES } from "./perfiles";
import { ejecutar } from "./proceso";

/**
 * Importar el kit de marca de un perfil: se copia (nunca se toca el original) a config/perfiles/<slug>/kit/,
 * se clasifican sus archivos por nombre y contenido y se sacan las reglas del manual.
 */

export const dirKit = (slug: string) => path.join(DIR_PERFILES, slug, "kit");
const dirPrevia = (slug: string) => path.join(DIR_PERFILES, slug, "kit.previa");

const listar = async (dir: string, base = dir): Promise<string[]> => {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "__MACOSX") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listar(p, base)));
    else out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out.sort();
};

const nombreBase = (f: string) => path.basename(f).replace(/\.[^.]+$/, "").toLowerCase();
const ext = (f: string) => path.extname(f).toLowerCase();
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Variante de un logo o símbolo según su nombre (español o inglés). */
const varianteDe = (n: string): VarianteLogo | null => {
  if (/horizontal|wide|lockup/.test(n)) return "horizontal";
  if (/fondo_?blanco|white_?bg|on_?white/.test(n)) return "fondo_blanco";
  if (/sobre_?rojo|on_?red|rojo|acento/.test(n)) return "sobre_rojo";
  if (/negativ|reverse|dark|oscuro|blanco|white/.test(n)) return "negativo";
  if (/mono/.test(n)) return "monocromo";
  if (/principal|primary|main|color|default/.test(n)) return "principal";
  return null;
};

/** Agrupa los archivos por nombre base: la versión svg y png del mismo recurso van juntas. */
const agrupar = (archivos: string[]) => {
  const grupos = new Map<string, ArchivoKit & { dir: string }>();
  for (const f of archivos) {
    const e = ext(f);
    if (e !== ".svg" && e !== ".png" && e !== ".jpg" && e !== ".jpeg" && e !== ".webp") continue;
    const clave = `${nombreBase(f)}`;
    const g = grupos.get(clave) ?? { svg: null, png: null, dir: path.dirname(f) };
    if (e === ".svg") g.svg = f;
    else g.png ??= f;
    grupos.set(clave, g);
  }
  return grupos;
};

/** Rol de un color por su nombre (cuando el manual no lo dice). */
export const rolPorNombre = (nombre: string, hex: string): RolColor => {
  const n = norm(nombre);
  if (/rojo|acento|accent|red|primario|punto/.test(n)) return "acento";
  if (/tinta|ink|texto|text|negro|black|oscuro/.test(n)) return "texto";
  if (/papel|paper|crema|secundari|fondo2|off/.test(n)) return "fondo2";
  if (/blanco|white|fondo|background/.test(n)) return "fondo";
  if (/gris|gray|grey|editorial|muted/.test(n)) return "secundario";
  // por luminancia: muy claro = fondo, muy oscuro = texto
  const v = Number.parseInt(hex.slice(1), 16);
  const l = (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  return l > 0.92 ? "fondo" : l < 0.2 ? "texto" : "otro";
};

/** Colores de los CSS (--prefijo-nombre: #hex), de un .json [{nombre, hex}] o de una paleta GIMP. */
const leerColores = async (raiz: string, archivos: string[]): Promise<ColorKit[]> => {
  const encontrados = new Map<string, string>();
  for (const f of archivos) {
    const e = ext(f);
    const texto = e === ".css" || e === ".json" || e === ".gpl" || e === ".scss" ? await readFile(path.join(raiz, f), "utf8") : null;
    if (!texto) continue;
    if (e === ".css" || e === ".scss") {
      for (const m of texto.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)) {
        const nombre = m[1]!.split("-").filter(Boolean).at(-1)!;
        if (!encontrados.has(nombre)) encontrados.set(nombre, m[2]!.toUpperCase());
      }
    } else if (e === ".json") {
      try {
        const j = JSON.parse(texto) as unknown;
        const lista = Array.isArray(j) ? j : typeof j === "object" && j ? Object.entries(j as Record<string, unknown>).map(([nombre, hex]) => ({ nombre, hex })) : [];
        for (const c of lista as { nombre?: string; name?: string; hex?: string }[]) {
          const nombre = c.nombre ?? c.name;
          if (nombre && typeof c.hex === "string" && /^#[0-9a-fA-F]{6}$/.test(c.hex) && !encontrados.has(nombre)) encontrados.set(nombre, c.hex.toUpperCase());
        }
      } catch {
        // no es una paleta
      }
    }
  }
  return [...encontrados].map(([nombre, hex]) => ({ nombre, hex, rol: rolPorNombre(nombre, hex) }));
};

const leerFuentes = (archivos: string[]): FuenteKit[] =>
  archivos
    .filter((f) => /\.(ttf|otf|woff2?)$/i.test(f))
    .map((f) => {
      const base = path.basename(f).replace(/\.[^.]+$/, "");
      const variable = /variable|\[.*wght.*\]/i.test(base);
      const familia = base
        .replace(/[-_]?(variable|regular|vf)$/i, "")
        .replace(/\[.*\]/, "")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .trim();
      const raiz = familia.split(" ")[0]!.toLowerCase();
      const licencia = archivos.find((a) => /\.(txt|md)$/i.test(a) && /ofl|licen/i.test(a) && path.basename(a).toLowerCase().startsWith(raiz)) ?? null;
      const mono = /mono|code/i.test(base);
      return { familia, archivo: f, licencia, variable, pesos: variable ? [400, 500, 600] : [/bold/i.test(base) ? 700 : 400], uso: mono ? "datos" : "titulos" } satisfies FuenteKit;
    });

/** Íconos: los SVG de una carpeta de íconos (o chicos, viewBox 24) y los <symbol> del sprite. */
const leerIconos = async (raiz: string, archivos: string[], grupos: ReturnType<typeof agrupar>) => {
  const iconos: Record<string, ArchivoKit> = {};
  let sprite: string | null = null;
  for (const [nombre, g] of grupos) {
    const enCarpeta = /icon|icono/i.test(g.dir);
    if (!enCarpeta || /sprite/.test(nombre)) continue;
    iconos[nombre] = { svg: g.svg, png: g.png };
  }
  for (const f of archivos.filter((a) => /sprite/i.test(a) && a.endsWith(".svg"))) {
    sprite = f;
    const texto = await readFile(path.join(raiz, f), "utf8");
    for (const m of texto.matchAll(/<symbol[^>]*id="([^"]+)"/g)) iconos[m[1]!.toLowerCase()] ??= { svg: null, png: null };
  }
  return { iconos, sprite };
};

/** Clasifica una carpeta de kit (sin copiar nada). */
export const detectarKit = async (raiz: string): Promise<Omit<Kit, "importado" | "origen" | "extendidos">> => {
  const archivos = await listar(raiz);
  const grupos = agrupar(archivos);
  const logos: Partial<Record<VarianteLogo, ArchivoKit>> = {};
  const simbolos: Partial<Record<VarianteSimbolo, ArchivoKit>> = {};
  const avatares: Kit["avatares"] = [];
  const recursos: Partial<Record<RecursoKit, ArchivoKit>> = {};
  for (const [nombre, g] of grupos) {
    const archivo = { svg: g.svg, png: g.png };
    if (/icon|icono/i.test(g.dir)) continue;
    if (/^(perfil|avatar|profile)/.test(nombre)) avatares.push({ ...archivo, nombre });
    else if (/simbolo|symbol|isotipo|monogram|marca_corta/.test(nombre)) {
      const v = varianteDe(nombre) ?? "principal";
      if (v !== "horizontal" && v !== "fondo_blanco") simbolos[v] ??= archivo;
    } else if (/logo/.test(nombre)) {
      const v = varianteDe(nombre) ?? "principal";
      logos[v] ??= archivo;
    } else {
      const r = RECURSOS_KIT.find((x) => nombre.startsWith(x) || (x === "patron" && /pattern|patron/.test(nombre)));
      if (r) recursos[r] ??= archivo;
    }
  }
  const { iconos, sprite } = await leerIconos(raiz, archivos, grupos);
  return {
    version: 1,
    logos,
    simbolos,
    avatares: avatares.sort((a, b) => a.nombre.localeCompare(b.nombre)),
    colores: await leerColores(raiz, archivos),
    fuentes: leerFuentes(archivos),
    recursos,
    iconos,
    sprite,
    manual: archivos.find((a) => /\.pdf$/i.test(a)) ?? null,
    resumen: archivos.find((a) => /resumen|summary|overview/i.test(a) && /\.(png|jpe?g)$/i.test(a)) ?? null,
  };
};

/** Si el zip trae una sola carpeta adentro, esa es la raíz del kit. */
const raizUnica = async (dir: string) => {
  const hijos = (await readdir(dir, { withFileTypes: true })).filter((e) => !e.name.startsWith(".") && e.name !== "__MACOSX");
  return hijos.length === 1 && hijos[0]!.isDirectory() ? path.join(dir, hijos[0]!.name) : dir;
};

/**
 * Paso 1 de la importación: copia el kit (carpeta o zip) a kit.previa/ y lo clasifica. No pisa el kit que
 * ya tuviera el perfil hasta que confirmás.
 */
export const previsualizarKit = async (slug: string, fuente: { carpeta: string } | { zip: Buffer; nombre: string }): Promise<Kit> => {
  const previa = dirPrevia(slug);
  await rm(previa, { recursive: true, force: true });
  await mkdir(previa, { recursive: true });
  let origen: string;
  if ("carpeta" in fuente) {
    const carpeta = path.resolve(fuente.carpeta.replace(/^~(?=\/|$)/, os.homedir()));
    if (!existsSync(carpeta) || !(await stat(carpeta)).isDirectory()) throw new Error(`No encuentro la carpeta ${carpeta}`);
    await cp(carpeta, previa, { recursive: true });
    origen = carpeta;
  } else {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "kit-"));
    try {
      const zip = path.join(tmp, "kit.zip");
      await writeFile(zip, fuente.zip);
      const destino = path.join(tmp, "x");
      await ejecutar("unzip", ["-q", zip, "-d", destino]);
      await cp(await raizUnica(destino), previa, { recursive: true });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
    origen = fuente.nombre;
  }
  const kit = KitSchema.parse({ ...(await detectarKit(previa)), importado: new Date().toISOString(), origen });
  await writeFile(path.join(previa, "kit.json"), `${JSON.stringify(kit, null, 2)}\n`);
  return kit;
};

const RespuestaManualSchema = z.object({
  reglas: ReglasMarcaSchema,
  roles: z.array(z.object({ nombre: z.string(), rol: z.enum(["acento", "texto", "fondo", "fondo2", "secundario", "otro"]) })).describe("Rol de cada color del kit según el manual"),
  marca_md: z.string().min(50).max(12000).describe("Las reglas en Markdown claro, en español rioplatense"),
});

/** Reglas por defecto armadas con lo que se detectó (cuando no hay manual o no se pudo leer). */
export const reglasPorDefecto = (kit: Kit): ReglasMarca =>
  ReglasMarcaSchema.parse({
    tipografia: { titulos: kit.fuentes.find((f) => f.uso === "titulos")?.familia ?? "", datos: kit.fuentes.find((f) => f.uso === "datos")?.familia ?? "" },
  });

export const mdDeReglas = (r: ReglasMarca, kit: Kit) =>
  [
    "# Reglas de marca",
    r.concepto ? `\n**Concepto:** ${r.concepto}` : "",
    r.lema ? `**Lema:** ${r.lema}` : "",
    "\n## Logo",
    `- Fondo claro → ${r.logoPorFondo.claro}; oscuro → ${r.logoPorFondo.oscuro}; acento → ${r.logoPorFondo.acento}; una tinta → ${r.logoPorFondo.unaTinta}.`,
    `- Margen libre: ${r.margenEnPuntos} diámetros del punto. Mínimos: logo ${r.minimos.logo} px, horizontal ${r.minimos.horizontal} px, símbolo ${r.minimos.simbolo} px.`,
    r.noSobreFotos ? "- No va sobre fotos cargadas." : "",
    "\n## Colores",
    ...kit.colores.map((c) => `- ${c.nombre} ${c.hex}: ${c.rol}`),
    `- El acento no pasa del ${r.acentoMaxPct} % del cuadro.`,
    "\n## Tipografía",
    `- Títulos y lectura: ${r.tipografia.titulos} (${r.tipografia.pesos.join(", ")}). Fechas, fuentes y numeración: ${r.tipografia.datos}.`,
    `- Escala sobre ${r.tipografia.escala.anchoReferencia} px: título ${r.tipografia.escala.titulo}, cuerpo ${r.tipografia.escala.cuerpo}, fuente ${r.tipografia.escala.fuente}.`,
    r.etiquetas.length ? `\n## Etiquetas\n${r.etiquetas.join(" · ")}` : "",
    r.notas.length ? `\n## Notas\n${r.notas.map((n) => `- ${n}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

/**
 * Colores exactos de los recursos (los SVG son los maestros: mandan sobre lo que se lee del PDF): la tinta de
 * apoyo del destacado (el relleno que no es de la paleta) y el trazo de la línea del separador.
 */
export const coloresDeRecursos = async (dir: string, kit: Kit): Promise<Partial<Pick<ReglasMarca, "apoyoAcento" | "linea">>> => {
  const paleta = new Set(kit.colores.map((c) => c.hex.toUpperCase()));
  const leer = async (a: ArchivoKit | undefined) => (a?.svg && existsSync(path.join(dir, a.svg)) ? readFile(path.join(dir, a.svg), "utf8") : null);
  const out: Partial<Pick<ReglasMarca, "apoyoAcento" | "linea">> = {};
  const destacado = await leer(kit.recursos.destacado);
  const apoyo = destacado ? [...destacado.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1]!.toUpperCase()).find((c) => !paleta.has(c)) : undefined;
  if (apoyo) out.apoyoAcento = apoyo;
  const separador = await leer(kit.recursos.separador);
  const linea = separador ? /stroke="(#[0-9a-fA-F]{6})"/.exec(separador)?.[1]?.toUpperCase() : undefined;
  if (linea) out.linea = linea;
  return out;
};

/** Lee el manual PDF con Claude y devuelve las reglas (y los roles de los colores). */
const leerManual = async (dir: string, kit: Kit, modelo: string, onLog?: (l: string) => void) => {
  if (!kit.manual) return null;
  return pedirAClaude({
    prompt: `Leé el manual de identidad "${kit.manual}" ENTERO con la herramienta Read (es un PDF).
Es el manual de una marca para videos verticales (Reels/TikTok). Ya detecté en el kit:
- Colores: ${kit.colores.map((c) => `${c.nombre} ${c.hex}`).join(", ")}
- Fuentes: ${kit.fuentes.map((f) => `${f.familia} (${f.archivo})`).join(", ")}
- Variantes de logo: ${Object.keys(kit.logos).join(", ")}; de símbolo: ${Object.keys(kit.simbolos).join(", ")}
- Recursos: ${Object.keys(kit.recursos).join(", ")}; íconos: ${Object.keys(kit.iconos).length}

Devolvé las reglas TAL COMO LAS DICE EL MANUAL (no inventes): qué variante de logo va sobre fondo claro, oscuro, de acento
y a una tinta; margen de seguridad en diámetros del punto; tamaños mínimos; si no va sobre fotos; qué fuente es para
títulos y cuál para datos (fechas/fuentes/numeración), pesos y escala sugerida; etiquetas explícitas; concepto y lema;
el % máximo de acento si lo dice (si no, 15); la tinta de apoyo del acento si la menciona (por ejemplo el rosa del
destacado) y el color de las líneas finas si se ve; y notas cortas con cualquier otra regla. En "roles", el rol de cada
color detectado. En "marca_md", todo en Markdown claro.`,
    schema: RespuestaManualSchema,
    cwd: dir,
    herramientas: ["Read"],
    model: modelo,
    onLog,
  });
};

/**
 * Paso 2: confirmás la previa. Se lee el manual (si hay), se guardan reglas.json y marca.md y el kit
 * reemplaza al anterior en kit/. Los íconos extendidos del kit anterior se conservan.
 */
export const confirmarKit = async (slug: string, modelo: string, onLog?: (l: string) => void): Promise<{ kit: Kit; reglas: ReglasMarca; desdeManual: boolean }> => {
  const previa = dirPrevia(slug);
  if (!existsSync(path.join(previa, "kit.json"))) throw new Error("No hay un kit para confirmar: importalo de nuevo.");
  let kit = KitSchema.parse(JSON.parse(await readFile(path.join(previa, "kit.json"), "utf8")));
  const anterior = await leerKit(slug);
  if (anterior) kit = { ...kit, extendidos: { ...anterior.extendidos, ...kit.extendidos } };
  let reglas = reglasPorDefecto(kit);
  let md = mdDeReglas(reglas, kit);
  let desdeManual = false;
  try {
    const r = await leerManual(previa, kit, modelo, onLog);
    if (r) {
      reglas = r.reglas;
      kit = { ...kit, colores: kit.colores.map((c) => ({ ...c, rol: r.roles.find((x) => norm(x.nombre) === norm(c.nombre))?.rol ?? c.rol })) };
      md = r.marca_md;
      desdeManual = true;
    }
  } catch (e) {
    onLog?.(`No pude leer el manual (${(e as Error).message}): uso reglas por defecto.`);
  }
  const exactos = await coloresDeRecursos(previa, kit);
  reglas = { ...reglas, ...exactos };
  if (exactos.apoyoAcento || exactos.linea)
    md += `\n\n## Colores exactos de los recursos (de los SVG maestros, mandan sobre el PDF)\n${exactos.apoyoAcento ? `- Tinta de apoyo del destacado: \`${exactos.apoyoAcento}\` (no es un color nuevo de marca).\n` : ""}${exactos.linea ? `- Línea del separador: \`${exactos.linea}\`.\n` : ""}`;
  await writeFile(path.join(previa, "kit.json"), `${JSON.stringify(kit, null, 2)}\n`);
  await writeFile(path.join(previa, "reglas.json"), `${JSON.stringify(reglas, null, 2)}\n`);
  await writeFile(path.join(previa, "marca.md"), `${md.trim()}\n`);
  const destino = dirKit(slug);
  if (anterior && existsSync(path.join(destino, "extendidos"))) await cp(path.join(destino, "extendidos"), path.join(previa, "extendidos"), { recursive: true });
  await rm(destino, { recursive: true, force: true });
  await rename(previa, destino);
  return { kit, reglas, desdeManual };
};

export const leerKit = async (slug: string): Promise<Kit | null> => {
  const f = path.join(dirKit(slug), "kit.json");
  if (!existsSync(f)) return null;
  const r = KitSchema.safeParse(JSON.parse(await readFile(f, "utf8")));
  return r.success ? r.data : null;
};

export const leerReglas = async (slug: string): Promise<ReglasMarca | null> => {
  const f = path.join(dirKit(slug), "reglas.json");
  if (!existsSync(f)) return null;
  const r = ReglasMarcaSchema.safeParse(JSON.parse(await readFile(f, "utf8")));
  return r.success ? r.data : null;
};

export const guardarKit = async (slug: string, kit: Kit) => writeFile(path.join(dirKit(slug), "kit.json"), `${JSON.stringify(KitSchema.parse(kit), null, 2)}\n`);

/** Ruta segura de un archivo del kit (nunca fuera de la carpeta). */
export const rutaEnKit = (slug: string, rel: string) => {
  const base = dirKit(slug);
  const p = path.resolve(base, rel);
  if (!p.startsWith(base + path.sep)) throw new Error("Ruta inválida");
  return p;
};
