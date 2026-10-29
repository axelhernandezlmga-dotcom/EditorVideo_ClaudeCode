import { Music, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { urlPista, type Pista } from "../../../src/shared/musica";
import { MOODS, type Mood } from "../../../src/shared/opcionesCrudo";
import { api, type DetalleCrudo } from "../api";
import { useAviso } from "../App";

/** Revisión → Música: qué pista suena y por qué; cambiar el mood o la pista (escuchándola) y el volumen. */
export const PanelMusica: React.FC<{ id: string; musica: DetalleCrudo["musica"]; onCambio: (d: DetalleCrudo) => void }> = ({ id, musica, onCambio }) => {
  const avisar = useAviso();
  const [pistas, setPistas] = useState<Pista[]>([]);
  const [sonando, setSonando] = useState<string | null>(null);
  const [volumen, setVolumen] = useState(musica?.volumen ?? 0.08);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    api
      .musica()
      .then((r) => setPistas(r.pistas))
      .catch(() => undefined);
    return () => audio.current?.pause();
  }, []);
  useEffect(() => setVolumen(musica?.volumen ?? 0.08), [musica?.volumen]);

  const pedir = async (cambio: Parameters<typeof api.cambiarMusica>[1]) => {
    try {
      onCambio(await api.cambiarMusica(id, cambio));
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };
  const escuchar = (archivo: string) => {
    audio.current?.pause();
    if (sonando === archivo) return setSonando(null);
    audio.current = new Audio(urlPista(archivo));
    audio.current.volume = 0.5;
    void audio.current.play();
    audio.current.onended = () => setSonando(null);
    setSonando(archivo);
  };

  if (!musica) return <p className="ayuda">La música se elige junto con los efectos.</p>;
  const mood = musica.mood as Mood;
  const delMood = pistas.filter((p) => p.mood === mood);
  return (
    <div className="panel-musica">
      <div className="fila" style={{ gap: 10, justifyContent: "space-between" }}>
        <label className="interruptor">
          <input type="checkbox" checked={musica.activa} onChange={(e) => void pedir({ activa: e.target.checked })} />
          Música de fondo
        </label>
        {musica.activa ? (
          <select value={mood} onChange={(e) => void pedir({ mood: e.target.value as Mood })} style={{ width: "auto" }} aria-label="Mood">
            {MOODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {musica.activa ? (
        <>
          <p className="ayuda" style={{ margin: "8px 0" }}>
            <Music size={14} style={{ verticalAlign: "-2px" }} /> «{MOODS.find((m) => m.id === mood)?.nombre}»: {musica.motivo}
          </p>
          <ul className="lista-pistas">
            {delMood.map((p) => (
              <li key={p.archivo} className={p.archivo === musica.pista ? "activa" : ""}>
                <button className="boton-icono" onClick={() => escuchar(p.archivo)} aria-label={sonando === p.archivo ? "Pausar" : "Escuchar"}>
                  {sonando === p.archivo ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <span>
                  {p.original.replace(/\.[^.]+$/, "")}
                  <small>
                    {p.categoria ? `Biblioteca: ${p.categoria}` : `${Math.round(p.bpm)} BPM`} · {Math.round(p.duracion)} s{p.tonalidad ? ` · ${p.tonalidad}` : ""}
                  </small>
                </span>
                {p.archivo === musica.pista ? (
                  <b className="ayuda">en el video</b>
                ) : (
                  <button className="boton chico" onClick={() => void pedir({ pista: p.archivo })}>
                    Usar
                  </button>
                )}
              </li>
            ))}
          </ul>
          <label className="campo" style={{ marginTop: 10 }}>
            <span>Volumen: {Math.round(volumen * 100)} % (baja sola cuando hablás)</span>
            <input type="range" min={0.02} max={0.2} step={0.01} value={volumen} onChange={(e) => setVolumen(Number(e.target.value))} onPointerUp={() => void pedir({ volumen })} onKeyUp={() => void pedir({ volumen })} />
          </label>
        </>
      ) : null}
    </div>
  );
};
