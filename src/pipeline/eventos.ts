import { EventEmitter } from "node:events";
import type { Estado } from "../shared/schemas";
import type { UsoGemini } from "./usoGemini";

export type Evento =
  | { tipo: "estado"; id: string; estado: Estado }
  | { tipo: "log"; id: string; linea: string; nivel: "info" | "error" }
  | { tipo: "actividad"; id: string; texto: string }
  | { tipo: "progreso"; id: string; paso: string; progreso: number }
  | { tipo: "uso-gemini"; uso: UsoGemini };

class Bus extends EventEmitter {
  emitir(e: Evento) {
    this.emit("evento", e);
  }
  escuchar(fn: (e: Evento) => void) {
    this.on("evento", fn);
    return () => this.off("evento", fn);
  }
}

/** Bus global de eventos del motor: el servidor lo reenvía por SSE y la CLI lo imprime. */
export const bus = new Bus();
bus.setMaxListeners(100);
