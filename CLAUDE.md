# CLAUDE.md — Documento Maestro de Proyecto: Los del Desguace (Taller El Yunke)

> **Propósito de este archivo:** Fuente única de verdad para planificar, diseñar, depurar y evolucionar **Los del Desguace — Taller El Yunke** desde el MVP actual hasta el juego final. Toda nueva funcionalidad, corrección de bugs o cambio de interfaz debe respetar la identidad visual, las prioridades y la arquitectura documentadas aquí.

---

## 1. Objetivo Central, Alma del Juego y Visión Compartida

> **Regla de coordinación multi-agente (Antigravity / Claude / ChatGPT):** Este documento y [AGENTS.md](./AGENTS.md) definen el norte oficial del proyecto. **Antes de implementar nuevas mecánicas de la Fase 4, validar el diseño con el creador** (estamos en etapa de definición de objetivos y modalidad).

**Los del Desguace — Taller El Yunke** es un juego indie 3D **cooperativo/social (6+ jugadores)** de **construcción libre, exploración y actividades opcionales con física** (React Three Fiber + Rapier + Zustand/External Stores).

### ¿Qué NO es y qué SÍ es el juego?
- **NO es solo un sandbox aislado de armar autos con ruedas.**
- **SÍ es un taller universal y experiencia compartida con propósito claro:** **cualquier objeto** (barril, caja, chasis o futuras chapas recortadas) puede ser la base de un invento volador, robot con propulsores o máquina montable y guardable, combinando la **libertad total de inventar máquinas locas** con una **caja de herramientas híbrida** (herramientas rápidas en 3D + Mesa de Corte/Dibujo 2D→3D + Pintura/Aerosol), un **mundo vivo para explorar**, **encargos/objetivos**, **actividades opcionales** y un **Lobby Central de reunión** para jugar con amigos (mínimo 6 jugadores).

### Pilares del Diseño y Bucle de Progresión Entrelazada
1. **Lobby / Zona Central de Reunión (inspirado en *PEAK*):**
   - Espacio social compartido donde se juntan **6+ jugadores** antes de salir, personalizan su personaje en vivo (**El Vestidor del Yunke**), prueban gestos, muestran sus creaciones y eligen expediciones o actividades juntos.
2. **Libertad Total de Resolución (Construir O ir a Pie con Escalada/Parkour):**
   - Los niveles y secretos deben poder superarse **como el jugador elija**: armando una máquina loca **o a pie sin construir nada**.
   - **Trepada y parkour:** Mecánicas de agarre de salientes y escalada para subir a techos, contenedores y rutas alternativas con plataformas y atajos.
3. **Ciclo Entrelazado (`Explorar ↔ Construir ↔ Personalizar y Jugar`):**
   - **Explorar:** Mapa abierto con zonas temáticas, **Tuercas Doradas**, piezas raras, Torre Mirador y Montaña de Chatarra.
   - **Construir:** Libertad creativa en el taller para superar retos físicos, llegar a zonas secretas o validar diseños.
   - **Personalizar y Disfrutar:** Invertir recompensas en cosméticos/piezas y disfrutar actividades opcionales.
4. **Clima Dinámico y Riesgos Ambientales:**
   - Zonas de **barro** que atrapan vehículos, **vientos** que desvían aviones/dirigibles y variaciones climáticas que obligan a adaptar la estrategia o el diseño.
5. **Multijugador Compartido (6+ jugadores) e Interacción Grupal:**
   - Reglas de juego grupal: **desafíos cooperativos**, **carreras de relevos**, construcción contrarreloj y minijuegos de arena (*Fútbol de Chatarra / Scrapball*, demolición de barriles).
6. **Arenas de Combate y Duelos Libres:**
   - **Luchas de robots** armados por los jugadores y **duelos aéreos en aviones/dirigibles** ("libertad para todo").
7. **Pruebas de Ingeniería y Circuitos de Resistencia (estilo *Poly Bridge*):**
   - Fases/circuitos donde los jugadores ponen a prueba sus creaciones para ver si resisten y logran completar el recorrido bajo estrés físico real.

