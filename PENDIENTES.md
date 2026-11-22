# Pendientes de Los del Desguace

Prioridades: **Alta** (bloquea o rompe la experiencia), **Media** (necesario para el MVP), **Baja** (pulido). Visión y reglas del MVP: [docs/VISION_MVP.md](./docs/VISION_MVP.md). Planificación general: [ROADMAP.md](./ROADMAP.md).

## Bugs conocidos (Prioridad Alta)

- [ ] `src/invention/workshopPhysics.ts`, en `updateMotors`: evitar destruir y recrear la `RevoluteImpulseJoint` al pasar a `speed = 0` (usar `configureMotor(0, 0, 0, 0)`), suavizar las ganancias de rueda (`2.8` al acelerar / `4.5` al frenar), agregar zona muerta al `driverThrottle` y evitar que las ruedas de un vehículo con asiento giren solas sin conductor ni cableado.
- [ ] `src/invention/workshopPhysics.ts`, en `stepRunning`: eliminar el estabilizador duplicado de `pitch`/`roll` sin `dt` (ya corre en `stabilizeAndFlyAssembly`) y sacar el impulso físico `rumble`. Si hace falta, dejar la vibración solo visual en `vehicleFeel.ts` / `WorkshopChassis.tsx`.
- [ ] `src/invention/workshopPhysics.ts`, en `reset()`: limpiar también `knuckle` (`world.removeRigidBody(knuckle)`) para evitar la fuga de cuerpos dinámicos.
  - *Estado de los tres puntos de arriba:* el cambio ya está escrito en el espacio de trabajo, pero **todavía no se subió ni se verificó**. Falta correr `npm test` y `npm run lint`, y probar a mano el Carrito Clásico (subir, acelerar, soltar, bajar). Ojo con `tests/workshopAssembly.test.ts` ("Motor en marcha", exige avanzar más de 0.2 m con el motor más débil) y con los tests de `tests/presetStability.test.ts`.
- [ ] `src/ui/hud.css`, `.hud-joystick`: confirmar que el joystick táctil alcanza. La medida que se creía (`clamp(84px, 18vmin, 110px)`) ya no es la actual: hoy es `clamp(118px, 24vmin, 148px)`, y `110px` en pantallas bajas. Probar en iPhone 11 y, si sigue chico, agrandarlo.

## Pendientes de Mecánicas MVP (Prioridad Media)

