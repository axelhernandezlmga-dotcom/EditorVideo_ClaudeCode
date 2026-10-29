import { z } from "zod";
import { aEditadoCercano, type Tramo } from "./cortes";
import type { MaterialRender } from "./crudo";
import { CandidataImagenSchema, ORIGENES_IMAGEN } from "./imagenes";
import { MARCOS_FOTO, PropsPorPlantilla } from "./schemas";

/**
 * Material en pantalla de un crudo: noticias capturadas, datos con plantilla y fotos.
 * Los tiempos van en ms del ORIGINAL: así siguen en su lugar aunque cambies los cortes.
 */

export const TIPOS_MATERIAL = ["noticia", "dato", "persona", "lugar", "concepto", "clip", "escena"] as const;
/** Plantillas animadas que puede usar un dato (o una escena) sobre el crudo. */
export const PLANTILLAS_MATERIAL = ["dato_numero", "grafico", "comparacion", "linea_tiempo", "mapa", "escena_ilustrada"] as const;
export type PlantillaMaterial = (typeof PLANTILLAS_MATERIAL)[number];
export type TipoMaterial = (typeof TIPOS_MATERIAL)[number];

const fuente = z.object({ titulo: z.string().min(1), url: z.string().url() });

export { CandidataImagenSchema, ORIGENES_IMAGEN, type CandidataImagen, type OrigenImagen } from "./imagenes";

// ---------- lo que devuelve claude -p (objeto plano: el esquema tiene que poder ir a --json-schema) ----------

export const DeteccionSchema = z.object({
  items: z
    .array(
      z.object({
        tipo: z.enum(["noticia", "dato", "persona", "lugar", "concepto", "escena"]),
        palabra_inicio: z.number().int().min(0).describe("Número de la primera palabra donde se menciona"),
        palabra_fin: z.number().int().min(0).describe("Número de la última palabra de la mención"),
        frase: z.string().min(1).max(300).describe("Lo que dice la persona, textual"),
        // noticia
        url: z.string().url().optional().describe("noticia: URL de la nota en el medio"),
        titulo: z.string().max(220).optional().describe("noticia: titular tal como aparece en la nota"),
        medio: z.string().max(60).optional().describe("noticia: nombre del medio, ej. El Observador"),
        fecha: z.string().max(10).optional().describe("noticia: fecha de publicación YYYY-MM-DD"),
        resaltado: z.string().max(140).optional().describe("noticia: frase corta del titular o la bajada (copiada textual) que conviene resaltar"),
        // dato
        dato_numero: PropsPorPlantilla.dato_numero.optional().describe("dato: un solo número"),
        grafico: PropsPorPlantilla.grafico.optional().describe("dato: varias cifras comparables (barras), partes de un total (torta) o una evolución (lineas)"),
        comparacion: PropsPorPlantilla.comparacion.optional().describe("dato: A contra B"),
        linea_tiempo: PropsPorPlantilla.linea_tiempo.optional().describe("dato: fechas o etapas en orden"),
        mapa: PropsPorPlantilla.mapa.optional().describe("dato: un país o departamentos"),
        // escena (modo Animación situacional)
        escena_ilustrada: PropsPorPlantilla.escena_ilustrada.optional().describe("escena: la situación actuada por personajes del catálogo"),
        fuente: fuente.optional().describe("dato o noticia: de dónde sale"),
        // persona / lugar / concepto
        busqueda: z.string().max(80).optional().describe("persona o lugar: nombre exacto para buscar en Wikipedia; concepto: 2 a 4 palabras en inglés para Pixabay"),
        etiqueta: z.string().max(60).optional().describe("persona o lugar: texto corto que acompaña la foto (nombre y cargo)"),
        que_debe_verse: z.string().max(200).optional().describe("persona o lugar: qué tiene que mostrar EXACTAMENTE la imagen (para verificarla)"),
        imagenes: z.array(CandidataImagenSchema).max(4).optional().describe("persona o lugar: imágenes reales candidatas, en orden de prioridad"),
        dato_tarjeta: z.string().max(90).optional().describe("persona o lugar: dato corto para la tarjeta de texto si no hay imagen real"),
        marco: z.enum(MARCOS_FOTO).optional().describe("persona, lugar o concepto: composición de la imagen (completa = pantalla entera; circulo, polaroid, postit o ventana = en una esquina de arriba)"),
        // verificación
        coincide: z.boolean().describe("¿Lo que dice la persona coincide con la fuente?"),
        discrepancia: z.string().max(300).optional().describe("Si no coincide: qué dice la fuente y en qué difiere"),
      }),
    )
    .max(14),
});
export type Deteccion = z.infer<typeof DeteccionSchema>["items"][number];

// ---------- material.json ----------

export const ESTADOS_MATERIAL = ["listo", "pendiente", "quitado"] as const;

/** Rectángulos (0–1, relativos a la captura) de la frase a resaltar. */
const RectSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });

