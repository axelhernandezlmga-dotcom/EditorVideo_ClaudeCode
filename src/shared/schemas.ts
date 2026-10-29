import { z } from "zod";
import { CandidataImagenSchema } from "./imagenes";
import { IDS_MOODS, OpcionesCrudoSchema, UsoBibliotecaSchema } from "./opcionesCrudo";
import { IDS_TIPOGRAFIAS, PerfilSchema } from "./perfiles";
import { IDS_MODELOS_TRANSCRIPCION } from "./transcripcion";
import { IDS_FUENTES_MUSICA } from "./musica";
import { ModoEdicionSchema } from "./modos";
import { ACCIONES } from "../remotion/ilustracion/personajes/acciones";

// ---------- Marca / configuración ----------

/**
 * Proveedores de voz: de esta lista salen el esquema, el selector de Configuración y la detección por nombre de voz.
 * Agregar uno acá (y su implementación en src/pipeline/tts) alcanza para que aparezca en todos lados.
 */
export const PROVEEDORES_VOZ = [
  { id: "gemini", nombre: "Gemini TTS (Google)", detalle: "La más natural: actúa según el tono. Plan gratis con cupo diario; necesita GEMINI_API_KEY." },
  { id: "edge", nombre: "edge-tts (Microsoft)", detalle: "Gratis, sin cupo ni clave. Voces uruguayas y argentinas. Necesita internet." },
  { id: "kokoro", nombre: "Kokoro (offline)", detalle: "Corre en tu compu, sin internet. Solo voces de España." },
] as const;
export type IdProveedorVoz = (typeof PROVEEDORES_VOZ)[number]["id"];
export const IDS_PROVEEDORES_VOZ = PROVEEDORES_VOZ.map((p) => p.id) as [IdProveedorVoz, ...IdProveedorVoz[]];

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color en formato #RRGGBB");

