import { Film, Scissors, UploadCloud, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DURACIONES_MAX, INTENSIDADES, MOODS, PAUSA_SILENCIO, type OpcionesCrudo, type PedidoCrudo } from "../../../src/shared/opcionesCrudo";
import { ESTILOS_SUBTITULOS, PALETAS, TAMANOS_SUBTITULOS, type Perfil } from "../../../src/shared/perfiles";
import { api } from "../api";
import { ir, useAviso } from "../App";
import { SelectorPerfil } from "../componentes/SelectorPerfil";
import { MuestraPaleta } from "../componentes/MuestraPaleta";
import { SelectorBiblioteca } from "../componentes/SelectorBiblioteca";
import { SelectorModo } from "../componentes/SelectorModo";
import { VistaPerfil } from "../componentes/VistaPerfil";
import { completarCrudo, subirPartes, type ProgresoSubida } from "../subida";

const ACEPTA = "video/mp4,video/quicktime,.mp4,.mov,.m4v";

const megas = (b: number) => `${(b / 1024 ** 2).toLocaleString("es-UY", { maximumFractionDigits: 1 })} MB`;

/** Botonera de opciones excluyentes (sí/no, rápido/normal/suave…). */
function Opciones<T extends string | number | boolean>({ valor, opciones, onCambio }: { valor: T; opciones: { v: T; texto: string; ayuda?: string }[]; onCambio: (v: T) => void }) {
  return (
    <div className="segmentado" role="radiogroup">
      {opciones.map((o) => (
        <button key={String(o.v)} role="radio" aria-checked={valor === o.v} className={valor === o.v ? "activo" : ""} title={o.ayuda} onClick={() => onCambio(o.v)}>
          {o.texto}
        </button>
      ))}
    </div>
  );
}

const SI_NO = [
  { v: true, texto: "Sí" },
  { v: false, texto: "No" },
];

/** Una fila del formulario: título a la izquierda, control a la derecha (en el celular, uno abajo del otro). */
const Fila: React.FC<{ titulo: string; ayuda?: string; children: React.ReactNode }> = ({ titulo, ayuda, children }) => (
  <div className="fila-opcion">
    <div>
      <b>{titulo}</b>
      {ayuda ? <span className="ayuda">{ayuda}</span> : null}
    </div>
    <div className="fila-opcion-control">{children}</div>
  </div>
);