### Flujo Actual Implementado (MVP Jugable — Base Sólida)
1. **Bienvenida y Modos (`HudOverlay.tsx`):** Taller Libre (`sandbox`), Carrera en Pista (`race`), Desafío de Vuelo (`flight`) y **10 Encargos del Tablón** (`src/modes/contracts.ts`).
2. **Guía Visual y Arranque Rápido:** Plano Guía 3D (Slot 6), **17 Presets Operativos (incluye 3 sin ruedas)** (`PRESET_BLUEPRINTS` en `src/logic/blueprintManager.ts`) y exportación/importación por URL (`?bp=...`).
3. **Armado, Dispensador y Cableado:** Montaje por slots o soldadura libre, **dispensador de piezas extra** (hasta 24 piezas), **4 piezas locas** (`spring`, `balloon`, `fan`, `horn`) y cableado lógico (`contraptionRegistry.ts`, `logicGraph.ts`).
4. **Prueba, Destrucción y Reparación 1-Clic:** Conducción arcade estable, rotura controlada de soldaduras en choques fuertes y botón de reparación instantánea.
5. **Identidad, Personaje y Controles:** *El Vestidor del Yunke*, 7 gestos animados con audio, pantalla completa PC/iOS, joystick ampliado y controles táctiles de conducción de 2 pedales.

### Diseño de Niveles: "Un problema físico, un invento" (aclarado por el creador, 2026-11-22)

> **No son niveles de escalada ni de plataformas tipo *PEAK*.** Cada nivel/etapa es un **problema físico concreto** que se resuelve **armando y probando un invento**. *PEAK* solo sirve de referencia para la progresión por etapas con dificultad creciente y la misma metodología.

**Ejemplos del creador (norte de diseño):**
- Armar un prototipo o máquina que **cruza un puente** sin romperse (ruedas, masa, tracción).
- Armar un **helicóptero con imán** para destapar una olla gigante que tapa un desagüe (vuelo, equilibrio, carga).
- Armar una **máquina que rompe autos** hasta abrir paso a algo (empuje, corte, fuerza de choque).
- Y así: cada etapa combina o endurece lo aprendido.

**Metodología común a todos los niveles:**
1. **Objetivo físico claro y visible** desde la zona de armado.
2. **Zona de armado** con límites (presupuesto de piezas/peso).
3. **Prueba:** se suelta el invento y se mira qué pasa; reparar en 1 clic y reintentar.
4. **Éxito medible** con medallas por tiempo y eficiencia (menos piezas, menos daño).

**Regla de las dos rutas (NO obligatoria):**
- Algunos niveles/etapas, **no todos**, se pueden resolver **caminando** (parkour/trepada), pero esa ruta es **mucho más larga** (orden de 5 a 10 veces el tiempo del invento). Nunca es un bloqueo: nadie queda trabado si no construye.
- La ruta a pie debe ser **legible y señalizada**; el invento es el camino corto y directo.
- La medalla base se obtiene por cualquier ruta; las medallas altas premian el invento eficiente.
- Un nivel **no debe poder terminarse igual de rápido a pie**: tiene que existir una barrera real (foso, tapa pesada, muro de autos) que solo el invento salte rápido.
- Idealmente hay **más de una solución con invento** (ej. helicóptero con imán o grúa con cable).

**Nivel 2 definido con el creador (2026-11-22), "El Callejón de los Autos":** callejón de desguace tapado por **dos barreras de autos seguidas**, una liviana (autos de ~90 kg, 2 de alto) y otra pesada (~320 kg, 3 de alto, con autos marcados con una X amarilla que son puntos débiles). Los autos se **empujan y se rompen por impacto** (si el golpe es fuerte se parten en 3 o 4 trozos y pesan menos); no se cortan con sierra en esta versión. Meta: portón del taller con tuerca gigante luminosa. Ruta a pie: pasarela elevada en zigzag por el lado izquierdo, ~8 veces más larga. El detalle de medidas y arte está en `docs/PEDIDO_ANTIGRAVITY_NIVELES.md`. **Implementado en código (2026-11-22, sin probar jugando):** `src/modes/carBarriers.ts` (distribución, masas y umbrales; 16 autos en la barrera A y 36 en la B), `src/environment/CarBarriers.tsx` (autos dinámicos, rotura por `onContactForce` con umbral por auto, 4 trozos de 20 % de la masa, trozos que desaparecen a los 35 s, pila que se rearma con `runNonce`) y `Level2CarAlley` en `ExpeditionLevels.tsx` (bahía, callejón de 17 m, pasarela a 5 m de altura con rampas). **Pendiente:** afinar umbrales de rotura con una máquina real, alargar la pasarela con zigzag (hoy rodea casi en línea recta), y medir rendimiento en iPhone 11. Los autos y trozos ya cargan los GLB de Antigravity (`public/models/levels/cars/`, con cajas de respaldo si faltan) sin probar visualmente.

**Escalones de dificultad previstos:**
1. **Puente** (ruedas, masa, tracción; sin trampas) → nivel 1.
2. **Autos a romper** (empujar/cortar; sierra y amoladora ya existen) → nivel 2.
3. **Helicóptero con imán** (vuelo + carga con contrapeso) → nivel 3.
4. **Siguientes:** combinar mecanismos y sumar restricciones (piezas limitadas, viento, tiempo).