export const MarcaSchema = z.object({
  usuario: z.string().default("@tuusuario"),
  nicho: z.string().default("Política"),
  colores: z
    .object({
      fondo: color.default("#0B1020"),
      fondo2: color.default("#1E2A5A"),
      texto: color.default("#FFFFFF"),
      acento: color.default("#FFD23F"),
      acento2: color.default("#FF4D6D"),
    })
    .prefault({}),
  tipografia: z.enum(IDS_TIPOGRAFIAS).default("Montserrat"),
  /** Perfil con el que se firman los videos si no se elige otro (slug de config/perfiles). */
  perfilPorDefecto: z.string().default(""),
  voz: z.string().default("es-UY-MateoNeural"),
  velocidad: z.string().regex(/^[+-]\d{1,3}%$/, "Ej: +8%").default("+8%"),
  /** Tono (altura) de la voz. No confundir con `tonoPorDefecto`, el estilo del guion. */
  tono: z.string().regex(/^[+-]\d{1,3}Hz$/, "Ej: +0Hz").default("+0Hz"),
  /** Estilo del guion: un archivo de prompts/tonos/<id>.md. */
  tonoPorDefecto: z.string().regex(/^[a-z0-9-]+$/).default("academico"),
  /** Subtítulos y textos en pantalla con las malas palabras censuradas ("p*lotudo"); el audio no cambia. */
  censurarSubtitulos: z.boolean().default(true),
  /** El texto de la publicación sale sin malas palabras. */
  publicacionSinPuteadas: z.boolean().default(true),
  /** Proveedor principal. Las voces de Gemini se escriben "gemini:<Nombre>" (ej. gemini:Puck). */
  proveedorVoz: z.enum(IDS_PROVEEDORES_VOZ).default("gemini"),
  /** Voz de edge-tts que se usa si Gemini no está disponible (sin clave o sin cupo del plan gratis). */
  vozRespaldo: z.string().default("es-UY-MateoNeural"),
  /** Pedidos por día que se estiman para el plan gratis de Gemini TTS (Google no lo publica). Si llega un 429 diario, manda el número real. */
  limiteDiarioGemini: z.number().int().min(1).max(100000).default(10),
  duracionMin: z.number().int().min(10).max(120).default(30),
  duracionMax: z.number().int().min(15).max(180).default(55),
  modeloClaude: z.string().default("sonnet"),
  modoAutomatico: z.boolean().default(false),
  musica: z.boolean().default(true),
  volumenMusica: z.number().min(0).max(1).default(0.1),
  /** De dónde sale la música automática: la incluida, la de la Biblioteca o las dos. */
  fuenteMusica: z.enum(IDS_FUENTES_MUSICA).default("todas"),
  sfx: z.boolean().default(true),
  paginaSubtitulosMs: z.number().int().min(300).max(4000).default(1200),
  escenaLibre: z.boolean().default(false),
  redLocal: z.boolean().default(false),
  puerto: z.number().int().min(1).max(65535).default(3000),
  /** Ajustes de "Editar crudo". */
  crudo: z
    .object({
      /** Las pausas más largas que esto (segundos) se cortan. */
      pausaMaxS: z.number().min(0.1).max(3).default(0.35),
      /** Aire que se deja a cada lado de un corte (ms) para que no suene cortado. */
      margenMs: z.number().int().min(0).max(400).default(80),
      /** Zoom de los tramos impares (1.1 = 110 %) para disimular el salto de cada corte. */
      zoomAlternado: z.number().min(1).max(1.4).default(1.1),
      /** Volumen de los efectos respecto de la voz (0–1). 0,35 ≈ 11 dB por debajo de la voz. */
      volumenSfx: z.number().min(0).max(1).default(0.35),
      /** Motor para transcribir crudos: faster-whisper (rápido, int8) o whisper.cpp (respaldo). */
      motorTranscripcion: z.enum(["faster-whisper", "whisper.cpp"]).default("faster-whisper"),
      /** Modelo de whisper para transcribir crudos (ver src/shared/transcripcion.ts). */
      modeloWhisper: z.enum(IDS_MODELOS_TRANSCRIPCION).default("medium"),
      /** Hilos de CPU para transcribir. En CPUs con núcleos de eficiencia, más hilos puede ser MÁS lento (medido: 4 > 8 > 12). */
      hilosTranscripcion: z.number().int().min(1).max(64).default(4),
      /** Modelos de más de 500 MB que ya aprobaste bajar (se pregunta una sola vez por modelo). */
      modelosAprobados: z.array(z.enum(IDS_MODELOS_TRANSCRIPCION)).default([]),
    })
    .prefault({}),
});
export type Marca = z.infer<typeof MarcaSchema>;

// ---------- Props de cada plantilla ----------

/** Composiciones de una foto real (modo "Normal con imágenes" sobre todo). */
export const MARCOS_FOTO = ["completa", "polaroid", "circulo", "postit", "collage", "ventana"] as const;
export type MarcoFoto = (typeof MARCOS_FOTO)[number];

const texto = (max: number) => z.string().min(1).max(max);

