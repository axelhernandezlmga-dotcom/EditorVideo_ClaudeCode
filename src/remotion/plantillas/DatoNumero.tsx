import { Easing, interpolate } from "remotion";
import type { z } from "zod";
import { CAJA_CONTENIDO } from "../../shared/render";
import type { PropsPorPlantilla } from "../../shared/schemas";
import { ajustarTexto } from "../texto";
import { CLAMP, Destello, formatear, TextoCinetico, useEntrada, useTiempo, useTipo, useResorte } from "./comun";

const DIAMETRO = 500;
const GROSOR = 28;

/**
 * Número que cuenta de 0 al valor dentro de un aro de progreso que se llena a la par.
 * Al terminar: rebote del número, destello, y el aro queda latiendo; después entra el contexto.
 */
export const DatoNumero: React.FC<z.infer<typeof PropsPorPlantilla.dato_numero>> = ({ numero, decimales = 0, prefijo = "", unidad, contexto }) => {
  const spring = useResorte();
  const { frame, fps, dur } = useTiempo();
  const t = useTipo();
  const entrada = useEntrada(0, 12);
  const inicioConteo = 6;
  const finConteo = Math.round(Math.max(inicioConteo + 18, Math.min(dur * 0.45, fps * 2.2)));
  const avance = interpolate(frame, [inicioConteo, finConteo], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const valor = numero * avance;

  // el aro se llena hasta el porcentaje (si es un %) o completo
  const esPorcentaje = /%|por ?ciento/i.test(unidad ?? "") && numero > 0 && numero <= 100;
  const llenado = avance * (esPorcentaje ? numero / 100 : 1);
  const r = (DIAMETRO - GROSOR) / 2;
  const circ = 2 * Math.PI * r;

  // rebote al terminar de contar
  const rebote = spring({ frame: frame - finConteo, fps, config: { damping: 6, stiffness: 200, mass: 0.6 } });
  const escalaNumero = frame < finConteo ? 1 : interpolate(rebote, [0, 1], [1.28, 1]);
  const latido = frame < finConteo ? 0 : 0.5 + 0.5 * Math.sin((frame - finConteo) / 5);

  const textoFinal = `${prefijo}${formatear(numero, decimales)}`;
  const { fontSize } = ajustarTexto({ text: textoFinal, ancho: DIAMETRO - GROSOR * 2 - 70, alto: 190, fontFamily: t.fuente, fontWeight: t.fuerte, maxFont: 170, maxLineas: 1 });
  const ctxDesde = finConteo + 4;
  const ctx = useEntrada(ctxDesde);

  return (
    <div style={{ position: "absolute", left: CAJA_CONTENIDO.x, top: CAJA_CONTENIDO.y, width: CAJA_CONTENIDO.ancho, height: CAJA_CONTENIDO.alto }}>
      <div
        style={{
          position: "absolute",
          left: (CAJA_CONTENIDO.ancho - DIAMETRO) / 2,
          top: 0,
          width: DIAMETRO,
          height: DIAMETRO,
          // al terminar de contar, el aro "respira"
          scale: interpolate(entrada, [0, 1], [0.3, 1]) * (frame < finConteo ? 1 : 1 + 0.035 * Math.sin((frame - finConteo) / 7)),
          opacity: entrada,
          rotate: `${interpolate(entrada, [0, 1], [-90, 0])}deg`,
        }}
      >
        <svg width={DIAMETRO} height={DIAMETRO} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {/* aro exterior punteado que gira siempre */}
          <circle
            cx={DIAMETRO / 2}
            cy={DIAMETRO / 2}
            r={r + 34}
            fill="none"
            stroke={t.colores.texto}
            strokeOpacity={0.25}
            strokeWidth={4}
            strokeDasharray="4 22"
            strokeLinecap="round"
            transform={`rotate(${frame * 1.5} ${DIAMETRO / 2} ${DIAMETRO / 2})`}
          />
          <circle cx={DIAMETRO / 2} cy={DIAMETRO / 2} r={r} fill="rgba(0,0,0,0.25)" stroke={`${t.colores.texto}22`} strokeWidth={GROSOR} />
          <circle
            cx={DIAMETRO / 2}
            cy={DIAMETRO / 2}
            r={r}
            fill="none"
            stroke={t.colores.acento}
            strokeWidth={GROSOR}
            strokeLinecap="round"
            strokeDasharray={`${circ * llenado} ${circ}`}
            transform={`rotate(-90 ${DIAMETRO / 2} ${DIAMETRO / 2})`}
            style={{ filter: `drop-shadow(0 0 ${12 + 18 * latido}px ${t.colores.acento})` }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <div
            style={{
              fontFamily: t.fuente,
              fontWeight: t.fuerte,
              fontSize,
              lineHeight: 1,
              color: t.colores.texto,
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
              scale: escalaNumero,
              textShadow: `0 0 50px ${t.colores.acento}88, 0 8px 30px rgba(0,0,0,0.5)`,
            }}
          >
            {prefijo}
            {formatear(valor, decimales)}
          </div>
          {unidad ? (
            <div
              style={{
                fontFamily: t.fuente,
                fontWeight: t.fuerte,
                fontSize: unidad.length > 10 ? 40 : 58,
                color: t.colores.acento,
                textTransform: "uppercase",
                maxWidth: DIAMETRO - 120,
                lineHeight: 1.05,
                textAlign: "center",
                opacity: interpolate(frame, [inicioConteo + 4, inicioConteo + 12], [0, 1], CLAMP),
              }}
            >
              {unidad}
            </div>
          ) : null}
        </div>
        {/* puntos que orbitan el aro sin parar */}
        {[0, 1, 2].map((k) => {
          const ang = frame / 14 + (k * Math.PI * 2) / 3;
          const ro = r + 34;
          return (
            <div
              key={k}
              style={{
                position: "absolute",
                left: DIAMETRO / 2 + Math.cos(ang) * ro - 11,
                top: DIAMETRO / 2 + Math.sin(ang) * ro - 11,
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: k === 0 ? t.colores.acento2 : t.colores.acento,
                boxShadow: `0 0 16px ${t.colores.acento}`,
                opacity: interpolate(frame, [finConteo - 6, finConteo + 4], [0, 1], CLAMP),
              }}
            />
          );
        })}
        <Destello en={finConteo} radio={DIAMETRO * 0.55} color={t.colores.acento} cantidad={14} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          width: CAJA_CONTENIDO.ancho,
          top: DIAMETRO + 50,
          height: CAJA_CONTENIDO.alto - DIAMETRO - 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: ctx,
          translate: `0 ${interpolate(ctx, [0, 1], [50, 0])}px`,
        }}
      >
        <TextoCinetico texto={contexto} alto={CAJA_CONTENIDO.alto - DIAMETRO - 60} maxFont={62} maxLineas={3} peso="medio" desde={ctxDesde} hasta={Math.max(ctxDesde + 6, dur * 0.75)} />
      </div>
    </div>
  );
};
