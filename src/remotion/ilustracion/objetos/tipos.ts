import type React from "react";

/** Props que recibe el dibujo de cada objeto: la acción y cuántos frames lleva haciéndola. */
export type PropsObjeto = { accion: string; t: number; fps: number; semilla: number; color?: string };

export type FichaObjeto = {
  nombre: string;
  etiquetas: string[];
  /** Acciones propias del objeto (además de las genéricas: entrar, caer, flotar, rebotar, latir, volar, salir). */
  acciones: string[];
  /** Medio ancho y alto aproximado del dibujo, centrado en (0, 0) con el piso en y = alto/2. */
  tam: [number, number];
  Dibujo: React.FC<PropsObjeto>;
};
