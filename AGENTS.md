# AGENTS.md — Coordinación Multi-Agente: Los del Desguace (Taller El Yunke)

> **Para cualquier agente (Antigravity, Claude, ChatGPT / Codex, Cursor):** Este archivo resume el **objetivo oficial del juego**, su estado actual y las reglas del repositorio. La especificación detallada completa está en [CLAUDE.md](./CLAUDE.md).

---

## 1. Objetivo Central del Juego (Visión Oficial)

**Los del Desguace — Taller El Yunke** es un juego indie 3D **multijugador compartido (mínimo 6 jugadores)** de **construcción libre, exploración con parkour y actividades opcionales con física** (React Three Fiber + Rapier + Zustand).

- **NO es solo un sandbox aislado de construcción ni se limita a armar autos con ruedas.**
- **SÍ es un patio de recreo social con libertad total de invención y progresión entrelazada:**
  1. **Taller Universal (Sin Ruedas Obligatorias):** **Cualquier objeto** (barril, caja, chasis o futuras chapas recortadas) puede convertirse en la base de un invento volador, robot o máquina montable, guardable y compartible, apoyado por una **caja de herramientas híbrida** (herramientas 3D en mano + Mesa de Corte/Dibujo 2D→3D + Pintura/Aerosol sobre piezas).
  2. **Lobby Central (estilo *PEAK*):** Espacio social para **6+ jugadores** donde se juntan, personalizan su personaje (**El Vestidor del Yunke**), hacen gestos, muestran inventos y eligen qué jugar juntos.
  3. **Explorar con o sin construir (Escalada y Parkour):** Los niveles y secretos se pueden pasar armando máquinas **o a pie** gracias a mecánicas de **agarre de salientes y trepada** a techos/contenedores, buscando **Tuercas Doradas**, reliquias y piezas raras (Torre Mirador, Montaña de Chatarra).
  4. **Clima Dinámico y Riesgos Ambientales:** Barro que atrapa vehículos, vientos que desvían aviones/dirigibles y condiciones cambiantes.
  5. **Interacción Grupal (6+ jugadores):** Desafíos cooperativos, carreras de relevos, construcción contrarreloj y minijuegos de arena (*Fútbol de Chatarra / Scrapball*, demolición de barriles).
  6. **Arenas de Combate y Duelos Libres:** **Luchas de robots** construidos por los jugadores y **duelos aéreos en aviones**.
  7. **Pruebas de Ingeniería (estilo *Poly Bridge*):** Circuitos de resistencia donde los jugadores prueban si sus creaciones aguantan y logran cruzar el reto.

---

## 2. Estado Actual del Proyecto

- **Base implementada y verificada:**
  - Identidad visual indie obligatoria: carteles de madera (`.wood-sign`), tuercas hexagonales (`<WoodBolts />`), letras marrones (`#3b1e0a`) y tipografías `Fredoka` + `Nunito`.
  - Conducción arcade estable, cámara auto-follow, controles táctiles de 2 pedales, pantalla completa PC/iOS y audio WebAudio con motor dinámico.
  - *El Vestidor del Yunke* (creador de personajes persistente) + 7 gestos animados con morphs faciales y SFX.
  - Tablón de Encargos, Presets, piezas locas (`spring`, `balloon`, `fan`, `horn`, `gyro`), dispensador de piezas extra (hasta 24), rotura de soldaduras + reparación en 1 clic y planos compartibles por URL (`?bp=...`).
- **Fase 4 — Taller Universal (Hoja de Ruta Aprobada):**
  - **Hito 1 (En implementación):** Libertad sin ruedas — Barril Volador montable directo, pieza `gyro` (Giroscopio Estabilizador), vuelo 3D con ascenso/descenso y estabilización, planos libres (`rootPartId`), presets sin ruedas, cámara de ratón libre con Pointer Lock en PC, interacción mejorada con rayo láser manos libres (`M`) y mapa de atajos sin colisiones (`G` Gestos / `P` Empujar).
  - **Hito 2 (En diseño 🧭):** Robots articulados (bisagras/servos, pistones reales) + Soplete Soldador + Cortadora/Amoladora (cortar soldaduras y rebanar piezas).
  - **Hito 3 (En diseño 🧭):** Mesa de Dibujo y Recorte 2D→3D (siluetas 2D extruidas a piezas físicas 3D) + Pintura/Aerosol directo sobre inventos.
  - **Visión social/mundo:** Lobby Central (6+ jugadores), Escalada/Parkour, Clima/Riesgos Ambientales, Reglas Grupales, Arenas de Combate y Circuitos *Poly Bridge*.
  - **IMPORTANTE:** No implementar código de hitos futuros en diseño sin aprobar primero el diseño específico con el creador.