export const PropsPorPlantilla = {
  titular: z.object({
    texto: texto(90).describe("Titular corto, 3 a 10 palabras"),
    subtitulo: texto(90).optional(),
  }),
  dato_numero: z.object({
    numero: z.number().describe("Número a animar (sin separadores), ej. 1500"),
    decimales: z.number().int().min(0).max(2).optional(),
    prefijo: z.string().max(4).optional().describe("Ej: $, US$, ~"),
    unidad: z.string().max(24).optional().describe("Ej: %, millones, km"),
    contexto: texto(90).describe("Qué significa el número, 3 a 12 palabras"),
  }),
  lista: z.object({
    titulo: texto(60).optional(),
    items: z
      .array(
        z.union([
          texto(48),
          z.object({
            texto: texto(48),
            icono: z.string().max(40).optional().describe("Emoji o ícono Lucide en kebab-case que ilustre el ítem"),
          }),
        ]),
      )
      .min(2)
      .max(5),
  }),
  comparacion: z.object({
    titulo: texto(60).optional(),
    a: z.object({ etiqueta: texto(28), valor: z.number().optional(), texto: texto(48).optional() }),
    b: z.object({ etiqueta: texto(28), valor: z.number().optional(), texto: texto(48).optional() }),
    unidad: z.string().max(16).optional(),
    ganador: z.enum(["a", "b"]).optional().describe("Lado a resaltar; si hay valores y no se indica, gana el mayor"),
  }),
  cita: z.object({
    texto: texto(160).describe("Cita textual verificada en una fuente"),
    autor: texto(60),
    fecha: z.string().max(30).optional(),
  }),
  linea_tiempo: z.object({
    titulo: texto(60).optional(),
    eventos: z.array(z.object({ fecha: texto(16), texto: texto(60) })).min(2).max(5),
  }),
  grafico: z.object({
    tipo: z.enum(["barras", "torta", "lineas"]).describe("barras: comparar categorías; torta: partes de un total; lineas: una evolución en el tiempo (etiquetas = fechas en orden)"),
    titulo: texto(60).optional(),
    unidad: z.string().max(16).optional(),
    datos: z.array(z.object({ etiqueta: texto(24), valor: z.number().min(0) })).min(2).max(6),
  }),
  mapa: z.object({
    pais: z.string().length(3).describe("Código ISO 3166-1 alfa-3 en mayúsculas, ej. URY, ARG, USA"),
    etiqueta: texto(40).optional(),
    dato: texto(60).optional(),
    zonas: z
      .array(texto(40))
      .max(24)
      .optional()
      .describe("Departamentos/provincias/estados a colorear, con su nombre oficial (ej. Montevideo, Canelones)"),
  }),
  icono_texto: z.object({
    icono: z.string().min(1).max(40).describe("Un emoji, o nombre de ícono Lucide en kebab-case (ej. landmark, vote, scale)"),
    texto: texto(90),
    subtitulo: texto(90).optional(),
  }),
  stock_video: z.object({
    texto: texto(90),
    subtitulo: texto(90).optional(),
  }),
  cierre_cta: z.object({
    remate: texto(90),
    pregunta: texto(90).optional(),
  }),
  foto_real: z.object({
    texto: texto(60).describe("Nombre de lo que se ve: persona y cargo, institución o lugar"),
    dato: texto(90).optional().describe("Dato corto que acompaña (va también en la tarjeta si no hay foto)"),
    que_debe_verse: texto(200).describe("Qué tiene que mostrar EXACTAMENTE la foto (se verifica mirándola)"),
    imagenes: z.array(CandidataImagenSchema).max(4).default([]).describe("Fotos reales candidatas en orden: noticia, oficial, wikimedia, prensa"),
    marco: z
      .enum(MARCOS_FOTO)
      .optional()
      .describe("Cómo se compone la foto: completa (pantalla entera), polaroid, circulo (retrato con el nombre al lado), postit (foto + nota con el dato), collage (2 o 3 fotos), ventana (recuadro sobre el fondo de la marca)"),
  }),
  clip_biblioteca: z.object({
    clip: z.string().min(4).max(40).describe("id de un clip de la lista «Clips de la biblioteca» del pedido"),
    texto: z.string().max(60).optional().describe("título corto opcional sobre el clip (no en memes o reacciones)"),
  }),
  escena_ilustrada: z.object({
    escenario: z.string().min(2).max(40).describe("id de un escenario del catálogo de ilustración"),
    personajes: z
      .array(
        z.object({
          id: z.string().min(2).max(40).describe("id de un personaje del catálogo, o \"narrador\""),
          lugar: z.enum(["izquierda", "centro", "derecha"]),
          accion: z.enum(ACCIONES).describe("acción con la que arranca"),
          mira: z.enum(["izquierda", "derecha"]).optional(),
          habla: z.boolean().optional().describe("true solo para quien dice la narración (mueve la boca con la voz)"),
          entra: z.enum(["izquierda", "derecha"]).optional().describe("entra caminando desde ese lado"),
        }),
      )
      .max(3)
      .default([]),
    objetos: z
      .array(
        z.object({
          id: z.string().min(2).max(40).describe("id de un objeto del catálogo (o uno nuevo en snake_case: la app lo dibuja)"),
          lugar: z.enum(["izquierda", "centro", "derecha", "arriba"]),
          accion: z.string().max(30).default("entrar").describe("acción genérica (entrar, caer, flotar, rebotar, latir, volar, temblar, girar) o una propia del objeto"),
          tam: z.enum(["chico", "normal", "grande"]).default("normal"),
          cantidad: z.number().int().min(1).max(8).default(1).describe("más de 1 = lluvia o pila del mismo objeto"),
        }),
      )
      .max(4)
      .default([]),
    camara: z.enum(["fija", "paneo", "zoom_in", "zoom_out", "parallax"]).default("parallax"),
    beats: z
      .array(
        z.object({
          palabra: z.string().min(1).max(30).describe("palabra EXACTA de la narración de esta escena donde pasa el cambio"),
          personaje: z.number().int().min(0).max(2).optional(),
          accion: z.enum(ACCIONES).optional(),
          objeto: z.number().int().min(0).max(3).optional(),
          accion_objeto: z.string().max(30).optional(),
          efecto: z.string().max(30).optional().describe("id de un efecto del catálogo"),
          efecto_sobre: z.number().int().min(-1).max(2).optional().describe("índice del personaje sobre el que aparece (-1 = centro)"),
          camara: z.enum(["acercar", "alejar", "izquierda", "derecha"]).optional(),
        }),
      )
      .max(8)
      .default([]),
    texto: texto(60).optional().describe("título corto opcional arriba, 3 a 7 palabras"),
  }),
} as const;

