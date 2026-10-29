import { CheckCircle2, CircleDashed, CircleHelp, Eye, EyeOff, KeyRound, Pencil, PlugZap, Plus, Trash2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, type EstadoClave, type EstadoCredencial, type NombreClave, type ServicioCredencial } from "../api";
import { useAviso } from "../App";

type Estado = { configurada: boolean; prueba?: { ok: boolean; motivo: string } };

const IconoEstado: React.FC<{ c: Estado }> = ({ c }) =>
  !c.configurada ? <CircleDashed size={20} color="var(--tenue)" aria-label="Sin configurar" /> : !c.prueba ? <CircleHelp size={20} color="var(--info)" aria-label="Sin probar" /> : c.prueba.ok ? <CheckCircle2 size={20} color="var(--ok)" aria-label="Funciona" /> : <XCircle size={20} color="var(--error)" aria-label="No funciona" />;

const resumen = (c: Estado & { final?: string }) => (!c.configurada ? "Sin configurar" : !c.prueba ? `Guardada (…${c.final}), sin probar` : `${c.prueba.ok ? "Funciona" : "No funciona"} (…${c.final})`);

/** Campo de clave: oculta por defecto, con un botón para verla mientras la escribís. */
const CampoClave: React.FC<{ valor: string; onCambio: (v: string) => void; placeholder: string; onEnter?: () => void; autoFocus?: boolean }> = ({ valor, onCambio, placeholder, onEnter, autoFocus }) => {
  const [ver, setVer] = useState(false);
  return (
    <div className="fila campo-clave" style={{ gap: 6, flexWrap: "nowrap" }}>
      <input
        className="crece"
        type={ver ? "text" : "password"}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
      />
      <button type="button" className="boton chico icono" onClick={() => setVer((v) => !v)} aria-label={ver ? "Ocultar la clave" : "Ver la clave"} title={ver ? "Ocultar" : "Ver lo que escribiste"}>
        {ver ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
};

const aTexto = (p: Record<string, string>) =>
  Object.entries(p)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
const deTexto = (t: string) => Object.fromEntries(t.split("\n").map((l) => l.split("=")).filter((x) => x.length >= 2 && x[0]!.trim()).map(([k, ...v]) => [k!.trim(), v.join("=").trim()]));

type Formulario = { nombre: string; servicio: string; servicioNombre: string; clave: string; baseUrl: string; parametros: string };
const VACIO: Formulario = { nombre: "", servicio: "openai", servicioNombre: "", clave: "", baseUrl: "", parametros: "" };

/**
 * Configuración → API Keys. Las claves se guardan solo en .env (fuera de git) y nunca vuelven enteras al
 * navegador: se ven los últimos 4 caracteres. Distingue las que la app usa de las que solo quedan guardadas.
 */
export const Claves: React.FC = () => {
  const avisar = useAviso();
  const [claves, setClaves] = useState<EstadoClave[]>([]);
  const [propias, setPropias] = useState<EstadoCredencial[]>([]);
  const [servicios, setServicios] = useState<ServicioCredencial[]>([]);
  const [editando, setEditando] = useState<NombreClave | null>(null);
  const [valor, setValor] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [editandoPropia, setEditandoPropia] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [c, p] = await Promise.all([api.claves(), api.credenciales()]);
    setClaves(c.claves);
    setPropias(p.propias);
    setServicios(p.servicios);
  }, []);
  useEffect(() => {
    cargar().catch((e: Error) => avisar(e.message, "error"));
  }, [cargar, avisar]);

  const correr = async (id: string, fn: () => Promise<unknown>, ok?: string) => {
    setOcupado(id);
    try {
      await fn();
      await cargar();
      if (ok) avisar(ok, "ok");
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setOcupado(null);
    }
  };

  const guardarIntegrada = (nombre: NombreClave) => {
    const v = valor.trim();
    setEditando(null);
    setValor("");
    if (!v) return;
    void correr(nombre, async () => {
      const r = await api.guardarClave(nombre, v);
      const c = r.claves.find((k) => k.nombre === nombre);
      if (c?.prueba) avisar(`${c.servicio}: ${c.prueba.motivo}`, c.prueba.ok ? "ok" : "error");
    });
  };

  const guardarFormulario = () => {
    if (!form) return;
    const pedido = { nombre: form.nombre, servicio: form.servicio, servicioNombre: form.servicioNombre, baseUrl: form.baseUrl.trim(), parametros: deTexto(form.parametros), ...(form.clave.trim() ? { clave: form.clave.trim() } : {}) };
    if (editandoPropia) void correr(editandoPropia, () => api.editarCredencial(editandoPropia, pedido), "Guardada.").then(() => (setForm(null), setEditandoPropia(null)));
    else
      void correr("nueva", async () => {
        const r = await api.agregarCredencial(pedido);
        avisar(r.integrada ? "Guardada: la app ya la usa (está en Integraciones)." : "Guardada. Ojo: la app todavía no usa este servicio por su cuenta.", "ok");
        setForm(null);
      });
  };

  const servicio = (id: string) => servicios.find((s) => s.id === id);
  const sinConfigurar = claves.filter((c) => !c.configurada).length;

  return (
    <section className="tarjeta">
      <div className="tarjeta-titulo">
        <h2>
          <KeyRound size={20} style={{ verticalAlign: "-3px" }} /> API Keys
        </h2>
        {!form ? (
          <button className="boton chico" onClick={() => (setForm(VACIO), setEditandoPropia(null))}>
            <Plus size={14} /> Agregar API key
          </button>
        ) : null}
      </div>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Se guardan solo en <span className="mono">.env</span> (no se sube a git y solo lo lee tu usuario); acá se ven los últimos 4 caracteres. {claves.length - sinConfigurar} de {claves.length} integraciones configuradas
        {sinConfigurar ? `, ${sinConfigurar} ${sinConfigurar === 1 ? "requiere" : "requieren"} configuración` : ""}.
      </p>

      {form ? (
        <div className="tarjeta interior" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 10 }}>{editandoPropia ? "Editar API key" : "Nueva API key"}</h3>
          <div className="rejilla-2">
            <label className="campo">
              <span>Nombre</span>
              <input type="text" value={form.nombre} placeholder="Ej. OpenAI personal" onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </label>
            <label className="campo">
              <span>Servicio</span>
              <select value={form.servicio} disabled={Boolean(editandoPropia)} onChange={(e) => setForm({ ...form, servicio: e.target.value })}>
                {servicios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                    {s.integrada ? " (la usa la app)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {form.servicio === "otro" ? (
              <label className="campo">
                <span>¿Qué servicio es?</span>
                <input type="text" value={form.servicioNombre} placeholder="Ej. Replicate" onChange={(e) => setForm({ ...form, servicioNombre: e.target.value })} />
              </label>
            ) : null}
            {!servicio(form.servicio)?.integrada ? (
              <label className="campo">
                <span>URL base (opcional)</span>
                <input type="url" value={form.baseUrl} placeholder="https://…/v1" onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
              </label>
            ) : null}
          </div>
          <div className="campo">
            <span>Clave{editandoPropia ? " (dejala vacía para no cambiarla)" : ""}</span>
            <CampoClave valor={form.clave} onCambio={(v) => setForm({ ...form, clave: v })} placeholder="Pegá la clave" onEnter={guardarFormulario} />
          </div>
          {!servicio(form.servicio)?.integrada ? (
            <label className="campo">
              <span>Otros parámetros (opcional, uno por línea: nombre=valor; no pongas claves acá)</span>
              <textarea rows={2} value={form.parametros} placeholder={"modelo=gpt-4o-mini\nregion=us-east-1"} onChange={(e) => setForm({ ...form, parametros: e.target.value })} />
            </label>
          ) : null}
          <p className="ayuda">
            {servicio(form.servicio)?.integrada
              ? `La app ya usa ${servicio(form.servicio)!.nombre}: ${servicio(form.servicio)!.uso}. La clave reemplaza la que haya.`
              : "La app todavía no usa este servicio: la clave queda guardada para una integración futura (o para tus scripts). Si el servicio tiene prueba, se prueba al guardar."}
          </p>
          <div className="fila" style={{ gap: 6 }}>
            <button className="boton chico primario" disabled={ocupado !== null || (!editandoPropia && !form.clave.trim()) || (!servicio(form.servicio)?.integrada && !form.nombre.trim())} onClick={guardarFormulario}>
              {ocupado === "nueva" || ocupado === editandoPropia ? <span className="girando" /> : null} Guardar
            </button>
            <button className="boton chico" onClick={() => (setForm(null), setEditandoPropia(null))}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <h3 className="subtitulo-claves">Integraciones que la app usa</h3>
      <div className="claves">
        {claves.map((c) => (
          <div key={c.nombre} className="clave">
            <span className="clave-icono">
              <IconoEstado c={c} />
            </span>
            <div className="crece" style={{ minWidth: 0 }}>
              <strong>{c.servicio}</strong> <small className="mono" style={{ color: "var(--tenue)" }}>{c.nombre}</small>
              <div className="ayuda" style={{ margin: 0 }}>
                {resumen(c)} · para {c.para}
                {c.prueba && !c.prueba.ok ? <span style={{ color: "var(--error)" }}> — {c.prueba.motivo}</span> : null}
              </div>
              {editando === c.nombre ? (
                <div className="fila" style={{ marginTop: 8 }}>
                  <div className="crece">
                    <CampoClave valor={valor} onCambio={setValor} placeholder={`Pegá la clave (${c.dondeSacarla})`} onEnter={() => guardarIntegrada(c.nombre)} autoFocus />
                  </div>
                  <button className="boton chico primario" onClick={() => guardarIntegrada(c.nombre)} disabled={!valor.trim()}>
                    Guardar y probar
                  </button>
                  <button className="boton chico" onClick={() => (setEditando(null), setValor(""))}>
                    Cancelar
                  </button>
                </div>
              ) : null}
            </div>
            {editando !== c.nombre ? (
              <div className="fila" style={{ gap: 6 }}>
                {c.configurada ? (
                  <button className="boton chico" disabled={ocupado !== null} onClick={() => void correr(c.nombre, async () => {
                    const r = await api.probarClave(c.nombre);
                    const k = r.claves.find((x) => x.nombre === c.nombre);
                    if (k?.prueba) avisar(`${k.servicio}: ${k.prueba.motivo}`, k.prueba.ok ? "ok" : "error");
                  })}>
                    {ocupado === c.nombre ? <span className="girando" /> : <PlugZap size={14} />} Probar
                  </button>
                ) : null}
                <button className="boton chico" disabled={ocupado !== null} onClick={() => (setEditando(c.nombre), setValor(""))}>
                  {c.configurada ? "Reemplazar" : "Configurar"}
                </button>
                {c.configurada ? (
                  <button className="boton chico peligro" disabled={ocupado !== null} onClick={() => void correr(c.nombre, () => api.guardarClave(c.nombre, null), `${c.servicio}: clave borrada de .env.`)}>
                    Borrar
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <h3 className="subtitulo-claves">Otras API keys guardadas</h3>
      {propias.length === 0 ? (
        <p className="ayuda">Ninguna. Con «Agregar API key» podés guardar la de cualquier servicio (OpenAI, Anthropic, ElevenLabs, uno compatible con OpenAI u otro).</p>
      ) : (
        <div className="claves">
          {propias.map((c) => (
            <div key={c.id} className="clave">
              <span className="clave-icono">
                <IconoEstado c={c} />
              </span>
              <div className="crece" style={{ minWidth: 0 }}>
                <strong>{c.nombre}</strong> <small style={{ color: "var(--tenue)" }}>{c.servicio === "otro" ? c.servicioNombre || "Otro servicio" : servicio(c.servicio)?.nombre}</small>
                <div className="ayuda" style={{ margin: 0 }}>
                  {resumen(c)} · <span className="chip-tipo">Solo guardada: la app todavía no la usa</span>
                  {c.baseUrl ? <> · <span className="mono">{c.baseUrl}</span></> : null}
                  {c.prueba && !c.prueba.ok ? <span style={{ color: "var(--error)" }}> — {c.prueba.motivo}</span> : null}
                </div>
              </div>
              <div className="fila" style={{ gap: 6 }}>
                {c.probable && c.configurada ? (
                  <button className="boton chico" disabled={ocupado !== null} onClick={() => void correr(c.id, () => api.probarCredencial(c.id))}>
                    {ocupado === c.id ? <span className="girando" /> : <PlugZap size={14} />} Probar
                  </button>
                ) : null}
                <button
                  className="boton chico icono"
                  aria-label="Editar"
                  title="Editar o reemplazar la clave"
                  onClick={() => {
                    setEditandoPropia(c.id);
                    setForm({ nombre: c.nombre, servicio: c.servicio, servicioNombre: c.servicioNombre, clave: "", baseUrl: c.baseUrl, parametros: aTexto(c.parametros) });
                  }}
                >
                  <Pencil size={14} />
                </button>
                <button className="boton chico icono peligro" aria-label="Borrar" title="Borrar" disabled={ocupado !== null} onClick={() => window.confirm(`¿Borrar la API key «${c.nombre}»?`) && void correr(c.id, () => api.borrarCredencial(c.id), "Borrada.")}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
