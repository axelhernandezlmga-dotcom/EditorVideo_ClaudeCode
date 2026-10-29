import { ArrowLeftRight, Home, LayoutGrid, Library, Play, Settings } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { TipoTrabajo } from "../../src/shared/schemas";
import type { UsoGemini } from "./api";
import { BLOQUES, bloqueDeRuta, type IdBloque } from "./bloques";
import { MotorProvider, useMotor } from "./motor";
import { Cola } from "./paginas/Cola";
import { Configuracion } from "./paginas/Configuracion";
import { Crear } from "./paginas/Crear";
import { CrudoRevision } from "./paginas/CrudoRevision";
import { CrudoSubir } from "./paginas/CrudoSubir";
import { DetalleVideo } from "./paginas/DetalleVideo";
import { Galeria } from "./paginas/Galeria";
import { Inicio } from "./paginas/Inicio";
import { Tonos } from "./paginas/Tonos";
import { BibliotecaPagina } from "./paginas/Biblioteca";
import { Perfiles } from "./paginas/Perfiles";
import { Revision } from "./paginas/Revision";
import { Voces } from "./paginas/Voces";
import { ErrorPantalla } from "./componentes/ErrorPantalla";
import { Grabar } from "./paginas/Grabar";
import { VozRevision } from "./paginas/VozRevision";

// ---------- ruteo por hash (#/cola, #/video/<id>…): no necesita configuración del servidor ----------

const leerRuta = () => window.location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);

