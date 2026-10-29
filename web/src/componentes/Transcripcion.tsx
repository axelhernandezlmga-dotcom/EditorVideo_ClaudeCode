import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import type { Marca } from "../../../src/shared/schemas";
import { MB_PREGUNTAR_DESCARGA, textoMb, tiempoEstimado } from "../../../src/shared/transcripcion";
import { api, type ModeloTranscripcion } from "../api";

/** Configuración → Transcripción: motor, modelo (con tamaño y tiempo estimado para 2 min) e hilos de CPU. */
export const AjustesTranscripcion: React.FC<{ marca: Marca; onCambio: (c: Marca["crudo"]) => void }> = ({ marca, onCambio }) => {
  const [modelos, setModelos] = useState<ModeloTranscripcion[] | null>(null);
  const [fw, setFw] = useState(true);
  useEffect(() => {
    api
      .transcripcion()
      .then((r) => {
        setModelos(r.modelos);
        setFw(r.fasterWhisper);
      })
      .catch(() => setModelos([]));
  }, []);
  const c = marca.crudo;
  const elegido = modelos?.find((m) => m.id === c.modeloWhisper);
  return (
    <section className="tarjeta">
      <h2 style={{ marginBottom: 14 }}>Transcripción de crudos</h2>
      <label className="campo">
        <span>Modelo (tiempo aproximado para 2 min de video)</span>
        <select value={c.modeloWhisper} onChange={(e) => onCambio({ ...c, modeloWhisper: e.target.value as Marca["crudo"]["modeloWhisper"] })}>
          {(modelos ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre} · {textoMb(m.mb)} · {tiempoEstimado(m.id, 120)}
              {m.bajado ? " · bajado" : ""}
            </option>
          ))}
        </select>
        <span className="ayuda">{elegido?.detalle}</span>
      </label>
      {elegido && !elegido.bajado ? (
        <div className="aviso advertencia" style={{ marginBottom: 12 }}>
          <Download size={16} style={{ verticalAlign: "-3px" }} /> Este modelo no está bajado: se baja la primera vez que transcribas ({textoMb(elegido.mb)}).
          {elegido.mb > MB_PREGUNTAR_DESCARGA ? " Antes de bajarlo te pregunto, por si estás con los datos del celular." : ""}
        </div>
      ) : null}
      <div className="rejilla-2">
        <label className="campo">
          <span>Motor</span>
          <select value={c.motorTranscripcion} onChange={(e) => onCambio({ ...c, motorTranscripcion: e.target.value as Marca["crudo"]["motorTranscripcion"] })}>
            <option value="faster-whisper">faster-whisper (rápido){fw ? "" : " — no instalado"}</option>
            <option value="whisper.cpp">whisper.cpp (respaldo, ~4× más lento)</option>
          </select>
        </label>
        <label className="campo">
          <span>Hilos de CPU: {c.hilosTranscripcion}</span>
          <input type="range" min={1} max={16} value={c.hilosTranscripcion} onChange={(e) => onCambio({ ...c, hilosTranscripcion: Number(e.target.value) })} />
          <span className="ayuda">En esta compu 4 es lo más rápido: los núcleos de eficiencia frenan si se usan todos.</span>
        </label>
      </div>
    </section>
  );
};
