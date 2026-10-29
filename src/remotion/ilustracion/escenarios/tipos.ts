import type React from "react";

/**
 * Props de un escenario: se dibuja en 1080×1920 (más un margen a los costados para paneos). `camara` es el
 * desplazamiento horizontal de la cámara en px; cada capa lo multiplica por su profundidad (parallax).
 */
export type PropsEscenario = { t: number; fps: number; camara: number; semilla: number };

export type FichaEscenario = {
  nombre: string;
  etiquetas: string[];
  /** Altura (px, en 1920) donde pisan los personajes. */
  piso: number;
  /** Elementos vivos, para el catálogo. */
  vivos: string[];
  Dibujo: React.FC<PropsEscenario>;
};
