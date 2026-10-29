import { analisis, analizarClips, CLIPS_POR_PEDIDO, pendientesAnalisis } from "../pipeline/analisis";
import { crearCategoria, importacion, importarCarpeta, leerBiblioteca } from "../pipeline/biblioteca";
import { colores as c, parsearArgs } from "./comun";

const AYUDA = `Uso:
  npm run biblioteca                                        lista categorías y cuántos archivos tiene cada una
  npm run biblioteca -- importar <carpeta> --categoria "Memes varios" [--audio musica|sfx]
  npm run biblioteca -- analizar --categoria "Memes varios"                     fase local (gratis)
  npm run biblioteca -- analizar --categoria "Memes varios" --claude [--limite 12] [--si]

La categoría se crea si no existe. Los archivos se COPIAN a biblioteca/medios/ (el original no se toca) y
los repetidos se saltean. El análisis se reanuda: nunca repite un clip ya analizado. La fase local (fotogramas,
volumen y transcripción con faster-whisper) es gratis; la de Claude usa tu cuenta (un pedido cada 6 clips) y
sin --si solo muestra cuántos pedidos haría.`;

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
    await importarCarpeta(carpeta, { categoria: categoria.id, tipoAudio });
    console.log(`Importando ${importacion.total} archivos a «${categoria.nombre}»…`);
    await esperar(importacion, () => `${importacion.hechos} de ${importacion.total} (${importacion.importados} nuevos, ${importacion.duplicados} repetidos, ${importacion.errores.length} con error)`);
    console.log(c.verde(`✓ ${importacion.importados} importados, ${importacion.duplicados} repetidos salteados.`));
    for (const e of importacion.errores) console.log(c.amarillo(`  ⚠ ${e.archivo}: ${e.error}`));
    return;
  }

  if (accion === "analizar") {
    const fase = flags.claude ? "claude" : "local";
    const p = (await pendientesAnalisis())[categoria.id]!;
    const limite = typeof flags.limite === "string" ? Number(flags.limite) : undefined;
    if (fase === "claude" && !flags.si) {
      const n = Math.min(limite ?? p.claude, p.claude);
      console.log(`Faltan ${p.claude} clips por analizar con Claude en «${categoria.nombre}». Esta corrida haría ${n} (≈ ${Math.ceil(n / CLIPS_POR_PEDIDO)} pedidos a Claude con tu cuenta).`);
      console.log("Para hacerlo, agregá --si (y --limite N para probar con pocos).");
      return;
    }
    await analizarClips({ fase, categoria: categoria.id, limite });
    console.log(`Analizando ${analisis.total} clips de «${categoria.nombre}» (${fase === "local" ? "fase local: fotogramas, volumen y transcripción" : "con Claude"})…`);
    await esperar(analisis, () => `${analisis.hechos} de ${analisis.total}${fase === "claude" ? ` · ${analisis.pedidos} pedidos` : ""} · ${analisis.errores.length} con error`);
    for (const e of analisis.errores.slice(0, 20)) console.log(c.amarillo(`  ⚠ ${e.nombre}: ${e.error}`));
    const q = (await pendientesAnalisis())[categoria.id]!;
    console.log(c.verde(`✓ Listo. Pendientes en «${categoria.nombre}»: ${q.local} sin fase local, ${q.claude} sin analizar con Claude.`));
    return;
  }

  throw new Error(`No conozco «${accion}».\n\n${AYUDA}`);
};

main().catch((e: Error) => {
  console.error(c.rojo(`✗ ${e.message}`));
  process.exit(1);
});
