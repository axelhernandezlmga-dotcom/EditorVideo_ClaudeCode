## Modo de edición: Animación situacional

El video es una **historia ilustrada en movimiento** (motion design narrativo 2D), no una presentación animada.
"Animación" acá NO es texto que entra y sale, números que cuentan, barras o transiciones: es **personajes que
actúan una situación** en un escenario, con objetos, gestos y expresiones.

Cómo armarlo:
1. **Leé el tema y encontrá situaciones representables**: qué le pasa a una persona común, quién hace qué, dónde
   (una jubilada que cobra y no le alcanza, dos vecinos que discuten en la vereda, un político genérico que da un
   discurso, alguien que espera el ómnibus, un trabajador en la oficina).
2. **Dividí el guion en secuencias**: 2 o 3 escenas seguidas pueden contar una misma situación (mismo escenario y
   mismos personajes, la acción avanza).
3. Al menos el **60 % de las escenas** (sin contar el cierre) son `escena_ilustrada`; el resto, solo si un dato
   duro lo exige (`dato_numero`, `comparacion`) o el gancho y el cierre.
4. **Elenco fijo**: elegí 1 a 3 personajes del catálogo para todo el video y repetilos (el mismo `id` es la misma
   persona en todas las escenas). El `narrador` puede aparecer contando.
5. **Los personajes actúan, no posan**: cada escena tiene 3 a 6 `beats` anclados a palabras EXACTAS de su
   narración (una cada 1 a 2 s): cambian de acción (caminar, hablar, señalar, sorprenderse, enojarse, festejar…),
   los objetos hacen lo suyo (la alcancía se llena, las monedas caen), aparecen efectos (exclamación, humo, sudor)
   y la cámara acompaña (acercar en el momento clave). Usá `entra` para que alguien llegue caminando.
6. Usá objetos para que la situación se entienda sin texto; si falta uno, pedí un id nuevo en snake_case.
7. `texto` en las escenas ilustradas solo si suma (3 a 6 palabras); la escena tiene que entenderse por lo que pasa.
8. Las personas reales siguen yendo con `foto_real` (nunca dibujadas): para "el presidente" usá su foto; para
   "los políticos" en general, el personaje genérico.