**Estado actual de las expediciones (`src/modes/expeditionLevels.ts`):** los 3 niveles hechos (Pantano de Aceite, Cañón del Viento, Planta Trituradora) son recorridos de obstáculos que se cruzan a pie casi igual de rápido que con máquina; **no cumplen aún esta metodología**. Se conservan la base técnica (checkpoints, tiempos, tuercas, física) y se van a reconvertir; **el Nivel 1 ya fue reconvertido (2026-11-22, sin commitear ni desplegar) a "El Puente del Abismo"**: bahía de armado al inicio (las piezas del dispensador aparecen ahí vía `bayLocal`), puente angosto de 66 m sobre un abismo de 12 m y ruta a pie opcional (rampa izquierda, barro del fondo, rampa derecha). Decisión del creador: **bahía de armado dentro de cada nivel** (no se arma en el taller ni se transporta la máquina). Pendiente: probarlo jugando (máquina real cruzando, tiempo a pie vs invento), medallas por tiempo/piezas y el nivel 3. El nivel 2 ya tiene su versión en código (ver arriba). **Herramientas (2026-11-22):** soldadora, amoladora y sierra láser trabajan solo con **Ctrl + clic sostenido** (`GameCameraRig.tsx`, `usePrimaryAction`); el clic solo queda para el agarre con el láser, y amoladora y sierra no disparan el agarre. **Móvil:** el botón de acción es dinámico (`HudOverlay.tsx`, `toolOnlyHold`): con amoladora o sierra apuntando a un objetivo válido es solo de herramienta (mantener, sin agarre); sin objetivo vuelve a agarrar. **Validar el diseño de cada nivel con el creador antes de implementarlo.**

---

## 2. Identidad Visual y Estilo de UI (Guía de Diseño Obligatoria)

Toda interfaz nueva o modificada en `src/ui/` debe seguir estrictamente esta estética **indie artesanal de taller de madera y metal**:

### Tipografía Indie (`index.html` y `src/ui/hud.css`)
- **Display / Títulos / Botones / Carteles (`--font-display`):** `'Fredoka', 'Trebuchet MS', system-ui, sans-serif` (pesos `500`, `600`, `700`). Redondeada, amigable y expresiva.
- **Cuerpo / Pasos / Descripciones (`--font-body`):** `'Nunito', 'Trebuchet MS', system-ui, sans-serif` (pesos `600`, `700`, `800`). Máxima legibilidad en escritorio y móvil.

### Paleta y Lenguaje de Carteles de Madera + Tuercas + Letras Marrones
- **Carteles de Madera (`.wood-sign`):**
  - Fondo en tablón cálido (`#f6dca3` → `#e6b770` → `#cf9348`) con vetas horizontales sutiles (`repeating-linear-gradient`).
  - Contorno cartoon firme de `3px` en marrón muy oscuro (`--hud-outline: #2c1607`), bisel claro superior interno y sombra 3D sólida (`0 6px 0 #2c1607`).
- **Tuercas Metálicas (`<WoodBolts />` en `src/ui/HudOverlay.tsx`):**
  - 4 tuercas hexagonales SVG (`HexBolt` con relleno `#9eaab0`, núcleo `#5e686d` y borde `#2c1607`) ancladas en las 4 esquinas (`.tl`, `.tr`, `.bl`, `.br`) de cada cartel principal.
- **Letras Marrones:**
  - Texto principal: `--hud-ink: #3b1e0a`.
  - Texto secundario / subtítulos / kickers: `--hud-ink-soft: #6b3c1b`.

### Identidad Adaptada por Cada UI
1. **Carteles Principales (Bienvenida, Menú Principal, Cierre de Ronda):**
   - Base `.wood-sign` + `<WoodBolts />`, pestañas en madera translúcida/dorada y tarjetas de acción en madera clara (`#fae8be` → `#e7be7b`), destacando el botón principal en miel/dorado (`#ffe074` → `#e39a24`).
2. **Placa de Estado y Píldora Contextual Superior (`.hud-pill-status`, `.hud-context-pill`):**
   - Madera clara con contorno `#2c1607` y letras marrones; atajos `<kbd>` estilo etiqueta oscura de hierro/cuero (`#47260e`, texto `#ffe7a6`).
3. **Botones de Acción Contextual (`.hud-ctx-btn`):**
   - Estándar en madera clara con letras marrones.
   - **Acento / Soldar / Armar (`.is-accent`):** miel dorado (`#ffe06e` → `#df9320`, texto `#361906`).
   - **Cableado / Llave Mágica (`.is-wire` y `.hud-wrench[aria-pressed="true"]`):** verde-turquesa esmaltado de taller (`#3c8a7d` → `#24574f`, texto claro) para distinguir lo eléctrico/lógico de la madera.
   - **Peligro / Quitar cables / Borrar (`.is-danger`):** terracota/óxido (`#df6e50` → `#b14027`).
