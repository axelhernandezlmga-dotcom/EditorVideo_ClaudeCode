import { z } from "zod";
import type { CrudoProps } from "../../shared/crudo";
import { contraste, elegirLogo, esLineaDeFuente, parrafoEnMayusculas, piezasSvg } from "../../shared/marca";
import { FPS, FRAMES_TRANSICION, iniciosEscenas, type KitVisual, type VideoProps } from "../../shared/render";
import { spawn } from "node:child_process";

/**
 * Verificador de marca: corre en cada render de un perfil con kit y deja marca-reporte.json. Hay reglas que se
 * cumplen por construcción (los componentes eligen el logo y respetan los mínimos: el reporte lo confirma),
 * otras se revisan en los textos de las props y otras en los píxeles de cuadros del video renderizado.
 */

export const ChequeoSchema = z.object({
  regla: z.string(),
  estado: z.enum(["ok", "corregido", "aviso"]),
  detalle: z.string(),
  /** Segundo del video donde se vio (si aplica). */
  momento: z.number().optional(),
});
export const ReporteMarcaSchema = z.object({
  ok: z.boolean(),
  revisado: z.string(),
  chequeos: z.array(ChequeoSchema),
  cuadros: z.array(z.object({ s: z.number(), rojoPct: z.number(), fueraPct: z.number(), omitido: z.string().optional() })).default([]),
});
export type ReporteMarca = z.infer<typeof ReporteMarcaSchema>;
type Chequeo = z.infer<typeof ChequeoSchema>;

/** Dónde se pone cada pieza de marca (fondo, ancho en px y espacio libre extra alrededor), igual que en los componentes. */
const ubicaciones = (k: KitVisual) => [
  { donde: "cierre", fondo: k.colores.fondo2, ancho: 640, horizontal: false, libre: 200 },
  { donde: "firma de las tarjetas (papel)", fondo: k.colores.fondo2, ancho: 360, horizontal: true, libre: 46 },
  { donde: "firma de las tarjetas (tinta)", fondo: k.colores.texto, ancho: 360, horizontal: true, libre: 46 },
  { donde: "portada", fondo: k.colores.fondo2, ancho: 420, horizontal: true, libre: 40 },
  { donde: "marca de agua", fondo: k.colores.fondo2, ancho: 62, horizontal: false, libre: 16 },
];

/** Reglas de logo: variante por fondo, mínimos (con el cambio a «C.») y margen de seguridad. */
export const chequeosLogo = (k: KitVisual): Chequeo[] => {
  const out: Chequeo[] = [];
  const elegidos: string[] = [];
  const reemplazos: string[] = [];
  const margenes: string[] = [];
  for (const u of ubicaciones(k)) {
    const e = elegirLogo(u.fondo, u.ancho, k.reglas, k.colores.acento, { horizontal: u.horizontal });
    elegidos.push(`${u.donde}: ${e.pieza === "logo" ? `logo ${e.variante}` : `«C.» ${e.variante}`}`);
    if (e.pieza === "simbolo" && u.donde !== "marca de agua") reemplazos.push(`${u.donde} (${u.ancho} px < mínimo)`);
    // margen: el aire propio del SVG + el espacio libre alrededor, contra 2 diámetros del punto
    const svg = e.pieza === "logo" ? k.logos[e.variante] : k.simbolos[e.variante];
    const p = svg ? piezasSvg(svg) : null;
    if (p?.punto) {
      const escala = (e.pieza === "simbolo" ? Math.min(u.ancho, 160) : u.ancho) / p.ancho;
      const [tx, ty] = (/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(p.transform)?.slice(1).map(Number) ?? [0, 0]) as [number, number];
      const propio = Math.min(tx, ty) * escala;
      const requerido = k.reglas.margenEnPuntos * p.punto.r * 2 * escala;
      if (propio + u.libre < requerido) margenes.push(`${u.donde}: ${Math.round(propio + u.libre)} px de aire, hacen falta ${Math.round(requerido)}`);
    }
  }
  out.push({ regla: "Logo según el fondo", estado: "ok", detalle: `claro → ${k.reglas.logoPorFondo.claro}, oscuro → ${k.reglas.logoPorFondo.oscuro}, acento → ${k.reglas.logoPorFondo.acento}. ${elegidos.join(" · ")}` });
  out.push(
    reemplazos.length
      ? { regla: "Tamaño mínimo del logo", estado: "corregido", detalle: `Por debajo del mínimo va la «C.»: ${reemplazos.join(", ")}` }
      : { regla: "Tamaño mínimo del logo", estado: "ok", detalle: `Logo ≥ ${k.reglas.minimos.logo} px, horizontal ≥ ${k.reglas.minimos.horizontal} px, «C.» ≥ ${k.reglas.minimos.simbolo} px.` },
  );
  out.push(margenes.length ? { regla: "Margen de seguridad", estado: "aviso", detalle: margenes.join(" · ") } : { regla: "Margen de seguridad", estado: "ok", detalle: `Al menos ${k.reglas.margenEnPuntos} diámetros del punto alrededor del logo.` });
  out.push({ regla: "Logo sobre fotos", estado: "ok", detalle: "El logo solo va sobre fondos lisos de la marca (cierre, tarjetas, portada); nunca sobre fotos, capturas ni clips." });
  return out;
};

