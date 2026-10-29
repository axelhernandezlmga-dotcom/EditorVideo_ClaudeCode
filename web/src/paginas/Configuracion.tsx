import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { PROVEEDORES_VOZ, type Marca } from "../../../src/shared/schemas";
import { FUENTES_MUSICA } from "../../../src/shared/musica";
import { api, type AvisoConfig } from "../api";
import { useAviso } from "../App";
import { Claves } from "../componentes/Claves";
import { InstalarKokoro, useKokoro } from "../componentes/Kokoro";
import { SelectorVoz } from "../componentes/SelectorVoz";
import { AjustesTranscripcion } from "../componentes/Transcripcion";
import { useMotor } from "../motor";

export const Configuracion: React.FC = () => {
  const avisar = useAviso();
  const [marca, setMarca] = useState<Marca | null>(null);
  const [original, setOriginal] = useState<string>("");
  /** Campos de marca.json que venían mal y se reemplazaron por su valor por defecto. */
  const [avisos, setAvisos] = useState<AvisoConfig[]>([]);
  const [guardando, setGuardando] = useState(false);
  const kokoro = useKokoro();
  const { usoGemini } = useMotor();

  useEffect(() => {
    api
      .config()
      .then((c) => {
        setMarca(c.marca);
        setOriginal(JSON.stringify(c.marca));
        setAvisos(c.avisos);
      })
      .catch((e: Error) => avisar(e.message, "error"));
  }, [avisar]);

  if (!marca) return <div className="vacio">Cargando…</div>;
  const cambiar = <K extends keyof Marca>(k: K, v: Marca[K]) => setMarca({ ...marca, [k]: v });
  // con avisos, guardar reescribe marca.json ya corregido
  const sinGuardar = JSON.stringify(marca) !== original || avisos.length > 0;
  const velocidadNum = Number.parseInt(marca.velocidad, 10) || 0;
  const tonoNum = Number.parseInt(marca.tono, 10) || 0;

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await api.guardarConfig(marca);
      const redCambio = JSON.parse(original).redLocal !== r.marca.redLocal || JSON.parse(original).puerto !== r.marca.puerto;
      setMarca(r.marca);
      setOriginal(JSON.stringify(r.marca));
      setAvisos(r.avisos);
      avisar(redCambio ? "Guardado. Reiniciá la app (Ctrl+C y npm start) para aplicar el cambio de red." : "Configuración guardada. Se usa en los próximos videos.", "ok");
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Configuración general</h1>
          <p>Lo que comparten los dos bloques: claves, voz, transcripción, música y uso de Gemini. Los colores y el @ van en cada perfil.</p>
        </div>
        <button className="boton primario" disabled={!sinGuardar || guardando} onClick={() => void guardar()}>
          {guardando ? <span className="girando" /> : <Save size={18} />} {sinGuardar ? "Guardar" : "Guardado"}
        </button>
      </div>

      {avisos.length ? (
        <div className="aviso advertencia" style={{ marginBottom: 16 }}>
          <strong>config/marca.json tenía valores que no entiendo; la app sigue con estos en su lugar:</strong>
          <ul style={{ margin: "6px 0 6px 18px" }}>
            {avisos.map((a) => (
              <li key={a.campo}>
                <code>{a.campo}</code> = <code>{JSON.stringify(a.valor)}</code> ({a.problema}){a.usado !== null ? <> → uso <code>{JSON.stringify(a.usado)}</code></> : null}
              </li>
            ))}
          </ul>
          Tocá «Guardar» para dejar el archivo corregido.
        </div>
      ) : null}

      <div className="columna-unica">
          <section className="tarjeta">
            <h2 style={{ marginBottom: 14 }}>Voz</h2>
            <label className="campo">
              <span>Proveedor de voz principal</span>
              <select value={marca.proveedorVoz} onChange={(e) => cambiar("proveedorVoz", e.target.value as Marca["proveedorVoz"])}>
                {PROVEEDORES_VOZ.map((p) => {
                  const sinInstalar = p.id === "kokoro" && kokoro.estado?.instalado === false;
                  return (
                    <option key={p.id} value={p.id} disabled={sinInstalar && marca.proveedorVoz !== p.id}>
                      {p.nombre}
                      {sinInstalar ? " (no instalado)" : ""}
                    </option>
                  );
                })}
              </select>
              <span className="ayuda">{PROVEEDORES_VOZ.find((p) => p.id === marca.proveedorVoz)?.detalle}</span>
            </label>
            {kokoro.estado ? <InstalarKokoro estado={kokoro.estado} instalar={kokoro.instalar} /> : null}
            <div className="campo">
              <span>Voz por defecto</span>
              <SelectorVoz key={kokoro.estado?.instalado ? "con-kokoro" : "sin-kokoro"} valor={marca.voz} onCambio={(v) => cambiar("voz", v)} velocidad={marca.velocidad} proveedor={marca.proveedorVoz} />
              <span className="ayuda">
                Las voces de Gemini leen toda la narración de una vez y actúan según el tono (sus notas de dirección se editan en cada tono).{" "}
                <a href="#/voces">Comparar voces con los textos de cada tono →</a>
              </span>
            </div>
            <div className="campo">
              <span>Voz de respaldo (edge-tts, gratis y sin cupo)</span>
              <SelectorVoz valor={marca.vozRespaldo} onCambio={(v) => cambiar("vozRespaldo", v)} velocidad={marca.velocidad} proveedor="edge" />
              <span className="ayuda">Se usa sola si Gemini no tiene clave o se acabó el plan gratis del día.</span>
            </div>
            {usoGemini ? (
              <div className={`aviso ${usoGemini.agotado ? "" : usoGemini.nivel === "ok" ? "info" : "advertencia"}`} style={{ marginBottom: 12 }}>
                <b>Uso de Gemini hoy:</b> {usoGemini.pedidos} de {usoGemini.limiteObservado ? "" : "~"}
                {usoGemini.limite} pedidos · {usoGemini.caracteres.toLocaleString("es-UY")} caracteres · {usoGemini.segundosAudio} s de audio
                {usoGemini.agotado ? " · se acabó el cupo de hoy (uso la voz de respaldo)" : ""}
              </div>
            ) : null}
            <label className="campo">
              <span>Pedidos diarios estimados de Gemini (plan gratis)</span>
              <input
                type="number"
                min={1}
                max={100000}
                value={marca.limiteDiarioGemini}
                onChange={(e) => cambiar("limiteDiarioGemini", Math.max(1, Math.round(Number(e.target.value) || 1)))}
              />
              <span className="ayuda">
                Google no publica el cupo gratis del TTS: miralo en{" "}
                <a href="https://aistudio.google.com/rate-limit" target="_blank" rel="noreferrer">
                  AI Studio → Rate limits
                </a>
                . Cada video gasta un pedido. Si Google corta antes, la app aprende el número real y lo usa en el medidor.
              </span>
            </label>
            <div className="rejilla-2">
              <label className="campo">
                <span>Velocidad: {marca.velocidad}</span>
                <input type="range" min={-20} max={40} step={1} value={velocidadNum} onChange={(e) => cambiar("velocidad", `${Number(e.target.value) >= 0 ? "+" : ""}${e.target.value}%`)} />
              </label>
              <label className="campo">
                <span>Tono: {marca.tono}</span>
                <input type="range" min={-20} max={20} step={1} value={tonoNum} onChange={(e) => cambiar("tono", `${Number(e.target.value) >= 0 ? "+" : ""}${e.target.value}Hz`)} />
              </label>
            </div>
          </section>

          <AjustesTranscripcion marca={marca} onCambio={(c) => cambiar("crudo", c)} />

          <section className="tarjeta">
            <h2 style={{ marginBottom: 14 }}>Música, sonido e imágenes</h2>
            <div className="fila" style={{ marginBottom: 12 }}>
              <label className="interruptor">
                <input type="checkbox" checked={marca.musica} onChange={(e) => cambiar("musica", e.target.checked)} />
                Música de fondo
              </label>
              <label className="interruptor">
                <input type="checkbox" checked={marca.sfx} onChange={(e) => cambiar("sfx", e.target.checked)} />
                Sonidos en las transiciones
              </label>
            </div>
            {marca.musica ? (
              <label className="campo">
                <span>Volumen de la música: {Math.round(marca.volumenMusica * 100)} % (baja sola cuando habla la voz)</span>
                <input type="range" min={0.02} max={0.3} step={0.01} value={marca.volumenMusica} onChange={(e) => cambiar("volumenMusica", Number(e.target.value))} />
              </label>
            ) : null}
            {marca.musica ? (
              <label className="campo">
                <span>De dónde sale la música automática</span>
                <select value={marca.fuenteMusica} onChange={(e) => cambiar("fuenteMusica", e.target.value as Marca["fuenteMusica"])}>
                  {FUENTES_MUSICA.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nombre}
                    </option>
                  ))}
                </select>
                <span className="ayuda">
                  Se elige por el ánimo del video, prefiriendo pistas que duren lo que el video. Tu música se importa en la <a href="#/biblioteca">Biblioteca</a> (pestaña Música), donde le ponés el ánimo a cada pista.
                </span>
              </label>
            ) : null}

          </section>

          <Claves />

          <section className="tarjeta">
            <h2 style={{ marginBottom: 14 }}>Acceso desde el celular</h2>
            <label className="interruptor">
              <input type="checkbox" checked={marca.redLocal} onChange={(e) => cambiar("redLocal", e.target.checked)} />
              Permitir entrar desde otros dispositivos de la misma Wi-Fi
            </label>
            <p className="ayuda">
              Al reiniciar la app, la terminal muestra la dirección para abrir en el celular. Cualquiera en tu red podría usar la app: activalo solo en redes de confianza (tu casa, no un
              café).
            </p>
            {marca.redLocal ? <HttpsCelular /> : null}
          </section>
      </div>
    </>
  );
};

