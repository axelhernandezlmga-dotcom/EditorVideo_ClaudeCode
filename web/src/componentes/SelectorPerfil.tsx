import { Check, Image as ImagenIcono, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ESTILOS_SUBTITULOS, PALETAS, slugPerfil, TAMANOS_SUBTITULOS, TIPOGRAFIAS, type EstiloSubtitulos, type Perfil, type TamanoSubtitulos, type Tipografia } from "../../../src/shared/perfiles";
import { api } from "../api";
import { useAviso } from "../App";
import { MuestraPaleta } from "./MuestraPaleta";
import { VistaPerfil } from "./VistaPerfil";

/**
 * "Nuevo perfil" completo (nombre, @, verificado, paleta, tipografía, logo y subtítulos) con la vista previa
 * en vivo. Es el mismo en Videos animados y en Edición de crudos.
 */
const NuevoPerfil: React.FC<{ onCreado: (p: Perfil) => void; onCancelar: () => void; conVista: boolean }> = ({ onCreado, onCancelar, conVista }) => {
  const avisar = useAviso();
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("@");
  const [verificado, setVerificado] = useState(false);
  const [paleta, setPaleta] = useState(PALETAS[1]!.id);
  const [tipografia, setTipografia] = useState<Tipografia>("Montserrat");
  const [estilo, setEstilo] = useState<EstiloSubtitulos>("contorno");
  const [tamano, setTamano] = useState<TamanoSubtitulos>("normal");
  const [logo, setLogo] = useState<File | null>(null);
  const [creando, setCreando] = useState(false);
  const logoUrl = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
  useEffect(() => () => void (logoUrl && URL.revokeObjectURL(logoUrl)), [logoUrl]);

  const u = usuario.trim().startsWith("@") ? usuario.trim() : `@${usuario.trim()}`;
  const borrador: Perfil = {
    slug: slugPerfil(nombre || u),
    nombre: nombre.trim() || u.slice(1) || "Nuevo perfil",
    usuario: u.length > 1 ? u : "@usuario",
    verificado,
    paleta,
    colores: { ...PALETAS.find((x) => x.id === paleta)!.colores },
    tipografia,
    foto: null,
    subtitulos: { estilo, tamano },
    lineaEditorial: "ninguna",
    moodsMusica: [],
  };

  const crear = async () => {
    setCreando(true);
    try {
      let { perfil } = await api.guardarPerfil(borrador, true);
      if (logo) perfil = (await api.fotoPerfil(perfil.slug, logo)).perfil;
      avisar(`Perfil «${perfil.nombre}» creado.`, "ok");
      onCreado(perfil);
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className={`nuevo-perfil ${conVista ? "con-vista" : ""}`}>
      <div>
        <div className="rejilla-2">
          <label className="campo">
            <span>Nombre</span>
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: La Diaria" />
          </label>
          <label className="campo">
            <span>@ de Instagram / TikTok</span>
            <input type="text" value={usuario} onChange={(e) => setUsuario(e.target.value.replace(/\s/g, ""))} />
          </label>
          <label className="campo">
            <span>Tipografía</span>
            <select value={tipografia} onChange={(e) => setTipografia(e.target.value as Tipografia)}>
              {TIPOGRAFIAS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre} — {t.detalle}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Subtítulos</span>
            <div className="fila" style={{ gap: 6, flexWrap: "nowrap" }}>
              <select value={estilo} onChange={(e) => setEstilo(e.target.value as EstiloSubtitulos)}>
                {ESTILOS_SUBTITULOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
              <select value={tamano} onChange={(e) => setTamano(e.target.value as TamanoSubtitulos)} style={{ width: "auto" }} aria-label="Tamaño de los subtítulos">
                {Object.keys(TAMANOS_SUBTITULOS).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>
        <div className="campo" style={{ marginTop: 10 }}>
          <span>Paleta</span>
          <div className="paletas-chicas">
            {PALETAS.map((p) => (
              <button key={p.id} type="button" className={`paleta ${paleta === p.id ? "activo" : ""}`} onClick={() => setPaleta(p.id)} title={p.nombre}>
                <MuestraPaleta c={p.colores} />
                {p.nombre}
              </button>
            ))}
          </div>
        </div>
        <div className="fila" style={{ gap: 14, margin: "12px 0" }}>
          <label className="interruptor">
            <input type="checkbox" checked={verificado} onChange={(e) => setVerificado(e.target.checked)} />
            Cuenta verificada (la insignia sale en el cierre «Seguir»)
          </label>
          <label className="boton chico">
            <ImagenIcono size={16} /> {logo ? logo.name : "Logo o foto (opcional)"}
            <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <div className="fila" style={{ gap: 8 }}>
          <button className="boton primario chico" disabled={creando || u.length < 2} onClick={() => void crear()}>
            {creando ? <span className="girando" /> : <Check size={16} />} Crear perfil
          </button>
          <button className="boton chico" onClick={onCancelar}>
            Cancelar
          </button>
        </div>
      </div>
      {conVista ? <VistaPerfil perfil={borrador} foto={logoUrl} /> : null}
    </div>
  );
};

/** Elegir un perfil guardado o crear uno nuevo. `conVista`: muestra la vista previa en vivo al lado. */
export const SelectorPerfil: React.FC<{ perfiles: Perfil[]; valor: string; onCambio: (slug: string) => void; onCreado: (p: Perfil) => void; conVista?: boolean }> = ({ perfiles, valor, onCambio, onCreado, conVista = false }) => {
  const [creando, setCreando] = useState(false);
  const elegido = perfiles.find((p) => p.slug === valor) ?? null;
  if (creando)
    return (
      <NuevoPerfil
        conVista={conVista}
        onCreado={(p) => {
          onCreado(p);
          setCreando(false);
        }}
        onCancelar={() => setCreando(false)}
      />
    );
  return (
    <div className={conVista ? "selector-perfil con-vista" : "selector-perfil"}>
      <div>
        <div className="fila" style={{ gap: 8 }}>
          <select value={valor} onChange={(e) => onCambio(e.target.value)} style={{ width: "auto", minWidth: 200 }}>
            {perfiles.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.nombre} ({p.usuario})
              </option>
            ))}
          </select>
          <button className="boton chico" onClick={() => setCreando(true)}>
            <Plus size={16} /> Nuevo perfil
          </button>
        </div>
        {elegido ? (
          <p className="ayuda" style={{ marginBottom: 0 }}>
            {elegido.usuario}
            {elegido.verificado ? " · verificado" : ""} · {elegido.tipografia} · subtítulos {ESTILOS_SUBTITULOS.find((s) => s.id === elegido.subtitulos.estilo)?.nombre.toLowerCase()}.{" "}
            <a href="#/animados/perfiles">Editar perfiles →</a>
          </p>
        ) : null}
      </div>
      {conVista && elegido ? <VistaPerfil perfil={elegido} foto={api.urlFotoPerfil(elegido)} /> : null}
    </div>
  );
};