4. **Plano Guía (Slot 6 — `.hud-guide-card`):**
   - Papel cianotipo azul técnico (`#1b4b6e` → `#12314a`) con grilla sutil de `16px` y `<WoodBolts />` en las esquinas, simulando un plano fijado a una tabla del taller.
5. **Inventario Inferior (`.hud-slots`) y Controles Táctiles:**
   - Barra estilo caja de herramientas de madera oscura (`#6d3f1d` → `#492810`) con compartimentos en madera media (`#8b542a` → `#5c3316`), selección activa en dorado (`#ffe066`), joystick y pads con estética de cobre/madera.

---

## 3. Bugs Críticos Históricos (RESUELTOS ✅)

> **Estado:** Ambos bugs críticos y la auditoría completa (Críticos + Medios) fueron resueltos y verificados (`npx tsc --noEmit` en 0 y `117/117` tests Vitest). Se mantienen documentados como regresión a no romper.

### BUG #1 (RESUELTO ✅): Al subir al auto armado de los presets salía volando o no dejaba controlarlo
- **Causa raíz resuelta:** `<Ecctrl>` en `PlayerRig.tsx` pasaba `type={seated ? 'kinematicPosition' : 'dynamic'}`, las piezas montadas en el vehículo usan grupo de colisión dedicado (`workshopPhysics.ts`), fricción de rueda ajustada (`0.18`), dirección arcade suave con cámara auto-follow (`GameCameraRig.tsx` / `ThirdPersonCamera.tsx`) y sin recreación destructiva de juntas `RevoluteImpulseJoint`.

### BUG #2 (RESUELTO ✅): El joystick táctil era muy chico y los controles de manejo poco intuitivos
- **Solución aplicada:** Joystick a pie ampliado (`118–148px`), controles táctiles dedicados de conducción de 2 pedales (`◀` `▶`, `FRENO / REV`, `ACELERAR`, `TURBO`, `Bajar` en barra superior), pantalla completa PC/iOS y audio WebAudio reforzado con desbloqueo en primer toque iOS.

---

## 4. Crítica Dual: Experto Indie vs. Jugador Real

### Punto de Vista 1: Crítica como Experto en Desarrollo Indie (Por qué hoy sigue siendo MVP)
1. **Sin consecuencias físicas ("Drama del Desguace"):** Las soldaduras son irrompibles; falta que los choques fuertes desprendan piezas con chispas.
2. **Construcción sin presión de diseño:** Todos los desafíos actuales (`race` y `flight` en `src/modes/gameModes.ts`) se superan con el mismo diseño básico.
3. **Piezas lógicas avanzadas desaprovechadas:** `magnet`, `timerBox`, `switchBox` y `logicAnd` (`src/logic/contraptionRegistry.ts`) no tienen objetivos en el mapa (`src/environment/TestTrackAndYard.tsx`) que los exijan.
4. **Multijugador local limitado a avatares:** `src/multiplayer/netProtocol.ts` usa `BroadcastChannel` entre pestañas y solo sincroniza poses, no vehículos armados ni gestos.
5. **Falta "Game Feel" continuo:** `src/audio/sfxEngine.ts` necesita audio de motor ligado a las RPM/velocidad, derrape de ruedas, estela continua en propulsores y vibración sutil de cámara.

### Punto de Vista 2: Crítica como Jugador Real (Qué frustra o engancha de verdad)
1. **Cero bloqueo en Taller Libre:** Todas las piezas locas deben estar disponibles desde el segundo 0 en Taller Libre; nunca obligar a "farmear" para poner un cohete.
2. **Destrucción sí, pero con Reparación en 0.1s:** Si el auto se desarma al chocar, el botón **Reconstruir / Reparar en 1 clic** debe rearmar piezas y cables al instante para no tener que caminar buscando ruedas por el patio.
3. **Controles táctiles dedicados al conducir son prioridad #1:** Manejar un auto en móvil con el joystick chiquito de caminar rompe la experiencia antes de empezar.
4. **Lógica visual y divertida, no examen de electrónica:** Conectar un `timerBox` o `logicAnd` debe producir efectos inmediatos y espectaculares (ráfagas rítmicas, eyección, pulso magnético).

---

## 5. Creador de Personajes ("El Vestidor del Yunke") y Lista de Gestos