const MESES = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";
const FECHA_SUELTA = new RegExp(`\\b\\d{1,2}\\s+de\\s+(${MESES})(\\s+de\\s+\\d{4})?\\b|\\b\\d{1,2}/\\d{1,2}/\\d{2,4}\\b`, "i");

/** Todos los textos en pantalla de las props (props de cada escena o material del crudo), con su segundo aproximado. */
const textosEnPantalla = (props: VideoProps | CrudoProps): { texto: string; s: number; plantilla?: string }[] => {
  const out: { texto: string; s: number; plantilla?: string }[] = [];
  const juntar = (v: unknown, s: number, plantilla?: string) => {
    if (typeof v === "string") out.push({ texto: v, s, plantilla });
    else if (Array.isArray(v)) v.forEach((x) => juntar(x, s, plantilla));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (!["imagenes", "url", "src", "que_debe_verse", "credito", "icono", "pais", "fecha"].includes(k)) juntar(x, s, plantilla);
  };
  if ("escenas" in props) {
    const inicios = iniciosEscenas(props.escenas.map((e) => e.duracionFrames));
    props.escenas.forEach((e, i) => juntar(e.props, ((props.apertura ?? 0) + inicios[i]!) / FPS, e.plantilla));
  } else for (const m of props.material) juntar({ ...(m as Record<string, unknown>), imagen: undefined, rects: undefined }, (m as { desdeMs?: number }).desdeMs ? (m as { desdeMs: number }).desdeMs / 1000 : 0);
  return out.filter((x) => x.texto.trim().length > 1);
};

/** Lo que el armado del video ya corrigió por las reglas de la marca (fechas sacadas de títulos, etc.). */
const chequeoCorrecciones = (props: VideoProps | CrudoProps): Chequeo[] => {
  const c = "correccionesMarca" in props ? (props.correccionesMarca ?? []) : [];
  return c.length ? [{ regla: "Fechas y fuentes en Plex Mono (corregido)", estado: "corregido", detalle: c.join(" · ") }] : [];
};

/** Reglas de tipografía y contraste. */
export const chequeosTexto = (k: KitVisual, props: VideoProps | CrudoProps): Chequeo[] => {
  const out: Chequeo[] = [];
  const textos = textosEnPantalla(props);
  const mayus = textos.filter((t) => parrafoEnMayusculas(t.texto));
  out.push(
    mayus.length
      ? { regla: "Nada de párrafos en mayúsculas", estado: "aviso", detalle: `${mayus.length} texto(s) escritos en mayúsculas: «${mayus[0]!.texto.slice(0, 60)}»${mayus.length > 1 ? "…" : ""}. Escribilos en minúscula (la marca no fuerza mayúsculas).`, momento: mayus[0]!.s }
      : { regla: "Nada de párrafos en mayúsculas", estado: "ok", detalle: "Los textos respetan mayúsculas y minúsculas; solo etiquetas y fechas van en mayúsculas." },
  );
  // las fechas de la línea de tiempo (campo "fecha") ya van en Plex Mono; acá se buscan las que quedaron en Inter
  // (el cierre de marca ya convierte «Fuente: …» en su línea; en otras escenas es un aviso)
  const fechas = textos.filter((t) => FECHA_SUELTA.test(t.texto) || (esLineaDeFuente(t.texto) && t.plantilla !== "cierre_cta"));
  out.push(
    fechas.length
      ? { regla: "Fechas y fuentes en Plex Mono", estado: "aviso", detalle: `${fechas.length} fecha(s) dentro de un texto en Inter: «${fechas[0]!.texto.slice(0, 60)}». Las fechas van en la línea de fecha y fuente (Plex Mono).`, momento: fechas[0]!.s }
      : { regla: "Fechas y fuentes en Plex Mono", estado: "ok", detalle: `Fechas y fuentes en la línea de Plex Mono («${k.fecha} / FUENTE 01»).` },
  );
  const pares: [string, string, string][] = [
    ["Texto sobre papel", k.colores.texto, k.colores.fondo2],
    ["Texto sobre blanco", k.colores.texto, k.colores.fondo],
    ["Fechas y bajadas (gris) sobre papel", k.colores.secundario, k.colores.fondo2],
    ["Texto blanco sobre tinta", k.colores.fondo, k.colores.texto],
  ];
  const bajos = pares.filter(([, a, b]) => contraste(a, b) < 4.5);
  out.push(
    bajos.length
      ? { regla: "Contraste del texto", estado: "aviso", detalle: bajos.map(([n, a, b]) => `${n}: ${contraste(a, b).toFixed(1)}:1 (mínimo 4,5:1)`).join(" · ") }
      : { regla: "Contraste del texto", estado: "ok", detalle: pares.map(([n, a, b]) => `${n} ${contraste(a, b).toFixed(1)}:1`).join(" · ") },
  );
  return out;
};

