import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditar } from "../scripts/publicar";

const armar = (archivos: Record<string, string>) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "fabrica-publicar-"));
  for (const [f, contenido] of Object.entries(archivos)) {
    mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    writeFileSync(path.join(dir, f), contenido);
  }
  return dir;
};
const catalogo = JSON.stringify({ pistas: [{ archivo: "chill/a.ogg", licencia: "Public Domain (CC-0)" }, { archivo: "chill/b.ogg", licencia: "Todos los derechos reservados" }] });

describe("auditoría antes de publicar", () => {
  it("deja pasar lo publicable: código, perfil predeterminado, música CC0", () => {
    const dir = armar({ "src/x.ts": "export const x = 1;", "config/perfiles/predeterminado.json": "{}", "assets/musica/catalogo.json": catalogo, "assets/musica/chill/a.ogg": "", ".env.example": "GEMINI_API_KEY=", "biblioteca/LEEME.md": "", "jobs/.gitkeep": "" });
    expect(auditar(dir)).toEqual([]);
  });

  it("frena perfiles personales, configuración, .env, datos, trabajos y la biblioteca", () => {
    const dir = armar({ "config/perfiles/mi-marca.json": "{}", "config/marca.json": "{}", ".env": "X=1", "data/claves-estado.json": "{}", "jobs/2026-x/video.mp4": "", "biblioteca/biblioteca.json": "{}", ".claude/settings.local.json": "{}" });
    const p = auditar(dir).join("\n");
    for (const f of ["config/perfiles/mi-marca.json", "config/marca.json", ".env", "data/claves-estado.json", "jobs/2026-x/video.mp4", "biblioteca/biblioteca.json", ".claude/settings.local.json"]) expect(p).toContain(f);
  });

  it("frena videos, audio sin licencia libre y claves pegadas en el código", () => {
    const dir = armar({ "assets/musica/catalogo.json": catalogo, "assets/musica/chill/b.ogg": "", "assets/sfx/risa.mp3": "", "web/meme.mp4": "", "src/claves.ts": `const k = "AIza${"x".repeat(35)}";` });
    const p = auditar(dir).join("\n");
    expect(p).toMatch(/b\.ogg: la licencia/);
    expect(p).toMatch(/risa\.mp3: audio sin licencia/);
    expect(p).toMatch(/meme\.mp4: no se publican videos/);
    expect(p).toMatch(/claves\.ts: parece contener una clave/);
  });
});
