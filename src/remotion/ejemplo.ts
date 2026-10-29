import type { Caption } from "@remotion/captions";
import { duracionEscenaFrames, type EscenaRender, type MarcaVisual, type PortadaProps, type VideoProps } from "../shared/render";
import type { CrudoProps } from "../shared/crudo";
import type { Escena } from "../shared/schemas";

/** Datos de ejemplo escritos a mano: sirven para el Studio y para probar plantillas sin voz real. */

export const marcaEjemplo: MarcaVisual = {
  usuario: "@tuusuario",
  tipografia: "Montserrat",
  colores: { fondo: "#0B1020", fondo2: "#1E2A5A", texto: "#FFFFFF", acento: "#FFD23F", acento2: "#FF4D6D" },
};

/** Tiempos de palabra simulados (≈ 330 ms por palabra) para cuando no hay audio. */
export const captionsSimulados = (narracion: string, msPorPalabra = 330): Caption[] =>
  narracion
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => ({
      text: i === 0 ? w : ` ${w}`,
      startMs: 200 + i * msPorPalabra,
      endMs: 200 + (i + 1) * msPorPalabra - 30,
      timestampMs: 200 + i * msPorPalabra + msPorPalabra / 2,
      confidence: null,
    }));

export const aRender = (e: Escena): EscenaRender => {
  const captions = captionsSimulados(e.narracion);
  const fin = captions.at(-1)?.endMs ?? 1000;
  return { ...e, captions, audioSrc: null, duracionFrames: duracionEscenaFrames(fin) };
};

const comun = { palabras_clave_stock: [], emoji_o_icono: undefined };