export type NombrePlantilla = keyof typeof PropsPorPlantilla;
export const NOMBRES_PLANTILLAS = Object.keys(PropsPorPlantilla) as NombrePlantilla[];

/** Bloques de la línea editorial Hechos → Contexto → Opinión (las etiquetas del manual: DATO, FUENTE, CONTEXTO, OPINIÓN). */
export const BLOQUES_EDITORIALES = ["dato", "fuente", "contexto", "opinion"] as const;
export const ETIQUETA_BLOQUE: Record<(typeof BLOQUES_EDITORIALES)[number], string> = { dato: "DATO", fuente: "FUENTE", contexto: "CONTEXTO", opinion: "OPINIÓN" };

const comunesEscena = {
  bloque: z
    .enum(BLOQUES_EDITORIALES)
    .optional()
    .describe("Solo con línea editorial: a qué bloque pertenece la escena (dato o fuente = hechos; contexto; opinion = la del creador)"),
  narracion: z.string().min(1).max(400).describe("Lo que dice la voz en esta escena"),
  palabras_clave_stock: z.array(z.string()).max(5).default([]).describe("En inglés, para buscar videos en Pexels"),
  palabras_enfasis: z.array(z.string()).max(6).default([]).describe("Palabras de la narración a resaltar"),
  emoji_o_icono: z.string().max(40).optional(),
};

export const EscenaSchema = z.discriminatedUnion("plantilla", [
  z.object({ plantilla: z.literal("titular"), props: PropsPorPlantilla.titular, ...comunesEscena }),
  z.object({ plantilla: z.literal("dato_numero"), props: PropsPorPlantilla.dato_numero, ...comunesEscena }),
  z.object({ plantilla: z.literal("lista"), props: PropsPorPlantilla.lista, ...comunesEscena }),
  z.object({ plantilla: z.literal("comparacion"), props: PropsPorPlantilla.comparacion, ...comunesEscena }),
  z.object({ plantilla: z.literal("cita"), props: PropsPorPlantilla.cita, ...comunesEscena }),
  z.object({ plantilla: z.literal("linea_tiempo"), props: PropsPorPlantilla.linea_tiempo, ...comunesEscena }),
  z.object({ plantilla: z.literal("grafico"), props: PropsPorPlantilla.grafico, ...comunesEscena }),
  z.object({ plantilla: z.literal("mapa"), props: PropsPorPlantilla.mapa, ...comunesEscena }),
  z.object({ plantilla: z.literal("icono_texto"), props: PropsPorPlantilla.icono_texto, ...comunesEscena }),
  z.object({ plantilla: z.literal("stock_video"), props: PropsPorPlantilla.stock_video, ...comunesEscena }),
  z.object({ plantilla: z.literal("cierre_cta"), props: PropsPorPlantilla.cierre_cta, ...comunesEscena }),
  z.object({ plantilla: z.literal("foto_real"), props: PropsPorPlantilla.foto_real, ...comunesEscena }),
  z.object({ plantilla: z.literal("escena_ilustrada"), props: PropsPorPlantilla.escena_ilustrada, ...comunesEscena }),
  z.object({ plantilla: z.literal("clip_biblioteca"), props: PropsPorPlantilla.clip_biblioteca, ...comunesEscena }),
]);
export type Escena = z.infer<typeof EscenaSchema>;
/** Respuesta de "Regenerar escena": envuelta en un objeto para `claude -p --json-schema`. */
export const RespuestaEscenaSchema = z.object({ escena: EscenaSchema });

