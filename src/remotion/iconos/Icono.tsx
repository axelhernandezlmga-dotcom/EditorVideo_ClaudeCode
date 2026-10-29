import type React from "react";
import datos from "./lucide.json";

type Nodo = [string, Record<string, string | number>];
const { iconos: ICONOS, alias: ALIAS } = datos as unknown as { iconos: Record<string, Nodo[]>; alias: Record<string, string> };

/** Palabras en español (y nombres viejos de Lucide) → ícono de Lucide. */
const SINONIMOS: Record<string, string> = {
  urna: "vote",
  voto: "vote",
  votos: "vote",
  votar: "vote",
  elecciones: "vote",
  eleccion: "vote",
  ballot: "vote",
  reloj: "clock",
  tiempo: "clock",
  hora: "clock",
  plazo: "timer",
  cronometro: "timer",
  reloj_arena: "hourglass",
  balanza: "scale",
  justicia: "scale",
  equilibrio: "scale",
  ley: "gavel",
  leyes: "gavel",
  juez: "gavel",
  martillo: "gavel",
  tribunal: "gavel",
  parlamento: "landmark",
  congreso: "landmark",
  senado: "landmark",
  gobierno: "landmark",
  estado: "landmark",
  constitucion: "scroll-text",
  documento: "file-text",
  dinero: "banknote",
  plata: "banknote",
  pesos: "banknote",
  impuestos: "receipt",
  economia: "chart-line",
  gente: "users",
  personas: "users",
  poblacion: "users",
  ciudadanos: "users",
  persona: "user",
  candidato: "user-round",
  presidente: "user-round",
  mundo: "globe",
  planeta: "earth",
  pais: "flag",
  bandera: "flag",
  casa: "house",
  home: "house",
  escuela: "school",
  educacion: "graduation-cap",
  salud: "heart-pulse",
  hospital: "hospital",
  trabajo: "briefcase",
  empleo: "briefcase",
  idea: "lightbulb",
  alerta: "triangle-alert",
  "alert-triangle": "triangle-alert",
  advertencia: "triangle-alert",
  ok: "check",
  "check-circle": "circle-check",
  grafico: "chart-column",
  "bar-chart": "chart-column",
  "bar-chart-2": "chart-column",
  "pie-chart": "chart-pie",
  crecimiento: "trending-up",
  sube: "trending-up",
  baja: "trending-down",
  caida: "trending-down",
  megafono: "megaphone",
  anuncio: "megaphone",
  campana: "bell",
  calendario: "calendar",
  fecha: "calendar",
  mapa: "map",
  ubicacion: "map-pin",
  lugar: "map-pin",
  sol: "sun",
  luz: "sun",
  cielo: "cloud-sun",
  lluvia: "cloud-rain",
  agua: "droplets",
  fuego: "flame",
  energia: "zap",
  rayo: "zap",
  ciencia: "flask-conical",
  libro: "book-open",
  historia: "book-open",
  pregunta: "circle-help",
  comentario: "message-circle",
  corazon: "heart",
  estrella: "star",
  trofeo: "trophy",
  ganador: "trophy",
  candado: "lock",
  seguridad: "shield",
  policia: "shield",
  auto: "car",
  avion: "plane",
  barco: "ship",
  telefono: "smartphone",
  celular: "smartphone",
  internet: "wifi",
  computadora: "laptop",
};

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** true si el texto es un emoji (no un nombre de ícono). */
export const esEmoji = (s: string) => /\p{Extended_Pictographic}/u.test(s);

/** Devuelve el nombre de un ícono de Lucide existente, o null. Acepta kebab-case, PascalCase, español o inglés. */
export const resolverIcono = (nombre: string | undefined | null): string | null => {
  if (!nombre) return null;
  const kebab = sinTildes(nombre.trim())
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  if (ICONOS[kebab]) return kebab;
  if (ALIAS[kebab]) return ALIAS[kebab];
  const sin = SINONIMOS[kebab] ?? SINONIMOS[kebab.replace(/-/g, "_")];
  if (sin && ICONOS[sin]) return sin;
  // "vote-icon", "lucide-vote", palabras sueltas: probar cada parte
  for (const parte of kebab.split("-")) {
    const p = SINONIMOS[parte] ?? parte;
    if (p.length > 2 && ICONOS[p]) return p;
  }
  return null;
};

/** Busca un ícono a partir de palabras sueltas (ej. las palabras clave de stock, en inglés). */
export const iconoDesdePalabras = (palabras: string[]): string | null => {
  for (const frase of palabras) {
    const directo = resolverIcono(frase);
    if (directo) return directo;
  }
  return null;
};

export const existeIcono = (nombre: string) => Boolean(ICONOS[nombre]);

/**
 * Ícono de Lucide (o emoji) que se "dibuja" trazo por trazo: `dibujo` va de 0 (nada) a 1 (completo).
 * Usa `pathLength=1` para que el guion de trazo sea igual en todos los elementos del SVG.
 */
export const Icono: React.FC<{
  nombre: string;
  tam: number;
  color: string;
  dibujo?: number;
  grosor?: number;
  relleno?: string;
  style?: React.CSSProperties;
}> = ({ nombre, tam, color, dibujo = 1, grosor = 2, relleno, style }) => {
  if (esEmoji(nombre)) {
    return (
      <div style={{ fontSize: tam * 0.82, lineHeight: 1, width: tam, height: tam, display: "flex", alignItems: "center", justifyContent: "center", opacity: Math.min(1, dibujo * 2), ...style }}>
        {nombre}
      </div>
    );
  }
  const clave = resolverIcono(nombre) ?? "sparkles";
  const nodos = ICONOS[clave] ?? [];
  const d = Math.max(0, Math.min(1, dibujo));
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" style={{ overflow: "visible", ...style }}>
      {nodos.map(([tag, attrs], i) => {
        const Tag = tag as "path";
        return (
          <Tag
            key={i}
            {...(attrs as React.SVGProps<SVGPathElement>)}
            pathLength={1}
            stroke={color}
            strokeWidth={grosor}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="1 1"
            strokeDashoffset={1 - d}
            fill={relleno && d >= 1 ? relleno : "none"}
          />
        );
      })}
    </svg>
  );
};
