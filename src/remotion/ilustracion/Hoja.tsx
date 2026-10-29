import type { CalculateMetadataFunction } from "remotion";
import { AbsoluteFill, Freeze } from "remotion";
import { EscenaContext } from "../contexto";
import { piezaPorId, type CeldaHoja } from "./biblioteca";
import { DefsEstilo, ProveedorEstilo, type PaletaIlu } from "./estilo";

/**
 * Hojas de prueba y de catálogo: una grilla de celdas, cada una con una pieza de la biblioteca congelada en
 * un frame (y una acción, si es un personaje). Sirve para mirar cada dibujo antes de usarlo.
 */
export type SeccionHoja = { titulo?: string; celdas: CeldaHoja[]; columnas: number; ancho: number; alto: number };
export type HojaProps = { secciones: SeccionHoja[]; paleta?: Partial<PaletaIlu> };

const ROTULO = 34;
const TITULO = 70;

const altoSeccion = (s: SeccionHoja) => Math.ceil(s.celdas.length / s.columnas) * (s.alto + ROTULO) + (s.titulo ? TITULO : 0);

export const medidasHoja: CalculateMetadataFunction<HojaProps> = ({ props }) => ({
  width: Math.max(...props.secciones.map((s) => s.columnas * s.ancho)),
  height: props.secciones.reduce((n, s) => n + altoSeccion(s), 0),
  durationInFrames: 1 + Math.max(0, ...props.secciones.flatMap((s) => s.celdas.map((c) => c.frame))),
});

// voz falsa para ver la boca moverse en las hojas
const CAPTIONS_PRUEBA = "hola cómo andan todos hoy vamos a hablar de plata".split(" ").map((text, i) => ({
  text,
  startMs: i * 330,
  endMs: i * 330 + 300,
  timestampMs: null,
  confidence: null,
}));

const Seccion: React.FC<SeccionHoja & { paleta?: Partial<PaletaIlu> }> = ({ titulo, celdas, columnas, ancho, alto, paleta }) => (
  <div>
    {titulo ? <div style={{ height: TITULO, fontSize: 38, fontWeight: 800, padding: "14px 24px", color: "#222" }}>{titulo}</div> : null}
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columnas}, ${ancho}px)` }}>
      {celdas.map((celda, i) => {
        const pieza = piezaPorId(celda.tipo, celda.id, celda.svg);
        return (
          <div key={i} style={{ width: ancho, height: alto + ROTULO, boxSizing: "border-box", borderRight: "1px solid #ddd", borderBottom: "1px solid #ddd", background: "#FFFFFF", overflow: "hidden" }}>
            <div style={{ height: ROTULO, fontSize: 20, padding: "5px 10px", color: "#333", whiteSpace: "nowrap", overflow: "hidden" }}>{celda.etiqueta ?? `${celda.id} · ${celda.accion ?? ""} · f${celda.frame}`}</div>
            <ProveedorEstilo estilo={celda.estilo} paleta={paleta}>
              <EscenaContext.Provider value={{ captions: CAPTIONS_PRUEBA, enfasis: [], duracionFrames: 300, indice: 0 }}>
                <Freeze frame={celda.frame}>
                  {pieza ? (
                    <svg width={ancho} height={alto} viewBox={pieza.caja(celda)} style={{ display: "block" }} preserveAspectRatio="xMidYMid meet">
                      <DefsEstilo />
                      {pieza.dibujar(celda)}
                    </svg>
                  ) : (
                    <div style={{ color: "red", padding: 10 }}>No existe {celda.tipo}/{celda.id}</div>
                  )}
                </Freeze>
              </EscenaContext.Provider>
            </ProveedorEstilo>
          </div>
        );
      })}
    </div>
  </div>
);

export const Hoja: React.FC<HojaProps> = ({ secciones, paleta }) => (
  <AbsoluteFill style={{ backgroundColor: "#F4F2EE", fontFamily: "sans-serif" }}>
    {secciones.map((s, i) => (
      <Seccion key={i} {...s} paleta={paleta} />
    ))}
  </AbsoluteFill>
);
