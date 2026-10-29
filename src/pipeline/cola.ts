import { bus } from "./eventos";
import { ejecutarTrabajo } from "./runner";
import { Trabajo } from "./trabajo";

/**
 * Cola de trabajos: se procesa uno a la vez (el render usa casi toda la CPU).
 * Las ideas en lote quedan "en_cola" y arrancan solas cuando termina el anterior.
 */
class Cola {
  private pendientes: string[] = [];
  private actual: { id: string; control: AbortController } | null = null;

  get enCurso() {
    return this.actual?.id ?? null;
  }
  get ids() {
    return [...this.pendientes];
  }

  async encolar(id: string) {
    if (this.actual?.id === id || this.pendientes.includes(id)) return;
    this.pendientes.push(id);
    const t = await Trabajo.abrir(id);
    await t.actualizar((e) => {
      e.estado = "en_cola";
    });
    void this.siguiente();
  }

  async cancelar(id: string) {
    if (this.actual?.id === id) {
      this.actual.control.abort();
      return;
    }
    const i = this.pendientes.indexOf(id);
    if (i >= 0) {
      this.pendientes.splice(i, 1);
      const t = await Trabajo.abrir(id);
      await t.actualizar((e) => {
        e.estado = "cancelado";
      });
    }
  }

  /** Saca de la cola todo lo pendiente (queda "cancelado"); el que se está procesando, solo si se pide. */
  async vaciar(cancelarEnCurso: boolean): Promise<string[]> {
    const ids = [...this.pendientes];
    for (const id of ids) await this.cancelar(id);
    if (cancelarEnCurso && this.actual) {
      ids.push(this.actual.id);
      await this.cancelar(this.actual.id);
    }
    return ids;
  }

  /** Espera a que el trabajo deje de procesarse (después de cancelarlo), para poder borrar su carpeta. */
  async esperarLibre(id: string, maxMs = 30_000) {
    for (let t = 0; this.actual?.id === id && t < maxMs; t += 200) await new Promise((r) => setTimeout(r, 200));
    if (this.actual?.id === id) throw new Error(`El trabajo ${id} no terminó de cancelarse.`);
  }

  /**
   * Al arrancar el servidor: vuelve a encolar los trabajos que quedaron "en_cola" o a medias ("trabajando")
   * porque se cerró el programa. Como cada paso es reanudable, siguen donde quedaron.
   */
  async recuperar(): Promise<string[]> {
    const ids = (await Trabajo.listar()).filter((e) => !e.oculto && (e.estado === "en_cola" || e.estado === "trabajando")).map((e) => e.id);
    for (const id of ids.reverse()) await this.encolar(id);
    return ids;
  }

  private async siguiente() {
    if (this.actual) return;
    const id = this.pendientes.shift();
    if (!id) return;
    const control = new AbortController();
    this.actual = { id, control };
    try {
      const t = await Trabajo.abrir(id);
      await ejecutarTrabajo(t, control.signal);
    } catch (e) {
      bus.emitir({ tipo: "log", id, linea: `Error inesperado: ${(e as Error).message}`, nivel: "error" });
    } finally {
      this.actual = null;
      void this.siguiente();
    }
  }
}

export const cola = new Cola();