---

## 3. Reglas Obligatorias de Desarrollo

1. Respetar la identidad visual de madera, tuercas y letras marrones documentada en [CLAUDE.md](./CLAUDE.md#2-identidad-visual-y-estilo-de-ui-guía-de-diseño-obligatoria).
2. En Taller Libre, mantener libertad creativa total sin bloqueos frustrantes.
3. Mantener compatibilidad completa con **PC y móvil/iOS** (táctil, pantalla completa y desbloqueo de audio en primer toque).
4. Verificar siempre después de cualquier cambio de código:
   - `npx tsc --noEmit` (código de salida `0`)
   - `npm test` (toda la suite Vitest en verde)

## 4. Notas de Coordinación Multi-Agente (2026-11-19)

- **Estado:** `tsc` = 0, `117/117` tests, build OK. Detalle completo en `CLAUDE.md` sección 8.
- **Quién tocó qué:** Claude resolvió el preset 16 (masa de `crate` = 14), la gravedad al bajar del vehículo y el modelo del personaje que no seguía al asiento (`src/physics/PlayerRig.tsx`).
- **Antes de tocar `PlayerRig.tsx`:** respetar `canSleep={false}`, el `wakeUp()` al sentarse y la recolocación de seguridad del modelo; son lo que mantiene al personaje sobre el vehículo.
- **Antes de cambiar masas de props:** `tests/presetStability.test.ts` replica las masas de `GrabbableProps.tsx`; mantenerlas iguales o el test deja de representar el juego.
- **Pendiente:** prueba manual en navegador (montar barril, volar, bajar) y confirmar que el personaje se ve sentado. Hito 2 y 3 siguen en diseño: no implementar sin aprobar con el creador.

## 5. Notas de Coordinación (2026-11-22)

- **Quién tocó qué:** Claude hizo el Nivel 1 "El Puente del Abismo" y el Nivel 2 "El Callejón de los Autos" en código (`ExpeditionLevels.tsx`, `CarBarriers.tsx`, `carBarriers.ts`), conectó el arte `.glb` de niveles (`LevelArt.tsx`) y cambió las herramientas a Ctrl + clic sostenido (`GameCameraRig.tsx`). Antigravity entregó el arte del Nivel 1 en `public/models/levels/level-1-puente.glb`.
- **Para Antigravity:** el pedido del Nivel 2 (escenario, 4 carrocerías, variantes con X amarilla, trozos) está en `docs/PEDIDO_ANTIGRAVITY_NIVELES.md`. El Nivel 3 sigue sin aprobar: no modelarlo.
- **Pendiente:** probar a mano ambos niveles con una máquina real, afinar los umbrales de rotura (`carBreakForce`), medir rendimiento en iPhone 11 y revisar que los GLB de autos (ya cargados en `CarBarriers.tsx`) coincidan con las cajas físicas.
- **Estado:** `npm run build` OK y 203/203 tests.

- **Vuelo libre:** el control de vuelo de mecanismos sin ruedas está unificado en `stabilizeAndFlyAssembly` (ver `CLAUDE.md`, "Control de vuelo libre"). No volver a aplicar par o velocidad angular solo al cuerpo raíz: hace oscilar el conjunto.

## 6. Regla de arte 3D (2026-11-22): todo render/modelo 3D pasa por la skill `blender-stylized-props`

**Obligatorio para cualquier agente (Antigravity, Claude, ChatGPT) que cree o rehaga un modelo 3D del juego.** No usar scripts sueltos con los ayudantes viejos ni texturas de manchas procedurales a 512 px.
- Leer `.claude/skills/blender-stylized-props/SKILL.md` y `ART_DIRECTION.md` antes de modelar. Pedido detallado: `docs/PEDIDO_ANTIGRAVITY_SKILL_BLENDER.md`.
- Hacer una receta en `.claude/skills/blender-stylized-props/scripts/recipes/`, probar con `--dry-run`, revisar los renders `*_full` y `*_closeup`, y cerrar a `--res 1024` (512 solo para fondo lejano).
- Criterios: silueta con biseles reales, desgaste solo en bordes, óxido abajo, suciedad en cavidades, metal y madera distintos, paleta de `src/config/visualConfig.ts`, 1 material WebP y presupuesto de triángulos para iPhone 11.
- **Vehículos:** deben tener **ventanas/vidrios** (parabrisas, laterales y luneta) como geometría o material de vidrio; sin ventanas se leen como cajas.
- Solo apariencia: no tocar colliders, masas ni `src/`. Cada ejecución crea una variante nueva, sin sobrescribir GLB aprobados.
