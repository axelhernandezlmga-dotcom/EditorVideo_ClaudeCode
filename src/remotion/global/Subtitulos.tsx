import { useMemo } from "react";
import { createTikTokStyleCaptions } from "@remotion/captions";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { TAMANOS_SUBTITULOS } from "../../shared/perfiles";
import { CAJA_CONTENIDO, SUBTITULOS, SUBTITULOS_Y } from "../../shared/render";
import { normalizar, useEscena, useMarca } from "../contexto";
import { familia, pesoFuerte } from "../fuentes";
import { ajustarTexto } from "../texto";
import { caidaPunto } from "../marca/base";

const ANCHO_SUBS = CAJA_CONTENIDO.ancho;

/**
 * Subtítulos estilo TikTok de una escena: páginas cortas con la palabra activa resaltada.
 * `y` = centro vertical en px (en los crudos se mueve para no tapar la cara); por defecto, la franja de siempre.
 * El estilo y el tamaño salen del perfil: contorno (borde negro), caja (franja de color), resaltado (la palabra
 * activa en una píldora) o sombra (sin borde).
 */
export const Subtitulos: React.FC<{ paginaMs: number; y?: number }> = (props) => {
  const { kit } = useMarca();
  return kit ? <SubtitulosMarca {...props} /> : <SubtitulosGenericos {...props} />;
};

/**
 * Subtítulos de marca: Inter SemiBold, tinta sobre una caja papel (o blanco sobre tinta en fondos oscuros), sin
 * mayúsculas forzadas ni bordes; la palabra activa se marca con el subrayado rojo de la marca.
 */
const SubtitulosMarca: React.FC<{ paginaMs: number; y?: number; oscuro?: boolean }> = ({ paginaMs, y = SUBTITULOS_Y, oscuro = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { captions, enfasis } = useEscena();
  const { kit, subtitulos, energia } = useMarca();
  const { pages } = useMemo(() => createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: paginaMs }), [captions, paginaMs]);
  const enfasisNorm = useMemo(() => new Set(enfasis.flatMap((e) => e.split(/\s+/)).map(normalizar)), [enfasis]);
  if (!kit) return null;
  const escala = TAMANOS_SUBTITULOS[subtitulos?.tamano ?? "normal"];
  const ms = (frame / fps) * 1000;
  const idx = pages.findIndex((p, i) => ms >= p.startMs && ms < (pages[i + 1]?.startMs ?? p.startMs + p.durationMs + 400));
  const pagina = idx >= 0 ? pages[idx] : undefined;
  if (!pagina) return null;
  const fuente = familia("kit");
  const { fontSize } = ajustarTexto({ text: pagina.text.trim(), ancho: ANCHO_SUBS - 60, alto: SUBTITULOS.alto, fontFamily: fuente, fontWeight: 600, maxFont: Math.round(62 * escala), minFont: Math.round(36 * escala), maxLineas: 2 });
  const inicioPagina = (pagina.startMs / 1000) * fps;
  const entra = interpolate(frame, [inicioPagina, inicioPagina + 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.2, 0, 0, 1) });
  const tinta = oscuro ? "#FFFFFF" : kit.colores.texto;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: y,
        translate: `-50% calc(-50% + ${(1 - entra) * 10}px)`,
        maxWidth: ANCHO_SUBS,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        columnGap: fontSize * 0.26,
        rowGap: fontSize * 0.1,
        padding: `${fontSize * 0.26}px ${fontSize * 0.5}px ${fontSize * 0.34}px`,
        borderRadius: 18,
        background: oscuro ? kit.colores.texto : kit.colores.fondo,
        boxShadow: "0 2px 14px rgba(32,33,36,0.10)",
        fontFamily: fuente,
        fontWeight: 600,
        fontSize,
        lineHeight: 1.16,
        color: tinta,
        textAlign: "center",
        opacity: entra,
      }}
    >
      {pagina.tokens.map((tok, i) => {
        const activo = ms >= tok.fromMs && ms < tok.toMs;
        const subrayado = activo ? Math.min(1, (ms - tok.fromMs) / 90) : 0;
        // energía alta (tonos agresivos): en las palabras de énfasis cae el punto rojo, como en el logo
        const punto = energia === "alta" && enfasisNorm.has(normalizar(tok.text)) && ms >= tok.fromMs ? caidaPunto((ms / 1000) * fps, (tok.fromMs / 1000) * fps) : null;
        return (
          <span key={i} style={{ position: "relative", display: "inline-block", whiteSpace: "nowrap" }}>
            {tok.text.trim()}
            {punto ? <span style={{ display: "inline-block", width: fontSize * 0.2, height: fontSize * 0.2, marginLeft: fontSize * 0.04, borderRadius: "50%", background: kit.colores.acento, scale: String(punto.escala), translate: `0 ${punto.y * fontSize * 0.8}px` }} /> : null}
            <span style={{ position: "absolute", left: 0, right: 0, bottom: -fontSize * 0.1, height: Math.max(4, fontSize * 0.09), borderRadius: 4, background: kit.colores.acento, scale: `${subrayado} 1`, transformOrigin: "left" }} />
          </span>
        );
      })}
    </div>
  );
};

