import { Check, FolderOpen, PackageOpen, Sparkles, Trash2, Upload, UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { colorDeRol, NOMBRES_ROL, type Kit, type ReglasMarca, type VarianteLogo, type VarianteSimbolo } from "../../../src/shared/kit";
import { api } from "../api";
import { useAviso } from "../App";

type Detalle = { kit: Kit | null; reglas: ReglasMarca | null; marcaMd: string | null; resumen: string | null };

const NOMBRE_VARIANTE: Record<VarianteLogo, string> = {
  principal: "Principal",
  negativo: "Negativo",
  monocromo: "Monocromo",
  sobre_rojo: "Sobre acento",
  fondo_blanco: "Con fondo blanco",
  horizontal: "Horizontal",
};

/** Fondo sobre el que se muestra cada variante (el que le corresponde según el manual). */
const fondoDe = (k: Kit, v: VarianteLogo | VarianteSimbolo) => {
  const claro = colorDeRol(k, "fondo") ?? "#FFFFFF";
  const papel = colorDeRol(k, "fondo2") ?? claro;
  const tinta = colorDeRol(k, "texto") ?? "#202124";
  const acento = colorDeRol(k, "acento") ?? "#D92D38";
  return v === "negativo" ? tinta : v === "sobre_rojo" ? acento : v === "monocromo" || v === "horizontal" ? papel : claro;
};

/** Color del rótulo sobre la muestra: claro sobre tinta o acento, gris sobre fondos claros. */
const rotulo = (v: VarianteLogo | VarianteSimbolo) => (v === "negativo" || v === "sobre_rojo" ? "rgba(255,255,255,0.8)" : "#5F6368");

/** Muestra el kit de marca de un perfil (logos sobre sus fondos, paleta con roles, fuentes, recursos e íconos) e importa uno nuevo. */
export const KitMarca: React.FC<{ slug: string; onFoto: () => void }> = ({ slug, onFoto }) => {
  const avisar = useAviso();
  const [d, setD] = useState<Detalle | null>(null);
  const [previa, setPrevia] = useState<{ kit: Kit; resumen: string } | null>(null);
  const [carpeta, setCarpeta] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const zip = useRef<HTMLInputElement>(null);
  const url = (rel: string) => `/api/perfiles/${slug}/kit/archivo/${rel.split("/").map(encodeURIComponent).join("/")}`;

  const cargar = useCallback(() => {
    api
      .kit(slug)
      .then(setD)
      .catch((e: Error) => avisar(e.message, "error"));
  }, [slug, avisar]);
  useEffect(() => {
    setPrevia(null);
    cargar();
  }, [cargar]);

  // fuentes del kit como fuentes locales (sin Google Fonts), para las muestras
  useEffect(() => {
    const kit = d?.kit;
    if (!kit) return;
    const estilo = document.createElement("style");
    estilo.textContent = kit.fuentes.map((f, i) => `@font-face{font-family:"kit-${slug}-${i}";src:url("${url(f.archivo)}");font-weight:${f.variable ? "100 900" : f.pesos[0]};font-display:block}`).join("\n");
    document.head.appendChild(estilo);
    return () => estilo.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.kit, slug]);

  const conEspera = async (que: string, fn: () => Promise<void>) => {
    setOcupado(que);
    try {
      await fn();
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setOcupado(null);
    }
  };

  const desdeCarpeta = () => conEspera("previa", async () => setPrevia(await api.kitPreviaCarpeta(slug, carpeta.trim())));
  const desdeZip = (f: File | undefined) => f && conEspera("previa", async () => setPrevia(await api.kitPreviaZip(slug, f)));
  const confirmar = () =>
    conEspera("confirmar", async () => {
      const r = await api.kitConfirmar(slug);
      avisar(`Kit importado: ${r.resumen}.${r.desdeManual ? " Reglas sacadas del manual." : " Sin manual: reglas por defecto."}`, "ok");
      setPrevia(null);
      cargar();
    });
  const quitar = () =>
    conEspera("quitar", async () => {
      if (!window.confirm("¿Quitar el kit de marca de este perfil? Los videos ya hechos no cambian.")) return;
      await api.kitQuitar(slug);
      cargar();
    });
  const usarAvatar = (nombre: string) =>
    conEspera("foto", async () => {
      await api.kitFoto(slug, nombre);
      avisar("Avatar puesto como foto del perfil.", "ok");
      onFoto();
    });

  const importar = (
    <div className="importar-kit">
      <p className="ayuda" style={{ marginTop: 0 }}>
        Importá la carpeta del kit (logos, símbolo, colores, tipografías, recursos, íconos y el manual en PDF) o un .zip. Se copia al proyecto; el original no se toca.
      </p>
      <div className="fila" style={{ gap: 8 }}>
        <input className="crece" type="text" placeholder="~/Descargas/Kit_de_mi_marca" value={carpeta} onChange={(e) => setCarpeta(e.target.value)} />
        <button className="boton" disabled={!carpeta.trim() || ocupado !== null} onClick={() => void desdeCarpeta()}>
          {ocupado === "previa" ? <span className="girando" /> : <FolderOpen size={16} />} Importar carpeta
        </button>
        <button className="boton" disabled={ocupado !== null} onClick={() => zip.current?.click()}>
          <Upload size={16} /> Subir .zip
        </button>
        <input ref={zip} type="file" accept=".zip,application/zip" hidden onChange={(e) => void desdeZip(e.target.files?.[0])} />
      </div>
      {previa ? (
        <div className="aviso info" style={{ marginTop: 12 }}>
          <strong>Encontré {previa.resumen}.</strong>
          <div className="ayuda" style={{ margin: "6px 0 10px" }}>
            Logos: {Object.keys(previa.kit.logos).join(", ") || "—"} · Colores: {previa.kit.colores.map((c) => `${c.nombre} ${c.hex}`).join(", ") || "—"} · Fuentes: {previa.kit.fuentes.map((f) => f.familia).join(", ") || "—"}
          </div>
          <button className="boton primario chico" disabled={ocupado !== null} onClick={() => void confirmar()}>
            {ocupado === "confirmar" ? <span className="girando" /> : <Check size={16} />} {ocupado === "confirmar" ? (previa.kit.manual ? "Leyendo el manual…" : "Guardando…") : "Confirmar e importar"}
          </button>
        </div>
      ) : null}
    </div>
  );

  if (!d) return null;
  const k = d.kit;
  return (
    <section className="tarjeta kit-marca">
      <div className="tarjeta-titulo">
        <h2>
          <PackageOpen size={20} style={{ verticalAlign: "-3px" }} /> Kit de marca
        </h2>
        {k ? (
          <button className="boton chico peligro" disabled={ocupado !== null} onClick={() => void quitar()}>
            <Trash2 size={16} /> Quitar kit
          </button>
        ) : null}
      </div>
      {!k ? (
        importar
      ) : (
        <>
          <p className="ayuda" style={{ marginTop: 0 }}>
            {d.resumen}. Este perfil usa siempre sus logos, fuentes, colores, íconos y recursos.
          </p>

          <h3>Logos</h3>
          <div className="kit-grilla">
            {(Object.entries(k.logos) as [VarianteLogo, { svg: string | null; png: string | null }][]).map(([v, a]) => (
              <figure key={v} className="kit-muestra" style={{ background: fondoDe(k, v) }}>
                <img src={url((a.svg ?? a.png)!)} alt={`Logo ${v}`} />
                <figcaption style={{ color: rotulo(v) }}>{NOMBRE_VARIANTE[v]}</figcaption>
              </figure>
            ))}
            {(Object.entries(k.simbolos) as [VarianteSimbolo, { svg: string | null; png: string | null }][]).map(([v, a]) => (
              <figure key={`s-${v}`} className="kit-muestra chica" style={{ background: fondoDe(k, v) }}>
                <img src={url((a.svg ?? a.png)!)} alt={`Símbolo ${v}`} />
                <figcaption style={{ color: rotulo(v) }}>Símbolo · {NOMBRE_VARIANTE[v]}</figcaption>
              </figure>
            ))}
          </div>

          {k.avatares.length ? (
            <>
              <h3>Avatares</h3>
              <div className="fila" style={{ gap: 12 }}>
                {k.avatares.map((a) => (
                  <div key={a.nombre} className="kit-avatar">
                    <img src={url((a.png ?? a.svg)!)} alt={a.nombre} />
                    <button className="boton chico" disabled={!a.png || ocupado !== null} onClick={() => void usarAvatar(a.nombre)}>
                      <UserRound size={14} /> Usar como foto
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <h3>Paleta</h3>
          <div className="kit-paleta">
            {k.colores.map((c) => (
              <div key={c.nombre}>
                <span style={{ background: c.hex }} />
                <b>{c.nombre}</b>
                <small className="mono">{c.hex}</small>
                <small>{NOMBRES_ROL[c.rol]}</small>
              </div>
            ))}
          </div>

          <h3>Tipografías</h3>
          {k.fuentes.map((f, i) => (
            <div key={f.archivo} className="kit-fuente">
              <div style={{ fontFamily: `"kit-${slug}-${i}"`, fontSize: f.uso === "datos" ? 22 : 34, fontWeight: f.uso === "datos" ? 400 : 500, letterSpacing: f.uso === "datos" ? "0.04em" : undefined }}>
                {f.uso === "datos" ? "26 OCT 2026 / FUENTE 01 / CONTEXTO" : "¿Qué pasó? ¿Por qué importa?"}
              </div>
              <small className="ayuda">
                {f.familia} · {f.uso === "datos" ? "fechas, fuentes y numeración" : "logo, títulos y lectura"} · {f.variable ? `variable (${f.pesos.join(", ")})` : f.pesos.join(", ")}
                {f.licencia ? (
                  <>
                    {" "}
                    · <a href={url(f.licencia)} target="_blank" rel="noreferrer">licencia</a>
                  </>
                ) : null}
              </small>
            </div>
          ))}

          <h3>Recursos e íconos</h3>
          <div className="kit-iconos">
            {Object.entries(k.recursos).map(([n, a]) => (
              <figure key={n} className="recurso">
                <img src={url((a.svg ?? a.png)!)} alt={n} />
                <figcaption>{n}</figcaption>
              </figure>
            ))}
            {Object.entries(k.iconos).map(([n, a]) =>
              a.svg || a.png ? (
                <figure key={n}>
                  <img src={url((a.svg ?? a.png)!)} alt={n} />
                  <figcaption>{n}</figcaption>
                </figure>
              ) : null,
            )}
            {Object.entries(k.extendidos).map(([n, e]) => (
              <figure key={`x-${n}`} title="Dibujado por la app con las reglas del kit">
                <span className="icono-extendido" dangerouslySetInnerHTML={{ __html: e.svg }} />
                <figcaption>
                  {n} <Sparkles size={11} style={{ verticalAlign: "-1px" }} aria-label="dibujado por la app" />
                </figcaption>
              </figure>
            ))}
          </div>

          {d.marcaMd ? (
            <details style={{ marginTop: 14 }}>
              <summary>
                <b>Reglas de marca</b> <span className="ayuda">(marca.md{k.manual ? ", sacadas del manual" : ""})</span>
              </summary>
              <pre className="marca-md">{d.marcaMd}</pre>
            </details>
          ) : null}

          <details style={{ marginTop: 10 }}>
            <summary className="ayuda">Reimportar el kit</summary>
            {importar}
          </details>
        </>
      )}
    </section>
  );
};
