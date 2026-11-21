# Prueba de artefactos en Taller El Yunke

## Pedido para Antigravity

Auditá la versión del workspace en el juego. Cubrí las 24 clases de piezas actuales, las herramientas, los controles y las transiciones del taller. Empezá por el electroimán y los propulsores. Corré `npx tsc --noEmit`, `npm test` y `npm run build` como base. Hacé el recorrido completo en PC y repetí las acciones con controles táctiles en horizontal. Si tenés un iPhone 11, verificá ahí lectura del HUD, gestos y desbloqueo de audio. Registrá la emulación como tal.

Antes de empezar, anotá la versión probada. Para cada caso registrá **OK, falla, bloqueado o no aplica**, el dispositivo, qué esperabas, qué pasó y los pasos para repetirlo. Guardá una captura o un plano reproducible cuando ayude. Una falla de física necesita un armado mínimo y, cuando el resultado sea medible, un test de regresión en Rapier. Si el código y la intención del diseño discrepan, registrá la diferencia y proponé el cambio.

### Recorrido por pieza

1. Pedila en el dispensador, agarrala, girala, apoyala y soldala al chasis o a una base de chatarra.
2. Si tiene actuador, probá «Probar» y cableala a un interruptor. Confirmá qué pasa con señal apagada y encendida, con y sin batería, y al retirar el cable. Probá el asiento en PC y móvil cuando la pieza acepte señal del asiento.
3. Repetí con la base fija y liberada, y con el artefacto girado 90°. Bajá, volvé a subir, desmontá la pieza y reiniciá. Confirmá que ningún impulso se dispara solo y que el HUD refleja el estado.
4. Cuando corresponda, guardá el invento y volvé a cargarlo. Probá también el enlace del plano en una sesión limpia, especialmente si el invento incluye piezas pedidas en el dispensador.

### Casos prioritarios

- **Electroimán:** compará una pieza metálica libre con una caja y un barril de madera a la misma distancia. Probá con una pared intermedia, con una pieza del mismo armado y con la carga al límite del alcance. Revisá que el objeto deje de recibir impulso al cortar la señal. El código actual filtra por cuerpo dinámico suelto, pero no por material ni por obstáculos y añade un impulso hacia arriba. Registrá por separado cómo se percibe cada efecto.
- **Cohete, bidón propulsor, turbina y hélice de dron:** compará «Probar», cableado y Turbo donde corresponda. Usá la misma orientación, masa y batería en cada caso. Verificá eje del empuje, intensidad, desaceleración al cortar señal y efectos visibles. El cohete y el bidón comparten fuerza en Turbo y tienen fuerzas distintas como actuadores cableados. Comprobá además cuándo el vuelo asistido toma el control. Revisá que una pieza suelta no arranque al ingresar al taller.
- **Puño de resorte:** activá una vez con una caja adelante, a un costado, detrás y detrás de una pared. El primer cuerpo dinámico delante recibe el golpe. Un obstáculo fijo lo bloquea. Verificá el retroceso cuando la base está libre y el intervalo entre golpes con una señal sostenida.
- **Bandera:** agarrá, girá, fijá a una base y mové la base. Confirmá que se ve como un marcador y acompaña al invento.

### Catálogo completo y resultado esperado

Usá estos casos junto con el recorrido por pieza. Contrastá el resultado con el HUD, el sonido y el movimiento físico. Las piezas de decorado sin interacción deben distinguirse visualmente de las que se pueden agarrar.