/** Medición de un cuadro RGB: % de píxeles de acento y % fuera de la paleta (con tolerancia de antialias). */
export const medirCuadro = (rgb: Uint8Array, paleta: string[], acento: string) => {
  const cols = paleta.map((h) => [Number.parseInt(h.slice(1, 3), 16), Number.parseInt(h.slice(3, 5), 16), Number.parseInt(h.slice(5, 7), 16)] as const);
  const [ar, ag, ab] = [Number.parseInt(acento.slice(1, 3), 16), Number.parseInt(acento.slice(3, 5), 16), Number.parseInt(acento.slice(5, 7), 16)];
  let rojo = 0;
  let fuera = 0;
  const n = rgb.length / 3;
  for (let i = 0; i < rgb.length; i += 3) {
    const r = rgb[i]!;
    const g = rgb[i + 1]!;
    const b = rgb[i + 2]!;
    if (Math.hypot(r - ar, g - ag, b - ab) < 60) rojo++;
    let cerca = false;
    // en la paleta, o en el camino entre dos colores de la paleta (bordes suavizados, transparencias)
    for (let a = 0; a < cols.length && !cerca; a++) {
      const A = cols[a]!;
      if (Math.hypot(r - A[0], g - A[1], b - A[2]) < 34) cerca = true;
      for (let c = a + 1; c < cols.length && !cerca; c++) {
        const B = cols[c]!;
        const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        const l2 = d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2;
        const t = Math.max(0, Math.min(1, ((r - A[0]) * d[0]! + (g - A[1]) * d[1]! + (b - A[2]) * d[2]!) / l2));
        if (Math.hypot(r - (A[0] + t * d[0]!), g - (A[1] + t * d[1]!), b - (A[2] + t * d[2]!)) < 20) cerca = true;
      }
    }
    if (!cerca) fuera++;
  }
  return { rojoPct: (100 * rojo) / n, fueraPct: (100 * fuera) / n };
};

const ANCHO_MEDIDA = 108;
const ALTO_MEDIDA = 192;

