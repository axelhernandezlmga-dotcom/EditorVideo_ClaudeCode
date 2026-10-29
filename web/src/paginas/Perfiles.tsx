import { BadgeCheck, ImagePlus, Plus, Save, Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ESTILOS_SUBTITULOS, PALETAS, paletaDe, slugPerfil, TAMANOS_SUBTITULOS, TIPOGRAFIAS, type ColoresPerfil, type Perfil } from "../../../src/shared/perfiles";
import { familia } from "../../../src/remotion/fuentes";
import { api } from "../api";
import { useAviso } from "../App";
import { MuestraPaleta } from "../componentes/MuestraPaleta";
import { VistaPerfil } from "../componentes/VistaPerfil";
import { KitMarca } from "../componentes/KitMarca";
import { IDS_MOODS, MOODS } from "../../../src/shared/opcionesCrudo";

const COLORES: { clave: keyof ColoresPerfil; nombre: string }[] = [
  { clave: "acento", nombre: "Principal" },
  { clave: "acento2", nombre: "Acento" },
  { clave: "texto", nombre: "Texto" },
  { clave: "subtitulos", nombre: "Fondo de subtítulos" },
  { clave: "fondo", nombre: "Fondo" },
  { clave: "fondo2", nombre: "Fondo 2" },
];

const nuevoPerfil = (): Perfil => ({
  slug: "",
  nombre: "",
  usuario: "@",
  verificado: false,
  paleta: PALETAS[1]!.id,
  colores: { ...PALETAS[1]!.colores },
  tipografia: "Montserrat",
  foto: null,
  subtitulos: { estilo: "contorno", tamano: "normal" },
  lineaEditorial: "ninguna",
  moodsMusica: [],
});