export const ItemMaterialSchema = z.object({
  id: z.string(),
  tipo: z.enum(TIPOS_MATERIAL),
  frase: z.string(),
  /** Mención en el original (ms). */
  origenMs: z.number(),
  origenFinMs: z.number(),
  estado: z.enum(ESTADOS_MATERIAL),
  /** Por qué quedó pendiente (muro de pago, bloqueo, no se encontró foto…). */
  motivo: z.string().optional(),
  /** Aviso rojo: lo que se dice no coincide con la fuente (el video no se corrige). */
  discrepancia: z.string().optional(),
  noticia: z
    .object({
      url: z.string().url(),
      titulo: z.string(),
      medio: z.string(),
      fecha: z.string().nullable(),
      resaltado: z.string().nullable(),
      /** Captura del titular + bajada, relativa a la carpeta del trabajo. */
      captura: z.string().nullable(),
      rects: z.array(RectSchema).default([]),
      ancho: z.number().optional(),
      alto: z.number().optional(),
      /** "chrome" = la va a capturar la skill /capturar-noticias con tu Chrome; "subida" = la subiste vos. */
      origen: z.enum(["playwright", "chrome", "subida"]).optional(),
      pedirChrome: z.boolean().default(false),
    })
    .optional(),
  dato: z
    .object({
      plantilla: z.enum(PLANTILLAS_MATERIAL),
      props: z.record(z.string(), z.unknown()),
      fuente: fuente.nullable(),
    })
    .optional(),
  imagen: z
    .object({
      busqueda: z.string(),
      archivo: z.string().nullable(),
      etiqueta: z.string().nullable(),
      credito: z.string().nullable(),
      licencia: z.string().nullable(),
      paginaFuente: z.string().nullable(),
      proveedor: z.enum(["wikimedia", "pixabay"]).nullable(),
      /** De dónde salió (los viejos no lo tienen). */
      origen: z.enum(ORIGENES_IMAGEN).nullable().default(null),
      /** Qué tiene que mostrar, y qué dijo la verificación visual. */
      queDebeVerse: z.string().nullable().default(null),
      verificacion: z.string().nullable().default(null),
      candidatas: z.array(CandidataImagenSchema).default([]),
      /** Composición (modo "Normal con imágenes"): completa o en un marco que no tapa a la persona. */
      marco: z.enum(MARCOS_FOTO).optional(),
    })
    .optional(),
  /** Tarjeta de texto animada: va cuando no hay una imagen real verificada (nunca una equivocada). */
  tarjeta: z.object({ titulo: z.string(), texto: z.string().nullable() }).optional(),
  /** Clip propio (Mis clips): el tramo ya cortado a 9:16 y sin audio, dentro del trabajo. */
  clip: z
    .object({
      id: z.string(),
      ruta: z.string(),
      nombre: z.string(),
      desdeS: z.number(),
      duracionS: z.number(),
      archivo: z.string(),
      motivo: z.string(),
      /** Suena con su audio original (la voz y la música bajan mientras tanto). */
      conAudio: z.boolean().default(false),
    })
    .optional(),
});
export type ItemMaterial = z.infer<typeof ItemMaterialSchema>;

export const MaterialSchema = z.object({ items: z.array(ItemMaterialSchema) });
export type Material = z.infer<typeof MaterialSchema>;

/** Cuánto se ve cada cosa en pantalla (ms del video cortado). */
export const DURACION_MATERIAL = { min: 2600, max: 4500 } as const;
/** Una escena ilustrada se deja un poco más (tiene que contar una situación). */
const MAX_ESCENA_MS = 6500;

/**
 * Material en la línea de tiempo del video cortado: arranca cuando se menciona y dura lo que dura la mención
 * (entre 2,6 y 4,5 s). Si se pisa con el anterior, arranca cuando termina ese; si queda muy corto, no va.
 */
export const materialEnPantalla = (items: ItemMaterial[], tramos: Tramo[], url: (rel: string) => string): MaterialRender[] => {
  const out: MaterialRender[] = [];
  let libreDesde = 0;
  for (const it of [...items].sort((a, b) => a.origenMs - b.origenMs)) {
    if (it.estado !== "listo") continue;
    const ini = aEditadoCercano(tramos, it.origenMs);
    const fin = aEditadoCercano(tramos, it.origenFinMs);
    const desdeMs = Math.max(ini, libreDesde);
    // un clip dura lo que dura su tramo (2 a 5 s); lo demás, lo que dura la mención
    const maximo = it.tipo === "escena" ? MAX_ESCENA_MS : DURACION_MATERIAL.max;
    const hastaMs = it.clip ? desdeMs + it.clip.duracionS * 1000 : Math.max(desdeMs, ini + Math.min(maximo, Math.max(DURACION_MATERIAL.min, fin - ini + 800)));
    if (hastaMs - desdeMs < 1500) continue;
    const base = { desdeMs, hastaMs };
    if (it.tipo === "noticia" && it.noticia?.captura) {
      out.push({ ...base, tipo: "noticia", imagen: url(it.noticia.captura), medio: it.noticia.medio, fecha: it.noticia.fecha, titulo: it.noticia.titulo, resaltado: it.noticia.resaltado, rects: it.noticia.rects, proporcion: it.noticia.ancho && it.noticia.alto ? it.noticia.ancho / it.noticia.alto : null });
    } else if ((it.tipo === "dato" || it.tipo === "escena") && it.dato) {
      out.push({ ...base, tipo: "plantilla", plantilla: it.dato.plantilla, props: it.dato.props });
    } else if (it.tipo === "clip" && it.clip) {
      out.push({ ...base, tipo: "clip", video: url(it.clip.archivo), conAudio: it.clip.conAudio });
    } else if (it.imagen?.archivo) {
      out.push({ ...base, tipo: "imagen", imagen: url(it.imagen.archivo), credito: it.imagen.credito, etiqueta: it.imagen.etiqueta, marco: it.imagen.marco ?? "completa" });
    } else if (it.tarjeta) {
      out.push({ ...base, tipo: "tarjeta", titulo: it.tarjeta.titulo, texto: it.tarjeta.texto });
    } else continue;
    libreDesde = hastaMs + 300;
  }
  return out;
};