- **Caja apilable** (`crate`). Apoyá otra caja encima y comprobá que ambas se sostienen. Si se usa como interruptor, verificá que el HUD muestre su segundo uso y que solo cambie la señal cuando lo activás.
- **Rueda** (`wheel`). Montala en cada lado del chasis, soltá la base y empujala a mano. Debe rodar sobre su eje. Probá tracción e inversión de giro cuando tiene señal.
- **Bidón propulsor** (`canister`). Probalo como pieza suelta, en el banco del tambor y como propulsor. Comprobá que el montaje muestra el uso correcto y que una batería o una señal se comportan como indica el HUD.
- **Motor** (`part`). Montalo adelante y atrás. El eje indicado debe ser el que tracciona. Compará RPM parciales, altas y parada con la animación y el sonido del motor conectado.
- **Batería** (`battery`). Conectala a alimentación y verificá el puerto que muestra el HUD. Compará el actuador con el puerto cableado y con esa fuente apagada o retirada. Anotá si se activa solo al darle energía.
- **Barril de madera** (`woodBarrel`). Rodalo y compará el agarre con una caja. Usalo como base con asiento y verificá subir, bajar y volver a subir sin desmontar el armado.
- **Ala** (`wing`). Dejala suelta al entrar a Taller Libre y al reiniciar. Debe asentarse. Montada, compará sustentación en reposo y con avance, con la orientación normal e invertida.
- **Faro** (`headlight`). Activá, apagá y girá la carcasa. El haz debe seguir su orientación, apagarse al perder señal y no aplicar fuerza.
- **Asiento** (`seat`). Confirmá subida con E, clic y toque cuando el HUD muestra «Subir». Manejá, bajá y volvé a subir. Si el objetivo deja de estar al alcance, ninguna otra pieza debe desmontarse.
- **Cohete propulsor** (`thruster`). Cumplí el caso prioritario de propulsión, incluida una base fija que no sale disparada porque se esté cableando.
- **Temporizador** (`timerBox`). Conectalo a un faro y probá los períodos 0,6 s, 1,4 s y 3 s. La salida debe seguir el período elegido y dejar de controlar el faro al desconectar.
- **Interruptor** (`switchBox`). Debe alternar una vez por acción y mantener su último estado hasta la siguiente. Compará el estado del HUD con el del actuador.
- **Puerta AND** (`logicAnd`). Cableá dos interruptores y un faro. Probá 00, 01, 10 y 11. Solo 11 enciende el faro.
- **Electroimán** (`magnet`). Cumplí el caso prioritario y registrá con qué materiales se percibe como un imán reconocible.
- **Chasis** (`chassis`). Fijá, mové y soltá una base con cuatro ruedas. Las ruedas y accesorios deben acompañar la base, incluso al girarla y liberarla.
- **Soporte de carga** (`cargoRack`). Montalo, apoyá una caja y manejá. Mostrá la diferencia entre carga apoyada y soldada, incluida una frenada.
- **Resorte saltarín** (`spring`). Probá un pulso aislado y una señal sostenida. El empuje debe seguir la orientación y los rebotes deben corresponder a activaciones visibles.
- **Globo** (`balloon`). Compará globo suelto, soldado a una carga liviana y soldado a una pesada. Debe sentirse la diferencia de peso y no debe levantarse solo al reiniciar el taller.
- **Turbina** (`fan`). Cumplí el caso prioritario de propulsión. Confirmá que el efecto de aire acompaña la orientación y el estado de la señal.
- **Bocina** (`horn`). Activala cerca de una pieza libre y de una pieza soldada a su propia base. Compará sonido y efecto físico en ambos casos, y repetí con señal sostenida.
- **Giroscopio** (`gyro`). Compará el mismo invento sin ruedas con y sin giroscopio, después de inclinarlo. Medí si vuelve a quedar estable sin tirones ni cambios bruscos de posición.
- **Puño de resorte** (`boxingGlove`). Cumplí el caso prioritario. Probá además que la animación del guante coincide con un solo golpe por activación breve.
- **Hélice de dron** (`droneRotor`). Cumplí el caso prioritario de propulsión. Compará una hélice descentrada con dos equilibradas y probá señal apagada en ambas.
- **Bandera** (`flag`). Cumplí el caso prioritario. Su función actual es identificar un invento visualmente.

### Recorridos de integración

