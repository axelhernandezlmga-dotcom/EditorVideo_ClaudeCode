import { AbsoluteFill, Easing, interpolate } from "remotion";
import type { z } from "zod";
import { ZONA_SEGURA } from "../../shared/render";
import type { PropsPorPlantilla } from "../../shared/schemas";
import { useMarca } from "../contexto";
import { aparienciaDe, EfectoAnimado, ObjetoAnimado } from "../ilustracion/biblioteca";
import { azar } from "../ilustracion/color";
import { ESCENARIOS } from "../ilustracion/escenarios";
import { DefsEstilo, GranoPapel, ProveedorEstilo } from "../ilustracion/estilo";
import { OBJETOS } from "../ilustracion/objetos";
import type { FichaObjeto } from "../ilustracion/objetos/tipos";
import type { Accion, TramoAccion } from "../ilustracion/personajes/acciones";
import type { Apariencia } from "../ilustracion/personajes/apariencia";
import { Personaje } from "../ilustracion/personajes/Personaje";
import { fichaSvg } from "../ilustracion/svgObjeto";
import { CLAMP, TextoCinetico, useTiempo } from "./comun";

type Props = z.infer<typeof PropsPorPlantilla.escena_ilustrada> & {
  /** Objetos que la app dibujó para este video (SVG ya saneado), por id. */
  svgs?: Record<string, string>;
};

const X_LUGAR: Record<"izquierda" | "centro" | "derecha", number> = { izquierda: 250, centro: 540, derecha: 830 };
const ESCALA_PERSONAJE = 1.45;
/** Alto en pantalla (px) de un objeto según su tamaño. */
const ALTO_OBJETO = { chico: 150, normal: 250, grande: 400 } as const;
const ANCHO_MAX_OBJETO = { chico: 240, normal: 430, grande: 620 } as const;
/** Ningún tramo sin cambios más largo que esto (el director mete un cambio si hace falta). */
const MAX_SIN_CAMBIO_S = 2.2;
/** Al hablar, el que narra alterna estos gestos; los demás reaccionan con estos. */
const GESTOS_NARRA: Accion[] = ["senalar", "hablar", "encogerse", "hablar"];
const GESTOS_REACCION: Accion[] = ["pensar", "reposo", "sorprenderse", "reposo"];

type Cambio = { f: number; personaje?: number; accion?: Accion; objeto?: number; accionObjeto?: string; efecto?: string; sobre?: number; camara?: "acercar" | "alejar" | "izquierda" | "derecha" };

const suave = (t: number) => interpolate(t, [0, 1], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });

/**
 * Escena ilustrada: un escenario con capas (parallax), personajes que actúan, objetos que entran y se
 * transforman, efectos dibujados y una cámara que se mueve. Los cambios ("beats") caen en las palabras de la
 * narración que pide el guion, y el director agrega los que falten para que nunca pase más de ~2 s sin que
 * algo cambie.
 */
