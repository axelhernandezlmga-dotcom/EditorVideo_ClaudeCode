import { AlertTriangle, Check, ChevronDown, ChevronUp, Download, FileEdit, Mic, Minus, PenLine, Play, RotateCcw, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { pasosDe, type Estado, type Paso } from "../../../src/shared/schemas";
import { MODELOS_TRANSCRIPCION, textoMb } from "../../../src/shared/transcripcion";
import { api, type ResumenTrabajo } from "../api";
import { useAviso } from "../App";
import { useMotor } from "../motor";
import { Casilla } from "./Borrado";

const NOMBRES_PASOS: Record<Paso, string> = {
  guion: "Guion",
  revision: "Revisión",
  voz: "Voz",
  visuales: "Visuales",
  render: "Render",
  entrega: "Entrega",
  subida: "Proxy 720p",
  limpieza: "Audio limpio",
  transcripcion: "Transcripción",
  cortes: "Cortes",
  material: "Noticias y material",
  sfx: "Efectos",
  grabacion: "Tu grabación",
  revision_voz: "Revisión de tu voz",
};

export const TEXTO_ESTADO: Record<Estado["estado"], string> = {
  en_cola: "En cola",
  trabajando: "Trabajando",
  esperando_revision: "Para revisar",
  esperando_voz: "Esperando tu voz",
  pausado: "En pausa",
  listo: "Listo",
  error: "Con error",
  cancelado: "Cancelado",
};

const duracion = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
};