export const useRuta = () => {
  const [ruta, setRuta] = useState(leerRuta);
  useEffect(() => {
    const f = () => {
      setRuta(leerRuta());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return ruta;
};

export const ir = (ruta: string) => {
  window.location.hash = `/${ruta}`;
};

// ---------- avisos flotantes ----------

type Tostada = { id: number; texto: string; tipo: "ok" | "error" | "info" };
const TostadasCtx = createContext<(texto: string, tipo?: Tostada["tipo"]) => void>(() => undefined);
export const useAviso = () => useContext(TostadasCtx);

const horaLocal = (iso: string) => new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "Gemini hoy: 12 / ~10": el límite lleva "~" mientras sea el estimado de Configuración. */
const MedidorGemini: React.FC<{ uso: UsoGemini }> = ({ uso }) => (
  <a
    className={`medidor-gemini ${uso.nivel}`}
    href="#/config"
    title={`${uso.caracteres.toLocaleString("es-UY")} caracteres y ${uso.segundosAudio} s de audio hoy. Se reinicia a las ${horaLocal(uso.reinicio)} (medianoche del Pacífico).${uso.limiteObservado ? " El límite es el real: Google cortó ahí." : " El límite es estimado: el real se ve en AI Studio."}`}
  >
    <span>Gemini hoy:</span>
    <b>
      {uso.pedidos} / {uso.limiteObservado ? "" : "~"}
      {uso.limite}
    </b>
    <i style={{ width: `${Math.min(100, (uso.pedidos / Math.max(1, uso.limite)) * 100)}%` }} />
  </a>
);

/** Carteles debajo de la barra: amarillo al 80 % del plan gratis, rojo cuando Google cortó. */
const CartelGemini: React.FC<{ uso: UsoGemini | null }> = ({ uso }) => {
  if (!uso || uso.nivel === "ok") return null;
  return uso.agotado ? (
    <div className="cartel-gemini agotado" role="alert">
      Llegaste al límite gratis de Google por hoy. Se reinicia a las {horaLocal(uso.reinicio)}. Mientras tanto uso la voz de respaldo (edge-tts).
    </div>
  ) : (
    <div className="cartel-gemini poco" role="status">
      Te queda poco del plan gratis de hoy ({uso.pedidos} de {uso.limiteObservado ? "" : "~"}
      {uso.limite} pedidos). Si se acaba, sigo con la voz de respaldo (edge-tts).
    </div>
  );
};

/** Barra: logo (va al inicio), el bloque en el que estás con su color y "Cambiar", su menú, Gemini y la conexión. */
const Nav: React.FC<{ bloque: IdBloque | null; activo: string }> = ({ bloque, activo }) => {
  const { trabajos, conectado, usoGemini } = useMotor();
  const b = bloque ? BLOQUES[bloque] : null;
  const pendientes = (tipo: TipoTrabajo) => trabajos.filter((t) => t.tipo === tipo && !t.oculto && (t.estado === "en_cola" || t.estado === "trabajando" || t.estado === "esperando_revision" || t.estado === "esperando_voz")).length;
  const otro: IdBloque = bloque === "animados" ? "crudos" : "animados";
  const enlaces = b
    ? b.menu.map((m) => ({ href: `#/${bloque}/${m.ruta}`, id: m.ruta, texto: m.texto, Icono: m.Icono, contador: m.ruta === "cola" ? pendientes(b.tipo) : 0 }))
    : [
        { href: "#/", id: "inicio", texto: "Inicio", Icono: Home, contador: 0 },
        { href: "#/todos", id: "todos", texto: "Todos los videos", Icono: LayoutGrid, contador: 0 },
        { href: "#/biblioteca", id: "biblioteca", texto: "Biblioteca", Icono: Library, contador: 0 },
        { href: "#/config", id: "config", texto: "Configuración", Icono: Settings, contador: 0 },
      ];
  return (
    <header className="barra">
      <a className="logo" href="#/" title="Inicio">
        <span className="logo-icono">
          <Play size={16} fill="currentColor" />
        </span>
        <span className="logo-texto">Fábrica de Videos</span>
      </a>
      {b ? (
        <div className="bloque-actual">
          <span className="bloque-nombre">
            <b.Icono size={16} /> {b.nombre}
          </span>
          <a className="bloque-cambiar" href={`#/${otro}/${BLOQUES[otro].menu[0]!.ruta}`} title={`Ir a ${BLOQUES[otro].nombre}`}>
            <ArrowLeftRight size={14} /> <span>Cambiar</span>
          </a>
        </div>
      ) : null}
      <nav className="nav">
        {enlaces.map(({ href, id, texto, Icono, contador }) => (
          <a key={id} href={href} className={activo === id ? "activo" : ""}>
            <Icono size={18} />
            {texto}
            {contador ? <span className="contador">{contador}</span> : null}
          </a>
        ))}
      </nav>
      {usoGemini ? <MedidorGemini uso={usoGemini} /> : null}
      {b ? (
        <a className="boton-icono" href="#/config" title="Configuración general" aria-label="Configuración general">
          <Settings size={18} />
        </a>
      ) : null}
      <div className={`conexion ${conectado ? "" : "caida"}`} title={conectado ? "Conectado al motor" : "Sin conexión con el motor"}>
        <i />
        <span>{conectado ? "En vivo" : "Sin conexión"}</span>
      </div>
    </header>
  );
};

/** Rutas viejas (antes de los dos bloques) → las nuevas, para que no se rompan enlaces guardados. */
const RUTAS_VIEJAS: Record<string, string> = { crear: "animados/crear", cola: "animados/cola", galeria: "todos" };
/** "Mis clips" pasó a ser la Biblioteca. */
const SUBRUTAS_VIEJAS: Record<string, string> = { "crudos/clips": "crudos/biblioteca" };

const Contenido: React.FC = () => {
  const [seccion = "", sub] = useRuta();
  const { usoGemini } = useMotor();
  useEffect(() => {
    if (RUTAS_VIEJAS[seccion]) ir(RUTAS_VIEJAS[seccion]!);
    else if (SUBRUTAS_VIEJAS[`${seccion}/${sub}`]) ir(SUBRUTAS_VIEJAS[`${seccion}/${sub}`]!);
    else if (seccion === "crudo" && !sub) ir("crudos/subir");
  }, [seccion, sub]);
  const bloque = bloqueDeRuta(seccion);
  const b = bloque ? BLOQUES[bloque] : null;
  // en el detalle de un video se marca la galería de su bloque
  const activo = seccion === "revision" || seccion === "grabar" || seccion === "voz" ? "cola" : seccion === "video" || seccion === "crudo" ? "galeria" : bloque ? (sub ?? "") : seccion || "inicio";
  let pagina: React.ReactNode;
  if (seccion === "animados") {
    pagina = sub === "cola" ? <Cola tipo="idea" /> : sub === "galeria" ? <Galeria tipo="idea" /> : sub === "tonos" ? <Tonos /> : sub === "perfiles" ? <Perfiles /> : sub === "biblioteca" ? <BibliotecaPagina /> : <Crear />;
  } else if (seccion === "crudos") {
    pagina = sub === "cola" ? <Cola tipo="crudo" /> : sub === "galeria" ? <Galeria tipo="crudo" /> : sub === "perfiles" ? <Perfiles /> : sub === "biblioteca" ? <BibliotecaPagina /> : <CrudoSubir />;
  } else if (seccion === "revision" && sub) pagina = <Revision id={sub} />;
  else if (seccion === "video" && sub) pagina = <DetalleVideo id={sub} />;
  else if (seccion === "crudo" && sub) pagina = <CrudoRevision id={sub} />;
  else if (seccion === "grabar" && sub) pagina = <Grabar id={sub} />;
  else if (seccion === "voz" && sub) pagina = <VozRevision id={sub} />;
  else if (seccion === "todos") pagina = <Galeria />;
  else if (seccion === "voces") pagina = <Voces />;
  else if (seccion === "biblioteca") pagina = <BibliotecaPagina />;
  else if (seccion === "config") pagina = <Configuracion />;
  else pagina = <Inicio />;
  return (
    <div className={`app ${bloque ?? "general"}`} style={b ? ({ "--acento-bloque": b.color, "--acento-bloque-texto": b.colorTexto } as React.CSSProperties) : undefined}>
      <Nav bloque={bloque} activo={activo} />
      <CartelGemini uso={usoGemini} />
      {/* si una pantalla se rompe: cartel con el error y "Volver", nunca una pantalla negra */}
      <main>
        <ErrorPantalla ruta={`${seccion}/${sub ?? ""}`}>{pagina}</ErrorPantalla>
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  const [tostadas, setTostadas] = useState<Tostada[]>([]);
  const avisar = useCallback((texto: string, tipo: Tostada["tipo"] = "info") => {
    const id = Date.now() + Math.random();
    setTostadas((t) => [...t, { id, texto, tipo }]);
    setTimeout(() => setTostadas((t) => t.filter((x) => x.id !== id)), tipo === "error" ? 8000 : 3500);
  }, []);
  return (
    <TostadasCtx.Provider value={avisar}>
      <MotorProvider>
        <Contenido />
      </MotorProvider>
      <div className="tostadas" role="status">
        {tostadas.map((t) => (
          <div key={t.id} className={`tostada ${t.tipo}`}>
            {t.texto}
          </div>
        ))}
      </div>
    </TostadasCtx.Provider>
  );
};

