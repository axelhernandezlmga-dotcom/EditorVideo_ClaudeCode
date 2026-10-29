import { Player } from "@remotion/player";
import { useMemo } from "react";
import type { Perfil } from "../../../src/shared/perfiles";
import { ALTO, ANCHO, FPS, type MarcaVisual } from "../../../src/shared/render";
import { DemoPerfil, FRAMES_DEMO_PERFIL } from "../../../src/remotion/DemoPerfil";

/** Marca visual de un perfil para la vista previa (la foto viene de la API). */
export const visualDePerfil = (p: Perfil, foto: string | null): MarcaVisual => {
  const { subtitulos, ...colores } = p.colores;
  return { usuario: p.usuario || "@usuario", nombre: p.nombre, verificado: p.verificado, foto, colores, tipografia: p.tipografia, subtitulos: { ...p.subtitulos, fondo: subtitulos } };
};

/** Subtítulo, tarjeta de noticia y cierre "Seguir" con la paleta y la tipografía del perfil, en vivo. */
export const VistaPerfil: React.FC<{ perfil: Perfil; foto: string | null }> = ({ perfil, foto }) => {
  const props = useMemo(() => ({ marca: visualDePerfil(perfil, foto) }), [perfil, foto]);
  return (
    <div className="vista-previa">
      <Player
        component={DemoPerfil}
        inputProps={props}
        durationInFrames={FRAMES_DEMO_PERFIL}
        compositionWidth={ANCHO}
        compositionHeight={ALTO}
        fps={FPS}
        style={{ width: "100%", aspectRatio: "9 / 16" }}
        controls
        loop
        autoPlay
        acknowledgeRemotionLicense
      />
    </div>
  );
};