- [x] Separar el modo `sandbox` del MVP: dispensador infinito (`N`) y presets de 1 clic solo en `sandbox`/desarrollo; en el MVP, piezas en pilas limitadas del patio. `H` reconstruye solo el último diseño armado por el jugador. *(escrito, sin probar jugando)* Los niveles 1–3 viejos siguen con dispensador a propósito; se ve fuera de Taller Libre con `?dev=1`.
- [x] Juntas rompibles por impacto/tensión en Rapier. *(escrito, sin probar jugando)* La carga es una estimación (16 veces el peso por defecto): puede pedir ajuste.
- [x] Módulos sueltos en `custom:${string}` (por ejemplo `magnet` + `thruster` + `switchBox`) sin exigir chasis. *(escrito, sin probar jugando)*
- [x] Estado de desgaste `condition: 'ok' | 'broken' | 'discharged'` con reparación: motores trabados en el Banco RPM (`Tab`), baterías descargadas recargadas cableándolas (`5`) a un generador. *(escrito, sin probar jugando)* Falta probar la recarga en el generador del nivel nocturno.
- [x] Etiquetas físicas reutilizables en objetos del mapa (`breakForce`, `isMagnetic`, `isCuttable`, `conductsPower`). *(escrito, sin probar jugando)*
- [ ] Economía de la Sierra Láser (`4`) + Mesa Láser (`src/ui/LaserTable.tsx`): conseguir y fabricar piezas con material limitado.
- [ ] Transformar `src/modes/contracts.ts` en desafíos sin pistas ni solución a pie.
- [ ] Permitir ubicar uniones sobre piezas ya montadas. Reusar las uniones fijas, los ejes y la transmisión que prueban el carrito y el tambor.
- [ ] Extender los controles de fijar, girar y empujar a otras creaciones. Sumar mover el conjunto y deshacer el último montaje al flujo de construcción.
- [ ] Completar el armado del carrito con chasis y asiento manipulables y soporte de carga opcional.
- [ ] Definir la fabricación de piezas. Empezar por una receta con insumos del patio que produzca una pieza física compatible con el banco.
- [ ] Probar el carrito armado en pista. Definir cómo la masa, las ruedas y la posición del motor afectan el manejo, la tracción y las colisiones.
- [ ] Guardar el armado cuando esté definido el ciclo de construir, probar y desarmar.
- [x] Ergonomía móvil de herramientas de mantener: en pantalla táctil, la Sierra Láser (`4`), la Amoladora (`3`) y la Soldadora (`2`) funcionan por toque (uno enciende, otro apaga). En la Sierra: primer toque "Marcar inicio", después se gira la cámara con el pulgar libre y se toca "Cortar ahora"; hay botón "Cancelar" y el corte se cancela solo si te alejás más de 9 m de la pieza. PC no cambia (mantener clic). *(escrito, sin probar en el celular)*
- [x] Recorte en "U" y montaje en horquilla para triciclos (implementado, sin probar jugando):
  - "Cortar en escena" tiene botones nuevos **Muesca en U** y **Horquilla** (dibujan la muesca en el borde delantero; la chapa no se parte).
  - Al soldar una rueda dentro del hueco entre dos brazos, se centra sola con el eje de lado a lado (cartel "Montaje en horquilla").
  - La rueda en horquilla gira sobre su propio centro; el giro máximo sale del ancho real del hueco.
  - Triciclo (1 rueda directriz + 2 fijas): giro lateral limitado a 6.5 (antes 9).
  - **Validar jugando:** (1) cortar la muesca y ver que la chapa queda entera; (2) acercar la rueda delantera al hueco y ver el cartel y el centrado; (3) girar y comprobar que la rueda no roza los brazos; (4) manejar un triciclo rápido y ver que no vuelca; (5) probar un hueco más ancho/angosto que el de la Horquilla.
  - Pendiente: la rueda fantasma de vista previa todavía no se centra (solo el montaje real).

## Pendientes de Niveles y Arte (Prioridad Media)

- [x] Nivel nocturno *"Operación: Pilas del Control"* (ver [docs/VISION_MVP.md](./docs/VISION_MVP.md)). *(escrito, sin probar jugando)*
  - [x] Domo del faro registrado como pieza interactuable: la Sierra (`4`) y la Amoladora (`3`) lo cortan; el imán encendido se engancha con un resorte y un tirón fuerte (vehículo o propulsor) suelta la unión. *(sin probar; el umbral de tirón `1800 N` puede pedir ajuste)*
  - [x] 2 autos viejos soldados con el sistema del taller (chasis + 4 ruedas + motor roto + batería descargada) para desarmar con la Amoladora. *(sin probar; si el armado falla queda un aviso en la consola del navegador)*
  - [x] Escalada magnética: el imán encendido es atraído al eje de los postes `isMagnetic` y se sostiene contra la gravedad en proporción a su masa. *(sin probar; falta ajustar la fuerza escalando de verdad)*
  - [ ] Pendiente: medallas por tiempo, un tercer auto (tope de 24 piezas extra), y que el generador recargue de verdad la batería rescatada (probar).
- [ ] Arte 3D del Nivel 1 (puente). Tiene código, falta arte.
- [ ] Definición y pulido de los Niveles 2 (autos a romper) y 3 (helicóptero con imán). Son propuesta: validar con el creador antes de modelar.
- [ ] [Pedido para Antigravity: arte 3D de los niveles](./docs/PEDIDO_ANTIGRAVITY_NIVELES.md).

## Pendientes de Multijugador (Prioridad Media)

- [ ] Reemplazar `createBroadcastTransport` en `src/multiplayer/netProtocol.ts` por un transporte online real, sincronizando vehículos, herramientas y gestos. Hoy solo viajan las poses de los avatares y solo entre pestañas del mismo navegador. Opciones evaluadas en [docs/RECURSOS_Y_REPOS.md](./docs/RECURSOS_Y_REPOS.md); en el mismo archivo ya existe `createWebSocketTransport`, que necesita un servidor.
- [ ] Vehículo biplaza (`passengerSeat`) y modo Derby (ver [docs/VISION_MVP.md](./docs/VISION_MVP.md)).

## Animación y respuesta del juego

