import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { framesCrudo } from "../../shared/crudo";
import { FPS } from "../../shared/render";
import type { Marca } from "../../shared/schemas";
import { renderizarFotograma, renderizarVideo, servirCarpeta } from "../renderizador";
import type { Trabajo } from "../trabajo";
import { armarPropsCrudo } from "./props";
import { verificarYGuardar } from "../marca/verificador";

/** Render 1080×1920 con el video ORIGINAL (no el proxy), a un temporal que se renombra al terminar, + portada. */
export const pasoRenderCrudo = async (t: Trabajo, marca: Marca, signal?: AbortSignal) => {
  const servidor = await servirCarpeta(t.dir);
  try {
    const props = await armarPropsCrudo(t, marca, servidor.url);
    await t.escribir("render-props.json", await armarPropsCrudo(t, marca, "."));
    const tmp = t.ruta("video.parcial.mp4");
    let ultimo = -1;
    await renderizarVideo({
      props,
      salida: tmp,
      composicion: "Crudo",
      signal,
      onProgreso: (p) => {
        t.progreso("render", p);
        const pct = Math.floor(p * 10) * 10;
        if (pct !== ultimo) {
          ultimo = pct;
          t.actividad(`Renderizando… ${Math.round(p * 100)} %`);
        }
      },
    });
    if (existsSync(t.ruta("video.mp4"))) await rm(t.ruta("video.mp4"));
    await rename(tmp, t.ruta("video.mp4"));
    await verificarYGuardar(t, props);

    // portada: un fotograma del propio video, pasado el primer segundo (ya con subtítulos)
    t.actividad("Generando portada…");
    const frame = Math.min(framesCrudo(props.tramos, FPS) - 1, Math.round(FPS * 1.2));
    await renderizarFotograma({ props, frame, salida: t.ruta("portada.png"), composicion: "Crudo" });
    await t.log(`Video renderizado (${(props.tramos.reduce((n, x) => n + x.finMs - x.inicioMs, 0) / 1000).toFixed(1)} s): video.mp4 + portada.png`);
  } finally {
    await servidor.cerrar();
  }
};
