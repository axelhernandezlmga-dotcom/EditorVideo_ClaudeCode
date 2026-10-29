import { bus } from "../pipeline/eventos";

const c = {
  gris: (s: string) => `\x1b[90m${s}\x1b[0m`,
  verde: (s: string) => `\x1b[32m${s}\x1b[0m`,
  rojo: (s: string) => `\x1b[31m${s}\x1b[0m`,
  amarillo: (s: string) => `\x1b[33m${s}\x1b[0m`,
  negrita: (s: string) => `\x1b[1m${s}\x1b[0m`,
};
export const colores = c;

/** Imprime en la terminal lo que va haciendo el motor. */
export const mostrarProgreso = () => {
  let ultimaActividad = "";
  let ultimoPct = -1;
  return bus.escuchar((e) => {
    if (e.tipo === "actividad" && e.texto !== ultimaActividad && !e.texto.startsWith("Renderizando…")) {
      ultimaActividad = e.texto;
      console.log(c.gris(`  · ${e.texto}`));
    } else if (e.tipo === "progreso" && e.paso === "render") {
      const pct = Math.floor(e.progreso * 100);
      if (pct % 10 === 0 && pct !== ultimoPct) {
        ultimoPct = pct;
        console.log(c.gris(`  · Render ${pct} %`));
      }
    } else if (e.tipo === "log") {
      console.log(e.nivel === "error" ? c.rojo(`✗ ${e.linea}`) : `✓ ${e.linea}`);
    }
  });
};

export const parsearArgs = (argv: string[]) => {
  const flags: Record<string, string | true> = {};
  const posicionales: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2) as [string, string | undefined];
      const sig = argv[i + 1];
      if (v !== undefined) flags[k] = v;
      else if (sig !== undefined && !sig.startsWith("--") && ["voz", "reanudar", "aprobar", "tema", "cantidad", "solo", "trabajo", "modelo", "prueba", "estilo", "hoja", "perfil", "categoria", "audio", "limite", "carpeta", "nombre", "usuario", "slug"].includes(k)) {
        flags[k] = sig;
        i++;
      } else flags[k] = true;
    } else posicionales.push(a);
  }
  return { flags, posicionales };
};
