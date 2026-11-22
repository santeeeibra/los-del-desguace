# Pedido para Antigravity: arte 3D de los niveles de invento

Los del Desguace · Taller El Yunke · 22 de noviembre de 2026

## Objetivo

Hacer el arte 3D de los niveles de invento. Cada nivel es **un problema físico que se resuelve armando y probando una máquina** (ver `CLAUDE.md`, sección "Diseño de Niveles"). No son niveles de escalada. El arte tiene que hacer legible el problema desde la bahía de armado: el jugador mira el escenario y entiende qué tiene que resolver.

## Qué se pide y qué no

- **Se pide:** la representación visual de cada nivel (escenario, props de ambientación, señalética, el puente, la tapa, los autos) como archivos `.glb`.
- **No se toca:** colliders, posiciones de gameplay, checkpoints, metas, física ni lógica. Eso vive en código (`src/environment/ExpeditionLevels.tsx` y `src/modes/expeditionLevels.ts`) y se mantiene como hoy: el modelo es solo la malla visual, igual que con los props (`art/blender/README.md`).
- **Regla de las dos rutas:** cada nivel tiene un camino corto para el invento y un camino a pie mucho más largo. El arte tiene que mostrar ambos y que la ruta a pie se lea sin ser obligatoria (senda señalizada).

## Contrato con el código

- Cada nivel tiene un origen local en el mundo (`origin`, `x = 140` o más). Todo el modelo se entrega **en coordenadas locales del nivel**, con el origen del modelo en el origen local del nivel, eje **+Z** hacia la meta, **+Y** arriba, unidades en metros.
- Los siguientes puntos son fijos y el arte tiene que respetarlos (superficies caminables a la altura indicada, sin sobresalir). Están en `expeditionLevels.ts`:
  - spawn, bahía de armado (`bayLocal`), checkpoints, meta y tuerca dorada.
- Entregar además, dentro del mismo `.glb`, **objetos vacíos (empties) con estos nombres** para que el código ubique los efectos: `spawn`, `bay`, `checkpoint_1`, `checkpoint_2`, `goal`, `golden_nut`.
- Las superficies sobre las que el jugador o la máquina conducen no pueden quedar por encima ni por debajo de la caja física en más de 3 cm. Si el arte necesita relieve, que sea decorativo y esté fuera del trazado.

## Nivel 1 · El Puente del Abismo (implementado en código, sin arte)

Problema: cruzar un puente angosto sobre un abismo.

Medidas actuales (locales):

| Elemento | Posición y tamaño |
| --- | --- |
| Bahía de armado | plataforma de 24 x 14 m, tope en y = 0, z de -1 a 13, pista pintada de 11 x 8 m en el centro |
| Abismo | z de 13 a 80, 48 m de ancho, fondo de barro en y = -12 |
| Puente | 3 m de ancho, 67 m de largo, tope en y = 0, centrado en x = 0 (z de 13 a 80) |
| Ruta a pie | rampa izquierda de 6 m de ancho (x = -8) bajando del z = 13 al z = 35, rampa derecha (x = +8) subiendo del z = 58 al z = 80, pendiente de 12 m cada 22 m |
| Plataforma final | 24 x 18 m, tope en y = 0, z de 80 a 98 |
| Checkpoints | uno en el centro del puente (z = 46), otro en la plataforma final (z = 84) |
| Meta | z = 96 |
| Tuerca dorada | en el fondo del abismo, bajo el centro del puente |

Arte pedido:

- Un puente que se vea **angosto y exigente**, de madera y metal oxidado, con bordes señalizados. Que se lea que cabe una máquina justa.
- Paredes del abismo con estratos de chatarra compactada. Fondo de barro de aceite oscuro, con carcasas y piezas hundidas.
- La bahía de armado con banco de herramientas, estantes con piezas y un cartel que explique "armá algo que cruce".
- Senda a pie señalizada con flechas pintadas, vallas bajas y faroles. Que se vea larga y fea de recorrer.
- Un faro o torre en la plataforma final, visible desde la bahía como referencia de la meta.

## Nivel 2 · El Callejón de los Autos (aprobado por el creador el 22/11/2026)

Problema: abrir paso por un callejón del desguace tapado por **dos barreras de autos seguidas**, una liviana y otra pesada, hasta llegar al portón del taller. Los autos se **empujan y se rompen por impacto**: una máquina con masa y velocidad los derriba, y si el golpe es muy fuerte el auto se parte en 3 o 4 trozos y pesa menos. No se cortan con sierra en esta versión.

Medidas (locales, mismo sistema que el Nivel 1: +Z hacia la meta, +Y arriba, tope del suelo en y = 0):

| Elemento | Posición y tamaño |
| --- | --- |
| Bahía de armado | plataforma de 24 x 14 m, z de -1 a 13, igual que el Nivel 1 |
| Callejón | z de 13 a 98, 17 m de ancho (x de -8,5 a 8,5), con paredes de 6 m de alto hechas de contenedores y chatarra |
| Barrera A (liviana) | z de 33 a 41. 2 filas de profundidad y 2 autos de alto (2,8 m), cubre todo el ancho. Autos de unos 90 kg |
| Checkpoint 1 | z = 50, en el hueco entre las dos barreras |
| Barrera B (pesada) | z de 60 a 70. 3 filas de profundidad y 3 autos de alto (4,2 m), cubre todo el ancho. Autos de unos 320 kg. Algunos autos llevan una X de pintura amarilla: son los puntos débiles y se rompen con menos fuerza |
| Checkpoint 2 | z = 80 |
| Portón del taller (meta) | z = 96. Portón corredizo de 8 m de ancho con una tuerca gigante luminosa arriba, visible desde la bahía |
| Ruta a pie | pasarela elevada de 3 m de ancho sobre el lado izquierdo del callejón, a 5 m de altura, en zigzag con escaleras y techos de contenedores, rodeando las dos barreras. Unas 8 veces más larga que el camino directo, señalizada con flechas y faroles |
| Tuerca dorada | al final de un ramal sin salida de la pasarela, sobre el techo de un contenedor |