/** Un cuadro del video en RGB chiquito (108×192), como bytes (ffmpeg escribe el cuadro crudo por stdout). */
const cuadroRgb = (video: string, s: number) =>
  new Promise<Uint8Array>((ok, mal) => {
    const hijo = spawn("ffmpeg", ["-v", "error", "-ss", s.toFixed(2), "-i", video, "-frames:v", "1", "-vf", `scale=${ANCHO_MEDIDA}:${ALTO_MEDIDA}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
    const partes: Buffer[] = [];
    hijo.stdout.on("data", (b: Buffer) => partes.push(b));
    hijo.on("error", mal);
    hijo.on("close", (codigo) => (codigo === 0 ? ok(new Uint8Array(Buffer.concat(partes))) : mal(new Error(`ffmpeg terminó con código ${codigo}`))));
  });

const cuadros = async (video: string, segundos: number[]) => {
  const out: Uint8Array[] = [];
  for (const s of segundos) out.push(await cuadroRgb(video, s));
  return out;
};

/** Qué segundos no se miden: transiciones del punto, apertura (impacto) y escenas con fotos, clips o capturas reales. */
const omitidos = (props: VideoProps): { desde: number; hasta: number; motivo: string }[] => {
  const ap = props.apertura ?? 0;
  const out = [{ desde: 0, hasta: ap / FPS, motivo: "apertura" }];
  const inicios = iniciosEscenas(props.escenas.map((e) => e.duracionFrames));
  props.escenas.forEach((e, i) => {
    const a = (ap + inicios[i]!) / FPS;
    if (i > 0) out.push({ desde: a - 0.05, hasta: a + FRAMES_TRANSICION / FPS + 0.05, motivo: "transición" });
    const foto = e.plantilla === "foto_real" && e.foto;
    if (foto || (e.plantilla === "stock_video" && e.stockSrc)) out.push({ desde: a, hasta: a + e.duracionFrames / FPS, motivo: foto ? "foto real" : "clip" });
  });
  return out;
};

/** Verificación completa. `video` = el mp4 ya renderizado (para medir los píxeles; en crudos no se mide: es video real). */
export const verificarMarca = async (kit: KitVisual, props: VideoProps | CrudoProps, video: string | null): Promise<ReporteMarca> => {
  const chequeos = [...chequeosLogo(kit), ...chequeosTexto(kit, props), ...chequeoCorrecciones(props)];
  const cuadrosRep: ReporteMarca["cuadros"] = [];
  if (video && "escenas" in props) {
    const fps = FPS;
    const total = ((props.apertura ?? 0) + props.escenas.reduce((n, e) => n + e.duracionFrames, 0) - FRAMES_TRANSICION * (props.escenas.length - 1)) / fps;
    const segundos = Array.from({ length: 24 }, (_, i) => ((i + 0.5) * total) / 24);
    const fuera = omitidos(props);
    const paleta = [kit.colores.acento, kit.colores.texto, kit.colores.fondo, kit.colores.fondo2, kit.colores.secundario, kit.colores.apoyo, kit.colores.linea];
    const medir = segundos.filter((s) => !fuera.some((o) => s >= o.desde && s <= o.hasta));
    const imgs = await cuadros(video, medir);
    for (const s of segundos) {
      const o = fuera.find((x) => s >= x.desde && s <= x.hasta);
      if (o) {
        cuadrosRep.push({ s, rojoPct: 0, fueraPct: 0, omitido: o.motivo });
        continue;
      }
      const img = imgs[medir.indexOf(s)];
      if (!img || img.length < ANCHO_MEDIDA * ALTO_MEDIDA * 3) continue;
      cuadrosRep.push({ s, ...medirCuadro(img, paleta, kit.colores.acento) });
    }
    const medidos = cuadrosRep.filter((c) => !c.omitido);
    const rojos = medidos.filter((c) => c.rojoPct > kit.reglas.acentoMaxPct);
    chequeos.push(
      rojos.length
        ? { regla: "Rojo como acento (no como fondo)", estado: "aviso", detalle: `En ${rojos.length} cuadro(s) el rojo pasa del ${kit.reglas.acentoMaxPct} % (máx. ${Math.max(...rojos.map((c) => c.rojoPct)).toFixed(0)} %).`, momento: rojos[0]!.s }
        : { regla: "Rojo como acento (no como fondo)", estado: "ok", detalle: `El rojo nunca pasa del ${kit.reglas.acentoMaxPct} % del cuadro (máx. ${Math.max(0, ...medidos.map((c) => c.rojoPct)).toFixed(1)} %), fuera de transiciones e impactos.` },
    );
    const raros = medidos.filter((c) => c.fueraPct > 4);
    chequeos.push(
      raros.length
        ? { regla: "Colores de la paleta", estado: "aviso", detalle: `En ${raros.length} cuadro(s) hay colores fuera de la paleta (hasta ${Math.max(...raros.map((c) => c.fueraPct)).toFixed(0)} % del cuadro).`, momento: raros[0]!.s }
        : { regla: "Colores de la paleta", estado: "ok", detalle: `Fuera de fotos y clips reales, todo está en la paleta (máx. ${Math.max(0, ...medidos.map((c) => c.fueraPct)).toFixed(1)} % fuera, bordes suavizados incluidos).` },
    );
  } else {
    chequeos.push({ regla: "Colores de la paleta y rojo", estado: "ok", detalle: "Video real: los colores de la persona y el lugar no se miden; las piezas de marca encima usan solo la paleta." });
  }
  return { ok: chequeos.every((c) => c.estado !== "aviso"), revisado: new Date().toISOString(), chequeos, cuadros: cuadrosRep };
};

/** Corre el verificador después de un render con kit, guarda marca-reporte.json y deja el resumen en el log. */
export const verificarYGuardar = async (t: { escribir: (a: string, d: unknown) => Promise<void>; log: (l: string, n?: "info" | "error") => Promise<void>; ruta: (...p: string[]) => string }, props: VideoProps | CrudoProps) => {
  const kit = props.marca.kit;
  if (!kit) return null;
  const r = await verificarMarca(kit, props, "escenas" in props ? t.ruta("video.mp4") : null);
  await t.escribir("marca-reporte.json", r);
  const avisos = r.chequeos.filter((c) => c.estado === "aviso");
  await t.log(r.ok ? "Marca: OK (todas las reglas del kit se cumplen)" : `Marca: ${avisos.length} aviso(s): ${avisos.map((a) => a.regla).join(", ")}`, r.ok ? "info" : "error");
  return r;
};
