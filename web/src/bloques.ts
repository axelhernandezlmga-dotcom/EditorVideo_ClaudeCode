import { Clapperboard, Images, Library, ListVideo, Palette, Scissors, Sparkles, Upload, Users, type LucideIcon } from "lucide-react";
import type { TipoTrabajo } from "../../src/shared/schemas";

export type IdBloque = "animados" | "crudos";

/** Los dos bloques de la app, cada uno con su color de identidad, su menú, su cola y su galería. */
export const BLOQUES: Record<IdBloque, { nombre: string; tipo: TipoTrabajo; color: string; colorTexto: string; Icono: LucideIcon; menu: { ruta: string; texto: string; Icono: LucideIcon }[] }> = {
  animados: {
    nombre: "Videos animados",
    tipo: "idea",
    color: "#A78BFA",
    colorTexto: "#1A0B3B",
    Icono: Clapperboard,
    menu: [
      { ruta: "crear", texto: "Crear", Icono: Sparkles },
      { ruta: "cola", texto: "Cola", Icono: ListVideo },
      { ruta: "galeria", texto: "Galería", Icono: Images },
      { ruta: "tonos", texto: "Tonos", Icono: Palette },
      // la misma lista de perfiles que en Edición de crudos (config/perfiles/)
      { ruta: "perfiles", texto: "Perfiles", Icono: Users },
      { ruta: "biblioteca", texto: "Biblioteca", Icono: Library },
    ],
  },
  crudos: {
    nombre: "Edición de crudos",
    tipo: "crudo",
    color: "#FB923C",
    colorTexto: "#2A1200",
    Icono: Scissors,
    menu: [
      { ruta: "subir", texto: "Subir crudo", Icono: Upload },
      { ruta: "cola", texto: "Cola", Icono: ListVideo },
      { ruta: "galeria", texto: "Galería", Icono: Images },
      { ruta: "perfiles", texto: "Perfiles", Icono: Users },
      { ruta: "biblioteca", texto: "Biblioteca", Icono: Library },
    ],
  },
};

/**
 * En qué bloque está cada ruta: "#/animados/…" y "#/crudos/…" directo; el detalle de un video según su tipo
 * (revision y video = animados; crudo = crudos). Inicio, Todos los videos y Configuración no son de ningún bloque.
 */
export const bloqueDeRuta = (seccion: string): IdBloque | null => {
  if (seccion === "animados" || seccion === "revision" || seccion === "video" || seccion === "grabar" || seccion === "voz") return "animados";
  if (seccion === "crudos" || seccion === "crudo") return "crudos";
  return null;
};