export const EscenaIlustrada: React.FC<Props> = (props) => {
  const { frame, fps, dur, frameDe } = useTiempo();
  const marca = useMarca();
  // con kit de marca: siempre "plano editorial" recoloreado a la paleta de la marca, con más aire
  const kit = marca.kit;
  const estilo = kit ? "plano" : (marca.ilustracion?.estilo ?? "plano");
  const recolor = kit ? { tinta: kit.colores.texto, gris: kit.colores.secundario, linea: kit.colores.linea, papel: kit.colores.fondo2, blanco: kit.colores.fondo, acento: kit.colores.acento } : undefined;
  const escalaPersonaje = ESCALA_PERSONAJE * (kit ? 0.9 : 1);
  const narrador = marca.ilustracion?.narrador as Apariencia | undefined;
  const esc = ESCENARIOS[props.escenario] ?? ESCENARIOS.ciudad_dia!;
  const piso = esc.piso;
  const personajes = props.personajes.map((p) => ({ ...p, ap: aparienciaDe(p.id, narrador ? { ...aparienciaDe("narrador")!, ...narrador } : undefined) })).filter((p) => p.ap);
  const fichaDe = (id: string): FichaObjeto | undefined => OBJETOS[id] ?? (props.svgs?.[id] ? fichaSvg(id, props.svgs[id]!) : undefined);
  const objetos = props.objetos
    .map((o) => ({ ...o, ficha: fichaDe(o.id) }))
    .filter((o) => o.ficha)
    .slice(0, kit ? 2 : 4);

  // ---------- beats del guion → frames ----------
  const cambios: Cambio[] = props.beats
    .map((b, k): Cambio => ({
      f: Math.max(4, frameDe(b.palabra, Math.round(((k + 1) / (props.beats.length + 1)) * dur)) - 3),
      personaje: b.personaje,
      accion: b.accion,
      objeto: b.objeto,
      accionObjeto: b.accion_objeto,
      efecto: b.efecto,
      sobre: b.efecto_sobre,
      camara: b.camara,
    }))
    .sort((a, b) => a.f - b.f);

  // ---------- director: ningún hueco largo sin cambios ----------
  const entradas = objetos.map((_, k) => 6 + k * 9);
  const marcas = [0, ...entradas, ...cambios.map((c) => c.f), dur].sort((a, b) => a - b);
  const narra = Math.max(0, personajes.findIndex((p) => p.habla));
  let n = 0;
  for (let k = 0; k < marcas.length - 1; k++) {
    const hueco = marcas[k + 1]! - marcas[k]!;
    const partes = Math.floor(hueco / (MAX_SIN_CAMBIO_S * fps));
    for (let j = 1; j <= partes; j++) {
      const f = Math.round(marcas[k]! + (hueco * j) / (partes + 1));
      n++;
      if (personajes.length) {
        const quien = personajes.length > 1 && n % 3 === 0 ? (narra + 1) % personajes.length : narra;
        const lista = quien === narra ? GESTOS_NARRA : GESTOS_REACCION;
        cambios.push({ f, personaje: quien, accion: lista[n % lista.length], camara: n % 2 ? "acercar" : undefined });
      } else if (objetos.length) cambios.push({ f, objeto: n % objetos.length, accionObjeto: "latir", camara: n % 2 ? "acercar" : "izquierda" });
      else cambios.push({ f, camara: n % 2 ? "acercar" : "derecha" });
    }
  }
  cambios.sort((a, b) => a.f - b.f);

  // ---------- cámara ----------
  const t = frame / dur;
  let zoom = props.camara === "zoom_in" ? 1 + 0.16 * suave(t) : props.camara === "zoom_out" ? 1.16 - 0.16 * suave(t) : 1 + 0.035 * t;
  let camX = props.camara === "paneo" ? interpolate(t, [0, 1], [-170, 170]) : props.camara === "parallax" ? Math.sin((frame / fps) * 0.55) * 80 : 0;
  for (const c of cambios) {
    if (!c.camara || frame < c.f) continue;
    const u = suave((frame - c.f) / 14);
    if (c.camara === "acercar") zoom += 0.06 * u;
    else if (c.camara === "alejar") zoom = Math.max(1, zoom - 0.06 * u);
    else camX += (c.camara === "izquierda" ? -110 : 110) * u;
  }
  zoom = Math.min(zoom, 1.32);
  const foco = personajes[narra] ? { x: X_LUGAR[personajes[narra]!.lugar], y: piso - 330 } : { x: 540, y: 820 };

  // ---------- personajes ----------
  const capaPersonajes = personajes.map((p, i) => {
    const xFinal = X_LUGAR[p.lugar];
    const mira: 1 | -1 = p.mira ? (p.mira === "derecha" ? 1 : -1) : p.lugar === "derecha" ? -1 : 1;
    const tramos: TramoAccion[] = [];
    let x = xFinal;
    let miraAhora = mira;
    const caminata = Math.round(fps * 1.1);
    if (p.entra) {
      const desdeX = p.entra === "izquierda" ? -220 : 1300;
      x = interpolate(frame, [0, caminata], [desdeX, xFinal], { ...CLAMP, easing: Easing.out(Easing.quad) });
      tramos.push({ desde: 0, accion: "caminar" }, { desde: caminata, accion: p.accion });
      if (frame < caminata) miraAhora = p.entra === "izquierda" ? 1 : -1;
    } else tramos.push({ desde: 0, accion: p.accion });
    for (const c of cambios) if (c.personaje === i && c.accion && c.f > (tramos.at(-1)?.desde ?? 0) + 6) tramos.push({ desde: c.f, accion: c.accion });
    // la entrada: aparece con un pequeño salto aunque no camine
    const aparece = p.entra ? 1 : interpolate(frame, [i * 4, i * 4 + 10], [0, 1], { ...CLAMP, easing: Easing.out(Easing.back(1.6)) });
    return (
      <g key={`p${i}`} transform={`translate(${x - camX} ${piso}) scale(${escalaPersonaje * aparece})`}>
        <Personaje apariencia={p.ap!} acciones={tramos} mira={miraAhora} habla={p.habla === true} semilla={i * 7 + 3} />
      </g>
    );
  });

  // ---------- objetos ----------
  const ocupado = new Set(personajes.map((p) => p.lugar));
  const capaObjetos = objetos.map((o, k) => {
    const f = o.ficha!;
    const [w, h] = f.tam;
    const escala = Math.min(ALTO_OBJETO[o.tam] / (2 * h), ANCHO_MAX_OBJETO[o.tam] / (2 * w));
    const lugar = o.lugar === "arriba" ? null : o.lugar;
    const arriba = lugar === null;
    let x = lugar ? X_LUGAR[lugar] : 540;
    // si hay un personaje en el mismo lugar, el objeto se corre hacia el centro (o a la derecha si es el centro)
    if (lugar && ocupado.has(lugar)) x += lugar === "derecha" ? -170 : 170;
    const entra = entradas[k]!;
    const tramos = [{ desde: entra, accion: o.accion }];
    for (const c of cambios) if (c.objeto === k && c.accionObjeto && c.f > entra) tramos.push({ desde: c.f, accion: c.accionObjeto });
    const actual = tramos.findLast((tr) => tr.desde <= frame) ?? tramos[0]!;
    // antes de su momento el objeto no está; entra con su acción (o "entrar" si es una acción propia)
    if (frame < entra) return { arriba, nodos: [] };
    const cantidad = o.cantidad;
    const nodos = Array.from({ length: cantidad }, (_, j) => {
      // varios "arriba" = lluvia: caen en loop desde arriba del cuadro hasta el piso, girando, y se desvanecen
      if (arriba && cantidad > 1 && (actual.accion === "entrar" || actual.accion === "caer")) {
        const periodo = fps * (1.3 + azar(j + k) * 0.5);
        const u = (((frame - actual.desde) / periodo + j / cantidad) % 1 + 1) % 1;
        const yy = interpolate(u, [0, 1], [-160, piso - 40]);
        const xx = 540 + (azar(j * 3 + k * 11) - 0.5) * 900 + Math.sin(u * 6 + j) * 30;
        const opacidad = interpolate(u, [0, 0.08, 0.85, 1], [0, 1, 1, 0]);
        return (
          <g key={`o${k}-${j}`} opacity={opacidad} transform={`translate(${xx - camX * 0.8} ${yy}) rotate(${u * 220 * (j % 2 ? 1 : -1)}) scale(${escala})`}>
            <f.Dibujo accion="quieto" t={frame} fps={fps} semilla={j} />
          </g>
        );
      }
      const dx = cantidad > 1 ? (j - (cantidad - 1) / 2) * w * escala * 1.15 : 0;
      const yBase = arriba ? 620 : piso + 10;
      const desde = actual.desde + (cantidad > 1 ? j * 4 : 0);
      // uno solo arriba: entra y queda flotando
      const accion = arriba && actual.accion === "entrar" && frame - actual.desde > 20 ? "flotar" : actual.accion;
      return (
        <g key={`o${k}-${j}`} transform={`translate(${x + dx - camX * 0.95} ${yBase - h * escala}) scale(${escala})`}>
          <ObjetoAnimado id={o.id} ficha={f} accion={accion} desde={desde} semilla={j + k * 5 + 1} />
        </g>
      );
    });
    return { arriba, nodos };
  });

  // ---------- efectos ----------
  const capaEfectos = cambios
    .filter((c) => c.efecto)
    .map((c, k) => {
      const quien = c.sobre ?? -1;
      const p = personajes[quien];
      const x = p ? X_LUGAR[p.lugar] : 540;
      const y = p ? piso - 380 * escalaPersonaje * p.ap!.altura - 70 : 760;
      return (
        <g key={`e${k}`} transform={`translate(${x - camX + (p ? 60 : 0)} ${y}) scale(${p ? 0.75 : 1.5})`}>
          <EfectoAnimado id={c.efecto!} desde={c.f} semilla={k + 1} />
        </g>
      );
    });

  return (
    <ProveedorEstilo estilo={estilo} paleta={marca.colores} recolor={recolor}>
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <svg viewBox="0 0 1080 1920" width="100%" height="100%" style={{ display: "block" }}>
          <DefsEstilo />
          <g transform={`translate(${foco.x} ${foco.y}) scale(${zoom}) translate(${-foco.x} ${-foco.y})`}>
            <esc.Dibujo t={frame} fps={fps} camara={camX} semilla={1} />
            {capaObjetos.filter((c) => c.arriba).flatMap((c) => c.nodos)}
            {capaPersonajes}
            {capaObjetos.filter((c) => !c.arriba).flatMap((c) => c.nodos)}
            {capaEfectos}
          </g>
        </svg>
        <GranoPapel desplazamiento={frame} />
        {/* velo abajo: los subtítulos se leen mejor sobre el piso dibujado */}
        {kit ? null : <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 56%, rgba(0,0,0,0.28) 66%, rgba(0,0,0,0) 76%)" }} />}
      </AbsoluteFill>
      {props.texto ? (
        <div style={{ position: "absolute", left: 60, right: 60, top: ZONA_SEGURA.arriba - 6, padding: "18px 26px", borderRadius: 26, background: kit ? kit.colores.fondo : "rgba(10,12,24,0.62)" }}>
          {/* con kit: tinta sobre blanco, sin mayúsculas forzadas (nada de párrafos en mayúsculas) */}
          <TextoCinetico texto={props.texto} alto={150} maxFont={74} maxLineas={2} mayusculas={!kit} sombra={!kit} color={kit ? kit.colores.texto : undefined} hasta={Math.round(dur * 0.45)} />
        </div>
      ) : null}
    </ProveedorEstilo>
  );
};
