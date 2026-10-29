import { Eye, Film, RotateCcw, Scissors } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { useAviso } from "../App";
import { BarraSeleccion, Casilla, DialogoBorrar, useSeleccion } from "../componentes/Borrado";
import type { TipoTrabajo } from "../../../src/shared/schemas";
import { Insignia } from "../componentes/TarjetaTrabajo";
import { useMotor } from "../motor";

const FILTROS: { id: "todos" | TipoTrabajo; texto: string }[] = [
  { id: "todos", texto: "Todos" },
  { id: "idea", texto: "Animados" },
  { id: "crudo", texto: "Crudos" },
];

/** Adónde lleva cada miniatura: los crudos van a su revisión (ahí está el video final); las ideas, a su detalle. */
const enlace = (t: { id: string; tipo: TipoTrabajo; estado: string; pasos: Partial<Record<string, string>> }) =>
  t.tipo === "crudo" ? `#/crudo/${t.id}` : t.estado === "esperando_voz" ? `#/grabar/${t.id}` : t.estado === "esperando_revision" ? (t.pasos.revision_voz === "en_curso" ? `#/voz/${t.id}` : `#/revision/${t.id}`) : `#/video/${t.id}`;

/** Galería de un bloque (`tipo`) o la general "Todos los videos" (sin `tipo`, con filtro). */
export const Galeria: React.FC<{ tipo?: TipoTrabajo }> = ({ tipo }) => {
  const { trabajos: todos, recargar } = useMotor();
  const avisar = useAviso();
  const [verOcultos, setVerOcultos] = useState(false);
  const trabajos = todos.filter((t) => Boolean(t.oculto) === verOcultos && (!tipo || t.tipo === tipo));
  const ocultos = todos.filter((t) => t.oculto && (!tipo || t.tipo === tipo)).length;
  const sel = useSeleccion(trabajos);
  const [borrando, setBorrando] = useState(false);
  const recuperar = async () => {
    try {
      await api.recuperar([...sel.elegidos]);
      await recargar();
      sel.terminar();
      avisar("Recuperados: vuelven a aparecer en la lista.", "ok");
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>(() => {
    try {
      const f = localStorage.getItem("galeria-filtro");
      return f === "idea" || f === "crudo" ? f : "todos";
    } catch {
      return "todos";
    }
  });
  const elegir = (f: typeof filtro) => {
    setFiltro(f);
    try {
      localStorage.setItem("galeria-filtro", f);
    } catch {
      // sin almacenamiento: el filtro dura mientras la página esté abierta
    }
  };
  const visibles = (sel.activa ? sel.visibles : trabajos).filter((t) => tipo || filtro === "todos" || t.tipo === filtro);
  return (
    <>
      <div className="encabezado">
        <div>
          <h1>{verOcultos ? "Quitados de la lista" : tipo ? "Galería" : "Todos los videos"}</h1>
          <p>{trabajos.length ? `${trabajos.length} video${trabajos.length === 1 ? "" : "s"}. Tocá uno para verlo, copiar el texto o descargarlo.` : "Acá van a aparecer tus videos."}</p>
        </div>
        {trabajos.length && !tipo ? (
          <div className="segmentado" role="tablist" aria-label="Filtrar por tipo">
            {FILTROS.map((f) => (
              <button key={f.id} role="tab" aria-selected={filtro === f.id} className={filtro === f.id ? "activo" : ""} onClick={() => elegir(f.id)}>
                {f.texto}
                <span className="contador">{f.id === "todos" ? trabajos.length : trabajos.filter((t) => t.tipo === f.id).length}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="fila" style={{ gap: 8, marginBottom: 16 }}>
        {verOcultos ? (
          <>
            <button className="boton chico" onClick={() => (sel.terminar(), setVerOcultos(false))}>
              Volver
            </button>
            {sel.activa ? (
              <button className="boton chico" disabled={!sel.elegidos.size} onClick={() => void recuperar()}>
                <RotateCcw size={16} /> Recuperar ({sel.elegidos.size})
              </button>
            ) : null}
          </>
        ) : ocultos ? (
          <button className="boton chico" onClick={() => (sel.terminar(), setVerOcultos(true))}>
            <Eye size={16} /> Quitados de la lista ({ocultos})
          </button>
        ) : null}
        <BarraSeleccion s={sel} onBorrar={() => setBorrando(true)} />
      </div>
      {borrando ? <DialogoBorrar ids={[...sel.elegidos]} onCerrar={(ok) => (setBorrando(false), ok && sel.terminar())} /> : null}
      {trabajos.length === 0 ? (
        <div className="tarjeta vacio">
          <p>Todavía no hiciste ningún video.</p>
          <a className="boton primario" href={tipo === "crudo" ? "#/crudos/subir" : "#/animados/crear"}>
            {tipo === "crudo" ? "Subir el primer crudo" : "Crear el primero"}
          </a>
        </div>
      ) : visibles.length === 0 ? (
        <div className="tarjeta vacio">
          <p>{filtro === "crudo" ? "Todavía no editaste ningún crudo." : "No hay videos de este tipo."}</p>
          {filtro === "crudo" ? (
            <a className="boton primario" href="#/crudos/subir">
              <Scissors size={18} /> Editar un crudo
            </a>
          ) : null}
        </div>
      ) : (
        <div className="galeria">
          {visibles.map((t) => (
            <a
              key={t.id}
              className={`miniatura ${sel.elegidos.has(t.id) ? "seleccionada" : ""}`}
              href={enlace(t)}
              onClick={(e) => {
                // en modo selección, tocar la miniatura la marca (no abre el video)
                if (sel.activa) {
                  e.preventDefault();
                  sel.alternar(t.id);
                }
              }}
            >
              <div className="miniatura-img">
                {sel.activa ? <Casilla marcada={sel.elegidos.has(t.id)} onCambio={() => sel.alternar(t.id)} /> : null}
                {t.portada ? <img src={`${t.portada}?v=${encodeURIComponent(t.actualizado)}`} alt="" loading="lazy" /> : <Film size={36} />}
                {t.estado !== "listo" ? <Insignia estado={t.estado} /> : null}
                {t.tipo === "crudo" ? (
                  <span className="etiqueta-crudo">
                    <Scissors size={12} /> Crudo
                  </span>
                ) : null}
              </div>
              <div className="miniatura-pie">
                <strong>{t.idea}</strong>
                <small>{new Date(t.creado).toLocaleDateString("es-UY", { day: "numeric", month: "short", year: "numeric" })}</small>
              </div>
            </a>
          ))}
        </div>
      )}
    </>
  );
};