- [ ] [Plan de entregas y pedido para Antigravity](./docs/PLAN_ANIMACION_Y_RESPUESTA.md). La primera entrega cubre el agarre y montaje de una rueda, el Banco RPM y una vuelta en pista.

## Personajes (Prioridad Baja)

- [ ] Mejorar proporciones, silueta y articulaciones del cuerpo. Probar ambos atuendos en movimiento en iPhone 11.
- [ ] Habilitar ajustes acotados de torso, brazos, piernas y rasgos faciales. Adaptar prendas y accesorios a las medidas y mantener la apariencia separada de las expresiones.
- [ ] Conservar altura funcional, alcance, colisión, velocidad y salto con cualquier apariencia.
- [ ] Revisar la liberación de geometrías de contorno al desmontar y el grosor durante el aplastamiento. Investigar por separado las bandas de la cabeza con el GLB actual.

## Física emergente del taller (2026-11-22, sin probar jugando)
Las mismas reglas valen para cualquier invento; ya no hay casos especiales por tipo de vehículo.
- [x] **Tierra ↔ aire continuo:** si las ruedas tocan el piso mandan las ruedas; si el invento tiene propulsión de vuelo (rotor, ala, globo, cohete, ventilador) y se despega (o se pide subir), pasa solo al control de vuelo aunque tenga ruedas. Al volver a apoyar las ruedas sin subir, vuelven a mandar las ruedas.
- [x] **Dirección para N ruedas:** las distancias se miden desde el centro de masa real; dirigen las ruedas que quedan adelante del centro de masa.
- [x] **Rueda centrada** (x ≈ 0 o en horquilla): gira sobre su propio centro, sin barrer a los costados.
- [x] **Curva según el apoyo real:** se mide el ancho del apoyo a la altura del centro de masa (auto ≈ trocha, triciclo menos, fila de ruedas ≈ 0). Más angosto = curva más abierta (aceleración lateral entre 4.5 y 9) y estabilizador de balanceo que se endurece con la velocidad. Reemplaza el caso fijo del triciclo.
- [x] Muesca libre en cualquier borde: ya estaba (Cortar en escena + Muesca en U / Horquilla).
- **Combinaciones para probar jugando:**
  1. Bici de 6 ruedas en fila sobre una chapa larga: que avance derecho, doble abierto y no se caiga de costado.
  2. Helicóptero con ruedas (rotor + ruedas): andar por el piso, subir con Espacio, volar con control completo y aterrizar volviendo a manejar.
  3. Auto con alas saltando una rampa: en el aire debería pasar a control de vuelo y al caer volver a las ruedas.
  4. Triciclo (con horquilla y sin horquilla): doblar rápido sin volcar.
  5. Presets de siempre (auto, barril volador, robot con propulsores): que se manejen igual que antes.
- Riesgos a mirar: el paso tierra↔aire mira si hay piso a menos de ~0.56 m bajo cada rueda; ruedas puestas arriba de un invento podrían hacerlo "volar" en el piso.

## Aerosol (2026-11-22, sin probar jugando)
- [x] Herramienta **Aerosol** en la barra (tecla `Y`), paleta: rojo óxido, amarillo vial, verde militar, celeste taller, naranja fuego, negro mate, blanco tiza y borrador.
- [x] Modos con `R` o botón: **Pintar todo** (un clic tiñe la pieza y borra los trazos) y **Mano alzada** (aerógrafo donde pega el láser, boquilla Fino/Medio/Grueso).
- [x] Celular: Pintar todo = un toque; Mano alzada = un toque prende el gatillo, otro lo apaga (pulgar libre para girar la cámara).
- [x] Chorro de gotitas del color elegido, siseo suave y "clic-clac" de la lata al cambiar color.
- [x] Liviano: el lienzo 256×256 se crea solo en el primer trazo; texturas se suben a la GPU como máximo cada 50 ms; se liberan cuando la pieza desaparece; el color base se reaplica si la pieza se rearma (H).
- **Validar jugando:** pintar piezas con modelo GLB (si el UV es raro, el trazo puede salir en otro lugar de la pieza); FPS en iPhone 11 pintando a mano alzada; que el borrador devuelva el aspecto original; que el color se conserve al reconstruir con H.
- Pendiente: modelo 3D de lata en la mano (hoy se ve la llave), guardar la pintura en los planos compartidos por URL.