### Base Técnica Existente en el Repo
- `src/character/heads/headRegistry.ts` y `src/character/faceRigController.ts`: 4 formas de cabeza (`base`, `round`, `long`, `wide`) y 14 morph targets faciales (`smile`, `sad`, `mouth_O`, `eyes_wide`, `squint`, `brow_up`, `brow_furrow`, `blink_L`, `blink_R`, etc.).
- `src/character/outfits/outfitRegistry.ts` y `src/character/characterAppearance.ts`: Atuendos modulares (`overol`, `remera_pantalon`), guantes (`work_gloves` / `none`), casco (`hardhat` / `none`), antiparras (`forehead` / `none`), mochila (`scrap_pack` / `none`), cartuchera (`pouch` / `none`) y paleta de 23 colores.

### Diseño del Creador de Personajes
Cartel de madera **"El Vestidor del Yunke"** con vista 3D interactiva y persistencia en `localStorage` (+ sincronización en `PlayerSnapshot`):
- **Cabeza y Rostro:** Morfología (`Base`, `Redonda`, `Alargada`, `Ancha`), tono de piel y color de pelo.
- **Atuendo y Guantes:** `Overol de Taller` vs. `Remera y Pantalón`, con/sin guantes.
- **Accesorios:** Casco, Antiparras, Mochila chatarrera, Cartuchera de cinturón.
- **Paletas Rápidas de Taller:** *Azul Mecánico*, *Naranja Óxido*, *Verde Chapa*, *Amarillo Grúa*, *Rojo Nitro* + personalización de color.

### Lista de 7 Gestos (Emotes)
Combinan **animación procedural de brazos/torso** + **expresión facial (`faceRigController`)** + **audio (`sfxEngine`)**, disparables desde un botón/rueda **Gestos** de madera en el HUD (a pie o conduciendo) y sincronizables en multijugador:
1. **👋 ¡Hola! (Saludar):** Mano levantada saludando + `happy` (`smile` + `brow_up`).
2. **👍 ¡Quedó Joya! (Pulgar arriba):** Brazo al frente con pulgar + guiño (`blink_L` + `smile`).
3. **🎉 ¡Funciona! (Festejo):** Saltito con brazos en V + `eyes_wide` + `smile`.
4. **🤦 ¡Se Desarmó! (Facepalm):** Mano a la frente + `disappointed` (`sad` + `brow_furrow`).
5. **🤔 Mmm... (Pensando):** Mano al mentón + `squint` + mirada arriba.
6. **🔧 ¡A Soldar! (Truco de Llave):** Giro rápido con la llave en mano + `effort`.
7. **😱 ¡Guarda! (Pánico):** Manos al casco antes de chocar + `surprise` (`mouth_O` + `eyes_wide`).

---

## 6. Plan Maestro por Encargues (Estado y Próxima Fase)

### Encargues Completados ✅ (`npx tsc --noEmit` = 0 | `117/117` tests Vitest)
- **Encargue #1 (COMPLETADO ✅):** Arreglo de BUG #1 (física vehicular/presets estable + dirección arcade + cámara auto-follow), BUG #2 (joystick grande + controles táctiles de 2 pedales), pantalla completa PC/iOS y audio WebAudio reforzado con motor dinámico.
- **Encargue #2 (COMPLETADO ✅):** Creador de personajes **"El Vestidor del Yunke"** persistente + **7 gestos** animados con morphs faciales, SFX y sincronización de protocolo.
- **Encargue #3 (COMPLETADO ✅):** Tablón de Encargos de madera, rotura controlada de soldaduras + reparación en 1 clic, compartir planos por URL (`?bp=...`), **4 piezas locas** (`spring`, `balloon`, `fan`, `horn`), dispensador de piezas extra (hasta 24), **12 presets**, **10 encargos** y rampa acrobática + pirámide de barriles.

### Fase 4 — Taller Universal (Hoja de Ruta Aprobada con el Creador)
Transformar el taller actual en un **patio creativo sin ruedas obligatorias y experiencia compartida (6+ jugadores)**:
- **Hito 1 (En implementación):** Libertad sin ruedas — Barril Volador montable directo, pieza `gyro` (Giroscopio Estabilizador), vuelo 3D con ascenso/descenso y estabilización, planos libres (`rootPartId`), presets sin ruedas, cámara libre con ratón (Pointer Lock) en PC, interacción mejorada con rayo láser manos libres (`M`) y mapa de atajos sin colisiones (`G` Gestos vs `P` Empujar).
- **Hito 2 (En diseño 🧭 — NO implementar código hasta aprobar detalles):** Robots articulados (bisagras/servos controlados, pistones telescópicos reales) + **Soplete Soldador** (soldar piezas en contacto con selector de unión) + **Cortadora / Amoladora** (cortar soldaduras y rebanar piezas en el mundo).
- **Hito 3 (En diseño 🧭 — NO implementar código hasta aprobar detalles):** **Mesa de Dibujo y Recorte 2D→3D** (siluetas dibujadas a mano alzada extruidas a piezas físicas 3D) + **Pintura / Aerosol** directo sobre inventos.

