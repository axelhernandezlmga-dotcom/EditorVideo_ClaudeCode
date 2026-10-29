import { useCurrentFrame, useVideoConfig } from "remotion";
import { useMarca } from "../contexto";

export const BarraProgreso: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames, width } = useVideoConfig();
  const { colores } = useMarca();
  return (
    <div style={{ position: "absolute", top: 0, left: 0, width, height: 10, backgroundColor: "rgba(255,255,255,0.12)" }}>
      <div
        style={{
          width: (width * (frame + 1)) / durationInFrames,
          height: "100%",
          backgroundColor: colores.acento,
          boxShadow: `0 0 18px ${colores.acento}`,
        }}
      />
    </div>
  );
};