/** Una escena de muestra por plantilla (y variantes), para el Studio, la vista previa y `npm run plantillas`. */
export const escenasDemo: Record<string, Escena> = {
  titular: {
    plantilla: "titular",
    narracion: "¿Qué pasa en Uruguay si ningún candidato llega a la mitad de los votos?",
    props: { texto: "¿Y si nadie llega a la mitad?", subtitulo: "Así funciona el balotaje" },
    palabras_enfasis: ["mitad"],
    ...comun,
    emoji_o_icono: "circle-help",
  },
  dato_numero: {
    plantilla: "dato_numero",
    narracion: "En la primera vuelta, Yamandú Orsi sacó cuarenta y tres coma nueve por ciento. No le alcanzó.",
    props: { numero: 43.9, decimales: 1, unidad: "%", contexto: "Orsi en la primera vuelta de 2024" },
    palabras_enfasis: ["alcanzó"],
    ...comun,
  },
  lista: {
    plantilla: "lista",
    narracion: "Para votar necesitás tres cosas: tu credencial cívica, ir a tu circuito y meter la hoja de votación en el sobre.",
    props: {
      titulo: "Para votar",
      items: [
        { texto: "Credencial cívica", icono: "id-card" },
        { texto: "Tu circuito", icono: "map-pin" },
        { texto: "Hoja de votación en el sobre", icono: "mail" },
      ],
    },
    palabras_enfasis: ["credencial"],
    ...comun,
  },
  comparacion: {
    plantilla: "comparacion",
    narracion: "En el balotaje, Orsi obtuvo casi cincuenta por ciento y Delgado, casi cuarenta y seis.",
    props: { titulo: "Balotaje 2024", a: { etiqueta: "Orsi", valor: 49.84 }, b: { etiqueta: "Delgado", valor: 45.87 }, unidad: "%" },
    palabras_enfasis: ["Orsi"],
    ...comun,
  },
  cita: {
    plantilla: "cita",
    narracion: "La Constitución lo dice clarito: serán elegidos conjunta y directamente por el Cuerpo Electoral, por mayoría absoluta de votantes.",
    props: {
      texto: "Serán elegidos conjunta y directamente por el Cuerpo Electoral, por mayoría absoluta de votantes.",
      autor: "Constitución de Uruguay",
      fecha: "Artículo 151",
    },
    palabras_enfasis: ["mayoría", "absoluta"],
    ...comun,
  },
  linea_tiempo: {
    plantilla: "linea_tiempo",
    narracion: "La reforma se aprobó en mil novecientos noventa y seis. El primer balotaje fue en mil novecientos noventa y nueve. Y en dos mil veinticuatro, Orsi ganó en segunda vuelta.",
    props: {
      titulo: "El balotaje en el tiempo",
      eventos: [
        { fecha: "1996", texto: "La reforma se aprobó en plebiscito" },
        { fecha: "1999", texto: "El primer balotaje" },
        { fecha: "2024", texto: "Orsi ganó en segunda vuelta" },
      ],
    },
    palabras_enfasis: ["reforma"],
    ...comun,
  },
  grafico: {
    plantilla: "grafico",
    narracion: "En octubre, el Frente Amplio sacó cuarenta y cuatro, el Partido Nacional veintisiete y el Colorado diecisiete por ciento.",
    props: {
      tipo: "barras",
      titulo: "Primera vuelta 2024",
      unidad: "%",
      datos: [
        { etiqueta: "Frente Amplio", valor: 43.9 },
        { etiqueta: "Partido Nacional", valor: 26.8 },
        { etiqueta: "Partido Colorado", valor: 16.9 },
      ],
    },
    palabras_enfasis: ["Frente"],
    ...comun,
  },
  grafico_torta: {
    plantilla: "grafico",
    narracion: "Así se repartieron los votos en octubre: casi la mitad para el Frente, un cuarto para los blancos y el resto para los demás.",
    props: {
      tipo: "torta",
      titulo: "Octubre 2024",
      unidad: "%",
      datos: [
        { etiqueta: "Frente Amplio", valor: 43.9 },
        { etiqueta: "P. Nacional", valor: 26.8 },
        { etiqueta: "P. Colorado", valor: 16.9 },
        { etiqueta: "Otros", valor: 12.4 },
      ],
    },
    palabras_enfasis: [],
    ...comun,
  },
  mapa: {
    plantilla: "mapa",
    narracion: "Montevideo y Canelones juntan más de la mitad de los votantes de todo el país.",
    props: { pais: "URY", etiqueta: "Uruguay", dato: "Más de la mitad del padrón", zonas: ["Montevideo", "Canelones"] },
    palabras_enfasis: ["mitad"],
    ...comun,
  },
  icono_texto: {
    plantilla: "icono_texto",
    narracion: "Y ojo: en Uruguay votar es obligatorio, y si no vas te pueden multar.",
    props: { icono: "vote", texto: "Votar es obligatorio", subtitulo: "Si no vas, te pueden multar" },
    palabras_enfasis: ["obligatorio"],
    ...comun,
  },
  icono_texto_reloj: {
    plantilla: "icono_texto",
    narracion: "Entre la primera y la segunda vuelta hay apenas cuatro semanas de campaña.",
    props: { icono: "clock", texto: "Cuatro semanas de campaña" },
    palabras_enfasis: ["cuatro", "semanas"],
    ...comun,
  },
  stock_video: {
    plantilla: "stock_video",
    narracion: "Ese domingo, más de dos millones de personas fueron a votar en todo el país.",
    props: { texto: "Dos millones a las urnas", subtitulo: "24 de noviembre de 2024" },
    palabras_enfasis: ["millones"],
    palabras_clave_stock: ["voting", "ballot box"],
    emoji_o_icono: undefined,
  },
  escena_ilustrada: {
    plantilla: "escena_ilustrada",
    narracion: "Cada mes, una parte de tu sueldo va a una cuenta a tu nombre en una AFAP, y esa plata se invierte para que rinda hasta que te jubiles.",
    props: {
      escenario: "oficina_publica",
      personajes: [
        { id: "jubilado", lugar: "izquierda", accion: "pensar" },
        { id: "narrador", lugar: "derecha", accion: "hablar", habla: true },
      ],
      objetos: [
        { id: "alcancia", lugar: "centro", accion: "llenarse", tam: "normal", cantidad: 1 },
        { id: "moneda", lugar: "arriba", accion: "entrar", tam: "chico", cantidad: 5 },
      ],
      camara: "parallax",
      beats: [
        { palabra: "cuenta", personaje: 0, accion: "sorprenderse", efecto: "exclamacion", efecto_sobre: 0 },
        { palabra: "invierte", personaje: 1, accion: "senalar", camara: "acercar" },
        { palabra: "rinda", personaje: 0, accion: "festejar", efecto: "chispas", efecto_sobre: -1 },
      ],
      texto: "Tu plata, a tu nombre",
    },
    palabras_enfasis: ["AFAP"],
    ...comun,
  },
  escena_ilustrada_calle: {
    plantilla: "escena_ilustrada",
    narracion: "Y cuando llega el día, el jubilado sale de la oficina y se va caminando con su jubilación en el bolsillo.",
    props: {
      escenario: "ciudad_dia",
      personajes: [{ id: "jubilado", lugar: "centro", accion: "saludar", entra: "izquierda" }],
      objetos: [{ id: "billete", lugar: "arriba", accion: "volar", tam: "chico", cantidad: 3 }],
      camara: "paneo",
      beats: [{ palabra: "caminando", personaje: 0, accion: "contar_plata" }],
    },
    palabras_enfasis: ["jubilación"],
    ...comun,
  },
  cierre_cta: {
    plantilla: "cierre_cta",
    narracion: "Dos candidatos, una decisión final. ¿Te parece el mejor sistema? Contanos en los comentarios.",
    props: { remate: "Dos candidatos, una decisión", pregunta: "¿Es el mejor sistema? Contanos 👇" },
    palabras_enfasis: ["decisión"],
    ...comun,
  },
};

export const escenasEjemplo: Escena[] = ["titular", "dato_numero", "lista", "comparacion", "mapa", "icono_texto", "cierre_cta"].map((k) => escenasDemo[k]!);

export const ejemploVideo: VideoProps = {
  marca: marcaEjemplo,
  escenas: escenasEjemplo.map(aRender),
  musicaSrc: null,
  volumenMusica: 0.1,
  sfxSrc: null,
  paginaSubtitulosMs: 1200,
  mostrarZonas: false,
};

export const ejemploPortada: PortadaProps = {
  marca: marcaEjemplo,
  titulo: "¿Por qué el cielo es azul?",
  escena: ejemploVideo.escenas[1] ?? null,
};

/** Crudo de ejemplo para el Studio: sin video real se ve el fondo de la marca con los subtítulos. */
export const ejemploCrudo: CrudoProps = {
  marca: marcaEjemplo,
  video: { src: "", ancho: 1080, alto: 1920, fps: 30 },
  audioSrc: null,
  tramos: [
    { inicioMs: 0, finMs: 2000 },
    { inicioMs: 2600, finMs: 5000 },
  ],
  zoom: 1.1,
  captions: captionsSimulados("Esto es un crudo de ejemplo con los subtítulos ya cortados"),
  enfasis: ["crudo"],
  subtitulosY: 1229,
  paginaSubtitulosMs: 1200,
  material: [],
  sfx: [],
  volumenSfx: 0.35,
};