Pilares sociales y de mundo de la Fase 4 (en diseño 🧭):
1. **Lobby Central (estilo *PEAK*):** Hub social para **6+ jugadores** donde socializan, personalizan su personaje, hacen gestos, muestran inventos y arrancan juntos.
2. **Exploración Libre con Escalada/Parkour + Progresión Entrelazada:** Rutas alternativas a pie (agarre de salientes, trepada a techos/contenedores), **Tuercas Doradas**, secretos y puntos de interés (Torre Mirador, Montaña de Chatarra) que desbloquean cosméticos y piezas.
3. **Clima Dinámico y Riesgos Ambientales:** Zonas de barro, viento que desvía vehículos aéreos y condiciones cambiantes.
4. **Multijugador Real (6+ jugadores) y Reglas Grupales:** Salas compartidas reales con desafíos cooperativos, carreras de relevos, construcción contrarreloj y minijuegos (*Scrapball*, demolición).
5. **Arenas de Combate y Pruebas de Ingeniería:** Arenas para **luchas de robots** y **duelos aéreos en aviones**, además de **circuitos de resistencia tipo *Poly Bridge*** para validar si las creaciones aguantan y pasan el reto.

---

## 7. Referencia Rápida del Código y Comandos

- **Entrada UI y Estilos:** `index.html`, `src/ui/HudOverlay.tsx`, `src/ui/hud.css`, `src/ui/PropSlotIcon.tsx`.
- **Estado y Modos:** `src/state/gameStore.ts`, `src/modes/gameModes.ts`, `src/controls/playerInput.ts`.
- **Física, Ensamblaje y Planos:** `src/physics/PlayerRig.tsx`, `src/invention/workshopPhysics.ts`, `src/invention/workshopAssembly.ts`, `src/invention/cartBlueprints.ts`, `src/invention/BlueprintHolograms.tsx`, `src/logic/blueprintManager.ts`, `src/logic/contraptionRegistry.ts`, `src/logic/logicGraph.ts`.
- **Personaje y Expresiones:** `src/character/InventorCharacter.tsx`, `src/character/characterAppearance.ts`, `src/character/faceRigController.ts`, `src/character/heads/headRegistry.ts`, `src/character/outfits/outfitRegistry.ts`.
- **Verificación obligatoria después de cada cambio de código:**
  - `npx tsc -p tsconfig.app.json --noEmit` (debe terminar con código `0`; el `npx tsc --noEmit` de la raíz no revisa `src` porque `tsconfig.json` tiene `"files": []`)
  - `npm test` (toda la suite Vitest en verde)

---

## 8. Notas de Traspaso (Hito 1 Fase 4 — estado 2026-11-19)

**Estado verificado:** `npx tsc --noEmit` = 0, `117/117` tests Vitest, `npm run build` OK.

### Resuelto en esta tanda
- **Preset 16 (Robot con Propulsores) inestable:** la causa era la proporción de masas (caja raíz de 6 kg con ~35 kg de hijos en uniones fijas). Se subió la masa de `crate` a `14` en `src/props/GrabbableProps.tsx` y en `tests/presetStability.test.ts` (deben coincidir). Descartado como causa: estabilizador de vuelo, `driveAssembly/steerAssembly`, posición de piezas, iteraciones del solver.
- **Personaje flotando al bajar de un vehículo en el aire:** Ecctrl deja `gravityScale = 0` al pisar suelo y no lo actualiza sentado. `leaveSeat` ahora restablece `setGravityScale(1)`.
- **Personaje no se sentaba (modelo quedaba en el suelo, cuerpo físico bien):** hipótesis principal = cuerpo dormido (react-three-rapier no sincroniza el modelo de cuerpos dormidos). Capas aplicadas en `PlayerRig.tsx`: `canSleep={false}` en `<Ecctrl>`, `wakeUp()` al sentarse y cada frame, `setTranslation` directo al asiento en el paso físico, y red de seguridad que recoloca el modelo si se aleja > 0.5 m del cuerpo.

### Pendiente / a verificar a mano (no probado en navegador)
1. Subir al barril volador con `E`/`J` y confirmar que el personaje va sentado (piernas dobladas) y que al bajar en el aire cae.
2. Pointer Lock con `Esc`, apuntar con `M`, volar con Espacio y Shift.
3. Efecto secundario: la caja suelta ahora pesa 14 kg; revisar que se sienta bien al cargarla. Si molesta, dar al preset 16 un torso propio con esa masa.