/** "Editar crudo": elegís el video (se empieza a subir enseguida) y mientras completás las opciones. */
export const CrudoSubir: React.FC = () => {
  const avisar = useAviso();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [encima, setEncima] = useState(false);
  const [progreso, setProgreso] = useState<ProgresoSubida | null>(null);
  const [subida, setSubida] = useState<string | null>(null);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [pedido, setPedido] = useState<PedidoCrudo | null>(null);
  const [procesando, setProcesando] = useState(false);
  const control = useRef<AbortController | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const subidaLista = useRef<Promise<string> | null>(null);

  useEffect(() => {
    Promise.all([api.opcionesCrudo(), api.perfiles()])
      .then(([op, pf]) => {
        setPerfiles(pf.perfiles);
        // si el perfil que usaste la última vez ya no existe, el por defecto
        const perfil = pf.perfiles.some((p) => p.slug === op.perfil) ? op.perfil : pf.porDefecto || pf.perfiles[0]?.slug || "";
        // la intensidad por defecto del perfil (ej. una marca sobria: dinámica), si la tiene
        const intensidad = pf.perfiles.find((p) => p.slug === perfil)?.intensidadPorDefecto;
        setPedido({ ...op, perfil, crudo: intensidad ? { ...op.crudo, intensidad } : op.crudo });
      })
      .catch((e: Error) => avisar(e.message, "error"));
    return () => control.current?.abort();
  }, [avisar]);

  const perfil = perfiles.find((p) => p.slug === pedido?.perfil) ?? null;
  // vista previa con la paleta y los subtítulos elegidos para este video
  const perfilVista = useMemo(() => {
    if (!perfil || !pedido) return null;
    const paleta = PALETAS.find((p) => p.id === pedido.crudo.paleta);
    return { ...perfil, colores: paleta ? { ...paleta.colores } : perfil.colores, subtitulos: pedido.crudo.subtitulos ?? perfil.subtitulos };
  }, [perfil, pedido]);

  const elegir = (f: File | undefined) => {
    if (!f) return;
    if (!/\.(mp4|mov|m4v)$/i.test(f.name)) {
      avisar("Subí un video MP4 o MOV.", "error");
      return;
    }
    setArchivo(f);
    setErrorSubida(null);
    setSubida(null);
    control.current?.abort();
    control.current = new AbortController();
    setProgreso({ enviados: 0, total: f.size, parte: 0, partes: 1 });
    // la subida arranca ya: cuando termines el formulario probablemente ya esté
    const p = subirPartes(f, setProgreso, control.current.signal);
    subidaLista.current = p;
    p.then(setSubida).catch((e: Error) => {
      if (!control.current?.signal.aborted) setErrorSubida(e.message);
    });
  };

  const cancelar = () => {
    control.current?.abort();
    subidaLista.current = null;
    setArchivo(null);
    setProgreso(null);
    setSubida(null);
  };

  const procesar = async () => {
    if (!pedido || !subidaLista.current) return;
    setProcesando(true);
    try {
      const id = await subidaLista.current;
      await completarCrudo(id, pedido);
      avisar("¡Listo! Lo estoy preparando: te llevo a la cola.", "ok");
      ir("crudos/cola");
    } catch (e) {
      avisar((e as Error).message, "error");
      setProcesando(false);
    }
  };

  const cambiar = <K extends keyof OpcionesCrudo>(k: K, v: OpcionesCrudo[K]) => pedido && setPedido({ ...pedido, crudo: { ...pedido.crudo, [k]: v } });
  const pct = progreso ? progreso.enviados / Math.max(1, progreso.total) : 0;
  const c = pedido?.crudo;

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Subir crudo</h1>
          <p>Un video grabado de corrido. Mientras se sube, elegí cómo lo querés: le saco pausas, muletillas y tropiezos, le pongo subtítulos, noticias, música y efectos.</p>
        </div>
      </div>

      <div
        className={`tarjeta zona-subida ${encima ? "encima" : ""} ${archivo ? "con-archivo" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault();
          setEncima(false);
          if (!procesando) elegir(e.dataTransfer.files[0]);
        }}
        onClick={() => !archivo && entrada.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input ref={entrada} type="file" accept={ACEPTA} hidden onChange={(e) => elegir(e.target.files?.[0])} />
        {!archivo ? (
          <>
            <UploadCloud size={44} />
            <strong>Arrastrá tu video acá</strong>
            <span className="ayuda">o tocá para elegirlo · MP4 o MOV, hasta 8 GB</span>
          </>
        ) : (
          <div className="subiendo">
            <Film size={30} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ overflowWrap: "anywhere" }}>{archivo.name}</strong>
              <div className="progreso" aria-label="Progreso de la subida" style={{ marginTop: 8 }}>
                <div style={{ width: `${pct * 100}%` }} />
              </div>
              <span className="ayuda">
                {errorSubida
                  ? `No se pudo subir: ${errorSubida}`
                  : subida
                    ? `Subido (${megas(archivo.size)}). Elegí las opciones y tocá «Procesar».`
                    : `${megas(progreso?.enviados ?? 0)} de ${megas(archivo.size)} · ${Math.round(pct * 100)} %`}
              </span>
            </div>
            {!procesando ? (
              <button className="boton chico" onClick={(e) => (e.stopPropagation(), cancelar())}>
                <X size={16} /> Otro video
              </button>
            ) : null}
          </div>
        )}
      </div>

      {archivo && pedido && c ? (
        <div className="dos-columnas" style={{ marginTop: 18 }}>
          <div>
            <section className="tarjeta formulario-crudo">
              <h2>Opciones de este video</h2>
              <p className="ayuda" style={{ marginTop: 4 }}>
                Arranca con lo que elegiste la última vez.
              </p>

              <div className="fila-opcion" style={{ display: "block" }}>
                <b>Modo de edición</b>
                <div style={{ marginTop: 8 }}>
                  <SelectorModo valor={c.modo} onCambio={(v) => cambiar("modo", v)} />
                </div>
              </div>

              <Fila titulo="Perfil" ayuda="Con qué @, colores y letra sale el video.">
                <SelectorPerfil
                  perfiles={perfiles}
                  valor={pedido.perfil}
                  onCambio={(slug) => {
                    const intensidad = perfiles.find((p) => p.slug === slug)?.intensidadPorDefecto;
                    setPedido({ ...pedido, perfil: slug, crudo: intensidad ? { ...pedido.crudo, intensidad } : pedido.crudo });
                  }}
                  onCreado={(p) => {
                    setPerfiles([...perfiles, p]);
                    setPedido({ ...pedido, perfil: p.slug });
                  }}
                />
              </Fila>

              <Fila titulo="Paleta de colores" ayuda="La del perfil o otra solo para este video.">
                <div className="paletas-chicas">
                  <button className={`paleta ${c.paleta === "perfil" ? "activo" : ""}`} onClick={() => cambiar("paleta", "perfil")}>
                    {perfil ? <MuestraPaleta c={perfil.colores} /> : null}
                    Del perfil
                  </button>
                  {PALETAS.map((p) => (
                    <button key={p.id} className={`paleta ${c.paleta === p.id ? "activo" : ""}`} onClick={() => cambiar("paleta", p.id)}>
                      <MuestraPaleta c={p.colores} />
                      {p.nombre}
                    </button>
                  ))}
                </div>
              </Fila>

              <Fila titulo="Música de fondo" ayuda="Bajita, y baja más cuando hablás.">
                <div className="fila" style={{ gap: 10 }}>
                  <Opciones valor={c.musica.activa} opciones={SI_NO} onCambio={(v) => cambiar("musica", { ...c.musica, activa: v })} />
                  {c.musica.activa ? (
                    <>
                      <select value={c.musica.mood} onChange={(e) => cambiar("musica", { ...c.musica, mood: e.target.value as OpcionesCrudo["musica"]["mood"] })} style={{ width: "auto" }} aria-label="Mood">
                        <option value="auto">Mood automático</option>
                        {MOODS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nombre}
                          </option>
                        ))}
                      </select>
                      <label className="fila" style={{ gap: 8, minWidth: 180 }}>
                        <span className="ayuda">Vol. {Math.round(c.musica.volumen * 100)} %</span>
                        <input type="range" min={0.03} max={0.2} step={0.01} value={c.musica.volumen} onChange={(e) => cambiar("musica", { ...c.musica, volumen: Number(e.target.value) })} />
                      </label>
                    </>
                  ) : null}
                </div>
              </Fila>

              <Fila titulo="Incluir clips de la biblioteca" ayuda="Solo de las categorías elegidas, y solo cuando tienen que ver con lo que decís.">
                <SelectorBiblioteca valor={c.clips} onCambio={(v) => cambiar("clips", v)} />
              </Fila>

              <Fila titulo="Imágenes y capturas de noticias" ayuda="Fotos reales y capturas de las notas que mencionás.">
                <Opciones valor={c.imagenes} opciones={SI_NO} onCambio={(v) => cambiar("imagenes", v)} />
              </Fila>

              <Fila titulo="Subtítulos" ayuda="Los del perfil o otros para este video.">
                <div className="fila" style={{ gap: 10 }}>
                  <select
                    value={c.subtitulos?.estilo ?? "perfil"}
                    onChange={(e) =>
                      cambiar("subtitulos", e.target.value === "perfil" ? null : { estilo: e.target.value as NonNullable<OpcionesCrudo["subtitulos"]>["estilo"], tamano: c.subtitulos?.tamano ?? perfil?.subtitulos.tamano ?? "normal" })
                    }
                    style={{ width: "auto" }}
                    aria-label="Estilo de subtítulos"
                  >
                    <option value="perfil">Como el perfil ({ESTILOS_SUBTITULOS.find((e) => e.id === perfil?.subtitulos.estilo)?.nombre.toLowerCase()})</option>
                    {ESTILOS_SUBTITULOS.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre}
                      </option>
                    ))}
                  </select>
                  {c.subtitulos ? (
                    <Opciones
                      valor={c.subtitulos.tamano}
                      opciones={(Object.keys(TAMANOS_SUBTITULOS) as (keyof typeof TAMANOS_SUBTITULOS)[]).map((t) => ({ v: t, texto: t[0]!.toUpperCase() + t.slice(1) }))}
                      onCambio={(v) => cambiar("subtitulos", { ...c.subtitulos!, tamano: v })}
                    />
                  ) : null}
                </div>
              </Fila>

              <Fila titulo="Cortes" ayuda="Qué tan cortas quedan las pausas y si saco «eh», «este», «o sea».">
                <div className="fila" style={{ gap: 10 }}>
                  <Opciones
                    valor={c.cortes.silencio}
                    opciones={[
                      { v: "rapido", texto: "Rápido", ayuda: `Pausas de hasta ${PAUSA_SILENCIO.rapido} ms` },
                      { v: "normal", texto: "Normal", ayuda: `Pausas de hasta ${PAUSA_SILENCIO.normal} ms` },
                      { v: "suave", texto: "Suave", ayuda: `Pausas de hasta ${PAUSA_SILENCIO.suave} ms` },
                    ]}
                    onCambio={(v) => cambiar("cortes", { ...c.cortes, silencio: v })}
                  />
                  <label className="interruptor">
                    <input type="checkbox" checked={c.cortes.muletillas} onChange={(e) => cambiar("cortes", { ...c.cortes, muletillas: e.target.checked })} />
                    Quitar muletillas
                  </label>
                </div>
              </Fila>

              <Fila titulo="Efectos de sonido" ayuda="Golpes, dings y whoosh para remarcar.">
                <Opciones valor={c.sfx} opciones={SI_NO} onCambio={(v) => cambiar("sfx", v)} />
              </Fila>

              <Fila titulo="Intensidad de edición" ayuda={INTENSIDADES[c.intensidad].detalle}>
                <Opciones valor={c.intensidad} opciones={(Object.keys(INTENSIDADES) as (keyof typeof INTENSIDADES)[]).map((k) => ({ v: k, texto: INTENSIDADES[k].nombre }))} onCambio={(v) => cambiar("intensidad", v)} />
              </Fila>

              <Fila titulo="Cierre «Seguir»" ayuda="Placa final con tu @ y el botón animado.">
                <Opciones valor={c.cierre} opciones={SI_NO} onCambio={(v) => cambiar("cierre", v)} />
              </Fila>

              <Fila titulo="Duración máxima" ayuda="Si se pasa, saco las frases menos importantes.">
                <Opciones valor={c.duracionMax} opciones={DURACIONES_MAX.map((d) => ({ v: d, texto: d ? `${d} s` : "Sin límite" }))} onCambio={(v) => cambiar("duracionMax", v)} />
              </Fila>

              <Fila titulo="Modo automático" ayuda={pedido.auto ? "Renderiza sin pedirte que revises." : "Te aviso para revisar antes de renderizar."}>
                <Opciones valor={pedido.auto} opciones={SI_NO} onCambio={(v) => setPedido({ ...pedido, auto: v })} />
              </Fila>

              <button className="boton primario grande" style={{ marginTop: 18 }} disabled={procesando || Boolean(errorSubida) || !pedido.perfil} onClick={() => void procesar()}>
                {procesando ? <span className="girando" /> : <Scissors size={18} />}
                {procesando && !subida ? `Esperando que termine la subida (${Math.round(pct * 100)} %)…` : "Procesar"}
              </button>
            </section>
          </div>
          <aside className="columna-fija">
            <section className="tarjeta">
              <span className="etiqueta">Así va a salir</span>
              <div style={{ maxWidth: 280, marginInline: "auto", marginTop: 10 }}>
                {perfilVista ? <VistaPerfil perfil={perfilVista} foto={perfilVista.foto ? `/api/perfiles/${perfilVista.slug}/foto` : null} /> : null}
              </div>
            </section>
          </aside>
        </div>
      ) : null}
    </>
  );
};
