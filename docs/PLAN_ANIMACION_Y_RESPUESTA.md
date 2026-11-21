# Animación y respuesta del juego

Los del Desguace · Taller El Yunke · 20 de noviembre de 2026

## Objetivo

Que agarrar, arrastrar, montar y probar un invento tenga peso y se sienta distinto según la pieza. El jugador tiene que poder reconocer por el movimiento y el sonido si una rueda encastró, si un motor recibió señal o si el invento patinó o recibió un golpe. La primera prueba se hace en primera persona, con especial atención al iPhone 11 en horizontal.

El recorrido de referencia es **agarrar una rueda, caminar con ella, girarla, montarla con el holograma, acelerar en el banco y dar una vuelta en la pista**. El objetivo es que el jugador quiera volver al taller a mejorar lo que acaba de probar.

## Punto de partida

- `InventorCharacter.tsx` ya usa animación procedural y un anclaje de agarre. Hay locomoción, poses en el asiento, gestos y expresiones que se pueden ampliar.
- `PlayerRig.tsx` controla el agarre, la posición de montaje, la soldadura, los impactos y la transición al asiento. El holograma usa la pieza en la pose de destino. `GrabbableProps.tsx` ya separa la malla visual del cuerpo de Rapier.
- `sfxEngine.ts` ya tiene sonidos de soldadura, cableado, motor e impactos. El Banco RPM mide la velocidad angular del eje y la muestra en el HUD.
- El botón contextual, la llave, el acceso visible a **Cablear** y los seis slots ya forman parte del recorrido. Mantenerlos reconocibles en PC y táctil.

## Entrega 1 · Una rueda y una vuelta

### Agarre y transporte

- Al agarrar una rueda, Chispa baja los hombros, flexiona el cuerpo y cierra ambas manos sobre ella. Durante la marcha, la rueda acompaña el paso y se asienta al detenerse o cambiar de dirección. En primera persona, las manos y el borde de la rueda muestran ese esfuerzo. En tercera persona, se ve en el torso y la postura.
- Priorizar transiciones breves y fáciles de interrumpir. La interacción lógica se confirma al toque y la presentación visual acompaña. La pose de la rueda conserva la orientación elegida, la visibilidad de la mira y el espacio que valida el agarre.

### Giro y encastre

- Al girar la rueda, acompañar la orientación con un movimiento de muñecas. El holograma sigue mostrando la pose exacta que se aplicará.
- Al montar, confirmar la unión una vez con un golpe de eje metálico y un recorrido visual corto hasta la pose final. Usar el resultado real de montaje para disparar ese efecto. Si el punto está bloqueado, mantener el holograma coral y el motivo junto a la mira.

### Banco y pista

- Usar las RPM medidas en el banco para dar respuesta al motor visual y sonoro. Al acelerar, la carcasa puede vibrar levemente y el audio cambia con el giro real. Al parar, el sonido acompaña la caída de RPM.
- En pista, dar un pequeño balanceo visual al arrancar, girar y frenar. Al aterrizar de una loma, el chasis se asienta. El efecto queda en el modelo, con los colliders y las juntas en sus poses físicas.
- Distinguir rodadura, patinada e impacto con sus señales reales. La primera entrega puede partir de una rueda y un carrito, y dejar preparados los puntos de extensión para otros materiales e inventos.

### Aceptación

1. En Taller Libre, agarrar una rueda, moverla, girarla y montarla con el holograma sin abrir el editor. Verificar que una colocación bloqueada conserve la pieza en la mano.
2. Abrir **Probar RPM** con un carrito fijo, acelerar, parar y cerrar. La respuesta visual y sonora acompaña la medición del eje.
3. Probar el Carrito Clásico y un armado manual al subir, acelerar, girar y frenar. Confirmar salida del asiento y reparación de un invento.
4. Verificar el recorrido en PC y en un viewport táctil horizontal. Dejar identificada la validación hecha en Safari real del iPhone 11 y cualquier diferencia pendiente.
5. Pasar `npx tsc --noEmit`, `npm test` y `npm run build`. Entregar una captura o clip corto del recorrido y los resultados de las comprobaciones.

## Entrega 2 · Herramientas y fallas legibles

