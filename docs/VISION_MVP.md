# Visión del MVP — Los del Desguace (Taller El Yunke)

> Este documento fija el norte del MVP. Complementa a [CLAUDE.md](../CLAUDE.md) (especificación técnica y de identidad visual) y a [ROADMAP.md](../ROADMAP.md). Lo marcado como **(propuesto)** todavía no existe en el código.

## 1. Visión

Juego indie 3D de **ingeniería y creatividad en un desguace** (*Taller El Yunke*), jugable **solo o en cooperativo (2 a 6 jugadores)**.

El jugador resuelve **problemas físicos ingeniándoselas con chatarra limitada**, en lugar de spawnear soluciones prearmadas. Cada nivel plantea un obstáculo real (un abismo, una tapa pesada, un muro de autos, una montaña) y el invento del jugador es el camino corto.

## 2. Separación Sandbox/Dev vs. MVP

| | **Sandbox / Dev** | **MVP** |
|---|---|---|
| Piezas | Dispensador infinito (`N`, `SPAWNER_ITEMS` en `src/ui/HudOverlay.tsx`) | Pilas **limitadas** del patio |
| Arranque rápido | Presets de 1 clic (`PRESET_BLUEPRINTS`) | No hay presets: se arma desde cero |
| Conseguir piezas | Se piden al dispensador | Desarmar autos viejos con la Amoladora (`3`), cortar material con la Sierra Láser (`4`) o fabricar en la Mesa Láser (`src/ui/LaserTable.tsx`) |
| Tecla `H` | Reparar en 1 clic | Reconstruye **únicamente el último diseño armado por el jugador** |

- El dispensador infinito y los presets quedan **solo para el modo `sandbox` o pruebas de desarrollo** (`GameModeId` en `src/modes/gameModes.ts`).
- Las piezas del MVP se *ganan* con el patio: no hay "llave única" ni solución pregrabada.

## 3. Diseño sistémico: múltiples caminos, cero "llave única"

Los problemas no se resuelven con un objeto específico sino con **reglas físicas reutilizables** que el jugador combina.

### 3.1 Etiquetas físicas reutilizables en objetos del mapa (propuesto)
- `breakForce`: fuerza de impacto que lo rompe. *(Ya existe en autos: `src/modes/carBarriers.ts`; falta generalizarlo.)*
- `isMagnetic`: se puede levantar o arrastrar con un `magnet`.
- `isCuttable`: se puede rebanar con la Sierra Láser.
- `conductsPower`: transmite energía (p. ej. postes metálicos para escalada magnética).

### 3.2 Juntas rompibles y módulos sueltos (propuesto)
- **Juntas rompibles por impacto/tensión** en Rapier: las soldaduras pasan a ceder con un golpe o un tirón fuertes.
- **Módulos sueltos** armados en estaciones `custom:${string}` (por ejemplo `magnet` + `thruster` + `switchBox`) **sin exigir chasis**.

### 3.3 Desgaste de piezas rescatadas (propuesto)
Cada pieza rescatada tiene un estado `condition: 'ok' | 'broken' | 'discharged'`:
- **Motores trabados (`broken`)** → se reparan en el Banco RPM (`Tab`).
- **Baterías descargadas (`discharged`)** → se recargan cableándolas (`5`) a un generador.

### 3.4 Aerosol: personalizar inventos (implementado, sin probar jugando)
Herramienta **Aerosol** (tecla `Y` o botón en la barra) con paleta de 7 colores de taller + borrador.
- **Pintar todo:** un clic/toque tiñe la pieza entera (sin texturas, solo color del material).
- **Mano alzada:** trazos de aerógrafo donde pega el láser, con boquilla Fino/Medio/Grueso. El lienzo de 256×256 se crea recién en el primer trazo de cada malla.
- `R` cambia de modo. En celular: Pintar todo = un toque; Mano alzada = un toque prende el gatillo y otro lo apaga.
- Sirve para identificar el invento de cada jugador en multijugador y para mostrar creaciones en el Lobby.

## 4. Nivel vertical de referencia — "Operación: Pilas del Control" (propuesto)

Noche cerrada con niebla (`<fogExp2>`). **Objetivo:** subir una montaña para recuperar las pilas de un control remoto de TV.

1. **Conseguir el foco del faro** por cualquier vía válida:
   - martillo automático / pistón,
   - tirón con `magnet` + `thruster`,
   - volar y cortar con la Sierra Láser,
   - palanca por torque.
2. **Desguazar autos abandonados** con la Amoladora (`3`) para conseguir piezas.
3. **Reparar motor y batería** en el taller (ver 3.3).
4. **Subir la montaña iluminando el camino** con el foco, o improvisando: turbinas, saltos o escalada magnética en postes metálicos.

## 5. Modo "Con Amigos" (propuesto)

- **Vehículo biplaza** con `passengerSeat`, para que el acompañante opere herramientas.
- **Taller compartido en tiempo real.** Hoy el transporte es local entre pestañas; ver [PENDIENTES.md](../PENDIENTES.md) y [RECURSOS_Y_REPOS.md](./RECURSOS_Y_REPOS.md).
- **Modo Derby** con soldaduras rompibles en la Arena.

## 6. Regla de diseño para todos los niveles

Se mantiene lo definido en `CLAUDE.md` ("Un problema físico, un invento"): objetivo físico visible, zona de armado con límites, prueba con reparación en 1 clic, éxito medible con medallas, y ruta a pie opcional **siempre bastante más larga** que la del invento (nunca un bloqueo).
