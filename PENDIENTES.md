# Pendientes de Los del Desguace

Prioridades: **Alta** (bloquea o rompe la experiencia), **Media** (necesario para el MVP), **Baja** (pulido). Visión y reglas del MVP: [docs/VISION_MVP.md](./docs/VISION_MVP.md). Planificación general: [ROADMAP.md](./ROADMAP.md).

## Bugs conocidos (Prioridad Alta)

- [ ] `src/invention/workshopPhysics.ts`, en `updateMotors`: evitar destruir y recrear la `RevoluteImpulseJoint` al pasar a `speed = 0` (usar `configureMotor(0, 0, 0, 0)`), suavizar las ganancias de rueda (`2.8` al acelerar / `4.5` al frenar), agregar zona muerta al `driverThrottle` y evitar que las ruedas de un vehículo con asiento giren solas sin conductor ni cableado.
- [ ] `src/invention/workshopPhysics.ts`, en `stepRunning`: eliminar el estabilizador duplicado de `pitch`/`roll` sin `dt` (ya corre en `stabilizeAndFlyAssembly`) y sacar el impulso físico `rumble`. Si hace falta, dejar la vibración solo visual en `vehicleFeel.ts` / `WorkshopChassis.tsx`.
- [ ] `src/invention/workshopPhysics.ts`, en `reset()`: limpiar también `knuckle` (`world.removeRigidBody(knuckle)`) para evitar la fuga de cuerpos dinámicos.
  - *Estado de los tres puntos de arriba:* el cambio ya está escrito en el espacio de trabajo, pero **todavía no se subió ni se verificó**. Falta correr `npm test` y `npm run lint`, y probar a mano el Carrito Clásico (subir, acelerar, soltar, bajar). Ojo con `tests/workshopAssembly.test.ts` ("Motor en marcha", exige avanzar más de 0.2 m con el motor más débil) y con los tests de `tests/presetStability.test.ts`.
- [ ] `src/ui/hud.css`, `.hud-joystick`: confirmar que el joystick táctil alcanza. La medida que se creía (`clamp(84px, 18vmin, 110px)`) ya no es la actual: hoy es `clamp(118px, 24vmin, 148px)`, y `110px` en pantallas bajas. Probar en iPhone 11 y, si sigue chico, agrandarlo.

## Pendientes de Mecánicas MVP (Prioridad Media)

- [ ] Separar el modo `sandbox` del MVP: dispensador infinito (`N`) y presets de 1 clic solo en `sandbox`/desarrollo; en el MVP, piezas en pilas limitadas del patio. `H` reconstruye solo el último diseño armado por el jugador.
- [ ] Juntas rompibles por impacto/tensión en Rapier.
- [ ] Módulos sueltos en `custom:${string}` (por ejemplo `magnet` + `thruster` + `switchBox`) sin exigir chasis.
- [ ] Estado de desgaste `condition: 'ok' | 'broken' | 'discharged'` con reparación: motores trabados en el Banco RPM (`Tab`), baterías descargadas recargadas cableándolas (`5`) a un generador.
- [ ] Etiquetas físicas reutilizables en objetos del mapa (`breakForce`, `isMagnetic`, `isCuttable`, `conductsPower`).
- [ ] Economía de la Sierra Láser (`4`) + Mesa Láser (`src/ui/LaserTable.tsx`): conseguir y fabricar piezas con material limitado.
- [ ] Transformar `src/modes/contracts.ts` en desafíos sin pistas ni solución a pie.
- [ ] Permitir ubicar uniones sobre piezas ya montadas. Reusar las uniones fijas, los ejes y la transmisión que prueban el carrito y el tambor.
- [ ] Extender los controles de fijar, girar y empujar a otras creaciones. Sumar mover el conjunto y deshacer el último montaje al flujo de construcción.
- [ ] Completar el armado del carrito con chasis y asiento manipulables y soporte de carga opcional.
- [ ] Definir la fabricación de piezas. Empezar por una receta con insumos del patio que produzca una pieza física compatible con el banco.
- [ ] Probar el carrito armado en pista. Definir cómo la masa, las ruedas y la posición del motor afectan el manejo, la tracción y las colisiones.
- [ ] Guardar el armado cuando esté definido el ciclo de construir, probar y desarmar.

## Pendientes de Niveles y Arte (Prioridad Media)

- [ ] Nivel nocturno *"Operación: Pilas del Control"* (ver [docs/VISION_MVP.md](./docs/VISION_MVP.md)).
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
