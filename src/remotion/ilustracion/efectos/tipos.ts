import type React from "react";

/** Props de un efecto dibujado: frames desde que empezó y su duración (los efectos aparecen y se van solos). */
export type PropsEfecto = { t: number; fps: number; dur: number; semilla: number; color?: string };

export type FichaEfecto = {
  nombre: string;
  etiquetas: string[];
  /** Duración natural en segundos. */
  duracion: number;
  Dibujo: React.FC<PropsEfecto>;
};