/** Crudos → Perfiles: la identidad de cada cuenta para la que editás (colores, letra, @, verificado, foto). */
export const Perfiles: React.FC = () => {
  const avisar = useAviso();
  const [perfiles, setPerfiles] = useState<Perfil[] | null>(null);
  const [porDefecto, setPorDefecto] = useState("");
  const [editando, setEditando] = useState<Perfil | null>(null);
  const [esNuevo, setEsNuevo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [version, setVersion] = useState(0);
  const entradaFoto = useRef<HTMLInputElement>(null);

  const cargar = async (elegir?: string) => {
    const r = await api.perfiles();
    setPerfiles(r.perfiles);
    setPorDefecto(r.porDefecto || r.perfiles[0]?.slug || "");
    const p = r.perfiles.find((x) => x.slug === elegir) ?? r.perfiles[0] ?? null;
    setEditando(p);
    setEsNuevo(false);
  };
  useEffect(() => {
    cargar().catch((e: Error) => avisar(e.message, "error"));
  }, [avisar]);

  const original = useMemo(() => perfiles?.find((p) => p.slug === editando?.slug), [perfiles, editando?.slug]);
  const sinGuardar = esNuevo || (editando && JSON.stringify(editando) !== JSON.stringify(original));
  const foto = useMemo(() => (editando?.foto && !esNuevo ? `/api/perfiles/${editando.slug}/foto?v=${version}` : null), [editando?.foto, editando?.slug, esNuevo, version]);

  if (!perfiles || !editando) return <div className="vacio">Cargando…</div>;
  const cambiar = <K extends keyof Perfil>(k: K, v: Perfil[K]) => setEditando({ ...editando, [k]: v });
  const cambiarColor = (k: keyof ColoresPerfil, v: string) => {
    const colores = { ...editando.colores, [k]: v.toUpperCase() };
    setEditando({ ...editando, colores, paleta: paletaDe(colores) });
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const usuario = editando.usuario.trim().startsWith("@") ? editando.usuario.trim() : `@${editando.usuario.trim()}`;
      const slug = esNuevo ? slugPerfil(editando.nombre || usuario) : editando.slug;
      const { perfil } = await api.guardarPerfil({ ...editando, slug, usuario }, esNuevo);
      await cargar(perfil.slug);
      avisar(esNuevo ? `Perfil «${perfil.nombre}» creado.` : "Perfil guardado.", "ok");
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!window.confirm(`¿Borrar el perfil «${editando.nombre}»? Los videos ya hechos no cambian.`)) return;
    try {
      await api.borrarPerfil(editando.slug);
      await cargar();
      avisar("Perfil borrado.", "ok");
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };

  const hacerPorDefecto = async () => {
    try {
      const { marca } = await api.config();
      await api.guardarConfig({ ...marca, perfilPorDefecto: editando.slug });
      setPorDefecto(editando.slug);
      avisar(`«${editando.nombre}» es el perfil por defecto.`, "ok");
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };

  const subirFoto = async (archivo: File | undefined) => {
    if (!archivo) return;
    try {
      const { perfil } = await api.fotoPerfil(editando.slug, archivo);
      setPerfiles(perfiles.map((p) => (p.slug === perfil.slug ? perfil : p)));
      setEditando({ ...editando, foto: perfil.foto });
      setVersion((v) => v + 1);
      avisar("Foto cargada.", "ok");
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Perfiles</h1>
          <p>Cada cuenta para la que hacés videos: su @, si está verificada, sus colores, su letra y su foto. Es la misma lista para Videos animados y Edición de crudos (config/perfiles/); en los animados, la paleta también pinta los dibujos.</p>
        </div>
        <button
          className="boton"
          onClick={() => {
            setEditando(nuevoPerfil());
            setEsNuevo(true);
          }}
        >
          <Plus size={18} /> Nuevo perfil
        </button>
      </div>

      <div className="chips-perfiles">
        {perfiles.map((p) => (
          <button
            key={p.slug}
            className={`chip-perfil ${!esNuevo && editando.slug === p.slug ? "activo" : ""}`}
            onClick={() => {
              setEditando(p);
              setEsNuevo(false);
            }}
          >
            <MuestraPaleta c={p.colores} />
            <span>
              <b>{p.nombre}</b>
              <small>
                {p.usuario}
                {p.verificado ? <BadgeCheck size={13} style={{ verticalAlign: "-2px", marginLeft: 4 }} aria-label="verificado" /> : null}
                {p.slug === porDefecto ? " · por defecto" : ""}
              </small>
            </span>
          </button>
        ))}
        {esNuevo ? <span className="chip-perfil activo">Nuevo perfil</span> : null}
      </div>

      <div className="dos-columnas">
        <div>
          <section className="tarjeta">
            <div className="tarjeta-titulo">
              <h2>{esNuevo ? "Nuevo perfil" : editando.nombre}</h2>
              <div className="fila" style={{ gap: 8 }}>
                {!esNuevo && editando.slug !== porDefecto ? (
                  <button className="boton chico" onClick={() => void hacerPorDefecto()}>
                    <Star size={16} /> Usar por defecto
                  </button>
                ) : null}
                {!esNuevo && perfiles.length > 1 ? (
                  <button className="boton chico peligro" onClick={() => void borrar()}>
                    <Trash2 size={16} /> Borrar
                  </button>
                ) : null}
                <button className="boton primario chico" disabled={!sinGuardar || guardando} onClick={() => void guardar()}>
                  {guardando ? <span className="girando" /> : <Save size={16} />} {sinGuardar ? "Guardar" : "Guardado"}
                </button>
              </div>
            </div>
            <div className="rejilla-2">
              <label className="campo">
                <span>Nombre</span>
                <input type="text" value={editando.nombre} placeholder="Ej: Mi Canal" onChange={(e) => cambiar("nombre", e.target.value)} />
              </label>
              <label className="campo">
                <span>@ de Instagram / TikTok</span>
                <input type="text" value={editando.usuario} placeholder="@cuenta" onChange={(e) => cambiar("usuario", e.target.value.replace(/\s/g, ""))} />
              </label>
            </div>
            <div className="campo">
              <span>¿Cuenta verificada?</span>
              <div className="segmentado">
                <button className={!editando.verificado ? "activo" : ""} onClick={() => cambiar("verificado", false)}>
                  No
                </button>
                <button className={editando.verificado ? "activo" : ""} onClick={() => cambiar("verificado", true)}>
                  <BadgeCheck size={16} /> Sí
                </button>
              </div>
              <span className="ayuda">La insignia de verificado aparece en el cierre solo si marcás «Sí».</span>
            </div>
            <div className="campo">
              <span>Foto de perfil o logo (opcional)</span>
              <div className="fila" style={{ gap: 12 }}>
                {foto ? <img src={foto} alt="" className="foto-perfil" /> : <span className="foto-perfil vacia">{(editando.nombre || "?").slice(0, 1).toUpperCase()}</span>}
                <button className="boton chico" disabled={esNuevo} onClick={() => entradaFoto.current?.click()}>
                  <ImagePlus size={16} /> {editando.foto ? "Cambiar foto" : "Subir foto"}
                </button>
                {esNuevo ? <span className="ayuda">Guardá el perfil primero.</span> : null}
                <input ref={entradaFoto} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void subirFoto(e.target.files?.[0])} />
              </div>
            </div>
          </section>

          {!esNuevo ? (
            <KitMarca
              key={editando.slug}
              slug={editando.slug}
              onFoto={() => {
                setVersion((v) => v + 1);
                void cargar(editando.slug);
              }}
            />
          ) : null}

          <section className="tarjeta">
            <h2 style={{ marginBottom: 14 }}>Línea editorial y estilo</h2>
            <div className="rejilla-2">
              <label className="campo">
                <span>Línea editorial</span>
                <select value={editando.lineaEditorial ?? "ninguna"} onChange={(e) => cambiar("lineaEditorial", e.target.value as Perfil["lineaEditorial"])}>
                  <option value="ninguna">Libre</option>
                  <option value="hechos_contexto_opinion">Hechos → Contexto → Opinión (bloques etiquetados)</option>
                </select>
                <span className="ayuda">Con bloques: DATO o FUENTE, después CONTEXTO y, solo si escribís tu opinión al crear el video, OPINIÓN.</span>
              </label>
              <label className="campo">
                <span>Intensidad de efectos por defecto (crudos)</span>
                <select value={editando.intensidadPorDefecto ?? ""} onChange={(e) => cambiar("intensidadPorDefecto", (e.target.value || undefined) as Perfil["intensidadPorDefecto"])}>
                  <option value="">La última que elegiste</option>
                  <option value="sobria">Sobria</option>
                  <option value="dinamica">Dinámica</option>
                  <option value="explosiva">Explosiva</option>
                </select>
              </label>
            </div>
            <div className="campo">
              <span>Música de este perfil</span>
              <div className="fila" style={{ gap: 8 }}>
                {IDS_MOODS.map((m) => {
                  const moods = editando.moodsMusica ?? [];
                  const activo = moods.includes(m);
                  return (
                    <button key={m} className={`boton chico ${activo ? "primario" : ""}`} onClick={() => cambiar("moodsMusica", activo ? moods.filter((x) => x !== m) : [...moods, m])}>
                      {MOODS.find((x) => x.id === m)?.nombre ?? m}
                    </button>
                  );
                })}
              </div>
              <span className="ayuda">{(editando.moodsMusica ?? []).length ? "La música se elige solo entre estos ánimos." : "Sin elegir: cualquier ánimo, según el guion."}</span>
            </div>
          </section>

          <section className="tarjeta">
            <h2 style={{ marginBottom: 14 }}>Paleta de colores</h2>
            <div className="grilla-paletas">
              {PALETAS.map((p) => (
                <button key={p.id} className={`paleta ${editando.paleta === p.id ? "activo" : ""}`} onClick={() => setEditando({ ...editando, paleta: p.id, colores: { ...p.colores } })}>
                  <MuestraPaleta c={p.colores} />
                  {p.nombre}
                </button>
              ))}
            </div>
            <span className="etiqueta" style={{ display: "block", marginTop: 16 }}>
              Colores a mano{editando.paleta === "propia" ? " (paleta propia)" : ""}
            </span>
            <div className="colores" style={{ marginTop: 8 }}>
              {COLORES.map(({ clave, nombre }) => (
                <label key={clave} className="color">
                  <input type="color" value={editando.colores[clave]} onChange={(e) => cambiarColor(clave, e.target.value)} />
                  <span>
                    {nombre}
                    <br />
                    <small className="mono" style={{ color: "var(--tenue)" }}>
                      {editando.colores[clave]}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="tarjeta">
            <h2 style={{ marginBottom: 14 }}>Letra y subtítulos</h2>
            <div className="grilla-tipos">
              {TIPOGRAFIAS.map((t) => (
                <button key={t.id} className={`tipo ${editando.tipografia === t.id ? "activo" : ""}`} onClick={() => cambiar("tipografia", t.id)}>
                  <b style={{ fontFamily: familia(t.id), fontSize: 26 }}>ASÍ SE VE</b>
                  <small>
                    {t.nombre} · {t.detalle}
                  </small>
                </button>
              ))}
            </div>
            <div className="rejilla-2" style={{ marginTop: 14 }}>
              <label className="campo">
                <span>Estilo de subtítulos</span>
                <select value={editando.subtitulos.estilo} onChange={(e) => cambiar("subtitulos", { ...editando.subtitulos, estilo: e.target.value as Perfil["subtitulos"]["estilo"] })}>
                  {ESTILOS_SUBTITULOS.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre} — {e.detalle}
                    </option>
                  ))}
                </select>
              </label>
              <div className="campo">
                <span>Tamaño</span>
                <div className="segmentado">
                  {(Object.keys(TAMANOS_SUBTITULOS) as Perfil["subtitulos"]["tamano"][]).map((t) => (
                    <button key={t} className={editando.subtitulos.tamano === t ? "activo" : ""} onClick={() => cambiar("subtitulos", { ...editando.subtitulos, tamano: t })}>
                      {t[0]!.toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="columna-fija">
          <section className="tarjeta">
            <span className="etiqueta">Vista previa en vivo</span>
            <div style={{ maxWidth: 300, marginInline: "auto", marginTop: 10 }}>
              <VistaPerfil perfil={editando} foto={foto} />
            </div>
          </section>
        </aside>
      </div>
    </>
  );
};
