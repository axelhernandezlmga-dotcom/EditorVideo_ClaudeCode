import { describe, expect, it } from "vitest";
import { clasificar } from "../src/pipeline/claude";

describe("límites de Claude", () => {
  it("el límite de sesión deja el trabajo en pausa (no es un error)", () => {
    expect(clasificar("You've hit your session limit · resets 1:10pm (America/Montevideo)")?.tipo).toBe("limite");
    expect(clasificar("Claude usage limit reached. Your limit will reset at 5pm")?.tipo).toBe("limite");
    expect(clasificar("Invalid API key · Please run /login")?.tipo).toBe("auth");
    expect(clasificar("Error inesperado")).toBeNull();
  });
});
