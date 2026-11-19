# Hoja de Ruta hacia el Juego Final — Taller El Yunke

> Documento sincronizado con [CLAUDE.md](file:///d:/los-del-desguace/CLAUDE.md), que actúa como especificación maestra del proyecto.

---

## 1. Bugs Críticos Prioritarios (Antes del Encargue #1)

1. **BUG #1 — Auto armado del Preset 1 se vuelve loco al subir:**
   - Al subir al asiento (`1. Carrito Clásico`), `updateMotors` en `src/invention/workshopPhysics.ts` elimina y recrea la `RevoluteImpulseJoint` al pasar `speed` a `0`, y se superponen motor de rueda, `driveAssembly`, `steerAssembly` contra fricción lateral (`0.95`) y el impulso oscilante `rumble` en `stepRunning`.
   - Solución: estabilizar las juntas sin destruirlas al frenar, unificar masa/tracción/dirección y aislar el comportamiento sin conductor.
2. **BUG #2 — Joystick táctil muy chico:**
   - `.hud-joystick` en `src/ui/hud.css` usa `clamp(84px, 18vmin, 110px)` (`82px` en pantallas bajas).
   - Solución: agrandar el joystick a pie y activar al sentarse controles dedicados grandes (**Dirección `◀ / ▶`** + **Pedales `Acelerar / Reversa / Turbo`**).

---

## 2. Identidad Visual y Estilo de UI

- **Tipografía indie:** `Fredoka` (títulos, botones y carteles) + `Nunito` (textos, pasos y ayudas).
- **Estética artesanal:** Carteles de madera cálida (`.wood-sign`) con vetas sutiles, contorno `#2c1607`, tuercas hexagonales metálicas en las esquinas (`<WoodBolts />`) y letras marrones (`#3b1e0a` / `#6b3c1b`).
- **Diferenciación por rol:**
  - *Menú, Bienvenida y Fin de Ronda:* tablones de madera con tuercas y botones miel/ámbar.
  - *Estado y Contexto:* placas de madera con etiquetas `<kbd>` oscuras; acciones de cableado/llave en verde-turquesa esmaltado y borrado en terracota/óxido.
  - *Plano Guía (Slot 6):* papel azul cianotipo técnico con grilla y tuercas en las esquinas.
  - *Inventario y Touch:* caja de herramientas en madera oscura y hierro + controles en cobre/madera.

---

## 3. Crítica como Desarrollador Indie Senior (Diagnóstico del MVP)

1. **Falta de consecuencias físicas ("Drama del Desguace"):** Las soldaduras en `src/invention/workshopPhysics.ts` son indestructibles; falta que impactos fuertes desprendan piezas con chispas.
2. **Construcción sin presión de diseño:** `race` y `flight` en `src/modes/gameModes.ts` se resuelven con casi cualquier vehículo básico.
3. **Piezas lógicas avanzadas desaprovechadas en el mapa:** `magnet`, `timerBox`, `switchBox` y `logicAnd` (`src/logic/contraptionRegistry.ts`) necesitan misiones físicas reales en `src/environment/TestTrackAndYard.tsx`.
4. **Multijugador local entre pestañas:** `src/multiplayer/netProtocol.ts` replica poses de avatares, pero no vehículos ni gestos en red real.
5. **Falta "Game Feel" continuo:** Motor con RPM dinámicas según velocidad, derrape de ruedas y vibración sutil de cámara en `src/audio/sfxEngine.ts`.

---

## 4. Crítica como Jugador Real (El Baño de Realidad)

1. **Cero bloqueo de diversión en Taller Libre:** Todas las piezas locas disponibles desde el segundo 0 en Taller Libre.
2. **Si el vehículo se destruye al chocar, repararlo debe tomar 0.1 segundos:** Botón de **Reconstruir / Reparar en 1 clic** para restaurar piezas y cables sin ir a buscar ruedas por el patio.
3. **Controles de vehículo dedicados en celular son prioridad #1:** Volante `◀ / ▶` + pedales grandes al sentarse (`seated === true`), nunca joystick diminuto.
4. **Lógica visual y explosiva, no académica:** Ráfagas de cohete, pulso magnético o eyecciones divertidas con un cable.

---

## 5. Creador de Personajes ("El Vestidor del Yunke") y Lista de 7 Gestos

### Creador de Personajes
Aprovecha `headRegistry.ts`, `faceRigController.ts`, `outfitRegistry.ts` y `characterAppearance.ts`:
- **Cabeza y Rostro:** Forma (`Base`, `Redonda`, `Alargada`, `Ancha`), tono de piel y color de pelo.
- **Atuendo:** `Overol de Taller` / `Remera y Pantalón` + guantes (`work_gloves` / `none`).
- **Accesorios:** Casco (`hardhat`), Antiparras (`forehead`), Mochila chatarrera (`scrap_pack`), Cartuchera (`pouch`).
- **Paletas rápidas de taller** guardadas en `localStorage` y sincronizadas en `PlayerSnapshot`.

### Lista de 7 Gestos (Emotes)
Animación corporal + expresión en `faceRigController.ts` + SFX desde botón/rueda **Gestos**:
1. 👋 **¡Hola!** (Saludar + `happy`)
2. 👍 **¡Quedó Joya!** (Pulgar arriba + guiño)
3. 🎉 **¡Funciona!** (Saltito + brazos en V + `eyes_wide`/`smile`)
4. 🤦 **¡Se Desarmó!** (Facepalm + `disappointed`)
5. 🤔 **Mmm...** (Mano al mentón + `squint`)
6. 🔧 **¡A Soldar!** (Truco con llave inglesa + `effort`)
7. 😱 **¡Guarda!** (Manos al casco + `surprise`)

---

## 6. Plan Maestro Ordenado por Encargues

- **Encargue #1 (Arranque recomendado):** Fix del Bug #1 (Preset 1 estable al subir y conducir) + Fix del Bug #2 (Joystick táctil grande + controles dedicados al volante) + Audio continuo de motor + Reconstrucción instantánea en 1 clic.
- **Encargue #2:** Creador de Personajes ("El Vestidor del Yunke") + Lista/rueda de 7 Gestos con animación, morphs faciales y red.
- **Encargue #3:** Tablón de Encargos de Madera (6 misiones físicas cortas) + Rotura de soldaduras en choques + Compartir planos por link (`?bp=...`).
