import { crearCategoria, describirClips, descripcion, importacion, importarCarpeta, leerBiblioteca } from "../pipeline/biblioteca";
import { colores as c, parsearArgs } from "./comun";

const AYUDA = `Uso:
  npm run biblioteca                                        lista categorías y cuántos archivos tiene cada una
  npm run biblioteca -- importar <carpeta> --categoria "Memes varios" [--describir] [--transcribir] [--audio musica|sfx]
  npm run biblioteca -- describir --categoria "Memes varios" [--transcribir]

La categoría se crea si no existe. Los archivos se COPIAN a biblioteca/medios/ (el original no se toca) y
los repetidos se saltean. --describir hace que Claude mire cada clip (un pedido por clip).`;

const esperar = async (estado: { activa: boolean; hechos: number; total: number }, texto: () => string) => {
  let ultimo = -1;
  while (estado.activa) {
    await new Promise((ok) => setTimeout(ok, 1000));
    if (estado.hechos !== ultimo && (estado.hechos % 25 === 0 || estado.hechos === estado.total)) {
      ultimo = estado.hechos;
      console.log(c.gris(`  · ${texto()}`));
    }
  }
};

/** Busca la categoría por nombre (sin importar mayúsculas) o la crea. */
const categoriaPorNombre = async (nombre: string) => {
  const existente = (await leerBiblioteca()).categorias.find((x) => x.nombre.toLowerCase() === nombre.toLowerCase() || x.id === nombre);
  return existente ?? (await crearCategoria(nombre));
};

const main = async () => {
  const { flags, posicionales } = parsearArgs(process.argv.slice(2));
  const [accion, carpeta] = posicionales;
  if (flags.ayuda || flags.help) return console.log(AYUDA);

  if (!accion) {
    const b = await leerBiblioteca();
    for (const cat of b.categorias) {
      const suyos = b.recursos.filter((r) => r.categoria === cat.id);
      const n = (t: string) => suyos.filter((r) => r.tipo === t).length;
      console.log(`${c.negrita(cat.nombre)} ${c.gris(`(${cat.id})`)}: ${n("video")} clips · ${n("musica")} pistas · ${n("sfx")} efectos`);
    }
    return;
  }

  if (typeof flags.categoria !== "string") throw new Error(`Falta --categoria.\n\n${AYUDA}`);
  const categoria = await categoriaPorNombre(flags.categoria);

  if (accion === "importar") {
    if (!carpeta) throw new Error(`Falta la carpeta.\n\n${AYUDA}`);
    const tipoAudio = flags.audio === "musica" || flags.audio === "sfx" ? flags.audio : "auto";
    await importarCarpeta(carpeta, { categoria: categoria.id, describir: Boolean(flags.describir), transcribir: Boolean(flags.transcribir), tipoAudio });
    console.log(`Importando ${importacion.total} archivos a «${categoria.nombre}»…`);
    await esperar(importacion, () => `${importacion.hechos} de ${importacion.total} (${importacion.importados} nuevos, ${importacion.duplicados} repetidos, ${importacion.errores.length} con error)`);
    console.log(c.verde(`✓ ${importacion.importados} importados, ${importacion.duplicados} repetidos salteados.`));
    for (const e of importacion.errores) console.log(c.amarillo(`  ⚠ ${e.archivo}: ${e.error}`));
    return;
  }

  if (accion === "describir") {
    const b = await leerBiblioteca();
    const ids = b.recursos.filter((r) => r.tipo === "video" && r.categoria === categoria.id && r.descripcionPor === "nombre").map((r) => r.id);
    await describirClips(ids, { transcribir: Boolean(flags.transcribir) });
    console.log(`Describiendo ${descripcion.total} clips de «${categoria.nombre}» con Claude…`);
    await esperar(descripcion, () => `${descripcion.hechos} de ${descripcion.total}`);
    if (descripcion.error) console.log(c.amarillo(`  ⚠ ${descripcion.error}`));
    console.log(c.verde("✓ Listo."));
    return;
  }

  throw new Error(`No conozco «${accion}».\n\n${AYUDA}`);
};

main().catch((e: Error) => {
  console.error(c.rojo(`✗ ${e.message}`));
  process.exit(1);
});
