import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import path from "node:path";
import { SLUG_PERFIL } from "../shared/perfiles";
import { guardarMarca, leerMarca } from "./config";
import { guardarUltimasOpciones, leerUltimasOpciones } from "./crudo/opciones";
import { DIR_PERFILES, guardarPerfil, guardarUltimoPerfilAnimados, leerPerfil, leerUltimoPerfilAnimados } from "./perfiles";
import { Trabajo } from "./trabajo";

/**
 * Cambia el slug (el nombre interno) de un perfil sin romper nada: mueve su archivo, su foto y su kit, y
 * actualiza el perfil por defecto, el último usado en cada bloque y los trabajos que lo usaban.
 */
export const renombrarPerfil = async (viejo: string, nuevo: string): Promise<{ trabajos: string[] }> => {
  if (!SLUG_PERFIL.test(nuevo)) throw new Error(`Slug inválido: ${nuevo}`);
  const p = await leerPerfil(viejo);
  if (!p) throw new Error(`No existe el perfil ${viejo}`);
  if (await leerPerfil(nuevo)) throw new Error(`Ya existe un perfil ${nuevo}`);

  let foto = p.foto;
  if (p.foto) {
    foto = `${nuevo}${path.extname(p.foto)}`;
    await rename(path.join(DIR_PERFILES, p.foto), path.join(DIR_PERFILES, foto));
  }
  if (existsSync(path.join(DIR_PERFILES, viejo))) await rename(path.join(DIR_PERFILES, viejo), path.join(DIR_PERFILES, nuevo));
  await guardarPerfil({ ...p, slug: nuevo, foto });
  await rm(path.join(DIR_PERFILES, `${viejo}.json`), { force: true });

  const marca = await leerMarca();
  if (marca.perfilPorDefecto === viejo) await guardarMarca({ ...marca, perfilPorDefecto: nuevo });
  const op = await leerUltimasOpciones(nuevo);
  if (op.perfil === viejo) await guardarUltimasOpciones({ ...op, perfil: nuevo });
  if ((await leerUltimoPerfilAnimados()) === viejo) await guardarUltimoPerfilAnimados(nuevo);

  const trabajos: string[] = [];
  for (const e of await Trabajo.listar()) {
    if (e.opciones.perfil !== viejo && e.perfilCopia?.slug !== viejo) continue;
    const t = await Trabajo.abrir(e.id);
    await t.actualizar((x) => {
      if (x.opciones.perfil === viejo) x.opciones.perfil = nuevo;
      if (x.perfilCopia?.slug === viejo) x.perfilCopia = { ...x.perfilCopia, slug: nuevo, foto };
    });
    trabajos.push(e.id);
  }
  return { trabajos };
};
