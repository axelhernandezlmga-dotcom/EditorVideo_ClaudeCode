import type React from "react";
import { PropsPorPlantilla, type NombrePlantilla } from "../../shared/schemas";
import type { EscenaRender } from "../../shared/render";
import { iconoDesdePalabras } from "../iconos/Icono";
import { CierreCta } from "./CierreCta";
import { ClipBiblioteca } from "./ClipBiblioteca";
import { Cita } from "./Cita";
import { Comparacion } from "./Comparacion";
import { DatoNumero } from "./DatoNumero";
import { EscenaIlustrada } from "./EscenaIlustrada";
import { FotoReal } from "./FotoReal";
import { Grafico } from "./Grafico";
import { IconoTexto } from "./IconoTexto";
import { LineaTiempo } from "./LineaTiempo";
import { Lista } from "./Lista";
import { Mapa } from "./Mapa";
import { StockVideo } from "./StockVideo";
import { Titular } from "./Titular";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Componente = React.FC<any>;

export const PLANTILLAS: Record<NombrePlantilla, Componente> = {
  titular: Titular,
  dato_numero: DatoNumero,
  lista: Lista,
  comparacion: Comparacion,
  cita: Cita,
  linea_tiempo: LineaTiempo,
  grafico: Grafico,
  mapa: Mapa,
  icono_texto: IconoTexto,
  stock_video: StockVideo,
  cierre_cta: CierreCta,
  foto_real: FotoReal,
  escena_ilustrada: EscenaIlustrada,
  clip_biblioteca: ClipBiblioteca,
};

const recortar = (s: string, palabras: number) => {
  const p = s.split(/\s+/);
  return p.length > palabras ? `${p.slice(0, palabras).join(" ")}…` : s;
};

/** Texto de respaldo para cuando una plantilla no se puede usar. */
const textoRespaldo = (e: EscenaRender): string => {
  const p = e.props as Record<string, unknown>;
  for (const k of ["texto", "remate", "contexto", "titulo", "etiqueta"]) {
    if (typeof p[k] === "string" && p[k]) return p[k] as string;
  }
  return recortar(e.narracion, 9);
};

/** Devuelve el componente y props a usar; si las props no validan, cae a `titular` en vez de romper el render. */
export const resolverPlantilla = (e: EscenaRender): { Comp: Componente; props: object; nombre: NombrePlantilla } => {
  const valido = PropsPorPlantilla[e.plantilla].safeParse(e.props);
  if (!valido.success) return { Comp: Titular, props: { texto: textoRespaldo(e) }, nombre: "titular" };
  if (e.plantilla === "stock_video") {
    // sin clip de Pexels, StockVideo usa su fondo animado con un ícono relacionado
    const icono = e.emoji_o_icono ?? iconoDesdePalabras(e.palabras_clave_stock) ?? "sparkles";
    return { Comp: StockVideo, props: { ...valido.data, src: e.stockSrc ?? null, icono }, nombre: e.plantilla };
  }
  if (e.plantilla === "escena_ilustrada") return { Comp: EscenaIlustrada, props: { ...valido.data, svgs: e.svgs }, nombre: e.plantilla };
  if (e.plantilla === "foto_real") return { Comp: FotoReal, props: { ...valido.data, src: e.foto?.src ?? null, credito: e.foto?.credito ?? null, extras: e.fotosExtra ?? [] }, nombre: e.plantilla };
  if (e.plantilla === "clip_biblioteca") return { Comp: ClipBiblioteca, props: { ...valido.data, src: e.stockSrc ?? null }, nombre: e.plantilla };
  return { Comp: PLANTILLAS[e.plantilla], props: valido.data, nombre: e.plantilla };
};
