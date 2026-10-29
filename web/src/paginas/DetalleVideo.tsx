import { ArrowLeft, Copy, Download, FileEdit, FolderOpen, Mic, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, copiar, type DetalleTrabajo } from "../api";
import { ir, useAviso } from "../App";
import { SelectorVoz } from "../componentes/SelectorVoz";
import { Insignia, TarjetaTrabajo } from "../componentes/TarjetaTrabajo";
import { ReporteMarca } from "../componentes/ReporteMarca";
import { useMotor } from "../motor";

export const DetalleVideo: React.FC<{ id: string }> = ({ id }) => {
  const avisar = useAviso();
  const { trabajos } = useMotor();
  const [d, setD] = useState<DetalleTrabajo | null>(null);
  const [voz, setVoz] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const vivo = trabajos.find((t) => t.id === id);

  const cargar = useCallback(async () => {
    try {
      const det = await api.trabajo(id);
      setD(det);
      setVoz((v) => v || det.estado.opciones.voz || "");
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  }, [id, avisar]);

  useEffect(() => {
    void cargar();
    api
      .config()
      .then((c) => setVoz((v) => v || c.marca.voz))
      .catch(() => undefined);
  }, [cargar]);

  // si se rehízo y terminó, recargar para ver el video nuevo
  useEffect(() => {
    if (vivo?.estado === "listo" && d && d.estado.actualizado !== vivo.actualizado) void cargar();
  }, [vivo?.estado, vivo?.actualizado, d, cargar]);

  const accion = async (fn: () => Promise<unknown>, ok: string, aCola = false) => {
    setOcupado(true);
    try {
      await fn();
      avisar(ok, "ok");
      if (aCola) ir("animados/cola");
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setOcupado(false);
    }
  };

  if (!d) return <div className="vacio">Cargando…</div>;
  const estado = vivo?.estado ?? d.estado.estado;
  const version = encodeURIComponent(d.estado.actualizado);

  return (
    <>
      <a className="boton chico" href="#/animados/galeria" style={{ marginBottom: 16 }}>
        <ArrowLeft size={16} /> Galería
      </a>
      <div className="encabezado">
        <div style={{ minWidth: 0 }}>
          <h1 style={{ overflowWrap: "anywhere" }}>{d.guion?.titulo ?? d.estado.idea}</h1>
          <p>
            {new Date(d.estado.creado).toLocaleString("es-UY", { dateStyle: "long", timeStyle: "short" })} · <Insignia estado={estado} />
          </p>
        </div>
      </div>

      {estado !== "listo" && vivo ? <TarjetaTrabajo t={vivo} /> : null}

      <ReporteMarca r={d.marcaReporte} />

      {d.archivos.video ? (
        <div className="video-detalle" style={{ marginTop: 16 }}>
          <div>
            <video className="reproductor" src={`${d.archivos.video}?v=${version}`} controls playsInline poster={d.archivos.portada ? `${d.archivos.portada}?v=${version}` : undefined} />
            <div className="fila" style={{ marginTop: 12 }}>
              <a className="boton primario crece" href={d.archivos.video} download={`${id}.mp4`}>
                <Download size={18} /> Descargar video
              </a>
              {d.archivos.portada ? (
                <a className="boton" href={d.archivos.portada} download={`${id}-portada.png`}>
                  <Download size={18} /> Portada
                </a>
              ) : null}
            </div>
          </div>

          <div>
            <section className="tarjeta">
              <div className="tarjeta-titulo">
                <h2>Texto para la publicación</h2>
                <button className="boton chico" onClick={() =>
                    void copiar(d.publicacion ?? "")
                      .then(() => avisar("Copiado. Pegalo en Instagram o TikTok.", "ok"))
                      .catch((e: Error) => avisar(e.message, "error"))
                  }>
                  <Copy size={16} /> Copiar
                </button>
              </div>
              <p className="texto-publicacion">{d.publicacion ?? "—"}</p>
              {d.archivos.portada ? (
                <div className="fila" style={{ alignItems: "flex-start" }}>
                  <img className="portada" src={`${d.archivos.portada}?v=${version}`} alt="Portada" />
                  <p className="ayuda" style={{ flex: 1, margin: 0 }}>
                    Portada para subir como miniatura (en Reels: "Editar portada" → "Agregar desde la galería").
                  </p>
                </div>
              ) : null}
            </section>

            <section className="tarjeta">
              <h2 style={{ marginBottom: 12 }}>Fuentes</h2>
              {d.fuentes.length ? (
                <ol className="fuentes">
                  {d.fuentes.map((f, k) => (
                    <li key={k}>
                      <a href={f.url} target="_blank" rel="noreferrer">
                        {f.titulo}
                      </a>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="ayuda">Sin fuentes registradas.</p>
              )}
            </section>

            <section className="tarjeta">
              <h2 style={{ marginBottom: 12 }}>Cambiar algo</h2>
              <div className="campo">
                <span>Rehacer con otra voz (mantiene el guion)</span>
                {voz ? <SelectorVoz valor={voz} onCambio={setVoz} velocidad="+8%" /> : null}
                <button className="boton" style={{ alignSelf: "flex-start" }} disabled={ocupado || !voz} onClick={() => void accion(() => api.rehacerVoz(id, voz), "Rehaciendo con la voz nueva…", true)}>
                  <Mic size={18} /> Rehacer con esta voz
                </button>
              </div>
              <div className="fila">
                <a className="boton" href={`#/revision/${id}`}>
                  <FileEdit size={18} /> Editar guion
                </a>
                <button
                  className="boton"
                  disabled={ocupado}
                  onClick={() => {
                    if (window.confirm("Se escribe un guion nuevo desde cero (con nueva investigación). ¿Seguimos?")) {
                      void accion(() => api.regenerarGuion(id), "Escribiendo un guion nuevo…", true);
                    }
                  }}
                >
                  <RefreshCw size={18} /> Regenerar guion
                </button>
                <button className="boton" disabled={ocupado} onClick={() => void accion(() => api.abrirCarpeta(id), "Abrí la carpeta en la compu.")}>
                  <FolderOpen size={18} /> Abrir carpeta
                </button>
              </div>
            </section>
          </div>
        </div>
      ) : estado === "esperando_revision" ? (
        <div className="tarjeta vacio">
          <p>El guion está listo para revisar.</p>
          <a className="boton primario" href={`#/revision/${id}`}>
            Revisar guion
          </a>
        </div>
      ) : null}
    </>
  );
};