export const FuenteSchema = z.object({ titulo: z.string().min(1), url: z.string().url() });

export const MAX_TITULARES = 2;

// ---------- Tonos ----------

export const ANIMACIONES = ["tranquila", "normal", "rebote"] as const;

/** Un tono = prompts/tonos/<id>.md (frontmatter con los ajustes + instrucciones para el guionista). */
export const TonoSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones").min(2).max(40),
  nombre: z.string().trim().min(1).max(40),
  descripcion: z.string().trim().max(200).default(""),
  /** Velocidad de la voz para este tono; vacía = la de la configuración. */
  velocidad: z.string().regex(/^[+-]\d{1,3}%$/, "Ej: +8%").optional(),
  /** Colores de acento para este tono; vacíos = los de la marca. */
  acento: color.optional(),
  acento2: color.optional(),
  animacion: z.enum(ANIMACIONES).default("normal"),
  /** Notas de dirección para la voz de Gemini (actitud, acento, ritmo). Edge y Kokoro las ignoran. */
  estiloVoz: z.string().trim().max(500).optional(),
  /** Otros tonos cuyas reglas se suman (se escriben con su id). */
  incluye: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(5).default([]),
  instrucciones: z.string().trim().min(1, "Escribí las instrucciones del tono"),
});
export type Tono = z.infer<typeof TonoSchema>;

export const GuionSchema = z
  .object({
  titulo: z.string().min(1).max(120),
  gancho: z.string().min(1).max(120).describe("Primera frase, máximo 12 palabras"),
  // los cinco del final son los nombres viejos (guiones anteriores); se traducen con moodDeGuion
  mood: z
    .enum([...IDS_MOODS, "tenso", "epico", "curioso", "alegre", "neutro"])
    .default("chill")
    .describe("Ánimo de la música de fondo: feliz, triste, epica, tension, misterio, motivacional, chill o comica"),
  escenas: z.array(EscenaSchema).min(3).max(10),
  texto_publicacion: z.string().min(1).max(2200),
  titulo_portada: z.string().min(1).max(60),
  fuentes: z.array(FuenteSchema).min(1),
  referencia_gancho: z
    .object({ referencia: z.string().min(1).max(200), fuente: FuenteSchema })
    .optional()
    .describe("Solo si el gancho usa una referencia viral o del momento: qué es y de dónde salió"),
  })
  .superRefine((g, ctx) => {
    const titulares = g.escenas.filter((e) => e.plantilla === "titular").length;
    if (titulares > MAX_TITULARES) {
      ctx.addIssue({
        code: "custom",
        path: ["escenas"],
        message: `Hay ${titulares} escenas "titular" y el máximo es ${MAX_TITULARES}: usá plantillas visuales (dato_numero, lista, comparacion, linea_tiempo, grafico, mapa, icono_texto, cita).`,
      });
    }
  });
export type Guion = z.infer<typeof GuionSchema>;

export const IdeaSchema = z.object({
  titulo: z.string(),
  gancho: z.string(),
  por_que: z.string(),
});
export const IdeasSchema = z.object({ ideas: z.array(IdeaSchema).min(1).max(15) });
export type Idea = z.infer<typeof IdeaSchema>;

// ---------- Captions (formato @remotion/captions) ----------

