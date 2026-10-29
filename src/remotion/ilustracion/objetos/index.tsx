import { OBJETOS_CIUDAD } from "./ciudad";
import { OBJETOS_CIVICO } from "./civico";
import { OBJETOS_COTIDIANO } from "./cotidiano";
import { OBJETOS_DINERO } from "./dinero";
import type { FichaObjeto } from "./tipos";

/** Todos los objetos animables de la biblioteca, por id. */
export const OBJETOS: Record<string, FichaObjeto> = { ...OBJETOS_DINERO, ...OBJETOS_CIVICO, ...OBJETOS_COTIDIANO, ...OBJETOS_CIUDAD };