### Trampas conocidas
- La telemetría `window.__desguaceTelemetry` **no se actualiza mientras se va sentado** (hay un `return` previo en `useFrame`); los campos `px/py/isOnGround/gravityScale` salen viejos. Los campos `seatedId`, `bodyType`, `bodyY` y `seatBodyPos` sí son vivos.
- Probar siempre en `localhost:5173` (`npm run dev`); la URL publicada puede ser una versión vieja.
- No usar `sed` global sobre coordenadas del plano en `blueprintManager.ts`: los presets 15 y 16 comparten valores y un reemplazo masivo rompió el 15 una vez.

### Control de vuelo libre (2026-11-19)
Aplica a **todo mecanismo sin ruedas** con propulsores o giroscopio (barril, robot, silla de globos): vive en `stabilizeAndFlyAssembly` (`src/invention/workshopPhysics.ts`), así que cualquier invento nuevo lo hereda.
- **Controles:** acelerar/retroceder avanza, ◀ ▶ (A/D) giran con inclinación hacia el lado, Espacio / SUBIR sube, Shift / BAJAR desciende.
- **Cómo funciona:** rumbo objetivo por estación (se adelanta como máximo 0.7 rad al cuerpo) + inclinación según acelerador y giro; el conjunto gira **como sólido rígido** (misma velocidad angular en todas las piezas y velocidad lineal por posición).
- **Por qué así:** aplicar el giro o el empuje solo al cuerpo raíz (6 kg) con alas/propulsores colgando de uniones fijas hacía oscilar el conjunto (picos de 20-60 rad/s) y volcaba el barril. `applyImpulseAtCenterOfMass` ahora reparte el impulso entre todas las piezas por masa, y `steerAssembly` ya no aplica par ni velocidad angular a los sin ruedas (solo agarre lateral y arrastre de velocidad).
- **Ruedas:** los vehículos con ruedas conservan el estabilizador vertical y la dirección anteriores.
- **Test:** `tests/flightControl.test.ts` (sube, gira a ambos lados, avanza, baja, sin volcarse). Estado: `tsc` = 0, `118/118`, build OK. Sin probar a mano en navegador/móvil.

---

## 9. Arquitectura de Física, Mecánicas y Lógica (Mapa Rápido)

Referencia directa para modificar mecánicas sin tener que releer todo el proyecto:

1. **Bucle físico y sincronización (`src/scene/DesguaceScene.tsx`, `src/physics/PlayerRig.tsx`):**
   - `<Physics timeStep={1 / 60} interpolate gravity={[0, -18, 0]}>`.
   - **`useBeforePhysicsStep` (antes de `world.step`):** evalúa `stepContraptionLogic` → `workshopPhysics.updateMotors` → `stepRunning` → si va sentado (`seatedIdRef`), llama `driveAssembly`/`steerAssembly` (solo vehículos con ruedas) y `stabilizeAndFlyAssembly` (vuelo libre o estabilización con giroscopio) y fija `ctrl.body` en `KinematicPositionBased`.
   - **`useAfterPhysicsStep` (después de `world.step`):** resincroniza `ctrl.body` a `seatBody` para eliminar el desfase de 1 frame (cero temblor personaje/cámara), actualiza modo de juego/contratos (`gameModeStore`, `contractStore`), puente/drones (`arenaAndBridgeStore`), red multijugador y seguridad de pared al cargar objetos.
   - **`useFrame` (render):** entradas (`playerInput`), rayo láser (`castWrenchBeam`), montar/bajar (`enterSeat`/`leaveSeat`), rotura de soldaduras por choque y datos procedurales de animación (`InventorCharacter`).
2. **Personaje y Asiento (`src/physics/PlayerRig.tsx`, `Ecctrl`):**
   - `<Ecctrl canSleep={false} enable={enabled && !seated} type={seated ? 'kinematicPosition' : 'dynamic'} />`.
   - `enterSeat`: desactiva colliders del jugador (`setSensor(true)` + `setEnabled(false)`), pasa a `KinematicPositionBased`, suelta el ensamblaje si estaba fijo (`toggleAssembly`), guarda snapshot intacto para **Reparar (`H`)**.
   - `leaveSeat`: busca punto libre en `EXIT_OFFSETS`, vuelve a `Dynamic`, restablece `setGravityScale(1, true)`, reactiva colliders, llama `world.propagateModifiedBodyPositionsToColliders()` y `wakeUp()`.