export const CaptionSchema = z.object({
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  timestampMs: z.number().nullable(),
  confidence: z.number().nullable(),
});
export const CaptionsSchema = z.array(CaptionSchema);

/** Resultado del paso de voz para una escena. */
export const AudioEscenaSchema = z.object({
  archivo: z.string(), // relativo a la carpeta del trabajo
  duracionMs: z.number().positive(),
  captions: CaptionsSchema, // relativos al inicio de la escena
  /** tts = los dio la voz; whisper = whisper.cpp; proporcional = estimados (whisper falló). */
  origenTiempos: z.enum(["tts", "whisper", "proporcional"]),
});
export const VozSchema = z.object({
  voz: z.string(),
  proveedor: z.enum(IDS_PROVEEDORES_VOZ).optional(),
  /** Gemini: hash de la narración completa (si no cambió, se reutiliza el audio). */
  hash: z.string().optional(),
  velocidad: z.string(),
  tono: z.string(),
  escenas: z.array(AudioEscenaSchema),
  /** Si salió con la voz de respaldo: qué voz se pidió y por qué no se usó. */
  respaldo: z.object({ vozPedida: z.string(), motivo: z.string() }).optional(),
  /** "Mi voz": la grabaste vos; estas escenas del guion no las dijiste y salen del video. */
  propia: z.object({ salteadas: z.array(z.number().int().min(0)) }).optional(),
});
export type Voz = z.infer<typeof VozSchema>;

// ---------- Estado del trabajo ----------

export const PASOS = ["guion", "revision", "voz", "visuales", "render", "entrega"] as const;
/** Pasos de "Editar crudo": el video lo grabaste vos, la app lo limpia, lo corta y lo viste. */
export const PASOS_CRUDO = ["subida", "limpieza", "transcripcion", "cortes", "material", "sfx", "revision", "render", "entrega"] as const;
/**
 * Pasos de "Mi voz": el guion lo escribe la app, la voz la grabás vos. Se espera la grabación, se limpia,
 * se transcribe y se corta con el motor de crudos, se revisan los cortes y se arma la voz por escena.
 */
export const PASOS_MI_VOZ = ["guion", "revision", "grabacion", "limpieza", "transcripcion", "cortes", "revision_voz", "voz", "visuales", "render", "entrega"] as const;
export const TODOS_LOS_PASOS = [...new Set([...PASOS, ...PASOS_CRUDO, ...PASOS_MI_VOZ])] as [Paso, ...Paso[]];
export type Paso = (typeof PASOS)[number] | (typeof PASOS_CRUDO)[number] | (typeof PASOS_MI_VOZ)[number];
export const TIPOS_TRABAJO = ["idea", "crudo"] as const;
export type TipoTrabajo = (typeof TIPOS_TRABAJO)[number];
/** Estilo de ilustración de un video: el elegido, o el que corresponde al tono ("auto"). */
export const estiloIlustracionDe = (elegido: string | undefined, tono: string | undefined): "plano" | "cartoon" | "documental" => {
  if (elegido === "plano" || elegido === "cartoon" || elegido === "documental") return elegido;
  if (tono === "academico") return "documental";
  return "plano";
};

/** Tonos que se sacaron de la app (v8): los trabajos y la configuración que los tenían pasan a Académico. */
export const TONOS_RETIRADOS = ["puteador", "gancho-random", "random-puteador"];
export const TONO_POR_DEFECTO = "academico";
export const migrarTono = (t: unknown) => (typeof t === "string" && TONOS_RETIRADOS.includes(t) ? TONO_POR_DEFECTO : t);

/** Cómo se hace la voz de un video animado: la IA, o la grabás vos. */
export const MODOS_VOZ = ["ia", "mi_voz"] as const;
export type ModoVoz = (typeof MODOS_VOZ)[number];
export const pasosDe = (tipo: TipoTrabajo, modo?: ModoVoz): readonly Paso[] => (tipo === "crudo" ? PASOS_CRUDO : modo === "mi_voz" ? PASOS_MI_VOZ : PASOS);
export const EstadoPasoSchema = z.enum(["pendiente", "en_curso", "hecho", "error", "salteado"]);

