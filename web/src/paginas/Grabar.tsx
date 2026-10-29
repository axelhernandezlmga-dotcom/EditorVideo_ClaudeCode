import { Check, Mic, Pause, Play, RotateCcw, Send, Square, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type DetalleVoz } from "../api";
import { ir, useAviso } from "../App";
import { Insignia } from "../componentes/TarjetaTrabajo";
import { useMotor } from "../motor";

/** Formato que graba este navegador (Chrome/Firefox: webm/opus; Safari: mp4/aac). */
const formatoGrabacion = () => {
  const opciones = [
    { mime: "audio/webm;codecs=opus", ext: ".webm" },
    { mime: "audio/webm", ext: ".webm" },
    { mime: "audio/mp4", ext: ".m4a" },
    { mime: "audio/ogg;codecs=opus", ext: ".ogg" },
  ];
  return opciones.find((o) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(o.mime)) ?? { mime: "", ext: ".webm" };
};

/** ¿Se puede usar el micrófono acá? Solo en HTTPS o localhost (regla de los navegadores). */
const microfonoDisponible = () => window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

const seg = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

type Estado = "listo" | "cuenta" | "grabando" | "pausado" | "grabado";

/** Micrófono + grabadora + medidor de nivel. */
const useGrabadora = () => {
  const [estado, setEstado] = useState<Estado>("listo");
  const [nivel, setNivel] = useState(0);
  const [cuenta, setCuenta] = useState(0);
  const [ms, setMs] = useState(0);
  const [grabacion, setGrabacion] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const flujo = useRef<MediaStream | null>(null);
  const grabadora = useRef<MediaRecorder | null>(null);
  const partes = useRef<Blob[]>([]);
  const reloj = useRef<{ desde: number; acumulado: number }>({ desde: 0, acumulado: 0 });
  const formato = useRef(formatoGrabacion());

  // el micrófono se pide una vez y el medidor queda andando (así ves el nivel antes de grabar)
  const pedirMicrofono = useCallback(async () => {
    if (flujo.current) return flujo.current;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      flujo.current = s;
      const ctx = new AudioContext();
      const analizador = ctx.createAnalyser();
      analizador.fftSize = 1024;
      ctx.createMediaStreamSource(s).connect(analizador);
      const datos = new Float32Array(analizador.fftSize);
      const medir = () => {
        if (!flujo.current) return void ctx.close();
        analizador.getFloatTimeDomainData(datos);
        let suma = 0;
        for (const v of datos) suma += v * v;
        const db = 10 * Math.log10(suma / datos.length + 1e-10);
        setNivel(Math.max(0, Math.min(1, (db + 60) / 50)));
        requestAnimationFrame(medir);
      };
      medir();
      return s;
    } catch {
      setError("No pude usar el micrófono. Revisá el permiso del navegador (el candado al lado de la dirección).");
      return null;
    }
  }, []);

  useEffect(
    () => () => {
      flujo.current?.getTracks().forEach((t) => t.stop());
      flujo.current = null;
    },
    [],
  );

  // cronómetro mientras graba
  useEffect(() => {
    if (estado !== "grabando") return;
    const i = setInterval(() => setMs(reloj.current.acumulado + Date.now() - reloj.current.desde), 200);
    return () => clearInterval(i);
  }, [estado]);

  /** Cuenta 3-2-1 y empieza a grabar. */
  const grabar = async (alEmpezar?: () => void) => {
    const s = await pedirMicrofono();
    if (!s) return;
    setGrabacion(null);
    setMs(0);
    setEstado("cuenta");
    for (const n of [3, 2, 1]) {
      setCuenta(n);
      await new Promise((r) => setTimeout(r, 800));
    }
    partes.current = [];
    const r = new MediaRecorder(s, formato.current.mime ? { mimeType: formato.current.mime } : undefined);
    r.ondataavailable = (e) => e.data.size && partes.current.push(e.data);
    r.onstop = () => {
      setGrabacion(new Blob(partes.current, { type: formato.current.mime || "audio/webm" }));
      setEstado("grabado");
    };
    r.start(500);
    grabadora.current = r;
    reloj.current = { desde: Date.now(), acumulado: 0 };
    setEstado("grabando");
    alEmpezar?.();
  };

  const pausar = () => {
    grabadora.current?.pause();
    reloj.current.acumulado += Date.now() - reloj.current.desde;
    setEstado("pausado");
  };
  const seguir = () => {
    grabadora.current?.resume();
    reloj.current.desde = Date.now();
    setEstado("grabando");
  };
  const parar = () => grabadora.current?.state !== "inactive" && grabadora.current?.stop();
  const descartar = () => {
    if (grabadora.current && grabadora.current.state !== "inactive") {
      grabadora.current.onstop = null;
      grabadora.current.stop();
    }
    setGrabacion(null);
    setMs(0);
    setEstado("listo");
  };

  return { estado, nivel, cuenta, ms, grabacion, error, formato: formato.current, pedirMicrofono, grabar, pausar, seguir, parar, descartar };
};