3. **Ensamblaje, Juntas y Vuelo (`src/invention/workshopAssembly.ts`, `src/invention/workshopPhysics.ts`):**
   - **Estaciones:** `'cart'` (chasis principal en `WORKSHOP_ORIGIN`), `'drum'` (`DRUM_STAND_ORIGIN`), `'custom:<rootId>'` (creaciones libres en `FREE_BUILD_ORIGIN = [3.0, 0.08, 8.6]`).
   - **Juntas:** `attach` y `attachOnPart` usan juntas fijas/revolute de Rapier con `setContactsEnabled(false)`, `setAdditionalSolverIterations(4)` y máscara `ignoreVehicleContacts` para que las piezas del mismo vehículo no colisionen entre sí.
   - **Vuelo libre (`stabilizeAndFlyAssembly` cuando `!assembly.hasWheels(station)`):** controlador unificado de cuerpo rígido. Calcula orientación objetivo (`heading.yaw`, `pitch`, `bank`), promedia/acota `angvel` por masa (`±4.5 rad/s`), limita velocidad (`15 m/s` horiz, `±10 m/s` vert, zona `±115 m`) y distribuye `angvel`/`linvel` a todas las piezas respecto al centro de masa.
   - **Vehículos con ruedas:** `driveAssembly` reparte impulso por masa (`applyImpulseAtCenterOfMass`), `steerAssembly` aplica giro + agarre lateral, `stabilizeAndFlyAssembly` aporta estabilización vertical/giroscopio.
4. **Grafo Lógico y Actuadores (`src/logic/logicGraph.ts`, `src/logic/contraptionRegistry.ts`):**
   - `PART_LOGIC_SPECS` define el rol de cada `GrabbableKind` (`battery`, `switch`, `key_input`, `timer`, `and`, `motor`, `thruster`, `light`, `magnet`, `piston`, `sensor`).
   - `stepContraptionLogic` avanza cooldowns, aplica turbo (`Space`), sustentación de `wing` y flotación de `balloon`, rompe cables estirados (`> 10m`) y evalúa `contraptionGraph`.
   - `skipForcesFor` **siempre** bloquea fuerzas individuales sobre estaciones fijas en taller y sobre creaciones custom sin ruedas (gobernadas por `stabilizeAndFlyAssembly`).
5. **Props, Planos y Cámara (`src/props/GrabbableProps.tsx`, `src/invention/cartBlueprints.ts`, `src/logic/blueprintManager.ts`, `src/controls/GameCameraRig.tsx`, `src/controls/playerInput.ts`):**
   - **Masas:** `PHYSICS_PROPS` en `GrabbableProps.tsx` debe coincidir siempre con `tests/presetStability.test.ts` (ej. `crate = 14`, `woodBarrel = 6`).
   - **Planos:** `captureCartBlueprint` / `restoreCartBlueprint` soportan chasis `'cart'` y creaciones libres (`rootPartId`), restauran juntas/cables y llaman `world.propagateModifiedBodyPositionsToColliders()`.
   - **Cámara (`GameCameraRig`):** soporta Pointer Lock en PC (`Esc` libera) y pausa el auto-follow `1.4 s` tras mover el ratón manualmente.
6. **Sierra láser y rebanado de piezas (`Shift+C`):**
   - `gameStore.toggleSaw()` equipa la sierra (deja el láser apuntando). Máquina de estados en `PlayerRig.tsx` (bloque "Sierra láser", antes de `consumePartAction`): `idle` → `trace` (mantener clic/`E` y arrastrar el láser) → `cut` (al soltar, el láser recorre la línea con chispas) → rebanado. Mientras la sierra apunta se suprime el agarre (`sawBusy`).
   - El plano pasa por la línea trazada y es perpendicular a la superficie. `laserTableBridge.slice(id, normal, offset, preview?)` parte la pieza: `src/invention/sliceGeometry.ts` (casco convexo, volumen, tests en `tests/sliceGeometry.test.ts`), crea dos `fragment` (`src/invention/fragmentStore.ts`, `src/props/FragmentPiece.tsx`) y suelta todo lo soldado. La pieza original se oculta (`fragmentStore.consume`) y vuelve al quitar todos los trozos.
   - Visual en vivo: `src/invention/liveCut.ts` (estado) + `LiveCutVisual.tsx` (guía celeste, línea al rojo, luz). Las chapas (`platform`) se recortan aparte: Herramientas ▸ Recortar chapa (`sceneCut`).


---

## 10. Regla de arte 3D (2026-11-22)

Todo modelo o render 3D nuevo o rehecho usa la skill `blender-stylized-props` (`.claude/skills/blender-stylized-props/`), con la dirección artística de su `ART_DIRECTION.md`, receta propia y bake a 1024 px. Detalle y criterios en la sección 6 de [AGENTS.md](./AGENTS.md) y en `docs/PEDIDO_ANTIGRAVITY_SKILL_BLENDER.md`. Los vehículos llevan ventanas/vidrios. Si algún agente genera arte 3D con otro flujo, pedirle que lo rehaga con la skill.