- Extender las poses según peso. Usar una mano para una pieza chica, dos para una rueda y el cuerpo inclinado para empujar una estructura. Dar a Chispa un gesto breve de apoyo al subir al asiento y una reacción al recibir un golpe.
- **Soldar** muestra el punto exacto de unión, un movimiento corto de mano, chispas y una marca de calor que desaparece. Reservar el cartel grande para momentos que el jugador recuerde, como la primera soldadura del armado. Los montajes sucesivos pueden confirmarse junto a la mira con sonido y una reacción breve.
- **Cablear** muestra la punta libre siguiendo la mira. Al confirmar la conexión, un pulso recorre el cable hasta la entrada. La reacción del aparato comunica el resultado cuando corresponde, como un faro que se enciende.
- **Desmontar y reparar** tienen gestos y sonidos propios. Cuando una unión se rompe, ubicar el efecto en esa pieza para que el jugador entienda dónde reforzar o cambiar el diseño.
- Diseñar el martillo para golpes cortos de enderezado, tijeras para chapa fina, serrucho con un movimiento de ida y vuelta, pintura para superficies y aerosol para marcas. Definir con el creador el efecto, la vista previa y el lugar de cada herramienta en el inventario antes de implementar su mecánica específica, según AGENTS.md.

## Entrega 3 · Un patio que se siente vivo

- Dar una señal ambiental clara a cada zona. En el taller, una lona que se mueve y el sonido localizado del banco. En el patio oeste, barriles que reaccionan al empuje y una ruta a pie. En la pista, distinguir hormigón y madera al rodar.
- Completar los descansos de Chispa con cambios de postura, un saludo o una reacción breve después de una caída. Usar pocos efectos por zona y priorizar los que ocurren cerca del jugador.
- Diseñar **Llevá el huevo** como encargo de validación. Una ruta corta a pie y otra abierta a inventos, con soluciones como una camioneta con cuna o un balde con ruedas. El estado del huevo al llegar debe ayudar a entender el efecto de los golpes y dar pie a reintentar con otra solución. Confirmar el diseño del encargo antes de ampliar la implementación.

## Criterios comunes

- Conservar los controles, alcance, tiempos de respuesta, colisiones y capacidades de Chispa. La animación acompaña el resultado del juego y puede interrumpirse al cambiar de acción.
- Reutilizar poses, referencias, audio y efectos del proyecto. Mantener estable la separación entre la malla y la física. En iPhone, priorizar unas pocas partículas cortas, evitar luz dinámica para chispas y reutilizar recursos entre acciones.
- Mantener la madera, tuercas y tipografía del Yunke. La mira y la parte central de la escena quedan legibles. Los efectos de cámara son suaves, en especial en primera persona.
- Trabajar en cambios chicos. Revisar el estado de la rama y los diffs existentes antes de editar. Registrar el tiempo hasta tener un cambio integrado y comprobado, con una revisión por entrega.

## Pedido para Antigravity

> Leé AGENTS.md, CLAUDE.md y docs/PLAN_ANIMACION_Y_RESPUESTA.md en el repo Los del Desguace. Implementá la **Entrega 1 · Una rueda y una vuelta**. El objetivo es que agarrar, girar y encastrar una rueda, probar las RPM y manejar el carrito se sienta más vivo en primera persona.
>
> Empezá revisando lo que ya existe en InventorCharacter, PlayerRig, GrabbableProps, workshopPhysics y sfxEngine. Reutilizá la animación procedural, el anclaje de agarre, el holograma y la medición real de RPM. Dale peso a la pose de las manos y torso, confirmación visual y metálica al montar y respuesta del motor y chasis al acelerar y frenar. Tomá la confirmación de montaje de la física y preservá los controles y la estabilidad de los presets.
>
> Comprobá el armado manual de una rueda, el caso de montaje bloqueado, el Banco RPM y una vuelta corta. Probá en PC y táctil horizontal. Corré `npx tsc --noEmit`, `npm test` y `npm run build`. Entregá el cambio enfocado, una captura o clip, el tiempo empleado en integración y cualquier prueba pendiente en Safari del iPhone 11. Las entregas siguientes quedan como plan para revisar con el creador.
