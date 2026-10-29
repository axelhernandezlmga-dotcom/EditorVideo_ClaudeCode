import { useMemo } from "react";
import { geoArea, geoBounds, geoCentroid, geoMercator, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { Easing, interpolate } from "remotion";
import type { z } from "zod";
import { CAJA_CONTENIDO } from "../../shared/render";
import type { PropsPorPlantilla } from "../../shared/schemas";
import { momentosItems, normalizar, useEscena } from "../contexto";
import paisesJson from "../geo/paises.json";
import zonasJson from "../geo/zonas.json";
import { Icono } from "../iconos/Icono";
import { CLAMP, TextoCinetico, TituloPildora, useTiempo, useTipo, useResorte } from "./comun";

type Pais = Feature<Geometry, { iso: string; nombre: string }>;
type Zona = Feature<Geometry, { pais: string; nombre: string }>;
/**
 * d3-geo espera los anillos exteriores en sentido horario (al revés que el estándar GeoJSON RFC 7946).
 * Si un polígono quedó "dado vuelta" ocupa más de media esfera: en ese caso se invierten sus anillos.
 */
const orientar = <T extends Feature<Geometry, object>>(f: T): T => {
  if (geoArea(f) <= 2 * Math.PI) return f;
  const g = f.geometry;
  if (g.type === "Polygon") return { ...f, geometry: { ...g, coordinates: g.coordinates.map((r) => [...r].reverse()) } };
  if (g.type === "MultiPolygon") return { ...f, geometry: { ...g, coordinates: g.coordinates.map((p) => p.map((r) => [...r].reverse())) } };
  return f;
};
const PAISES = (paisesJson as unknown as FeatureCollection<Geometry, { iso: string; nombre: string }>).features.map(orientar) as Pais[];
const ZONAS = (zonasJson as unknown as FeatureCollection<Geometry, { pais: string; nombre: string }>).features.map(orientar) as Zona[];

/** Países con departamentos/provincias disponibles para colorear. */
export const PAISES_CON_ZONAS = [...new Set(ZONAS.map((z) => z.properties.pais))];

const W = CAJA_CONTENIDO.ancho;
const ALTO_MAPA = 560;
const Y_MAPA = 100;

/**
 * Mapa con GeoJSON local (Natural Earth, dominio público): la cámara arranca mostrando la región y hace zoom
 * al país, su contorno se dibuja, se rellena, aparecen sus divisiones y se colorean las zonas a medida
 * que la voz las nombra (o un barrido si no hay zonas). Al final cae un pin que late.
 */
export const Mapa: React.FC<z.infer<typeof PropsPorPlantilla.mapa>> = ({ pais, etiqueta, dato, zonas = [] }) => {
  const spring = useResorte();
  const { frame, fps, dur } = useTiempo();
  const { captions } = useEscena();
  const t = useTipo();
  const iso = pais.toUpperCase();

  const geo = useMemo(() => {
    const objetivo = PAISES.find((p) => p.properties.iso === iso);
    if (!objetivo) return null;
    const proy = geoMercator().fitExtent(
      [
        [60, 40],
        [W - 60, ALTO_MAPA - 40],
      ],
      objetivo,
    );
    const camino = geoPath(proy);
    const [[x0, y0], [x1, y1]] = geoBounds(objetivo);
    const mx = (x1 - x0) * 2.5;
    const my = (y1 - y0) * 2.5;
    const vecinos = PAISES.filter((p) => {
      if (p === objetivo) return false;
      const [[a0, b0], [a1, b1]] = geoBounds(p);
      return a1 > x0 - mx && a0 < x1 + mx && b1 > y0 - my && b0 < y1 + my;
    }).map((p) => camino(p) ?? "");
    const divisiones = ZONAS.filter((z) => z.properties.pais === iso).map((z) => {
      const [cx, cy] = proy(geoCentroid(z)) ?? [W / 2, ALTO_MAPA / 2];
      return { nombre: z.properties.nombre, d: camino(z) ?? "", cx, cy };
    });
    const [px, py] = proy(geoCentroid(objetivo)) ?? [W / 2, ALTO_MAPA / 2];
    return { d: camino(objetivo) ?? "", nombre: objetivo.properties.nombre, vecinos, divisiones, centro: { x: px, y: py } };
  }, [iso]);

  const tituloTexto = etiqueta ?? geo?.nombre ?? iso;
  const datoDesde = Math.round(dur * 0.4);

  if (!geo) {
    // país desconocido: globo que gira con el nombre
    return (
      <div style={{ position: "absolute", left: CAJA_CONTENIDO.x, top: CAJA_CONTENIDO.y, width: W, height: CAJA_CONTENIDO.alto, display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
        <TituloPildora texto={tituloTexto} />
        <div style={{ rotate: `${frame * 2}deg`, scale: spring({ frame, fps, config: { damping: 10 } }) }}>
          <Icono nombre="globe" tam={360} color={t.colores.acento} dibujo={interpolate(frame, [0, 24], [0, 1], CLAMP)} grosor={1.6} />
        </div>
        {dato ? <TextoCinetico texto={dato} alto={160} maxFont={56} maxLineas={2} peso="medio" desde={datoDesde} /> : null}
      </div>
    );
  }

  // cámara: de la región (zoom 0.42) al país, y después sigue acercándose despacio
  const finZoom = Math.min(dur * 0.35, fps * 1.4);
  const zoom = interpolate(frame, [0, finZoom], [0.42, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) }) * interpolate(frame, [finZoom, dur], [1, 1.08], CLAMP);
  const cx = W / 2;
  const cy = ALTO_MAPA / 2;
  const transform = `translate(${cx} ${cy}) scale(${zoom}) translate(${-cx} ${-cy})`;

  const contorno = interpolate(frame, [4, finZoom + 6], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.quad) });
  const relleno = interpolate(frame, [finZoom, finZoom + 10], [0, 1], CLAMP);
  const lineas = interpolate(frame, [finZoom + 6, finZoom + 16], [0, 1], CLAMP);

  // zonas a colorear: cuando la voz las nombra; si no hay, un barrido que recorre todas
  const objetivoZonas = geo.divisiones.filter((d) => zonas.some((z) => normalizar(z) === normalizar(d.nombre)));
  const momentosZonas = momentosItems(captions, objetivoZonas.map((z) => z.nombre), (dur / fps) * 1000, ((finZoom + 10) / fps) * 1000).map((ms) => Math.max(finZoom + 10, (ms / 1000) * fps));
  const ordenBarrido = [...geo.divisiones].sort((a, b) => a.cx - b.cx);
  const inicioBarrido = finZoom + 12;
  const durBarrido = Math.max(12, Math.min(fps * 1.4, dur * 0.3));

  const zonaPin = objetivoZonas[0];
  const pin = zonaPin ? { x: zonaPin.cx, y: zonaPin.cy } : geo.centro;
  const momentoPin = Math.min(dur * 0.62, Math.max(inicioBarrido + durBarrido * 0.6, (momentosZonas[0] ?? 0) + 6));
  const caida = spring({ frame: frame - momentoPin, fps, config: { damping: 8, stiffness: 150 } });
  // posición del pin en pantalla (aplicando el zoom de la cámara)
  const pinX = cx + (pin.x - cx) * zoom;
  const pinY = cy + (pin.y - cy) * zoom;

  return (
    <div style={{ position: "absolute", left: CAJA_CONTENIDO.x, top: CAJA_CONTENIDO.y, width: W, height: CAJA_CONTENIDO.alto }}>
      <div style={{ position: "absolute", top: 0, width: "100%", display: "flex", justifyContent: "center" }}>
        <TituloPildora texto={tituloTexto} />
      </div>
      <div style={{ position: "absolute", left: 0, top: Y_MAPA, width: W, height: ALTO_MAPA, overflow: "hidden", borderRadius: 40, maskImage: "radial-gradient(ellipse at center, black 62%, transparent 100%)" }}>
        <svg width={W} height={ALTO_MAPA}>
          <g transform={transform}>
            {geo.vecinos.map((d, i) => (
              <path key={i} d={d} fill={`${t.colores.texto}12`} stroke={`${t.colores.texto}40`} strokeWidth={1.5 / zoom} />
            ))}
            <path d={geo.d} fill={t.colores.fondo2} fillOpacity={relleno} stroke="none" />
            {geo.divisiones.map((z, i) => {
              const k = objetivoZonas.indexOf(z);
              let color: string | null = null;
              let pop = 0;
              if (k >= 0) {
                const m = momentosZonas[k] ?? 0;
                const p = spring({ frame: frame - m, fps, config: { damping: 10 } });
                if (frame >= m) {
                  color = k === 0 ? t.colores.acento : k % 2 ? t.colores.acento2 : t.colores.acento;
                  pop = 1 - p;
                }
              } else if (objetivoZonas.length === 0) {
                const orden = ordenBarrido.indexOf(z);
                const m = inicioBarrido + (orden / Math.max(1, ordenBarrido.length)) * durBarrido;
                const brillo = interpolate(frame, [m, m + 5, m + 16], [0, 1, 0.25], CLAMP);
                if (brillo > 0) {
                  return <path key={i} d={z.d} fill={t.colores.acento} fillOpacity={0.85 * brillo} stroke={t.colores.fondo} strokeWidth={1.5 / zoom} />;
                }
              }
              if (!color) return null;
              const escala = 1 + 0.25 * pop;
              return (
                <path
                  key={i}
                  d={z.d}
                  fill={color}
                  stroke={t.colores.fondo}
                  strokeWidth={2 / zoom}
                  transform={`translate(${z.cx} ${z.cy}) scale(${escala}) translate(${-z.cx} ${-z.cy})`}
                  style={{ filter: `drop-shadow(0 0 ${12 * (1 - pop) + 4}px ${color})` }}
                />
              );
            })}
            {geo.divisiones.map((z, i) => (
              <path key={`l${i}`} d={z.d} fill="none" stroke={t.colores.texto} strokeOpacity={0.35 * lineas} strokeWidth={1.2 / zoom} />
            ))}
            <path
              d={geo.d}
              fill="none"
              stroke={t.colores.acento}
              strokeWidth={5 / zoom}
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - contorno}
              style={{ filter: `drop-shadow(0 0 10px ${t.colores.acento})` }}
            />
          </g>
        </svg>
        {/* pin */}
        {frame >= momentoPin - 1 ? (
          <div style={{ position: "absolute", left: pinX, top: pinY, width: 0, height: 0 }}>
            {[0, 1].map((k) => {
              const onda = ((frame - momentoPin + k * 12) % 24) / 24;
              return (
                <div
                  key={k}
                  style={{
                    position: "absolute",
                    left: -60 * onda,
                    top: -30 * onda,
                    width: 120 * onda,
                    height: 60 * onda,
                    borderRadius: "50%",
                    border: `4px solid ${t.colores.acento2}`,
                    opacity: frame > momentoPin + 6 ? 1 - onda : 0,
                  }}
                />
              );
            })}
            <div style={{ position: "absolute", left: -45, top: -96, translate: `0 ${interpolate(caida, [0, 1], [-300, 0])}px`, scale: `${interpolate(caida, [0, 0.8, 1], [0.8, 1.15, 1])} ${interpolate(caida, [0, 0.8, 1], [1.2, 0.85, 1])}`, transformOrigin: "50% 100%" }}>
              <Icono nombre="map-pin" tam={90} color={t.colores.acento2} relleno={`${t.colores.acento2}55`} grosor={2.4} />
            </div>
          </div>
        ) : null}
      </div>
      {dato ? (
        <div style={{ position: "absolute", left: 0, top: Y_MAPA + ALTO_MAPA + 10, width: W, height: CAJA_CONTENIDO.alto - Y_MAPA - ALTO_MAPA - 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <TextoCinetico texto={dato} alto={CAJA_CONTENIDO.alto - Y_MAPA - ALTO_MAPA - 20} maxFont={54} maxLineas={2} peso="fuerte" desde={datoDesde} hasta={Math.max(datoDesde + 6, dur * 0.75)} />
        </div>
      ) : null}
    </div>
  );
};
