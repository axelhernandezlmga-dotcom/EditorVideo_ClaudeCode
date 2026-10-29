import { ESCENARIOS_EXTERIORES } from "./exteriores";
import { ESCENARIOS_INTERIORES } from "./interiores";
import type { FichaEscenario } from "./tipos";

/** Escenarios con capas para parallax, por id. */
export const ESCENARIOS: Record<string, FichaEscenario> = { ...ESCENARIOS_EXTERIORES, ...ESCENARIOS_INTERIORES };
