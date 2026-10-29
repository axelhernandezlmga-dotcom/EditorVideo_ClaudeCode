import type { PedidoCrudo } from "../../src/shared/opcionesCrudo";
/** Subida por partes de un crudo: cada parte se reintenta sola si falla (Wi-Fi del celular, etc.). */

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

const json = async <T,>(r: Response): Promise<T> => {
  const datos = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(datos.error ?? `Error ${r.status}`);
  return datos;
};

export type ProgresoSubida = { enviados: number; total: number; parte: number; partes: number };

/** Sube el archivo por partes y devuelve el id de la subida (todavía no crea el trabajo: eso lo hace `completarCrudo`). */
export const subirPartes = async (archivo: File, onProgreso: (p: ProgresoSubida) => void, signal?: AbortSignal): Promise<string> => {
  const inicio = await json<{ id: string; partes: number; tamParte: number }>(
    await fetch("/api/crudos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: archivo.name, bytes: archivo.size }), signal }),
  );
  let enviados = 0;
  for (let n = 0; n < inicio.partes; n++) {
    const parte = archivo.slice(n * inicio.tamParte, Math.min(archivo.size, (n + 1) * inicio.tamParte));
    for (let intento = 1; ; intento++) {
      try {
        await json(await fetch(`/api/crudos/subidas/${inicio.id}/partes/${n}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: parte, signal }));
        break;
      } catch (e) {
        if (signal?.aborted || intento >= 5) throw e;
        await esperar(1000 * 2 ** (intento - 1));
      }
    }
    enviados += parte.size;
    onProgreso({ enviados, total: archivo.size, parte: n + 1, partes: inicio.partes });
  }
  return inicio.id;
};

/** Une las partes en un trabajo nuevo con las opciones del formulario y lo pone en la cola. */
export const completarCrudo = async (subida: string, pedido: PedidoCrudo): Promise<string> => {
  const { id } = await json<{ id: string }>(
    await fetch(`/api/crudos/subidas/${subida}/completar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pedido) }),
  );
  return id;
};
