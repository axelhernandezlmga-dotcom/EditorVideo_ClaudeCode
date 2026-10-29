import { describe, expect, it } from "vitest";
import type { PalabraCrudo } from "../src/shared/cortes";
import { alinearConGuion, emparejar } from "../src/shared/vozPropia";

/** Palabras dichas, una cada 400 ms. */
const decir = (texto: string): PalabraCrudo[] =>
  texto.split(" ").map((t, i) => ({ texto: t, inicioMs: i * 400, finMs: i * 400 + 300, prob: 1, sinTranscribir: false }));
const textoDe = (p: PalabraCrudo[], idx: number[]) => idx.map((i) => p[i]!.texto).join(" ");

const GUION = ["El balotaje es la segunda vuelta.", "Se hace si nadie pasa la mitad de los votos.", "Compiten los dos más votados.", "Seguime para más."];

describe("emparejar", () => {
  it("empareja aunque whisper escriba distinto", () => {
    expect(emparejar(["balotaje", "es"], ["ballotaje", "es"])).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });
});

describe("alinearConGuion", () => {
  it("leído tal cual: cada palabra en su escena", () => {
    const p = decir("el balotaje es la segunda vuelta se hace si nadie pasa la mitad de los votos compiten los dos más votados seguime para más");
    const a = alinearConGuion(GUION, p, () => true);
    expect(textoDe(p, a[0]!.palabras)).toBe("el balotaje es la segunda vuelta");
    expect(textoDe(p, a[2]!.palabras)).toBe("compiten los dos más votados");
    expect(a.every((e) => !e.salteada)).toBe(true);
  });

  it("si improvisás, lo que dijiste queda en la escena (manda lo dicho)", () => {
    const p = decir("el balotaje es la segunda vuelta o sea la revancha se hace si nadie pasa la mitad de los votos compiten los dos más votados seguime para más");
    const a = alinearConGuion(GUION, p, () => true);
    expect(textoDe(p, a[0]!.palabras)).toBe("el balotaje es la segunda vuelta o sea la revancha");
    expect(textoDe(p, a[1]!.palabras)).toBe("se hace si nadie pasa la mitad de los votos");
  });

  it("una escena salteada se marca y sale", () => {
    const p = decir("el balotaje es la segunda vuelta compiten los dos más votados seguime para más");
    const a = alinearConGuion(GUION, p, () => true);
    expect(a[1]!.salteada).toBe(true);
    expect(a[1]!.palabras).toEqual([]);
    expect(a.filter((e) => e.salteada).length).toBe(1);
  });

  it("no cuenta las palabras cortadas (muletillas, tomas repetidas)", () => {
    const p = decir("eh el balotaje el balotaje es la segunda vuelta se hace si nadie pasa la mitad de los votos compiten los dos más votados seguime para más");
    const cortadas = new Set([0, 1, 2]);
    const a = alinearConGuion(GUION, p, (i) => !cortadas.has(i));
    expect(textoDe(p, a[0]!.palabras)).toBe("el balotaje es la segunda vuelta");
  });

  it("con tomas por escena manda la toma", () => {
    const p = decir("el balotaje es la segunda vuelta compiten los dos más votados");
    const a = alinearConGuion(GUION, p, () => true, [
      { escena: 0, desdeMs: 0, hastaMs: 2400 },
      { escena: 2, desdeMs: 2400, hastaMs: 5000 },
    ]);
    expect(textoDe(p, a[2]!.palabras)).toBe("compiten los dos más votados");
    expect(a[1]!.salteada).toBe(true);
    expect(a[3]!.salteada).toBe(true);
  });
});
