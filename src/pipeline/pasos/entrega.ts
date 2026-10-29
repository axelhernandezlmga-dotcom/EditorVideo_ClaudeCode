import { censurar } from "../../shared/censura";
import type { Guion, Marca } from "../../shared/schemas";
import type { Trabajo } from "../trabajo";
import type { Visuales } from "./visuales";

/** Paso final: texto de publicación y fuentes en archivos fáciles de copiar. */
export const pasoEntrega = async (t: Trabajo, guion: Guion, visuales: Visuales, marca: Marca) => {
  const publicacion = guion.texto_publicacion.trim();
  await t.escribirTexto("publicacion.txt", `${marca.publicacionSinPuteadas ? censurar(publicacion) : publicacion}\n`);
  const lineas = [
    `# Fuentes — ${guion.titulo}`,
    "",
    "Datos verificados para este video:",
    "",
    ...guion.fuentes.map((f) => `- [${f.titulo}](${f.url})`),
  ];
  const ref = guion.referencia_gancho;
  if (ref) lineas.push("", "## Referencia del gancho", "", `gancho: ${ref.referencia} — [${ref.fuente.titulo}](${ref.fuente.url})`);
  if (visuales.creditos.length) lineas.push("", "## Créditos de video de stock", "", ...visuales.creditos.map((c) => `- ${c}`));
  await t.escribirTexto("fuentes.md", `${lineas.join("\n")}\n`);
};
