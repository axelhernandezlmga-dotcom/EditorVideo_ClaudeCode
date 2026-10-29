# Guía de estilo de la ilustración

Estas reglas son para que todo lo que se dibuja combine: personajes, objetos, escenarios y efectos. El código está en `src/remotion/ilustracion/`, los parámetros de cada estilo en `estilo.tsx` (`PARAMS_ESTILO`) y el catálogo en `catalogo.json`.

Para regenerar las hojas:

```sh
npm run ilustracion -- --catalogo          # catalogo.json + catalogo.png
npm run ilustracion -- --prueba todo       # pruebas/<tipo>-<id>.png
npm run ilustracion -- --prueba personaje:jubilado --estilo cartoon
```

## Los tres estilos de la casa

Los tres usan las mismas piezas; lo que cambia son los parámetros.

| | Plano editorial | Cartoon | Documental |
|---|---|---|---|
| Para qué | Explicador de noticias (el que va por defecto) | Puteador y gancho random | Académico |
| Contorno | 3 u, tinta `#231F38` | 7 u, tinta `#15111C` | 2,2 u, tinta sepia `#3B3029` |
| Cabeza | ×1 | ×1,28 | ×0,94 |
| Gestos | ×1 | ×1,5, con estirar y aplastar | ×0,7, más contenidos |
| Sombras | Velo negro al 14 % | Color base oscurecido un 28 %, recorte duro | Rayado diagonal a 40° |
| Color | Paleta tal cual | Saturación ×1,15 | Saturación ×0,6, teñida al papel `#EFE4CF` (16 %) |
| Ojos | Puntos | Blanco grande con pupila y brillo | Puntos chicos con párpado |
| Encima | Nada | Nada | Grano de papel y viñeta |

Cuando el estilo está en **automático** se elige por el tono: el académico va en documental, el puteador y el gancho random en cartoon, y el resto en plano editorial.

## Paleta

- **Del perfil** (`acento`, `acento2`, `fondo`, `fondo2`): la ropa del narrador, la corbata del político, los gráficos, las tapas del calendario y el megáfono. Así cada perfil tiene "su" color en los dibujos.
- **De la casa** (`CASA` en `estilo.tsx`):
  - 5 pieles: `piel1` (la más clara) a `piel5` (la más oscura).
  - Pelos: canoso, negro, castaño, rubio y colorado.
  - Ropa neutra: azul, marino, crema, gris, verde, bordo y mostaza.
  - Naturaleza y ciudad: pasto, cielo, mar, arena, ladrillo y hormigón.
- Todo color pasa por `c()`, que le aplica el estilo. Nunca se pone un color "a mano" sin pasar por `c()`.

## Proporciones de los personajes

Las unidades son las del dibujo: los pies en (0, 0) y un adulto mide unas 380.

- Cadera a 168 de altura. Muslo de 84 y pantorrilla de 78.
- Hombros a 284. Brazo de 64, antebrazo de 58 y mano de radio ~11.
- Cabeza de radio 46 × factor del estilo, encima de un cuello de 18 de ancho.
- La **contextura** (0,85–1,3) solo cambia el ancho del torso y la separación de las piernas. La **altura** (0,9–1,05) escala todo el personaje.
- **Vista tres cuartos:** los rasgos de la cara se corren 0,14 R hacia donde mira. El brazo de atrás va detrás del torso y el de adelante, delante. Para mirar a la izquierda se espeja todo el personaje (`mira = -1`).
- **Nunca quieto:** en reposo respira, mueve un poco la cabeza y parpadea cada 2,6–4,4 s, distinto según la semilla.
- **La boca sigue la voz** con 8 visemas (`visemas.ts`), que salen de los tiempos por palabra.

## Sombras y luz

- La luz viene de adelante y de arriba. La sombra va **del lado de atrás**: del torso, de la cara y de los objetos (el borde derecho o el de abajo).
- Una sola capa de sombra por forma, nada de degradés en las formas. Los únicos degradés permitidos son los cielos.
- Cada personaje lleva una sombra elíptica en el piso, que se achica cuando salta.

## Escenarios

- Se dibujan en 1080 × 1920, con 320 px extra a cada lado para los paneos.
- Se arman en capas con profundidad, que es cuánto se mueve cada una con la cámara: cielo 0,03–0,1, fondo 0,3, medio 0,5–0,7 y piso 1.
- El **piso está en y = 1110**: los personajes pisan justo arriba de la franja de subtítulos (60–68 %).
- Siempre hay algo vivo: nubes, olas, autos, gente, luces, el número de turno o el pizarrón que se escribe.

## Reglas firmes

- Todo diseño es propio. No se copia ningún personaje, marca, logo, escudo ni edificio real. El parlamento es un frontón genérico y la bandera es de franjas, sin escudo.
- **Nunca se dibuja a una persona real identificable.** Para ellas va la foto real verificada o la tarjeta de texto. Los personajes del elenco son genéricos (el "político genérico" no se parece a nadie).
- Cada pieza nueva se mira en su hoja de prueba (`pruebas/`) antes de usarla. Si después de 3 intentos no se entiende qué es, se usa una alternativa (ícono, texto o Lottie) y queda anotado en el catálogo.