Arte pedido:

- **Callejón del desguace** con paredes altas de contenedores oxidados y torres de neumáticos, barriles y carteles sin texto. Que se lea de lejos que el callejón está tapado.
- **Autos aplastados**, estilizados y legibles, en colores cálidos y apagados, con la pintura despintada. Entregarlos **como piezas separadas del escenario**, en archivos aparte:
  - `public/models/levels/cars/car-sedan.glb`, `car-van.glb`, `car-pickup.glb` y `car-wagon.glb`: 4 carrocerías enteras, origen en el centro de la caja, tamaño de unos 4,2 x 1,5 x 1,9 m.
  - `car-chunks-*.glb`: para cada carrocería, 3 o 4 trozos (techo, capó, puerta, chasis) con el origen en el centro de cada trozo, para usar cuando el auto se parte.
  - Una variante `car-weak-*` de cada carrocería con la **X de pintura amarilla** bien visible.
- **Referencia visual de la barrera pesada:** que se vea más gruesa, más oscura y más difícil que la liviana, así el jugador entiende que necesita una máquina más pesada.
- **Portón del taller** con una tuerca gigante luminosa, legible desde la bahía.
- **Pasarela a pie** con barandas, escaleras y flechas pintadas. Que se vea larga y fea de recorrer, sin parecer un error.
- El nivel tiene que pedir una máquina más pesada, no más compleja: no hace falta más arte que ese contraste entre barreras.

Los autos no van dentro del `level-2-autos.glb`: ese archivo trae solo el escenario (callejón, paredes, portón, pasarela, bahía) y los empties `spawn`, `bay`, `checkpoint_1`, `checkpoint_2`, `goal` y `golden_nut`. Además, **empties `barrier_a_origin` y `barrier_b_origin`** en el centro de cada barrera, para ubicar las pilas de autos desde el código.

## Nivel 3 · Helicóptero con imán (propuesta, a validar con el creador)

Problema: destapar una olla gigante que tapa un desagüe, con una máquina que vuela y levanta la tapa.

- Una olla enorme, de unos 6 m de diámetro, con una tapa metálica con un asa o anillo de hierro que el imán pueda levantar. Debajo, el desagüe con un cartel luminoso de meta.
- Un patio abierto con espacio para despegar y maniobrar, con chimeneas y cables que marquen la altura.
- La ruta a pie es una escalada larga por andamios hasta una palanca alternativa. Tiene que verse y no ser obligatoria.
- La tapa tiene que entregarse **como pieza separada** (su propio objeto en el `.glb`) para poder moverla con física.

## Estilo

Mismo lenguaje que el resto del juego: **indie artesanal de taller, madera y metal**, formas simples y redondeadas, bordes gruesos, colores cálidos (ver `CLAUDE.md`, sección "Identidad Visual"). Que se vea limpio y legible desde lejos en tercera persona, no realista. Sin emojis ni texto en los modelos; los carteles son geometría o textura sin letras (el texto lo ponemos nosotros).

## Presupuesto técnico (PC y iPhone 11)

- **Triángulos:** hasta 60.000 por nivel entre todo lo visible. Props repetidos con instancias.
- **Materiales:** hasta 8 por nivel. Texturas de hasta 1024 px, WebP, con atlas compartido. Normal y ORM solo donde aporten.
- **Peso:** el `.glb` de cada nivel hasta 6 MB, comprimido con `KHR_mesh_quantization` como los props actuales.
- **Sin luces ni sombras horneadas dinámicas** dentro del modelo. La iluminación la pone el juego.
- Separar en objetos distintos lo que el código puede mover o partir (tapa, autos, tablones sueltos).

## Entrega

- `public/models/levels/level-1-puente.glb`, `level-2-autos.glb`, `level-3-olla.glb`.
- Fuentes en `art/levels/` (`.blend` y el script que las regenera, si lo hay) y renders de control en `art/levels/previews/`.
- Un `README.md` en `art/levels/` con cómo regenerarlas y las métricas reales (triángulos, materiales, peso).
- Los nombres de los empties exactamente como arriba.

Conexión en el juego (`src/environment/LevelArt.tsx`): al iniciar un nivel, el juego busca su `.glb` en esas rutas. Si existe y es un GLB válido, lo muestra y oculta los bloques de prueba. Si falta o está corrupto, deja los bloques de prueba. No hace falta tocar código para integrar la entrega: alcanza con copiar el archivo con el nombre exacto.

## Aceptación

1. Cargar el nivel y ver el modelo alineado con la caja física: la máquina y el jugador se apoyan en el arte sin flotar ni hundirse.
2. Desde la bahía de armado se entiende el problema y se ve la meta.
3. La ruta a pie se lee y se distingue del camino corto.
4. 60 FPS estables en PC y fluidez en iPhone 11 en horizontal. Registrar el dispositivo probado.
5. `npx tsc --noEmit`, `npm test` y `npm run build` siguen en verde.

El Nivel 2 está aprobado. El Nivel 3 sigue siendo una propuesta: antes de modelarlo, el creador tiene que aprobarlo (ver `AGENTS.md`).
