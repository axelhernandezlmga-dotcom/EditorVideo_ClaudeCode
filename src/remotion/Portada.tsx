import { AbsoluteFill } from "remotion";
import { ALTO, CAJA_CONTENIDO, ZONA_SEGURA, type PortadaProps } from "../shared/render";
import { FUENTE_DATOS, PiezaMarca } from "./marca/base";
import { EscenaContext, MarcaContext } from "./contexto";
import { familia, pesoFuerte, useFuentesListas } from "./fuentes";
import { Fondo } from "./global/Fondo";
import { resolverPlantilla } from "./plantillas/registry";
import { ajustarTexto } from "./texto";

const Titulo: React.FC<{ titulo: string; marca: PortadaProps["marca"] }> = ({ titulo, marca }) => {
  const fuente = familia(marca.tipografia);
  const peso = pesoFuerte(marca.tipografia);
  const { fontSize } = ajustarTexto({ text: titulo.toUpperCase(), ancho: CAJA_CONTENIDO.ancho, alto: 560, fontFamily: fuente, fontWeight: peso, maxFont: 170, maxLineas: 4, mayusculas: true, interlineado: 1.02 });
  return (
    <div
      style={{
        position: "absolute",
        left: CAJA_CONTENIDO.x,
        width: CAJA_CONTENIDO.ancho,
        top: ALTO * 0.5,
        translate: "0 -50%",
        textAlign: "center",
        fontFamily: fuente,
        fontWeight: peso,
        fontSize,
        lineHeight: 1.02,
        textTransform: "uppercase",
        color: marca.colores.texto,
        WebkitTextStroke: `${Math.round(fontSize / 12)}px #000`,
        paintOrder: "stroke fill",
        textShadow: `0 10px 40px rgba(0,0,0,0.7)`,
      }}
    >
      {titulo.split(/(\s+)/).map((p, i) =>
        i === 0 || i === titulo.split(/(\s+)/).length - 1 ? (
          <span key={i} style={{ color: marca.colores.acento }}>
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </div>
  );
};

/** Portada de marca: papel, título en Inter (sin mayúsculas forzadas) cerrado por el punto rojo, fecha en Plex Mono y la firma. */
const PortadaMarca: React.FC<{ titulo: string; marca: PortadaProps["marca"] }> = ({ titulo, marca }) => {
  const kit = marca.kit!;
  const fuente = familia("kit");
  const { fontSize } = ajustarTexto({ text: titulo, ancho: CAJA_CONTENIDO.ancho, alto: 760, fontFamily: fuente, fontWeight: 500, maxFont: 150, maxLineas: 5, interlineado: 1.04 });
  return (
    <AbsoluteFill style={{ background: kit.colores.fondo2 }}>
      <div style={{ position: "absolute", left: CAJA_CONTENIDO.x, top: ZONA_SEGURA.arriba + 10, fontFamily: FUENTE_DATOS, fontSize: 32, letterSpacing: "0.06em", color: kit.colores.secundario }}>{kit.fecha}</div>
      <div style={{ position: "absolute", left: CAJA_CONTENIDO.x, width: CAJA_CONTENIDO.ancho, top: ALTO * 0.44, translate: "0 -50%", fontFamily: fuente, fontWeight: 500, fontSize, lineHeight: 1.04, letterSpacing: "-0.025em", color: kit.colores.texto }}>
        {titulo.replace(/[.!]+$/, "")}
        <span style={{ display: "inline-block", width: fontSize * 0.2, height: fontSize * 0.2, marginLeft: fontSize * 0.05, borderRadius: "50%", background: kit.colores.acento }} />
      </div>
      <div style={{ position: "absolute", left: CAJA_CONTENIDO.x, top: ALTO - ZONA_SEGURA.abajo - 40 }}>
        <PiezaMarca fondo={kit.colores.fondo2} ancho={420} horizontal />
      </div>
    </AbsoluteFill>
  );
};

export const Portada: React.FC<PortadaProps> = ({ marca, titulo, escena }) => {
  const listas = useFuentesListas(marca.kit);
  if (marca.kit)
    return (
      <MarcaContext.Provider value={marca}>
        <AbsoluteFill>{listas ? <PortadaMarca titulo={titulo} marca={marca} /> : null}</AbsoluteFill>
      </MarcaContext.Provider>
    );
  const fondo = escena ? resolverPlantilla(escena) : null;
  return (
    <MarcaContext.Provider value={marca}>
      <AbsoluteFill>
        <Fondo />
        {listas && escena && fondo ? (
          <AbsoluteFill style={{ opacity: 0.55, filter: "blur(4px)", scale: 1.08 }}>
            <EscenaContext.Provider value={{ captions: escena.captions, enfasis: escena.palabras_enfasis, duracionFrames: escena.duracionFrames, indice: 1, icono: escena.emoji_o_icono }}>
              <fondo.Comp {...fondo.props} />
            </EscenaContext.Provider>
          </AbsoluteFill>
        ) : null}
        <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.1) 100%)" }} />
        {listas ? <Titulo titulo={titulo} marca={marca} /> : null}
      </AbsoluteFill>
    </MarcaContext.Provider>
  );
};