type EstadoHttps = { activo: boolean; puerto: number | null; mkcert: boolean; ca: boolean; motivo?: string; direcciones: string[] };

/** https de la red local: para grabar tu voz con el micrófono del celular (por http el navegador no lo deja). */
const HttpsCelular: React.FC = () => {
  const [e, setE] = useState<EstadoHttps | null>(null);
  useEffect(() => {
    fetch("/api/https")
      .then((r) => r.json() as Promise<EstadoHttps>)
      .then(setE)
      .catch(() => undefined);
  }, []);
  if (!e) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ margin: "0 0 6px" }}>Grabar tu voz desde el celular (https)</h3>
      {e.activo ? (
        <>
          <p className="ayuda" style={{ marginTop: 0 }}>
            Abrí en el celular: {e.direcciones.map((d) => <b key={d} className="mono" style={{ marginRight: 10 }}>{d}</b>)}
          </p>
          <p className="ayuda">La primera vez el celular tiene que confiar en el certificado de tu compu (se hace una sola vez):</p>
          <ol className="ayuda" style={{ paddingLeft: 20, lineHeight: 1.6 }}>
            <li>
              En el iPhone, abrí <b>Safari</b> en la dirección <span className="mono">http://…:{window.location.port || "3000"}/api/https/ca</span> (o tocá{" "}
              <a href="/api/https/ca">este enlace</a> desde el celular) y aceptá «Permitir» la descarga del perfil.
            </li>
            <li>
              <b>Ajustes</b> → arriba aparece <b>Perfil descargado</b> → <b>Instalar</b> (te pide el código del celular).
            </li>
            <li>
              <b>Ajustes → General → Información → Ajustes de confianza de certificados</b> → activá <b>mkcert</b>.
            </li>
            <li>
              Listo: abrí la dirección <b>https</b> de arriba. En Android: Ajustes → Seguridad → Cifrado y credenciales → Instalar un certificado → Certificado de CA.
            </li>
          </ol>
        </>
      ) : (
        <div className="aviso advertencia">
          {e.mkcert ? `El https no arrancó: ${e.motivo}.` : (
            <>
              Para grabar desde el celular falta <b>mkcert</b>. En la terminal: <span className="mono">sudo pacman -S mkcert</span> y reiniciá la app.
            </>
          )}{" "}
          Mientras tanto, desde el celular podés subir una nota de voz.
        </div>
      )}
    </div>
  );
};