/** Re-renderiza cada segundo (para los cronómetros de los pasos en curso). */
const useReloj = (activo: boolean) => {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!activo) return;
    const i = setInterval(() => setT((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, [activo]);
};

export const Insignia: React.FC<{ estado: Estado["estado"] }> = ({ estado }) => (
  <span className={`insignia ${estado}`}>
    {estado === "trabajando" ? <span className="girando" style={{ width: 10, height: 10, borderWidth: 2 }} /> : null}
    {TEXTO_ESTADO[estado]}
  </span>
);

/** Un trabajo en la cola: pasos con su tiempo, % del render, qué está haciendo y el log. */
export const TarjetaTrabajo: React.FC<{ t: ResumenTrabajo; seleccion?: { marcada: boolean; alternar: () => void } }> = ({ t, seleccion }) => {
  const { actividad, progreso, logs, cola } = useMotor();
  const avisar = useAviso();
  const [verLog, setVerLog] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const trabajando = t.estado === "trabajando";
  useReloj(trabajando);
  const enCola = cola.pendientes.indexOf(t.id);

  const accion = async (fn: () => Promise<unknown>, ok: string) => {
    setOcupado(true);
    try {
      await fn();
      avisar(ok, "ok");
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setOcupado(false);
    }
  };

  const pctRender = t.pasos.render === "en_curso" ? (progreso[t.id] ?? 0) : t.pasos.render === "hecho" ? 1 : 0;
  const pctTranscripcion = t.pasos.transcripcion === "en_curso" ? (progreso[t.id] ?? 0) : null;
  const pendiente = t.descargaPendiente;
  // modelos más chicos que el pedido, para "usar otro" sin bajar nada grande
  const alternativas = pendiente ? MODELOS_TRANSCRIPCION.filter((m) => m.mb < pendiente.mb) : [];

  return (
    <article className={`tarjeta ${seleccion?.marcada ? "seleccionada" : ""} ${t.estado === "esperando_voz" ? "esperando-voz" : ""}`}>
      <div className="tarjeta-titulo">
        {seleccion ? <Casilla marcada={seleccion.marcada} onCambio={seleccion.alternar} /> : null}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ overflowWrap: "anywhere" }}>{t.idea}</h3>
          <div className="fila" style={{ marginTop: 6, gap: 8 }}>
            <Insignia estado={t.estado} />
            {enCola >= 0 ? <span className="ayuda">Puesto {enCola + 1} en la cola</span> : null}
            <span className="ayuda">{new Date(t.creado).toLocaleString("es-UY", { dateStyle: "short", timeStyle: "short" })}</span>
          </div>
        </div>
        <div className="fila" style={{ gap: 8, flexWrap: "nowrap" }}>
          {t.estado === "esperando_voz" ? (
            <a className="boton primario chico" href={`#/grabar/${t.id}`}>
              <Mic size={16} /> Grabar o subir tu voz
            </a>
          ) : null}
          {t.estado === "esperando_revision" ? (
            <a className="boton primario chico" href={t.tipo === "crudo" ? `#/crudo/${t.id}` : t.pasos.revision_voz === "en_curso" ? `#/voz/${t.id}` : `#/revision/${t.id}`}>
              <FileEdit size={16} /> {t.tipo === "crudo" ? "Revisar edición" : t.pasos.revision_voz === "en_curso" ? "Revisar tu voz" : "Revisar guion"}
            </a>
          ) : null}
          {t.estado === "listo" ? (
            <a className="boton primario chico" href={t.tipo === "crudo" ? `#/crudo/${t.id}` : `#/video/${t.id}`}>
              <Play size={16} /> Ver video
            </a>
          ) : null}
          {(t.estado === "error" || t.estado === "pausado" || t.estado === "cancelado") && !pendiente ? (
            <button className="boton chico" disabled={ocupado} onClick={() => void accion(() => api.reanudar(t.id), "Retomando el trabajo…")}>
              <RotateCcw size={16} /> Reanudar
            </button>
          ) : null}
          {t.estado === "trabajando" || t.estado === "en_cola" ? (
            <button className="boton chico peligro" disabled={ocupado} onClick={() => void accion(() => api.cancelar(t.id), "Cancelando…")}>
              <Square size={14} /> Cancelar
            </button>
          ) : null}
        </div>
      </div>

      <ol className="pasos">
        {pasosDe(t.tipo, t.opciones.modo).map((id) => {
          const nombre = NOMBRES_PASOS[id];
          const e = t.pasos[id] ?? "pendiente";
          const tiempos = t.tiempos?.[id];
          const ms = tiempos?.inicio ? (tiempos.fin ? Date.parse(tiempos.fin) : Date.now()) - Date.parse(tiempos.inicio) : null;
          // la revisión "en curso" no es trabajo de la compu: está esperando a que la hagas vos
          const esperandote = e === "en_curso" && ((id === "revision" || id === "revision_voz") && t.estado === "esperando_revision" || (id === "grabacion" && t.estado === "esperando_voz"));
          return (
            <li key={id} className={`paso ${e}`}>
              <div className="fila" style={{ gap: 8, flexWrap: "nowrap" }}>
                {esperandote ? (
                  <span className="paso-icono" style={{ background: id === "grabacion" ? "var(--voz)" : "var(--info)", color: "#04121f" }}>
                    {id === "grabacion" ? <Mic size={12} /> : <PenLine size={12} />}
                  </span>
                ) : e === "en_curso" ? (
                  <span className="girando" />
                ) : (
                  <span className="paso-icono">{e === "hecho" ? <Check size={12} /> : e === "error" ? <AlertTriangle size={12} /> : e === "salteado" ? <Minus size={12} /> : null}</span>
                )}
                <b>{nombre}</b>
              </div>
              <span className="tiempo">
                {esperandote ? "esperándote" : id === "render" && e === "en_curso" ? `${Math.round(pctRender * 100)} %` : id === "transcripcion" && pctTranscripcion !== null ? `${Math.round(pctTranscripcion * 100)} %` : e === "salteado" ? "automático" : ms !== null && e !== "pendiente" ? duracion(ms) : "—"}
              </span>
            </li>
          );
        })}
      </ol>

      {t.pasos.render === "en_curso" ? (
        <div className="progreso" style={{ marginTop: 12 }} aria-label="Progreso del render">
          <div style={{ width: `${pctRender * 100}%` }} />
        </div>
      ) : null}

      {pctTranscripcion !== null ? (
        <div className="progreso" style={{ marginTop: 12 }} aria-label="Progreso de la transcripción">
          <div style={{ width: `${pctTranscripcion * 100}%` }} />
        </div>
      ) : null}

      {pendiente && t.estado === "pausado" ? (
        <div className="aviso advertencia" style={{ marginTop: 12 }}>
          <strong>
            Necesito bajar el modelo «{pendiente.modelo}» ({textoMb(pendiente.mb)}) para transcribir.
          </strong>{" "}
          Si estás con los datos del celular, conviene esperar al Wi-Fi o usar uno más chico.
          <div className="fila" style={{ gap: 8, marginTop: 10 }}>
            <button className="boton primario chico" disabled={ocupado} onClick={() => void accion(() => api.aprobarModelo(pendiente.modelo), "Bajando el modelo…")}>
              <Download size={16} /> Bajar {textoMb(pendiente.mb)}
            </button>
            {alternativas.map((m) => (
              <button key={m.id} className="boton chico" disabled={ocupado} onClick={() => void accion(() => api.modeloCrudo(t.id, m.id), `Transcribo con ${m.nombre}…`)}>
                Usar {m.nombre} ({textoMb(m.mb)})
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {trabajando && actividad[t.id] ? (
        <div className="actividad">
          <span className="girando" />
          {actividad[t.id]}
        </div>
      ) : null}

      {t.error && t.estado !== "listo" && !pendiente ? <div className="aviso">{t.error}</div> : null}

      <button className="boton chico" style={{ marginTop: 12 }} onClick={() => setVerLog((v) => !v)}>
        {verLog ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {verLog ? "Ocultar detalle" : "Ver detalle"}
      </button>
      {verLog ? <Log id={t.id} vivas={logs[t.id] ?? []} /> : null}
    </article>
  );
};

/** Log: lo guardado en log.txt + lo que llega en vivo. */
const Log: React.FC<{ id: string; vivas: { linea: string; nivel: string }[] }> = ({ id, vivas }) => {
  const [lineas, setLineas] = useState<string[] | null>(null);
  useEffect(() => {
    api
      .trabajo(id)
      .then((d) => setLineas(d.log))
      .catch(() => setLineas([]));
  }, [id, vivas.length]);
  return (
    <div className="log">
      {lineas === null ? "Cargando…" : lineas.length === 0 ? "Sin registros todavía." : null}
      {lineas?.map((l, i) => (
        <div key={i} className={l.includes("ERROR") ? "err" : ""}>
          {l}
        </div>
      ))}
    </div>
  );
};