const Medidor: React.FC<{ nivel: number }> = ({ nivel }) => (
  <div className="medidor-mic" aria-label={`Nivel del micrófono ${Math.round(nivel * 100)} %`} title="Hablá normal: la barra tiene que llegar a la zona verde, sin tocar la roja">
    <div style={{ width: `${nivel * 100}%`, background: nivel > 0.92 ? "var(--error)" : nivel > 0.45 ? "var(--ok)" : "var(--acento)" }} />
  </div>
);

/** Teleprompter: el guion grande, que avanza solo (velocidad ajustable), con la ruedita o con las flechas. */
const Teleprompter: React.FC<{ escenas: string[]; activa: boolean; velocidad: number; soloEscena?: number }> = ({ escenas, activa, velocidad, soloEscena }) => {
  const caja = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(0);
  const pausadoTeclado = useRef(false);

  // avance automático: píxeles por segundo según la velocidad elegida
  useEffect(() => {
    if (!activa) return;
    let ultimo = performance.now();
    let raf = 0;
    const paso = (ahora: number) => {
      const el = caja.current;
      if (el && !pausadoTeclado.current) el.scrollTop += ((ahora - ultimo) / 1000) * 38 * velocidad;
      ultimo = ahora;
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [activa, velocidad]);

  // escena "actual" = la que cruza la línea de lectura
  const alDesplazar = () => {
    const el = caja.current;
    if (!el) return;
    const linea = el.scrollTop + el.clientHeight * 0.35;
    const hijos = Array.from(el.querySelectorAll<HTMLElement>("[data-escena]"));
    const k = hijos.findLastIndex((h) => h.offsetTop <= linea);
    setActual(Math.max(0, k));
  };

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      const el = caja.current;
      if (!el) return;
      if (e.code === "Space") {
        e.preventDefault();
        pausadoTeclado.current = !pausadoTeclado.current;
      } else if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        el.scrollBy({ top: el.clientHeight * 0.4, behavior: "smooth" });
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        el.scrollBy({ top: -el.clientHeight * 0.4, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  useEffect(() => {
    if (caja.current) caja.current.scrollTop = 0;
  }, [soloEscena]);

  const lista = soloEscena === undefined ? escenas.map((t, i) => ({ t, i })) : [{ t: escenas[soloEscena] ?? "", i: soloEscena }];
  return (
    <div className="teleprompter" ref={caja} onScroll={alDesplazar} tabIndex={0} aria-label="Teleprompter">
      <div className="teleprompter-linea" aria-hidden />
      <div style={{ height: "30%" }} />
      {lista.map(({ t, i }) => (
        <p key={i} data-escena={i} className={soloEscena !== undefined || actual === i ? "actual" : ""}>
          <small>Escena {i + 1}</small>
          {t}
        </p>
      ))}
      <div style={{ height: "70%" }} />
    </div>
  );
};

/** Pantalla "Grabar": tu voz para un video "Mi voz" (grabada acá o subida de un archivo). */
export const Grabar: React.FC<{ id: string }> = ({ id }) => {
  const avisar = useAviso();
  const { trabajos } = useMotor();
  const [d, setD] = useState<DetalleVoz | null>(null);
  const puedeGrabar = microfonoDisponible();
  const [pestana, setPestana] = useState<"grabar" | "subir">(puedeGrabar ? "grabar" : "subir");
  const [forma, setForma] = useState<"corrido" | "escenas">("corrido");
  const [escena, setEscena] = useState(0);
  const [velocidad, setVelocidad] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const g = useGrabadora();
  const escuchar = useRef<HTMLAudioElement>(null);
  const vivo = trabajos.find((t) => t.id === id);
  const urlGrabacion = useMemo(() => (g.grabacion ? URL.createObjectURL(g.grabacion) : null), [g.grabacion]);
  useEffect(() => () => void (urlGrabacion && URL.revokeObjectURL(urlGrabacion)), [urlGrabacion]);

  const cargar = useCallback(() => {
    api
      .voz(id)
      .then(setD)
      .catch((e: Error) => avisar(e.message, "error"));
  }, [id, avisar]);
  useEffect(cargar, [cargar, vivo?.estado]);

  const subir = async (audio: Blob, nombre: string, como: "archivo" | "navegador") => {
    setEnviando(true);
    try {
      await api.subirVoz(id, audio, nombre, como);
      avisar("¡Llegó tu voz! La limpio, la corto y sigo con el video.", "ok");
      ir("animados/cola");
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  };

  const guardarToma = async () => {
    if (!g.grabacion) return;
    setEnviando(true);
    try {
      setD(await api.subirTomaEscena(id, escena, g.grabacion, `toma${g.formato.ext}`));
      g.descartar();
      if (d && escena < d.escenas.length - 1) setEscena(escena + 1);
      avisar(`Escena ${escena + 1} guardada.`, "ok");
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  };

  const terminarEscenas = async () => {
    setEnviando(true);
    try {
      await api.tomasListas(id);
      avisar("Uní tus tomas: ahora las limpio, las corto y sigo con el video.", "ok");
      ir("animados/cola");
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  };

  if (!d) return <div className="tarjeta vacio">Cargando…</div>;
  const estado = vivo?.estado ?? d.estado.estado;
  const tomaDe = (n: number) => d.tomas.find((t) => t.escena === n);
  const grabando = g.estado === "grabando" || g.estado === "pausado" || g.estado === "cuenta";

  return (
    <>
      <div className="encabezado">
        <div style={{ minWidth: 0 }}>
          <h1 style={{ overflowWrap: "anywhere" }}>
            <Mic size={26} style={{ verticalAlign: "-4px", color: "var(--voz)" }} /> Grabá tu voz
          </h1>
          <div className="fila" style={{ marginTop: 8, gap: 8 }}>
            <Insignia estado={estado} />
            <span className="ayuda">{d.titulo}</span>
          </div>
        </div>
      </div>

      {estado !== "esperando_voz" && d.grabacion ? (
        <div className="aviso info">
          Ya tengo una grabación ({d.grabacion.nombre}). Si grabás o subís otra, reemplaza a la anterior y se rehacen los cortes.
        </div>
      ) : null}

      <div className="pestanas" role="tablist">
        <button role="tab" aria-selected={pestana === "grabar"} className={pestana === "grabar" ? "activa" : ""} onClick={() => setPestana("grabar")} disabled={!puedeGrabar}>
          <Mic size={16} /> Grabar acá
        </button>
        <button role="tab" aria-selected={pestana === "subir"} className={pestana === "subir" ? "activa" : ""} onClick={() => setPestana("subir")}>
          <Upload size={16} /> Subir un archivo
        </button>
      </div>

      {!puedeGrabar ? (
        <div className="aviso advertencia">
          <strong>Desde acá no puedo usar el micrófono.</strong> Los navegadores solo lo permiten en conexiones seguras (https) o en la misma compu.
          Grabá una <b>nota de voz</b> (WhatsApp, Grabadora o Notas de voz) leyendo el guion de abajo y subila. También podés abrir la dirección https de la app (está en Configuración).
        </div>
      ) : null}

      {pestana === "grabar" && puedeGrabar ? (
        <section className="tarjeta">
          <div className="fila" style={{ justifyContent: "space-between", gap: 12 }}>
            <div className="segmentado" role="radiogroup" aria-label="Cómo grabar">
              <button role="radio" aria-checked={forma === "corrido"} className={forma === "corrido" ? "activo" : ""} disabled={grabando} onClick={() => setForma("corrido")}>
                Todo de una
              </button>
              <button role="radio" aria-checked={forma === "escenas"} className={forma === "escenas" ? "activo" : ""} disabled={grabando} onClick={() => setForma("escenas")}>
                Escena por escena
              </button>
            </div>
            <label className="fila" style={{ gap: 8, flexWrap: "nowrap" }}>
              <span className="ayuda">Velocidad</span>
              <input type="range" min={0.4} max={2.2} step={0.1} value={velocidad} onChange={(e) => setVelocidad(Number(e.target.value))} aria-label="Velocidad del teleprompter" />
              <b style={{ width: 38 }}>{velocidad.toFixed(1)}×</b>
            </label>
          </div>

          <div style={{ position: "relative", marginTop: 14 }}>
            <Teleprompter escenas={d.escenas} activa={g.estado === "grabando"} velocidad={velocidad} soloEscena={forma === "escenas" ? escena : undefined} />
            {g.estado === "cuenta" ? (
              <div className="cuenta-regresiva" key={g.cuenta}>
                {g.cuenta}
              </div>
            ) : null}
          </div>
          <p className="ayuda" style={{ marginTop: 8 }}>
            Avanza solo mientras grabás. <b>Espacio</b>: frena o sigue · <b>flechas</b> o <b>ruedita</b>: adelante y atrás.
          </p>

          <div className="fila" style={{ gap: 12, marginTop: 12 }}>
            <Mic size={18} style={{ color: "var(--tenue)" }} />
            <Medidor nivel={g.nivel} />
            <span className="cronometro">{seg(g.ms)}</span>
          </div>
          {g.error ? <div className="aviso">{g.error}</div> : null}

          <div className="fila" style={{ gap: 10, marginTop: 14 }}>
            {g.estado === "listo" || g.estado === "grabado" ? (
              <button className="boton primario grande grabar" onClick={() => void g.grabar()}>
                <span className="punto-rec" /> {g.estado === "grabado" ? "Grabar de nuevo" : forma === "escenas" ? `Grabar la escena ${escena + 1}` : "Grabar"}
              </button>
            ) : null}
            {g.estado === "grabando" ? (
              <>
                <button className="boton" onClick={g.pausar}>
                  <Pause size={18} /> Pausar
                </button>
                <button className="boton primario" onClick={g.parar}>
                  <Square size={16} /> Terminar
                </button>
              </>
            ) : null}
            {g.estado === "pausado" ? (
              <>
                <button className="boton primario" onClick={g.seguir}>
                  <Play size={18} /> Seguir
                </button>
                <button className="boton" onClick={g.parar}>
                  <Square size={16} /> Terminar
                </button>
              </>
            ) : null}
            {grabando ? (
              <button className="boton peligro" onClick={g.descartar}>
                <RotateCcw size={16} /> Repetir
              </button>
            ) : null}
            {g.grabacion ? (
              <>
                <audio ref={escuchar} src={urlGrabacion ?? undefined} controls style={{ height: 40 }} />
                {forma === "corrido" ? (
                  <button className="boton primario" disabled={enviando} onClick={() => void subir(g.grabacion!, `grabacion${g.formato.ext}`, "navegador")}>
                    {enviando ? <span className="girando" /> : <Send size={16} />} Usar esta grabación
                  </button>
                ) : (
                  <button className="boton primario" disabled={enviando} onClick={() => void guardarToma()}>
                    {enviando ? <span className="girando" /> : <Check size={16} />} Guardar escena {escena + 1}
                  </button>
                )}
              </>
            ) : null}
          </div>

          {forma === "escenas" ? (
            <div style={{ marginTop: 18 }}>
              <span className="etiqueta">Escenas</span>
              <ol className="lista-tomas">
                {d.escenas.map((t, n) => {
                  const toma = tomaDe(n);
                  return (
                    <li key={n} className={n === escena ? "actual" : ""}>
                      <button className="toma-elegir" disabled={grabando} onClick={() => setEscena(n)}>
                        <b>{n + 1}</b> <span>{t}</span>
                      </button>
                      {toma ? (
                        <span className="fila" style={{ gap: 6, flexWrap: "nowrap" }}>
                          <span className="insignia listo">
                            <Check size={12} style={{ verticalAlign: "-2px" }} /> {(toma.duracionMs / 1000).toFixed(1)} s
                          </span>
                          <audio src={toma.url} controls preload="none" style={{ height: 32, width: 150 }} />
                        </span>
                      ) : (
                        <span className="ayuda">sin grabar</span>
                      )}
                    </li>
                  );
                })}
              </ol>
              <button className="boton primario" disabled={enviando || d.tomas.length === 0 || grabando} onClick={() => void terminarEscenas()}>
                <Send size={16} /> Listo: armar el video con {d.tomas.length} de {d.escenas.length} escenas
              </button>
              {d.tomas.length > 0 && d.tomas.length < d.escenas.length ? <p className="ayuda">Las escenas que no grabes salen del video.</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {pestana === "subir" ? (
        <section className="tarjeta">
          <h2>Subí tu grabación</h2>
          <p className="ayuda">Sirve cualquier audio: {d.extensiones.join(", ")}, y las notas de voz de WhatsApp. Leé el guion de abajo; si te equivocás, repetí la frase y yo me quedo con la última toma.</p>
          <label className={`zona-subida zona-voz ${enviando ? "ocupada" : ""}`}>
            <input
              type="file"
              accept="audio/*,.opus,.ogg,.m4a"
              disabled={enviando}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void subir(f, f.name, "archivo");
              }}
            />
            {enviando ? <span className="girando" /> : <Upload size={28} />}
            <span>{enviando ? "Subiendo…" : "Tocá para elegir el archivo"}</span>
          </label>
          <div className="guion-leer">
            {d.escenas.map((t, n) => (
              <p key={n}>
                <small>Escena {n + 1}</small> {t}
              </p>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
};