1. **Primera partida.** Desde una sesión limpia, hacé «Probar el carrito», subí, completá el encargo, volvé al taller y repetilo. Probá además Taller Libre antes de tocar una pieza. Observá qué se mueve solo, qué obstruye el área inicial y si el próximo paso se entiende mirando el HUD.
2. **Herramientas y manejo de peso.** Probá llave, láser, editor y acciones contextuales disponibles. Agarrá, guardá en el inventario, recuperá, girá, empujá, fijá y soltá piezas y armados. Compará un armado liviano con uno pesado. El aviso debe explicar qué acción está disponible y señalar el objetivo sobre el que se ejecutará.
3. **Montaje, soldadura y reparación.** Compará encastre guiado y soldadura libre. La pose que anuncia el holograma debe coincidir con la unión final. Si el sitio está ocupado o bloqueado, la pieza debe quedar en mano con un motivo visible. Desmontá una unión explícitamente y repará una creación después de un choque.
4. **Cableado y banco RPM.** Conectá desde el origen hasta el puerto correcto, cancelá a mitad, probá una conexión inválida y quitá un cable. Prepará un motor en el banco y probá acelerar y parar. La ayuda debe indicar si falta señal, alimentación o un montaje. Al cerrar el banco, confirmá qué queda activo.
5. **Presets y guardado.** Cargá cada preset del menú. En los montables, probá la primera subida antes de reparar, luego bajá y volvé a subir. En los demás, probá su función principal. Guardá un invento con una pieza del dispensador y una unión libre. Restauralo tras reiniciar y desde el plano compartido en un perfil nuevo.
6. **Un invento con varias funciones.** Armá un carrito con cuatro ruedas y un motor, una bandera visible, un puño activado por interruptor y un faro controlado por temporizador. Encendé cada función por separado, manejá, chocá, repará y repetí. Verificá que una acción no cambie la señal de otra y que los estados de piezas, cables y montaje coincidan con lo que se ve.
7. **Modos, encargos y escenario.** Pasá de Taller Libre a Carrera en Pista y Desafío de Vuelo. Comprobá punto de inicio, condiciones de finalización, recompensa, reintento y regreso con el invento. Recorré también los encargos disponibles y las zonas de arena y puente. Verificá colisiones visibles, contadores y si se pueden reintentar sin arrastrar el estado de la ronda anterior.
8. **HUD, cámara, entrada y audio.** Repetí las acciones principales en primera y tercera persona, con teclado y mouse y con dedos. Verificá botones accesibles en horizontal, gestos simultáneos, liberación de controles al cambiar de pestaña o abrir un menú y audio al primer toque. Al salir de un asiento o cerrar un menú, la cámara y el movimiento deben volver al modo correspondiente.

Entregá una lista de cobertura con los 24 tipos y los ocho recorridos. Priorizá acciones que dañan el armado, piezas que se activan solas, pérdidas de inventario o planos y bloqueos que obligan a reiniciar. Registrá como bloqueado cualquier caso que dependa de un dispositivo o una función aún pendiente.

## Próximos artefactos y desarme

- **Banco de desarme.** Llevá un electrodoméstico o un resto de auto al banco. La inspección muestra qué piezas pueden salir y dónde caen. El jugador recupera componentes mediante interacciones visibles sobre el objeto.
- **Fuentes de chatarra.** Lavarropas para motor y tambor. Aspiradora para turbina y manguera. Heladera para compresor y chapas. Auto de desguace para rueda, batería, alternador y engranajes. Las piezas obtenidas van a la bandeja del banco.
- **Primeras recetas.** Motor gastado más engranaje da un motor con más torque y menos velocidad. Batería básica más celda recuperada da mayor autonomía con más peso. El banco permite comparar las cifras antes de confirmar. El dispensador conserva motor y batería básicos.
- **Construcción.** Carrete con cuerda, gancho de escenario, bisagra motorizada, placa de presión, gato hidráulico y ventosa. El primer armado de prueba es una grúa para el huevo, accionada por el equipo.
- **Movimiento y exploración.** Orugas para terrenos blandos, esquís para deslizar, telescopio para marcar rutas, bandera como señal compartida de viento y punto de reunión, flotador pinchable y sillón eyectable. La bandera visual de taller es el punto de partida.
- **Chatarra con usos alternativos.** Colchón que amortigua, balde con tapa, paraguas que frena caídas o atrapa viento, aspiradora reversible y rueda de changuito.
- **TNT de caricatura.** Pieza de juego para desplazar chatarra y despejar obstáculos frágiles señalizados en un encargo.