const SubtitulosGenericos: React.FC<{ paginaMs: number; y?: number }> = ({ paginaMs, y = SUBTITULOS_Y }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { captions, enfasis } = useEscena();
  const { colores, tipografia, subtitulos } = useMarca();
  const estilo = subtitulos?.estilo ?? "contorno";
  const escala = TAMANOS_SUBTITULOS[subtitulos?.tamano ?? "normal"];
  const fondoSubs = subtitulos?.fondo ?? "#000000";
  const fuente = familia(tipografia);
  const peso = pesoFuerte(tipografia);

  const { pages } = useMemo(
    () => createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: paginaMs }),
    [captions, paginaMs],
  );
  const enfasisNorm = useMemo(() => new Set(enfasis.flatMap((e) => e.split(/\s+/)).map(normalizar)), [enfasis]);

  const ms = (frame / fps) * 1000;
  const idx = pages.findIndex((p, i) => ms >= p.startMs && ms < (pages[i + 1]?.startMs ?? p.startMs + p.durationMs + 400));
  const pagina = idx >= 0 ? pages[idx] : undefined;
  if (!pagina) return null;

  const { fontSize } = ajustarTexto({
    text: pagina.text.trim().toUpperCase(),
    ancho: ANCHO_SUBS,
    alto: SUBTITULOS.alto,
    fontFamily: fuente,
    fontWeight: peso,
    maxFont: Math.round(74 * escala),
    minFont: Math.round(38 * escala),
    maxLineas: 2,
    mayusculas: true,
  });
  const inicioPagina = (pagina.startMs / 1000) * fps;

  return (
    <div
      style={{
        position: "absolute",
        left: CAJA_CONTENIDO.x,
        width: ANCHO_SUBS,
        top: y,
        translate: "0 -50%",
        // palabras separadas con gap (no con espacios): así el escalado de la palabra activa no las pega
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        columnGap: fontSize * 0.28,
        textAlign: "center",
        fontFamily: fuente,
        fontWeight: peso,
        fontSize,
        lineHeight: 1.12,
        textTransform: "uppercase",
        color: colores.texto,
        WebkitTextStroke: estilo === "contorno" ? `${Math.round(fontSize / 9)}px #000` : undefined,
        paintOrder: "stroke fill",
        textShadow: estilo === "caja" ? undefined : estilo === "sombra" ? "0 4px 14px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.8)" : "0 6px 18px rgba(0,0,0,0.65)",
        ...(estilo === "caja" ? { backgroundColor: `${fondoSubs}E6`, padding: `${fontSize * 0.18}px ${fontSize * 0.4}px`, borderRadius: fontSize * 0.3, width: "auto", maxWidth: ANCHO_SUBS, left: "50%", translate: "-50% -50%" } : {}),
        scale: interpolate(frame, [inicioPagina, inicioPagina + 5], [0.86, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.back(2)),
        }),
      }}
    >
      {pagina.tokens.map((tok, i) => {
        const activo = ms >= tok.fromMs && ms < tok.toMs;
        const esEnfasis = enfasisNorm.has(normalizar(tok.text));
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              whiteSpace: "nowrap",
              color: estilo === "resaltado" && activo ? colores.texto : activo ? colores.acento : esEnfasis ? colores.acento2 : colores.texto,
              // la palabra activa sube un poco en vez de agrandarse (agrandarla la pegaba a la vecina)
              translate: activo && estilo !== "resaltado" ? `0 ${-fontSize * 0.07}px` : undefined,
              ...(estilo === "resaltado"
                ? { backgroundColor: activo ? colores.acento : "transparent", color: activo ? fondoSubs : esEnfasis ? colores.acento2 : colores.texto, padding: `0 ${fontSize * 0.14}px`, borderRadius: fontSize * 0.18 }
                : {}),
            }}
          >
            {tok.text.trim()}
          </span>
        );
      })}
    </div>
  );
};