export const EstadoSchema = z.object({
  id: z.string(),
  /** "idea" = video desde una idea (guion + voz); "crudo" = video grabado que se edita. Los trabajos viejos no lo tienen. */
  tipo: z.enum(TIPOS_TRABAJO).default("idea"),
  idea: z.string(),
  creado: z.string(),
  actualizado: z.string(),
  /** esperando_voz = "Mi voz": guion listo, falta que grabes o subas el audio (queda así aunque cierres la app). */
  estado: z.enum(["en_cola", "trabajando", "esperando_revision", "esperando_voz", "pausado", "listo", "error", "cancelado"]),
  pasos: z.partialRecord(z.enum(TODOS_LOS_PASOS), EstadoPasoSchema),
  opciones: z.object({
    voz: z.string().optional(),
    auto: z.boolean().optional(),
    /** Tono del guion (id de prompts/tonos); si falta, el de la configuración. Los retirados pasan a Académico. */
    tono: z.preprocess(migrarTono, z.string().regex(/^[a-z0-9-]+$/).optional()),
    /** Indicaciones extra para "Regenerar guion". */
    instruccion: z.string().max(500).optional(),
    /** Crudo: nombre del archivo que subiste. */
    archivo: z.string().max(260).optional(),
    /** Animados con línea editorial: la opinión del creador (si falta, el video no tiene bloque OPINIÓN). */
    opinion: z.string().trim().max(800).optional(),
    /** Animados: voz de la IA (por defecto) o la tuya. */
    modo: z.enum(MODOS_VOZ).optional(),
    /** Animados: estilo de las escenas ilustradas ("auto" = según el tono). */
    estiloIlustracion: z.enum(["auto", "plano", "cartoon", "documental"]).optional(),
    /** Animados: cuánta ilustración lleva el video. */
    cantidadIlustracion: z.enum(["poca", "media", "mucha"]).optional(),
    /** Modo de edición (normal, gráficos, situacional, imágenes); si falta, normal. En los crudos va en `crudo.modo`. */
    modoEdicion: ModoEdicionSchema.optional(),
    /** Animados: clips de la biblioteca que se pueden usar (si falta, ninguno). */
    biblioteca: UsoBibliotecaSchema.optional(),
    /** Animados: placa final "Seguir" (si falta, sí). */
    cierre: z.boolean().optional(),
    /** Perfil con el que se firma el video (slug de config/perfiles); si falta, el de la configuración. */
    perfil: z.string().regex(/^[a-z0-9-]+$/).optional(),
    /** Crudo: lo elegido en el formulario de subida (música, clips, cortes, intensidad…). */
    crudo: OpcionesCrudoSchema.optional(),
    /** Crudo: modelo de whisper para este trabajo (si falta, el de la configuración). */
    modeloWhisper: z.enum(IDS_MODELOS_TRANSCRIPCION).optional(),
  }),
  /** Crudo en pausa porque hay que bajar un modelo grande: espera tu OK (puede gastar datos del celular). */
  descargaPendiente: z.object({ modelo: z.enum(IDS_MODELOS_TRANSCRIPCION), mb: z.number() }).optional(),
  /**
   * Copia del perfil con el que se firmó (y su foto en la carpeta del trabajo): si después lo borrás de
   * Perfiles, el video sigue saliendo igual.
   */
  perfilCopia: PerfilSchema.extend({ fotoCopia: z.string().nullable().default(null) }).optional(),
  /** Inicio y fin (ISO) de cada paso, para mostrar cuánto tardó. */
  tiempos: z.partialRecord(z.enum(TODOS_LOS_PASOS), z.object({ inicio: z.string().optional(), fin: z.string().optional() })).optional(),
  error: z.string().optional(),
  /** Quitado de la lista sin borrar archivos (se puede recuperar). */
  oculto: z.boolean().optional(),
  /** Se borraron los temporales y quedó solo el video final, la portada y las fuentes. */
  soloFinal: z.boolean().optional(),
  progresoRender: z.number().min(0).max(1).optional(),
});
export type Estado = z.infer<typeof EstadoSchema>;
