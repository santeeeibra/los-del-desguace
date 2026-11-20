# Resultados de verificación (ajustes de cuerpo, ropa y contorno)

Entorno: Chromium headless con render por software (SwiftShader), sin GPU. A viewport de 1000x600 el juego corre a ~3 fps; a 360x220, ~8 fps.

## Comparación de contorno en primera persona
`antes_primera_persona.png` / `despues_primera_persona.png`: laboratorio `?lab=character&set=outfits&view=firstPerson&pose=carry`, viewport 1100x600, deviceScaleFactor 2, mismo recorte (0,400,1100x200). Grosor del trazo oscuro de las manos, medido en píxeles de la imagen: ~14–16 px antes, ~7–9 px después.
`antes_manga.png` / `despues_manga.png`: mismo laboratorio, vista de frente, reposo, mismo recorte.

## Juego real (`npm run dev`, tras "Entrar al Taller")
- `npm run build`: OK (solo el aviso de chunks > 500 kB).
- Movimiento: W avanza (telemetría `px/pz` cambia, `isOnGround` true), Espacio salta. Sin errores de consola.
- Agarre: `E` junto a una caja → `carriedKind = crate`; caminar con carga funciona; `E` de nuevo la suelta (`carriedKind` vacío).
- Primera persona: `V` x3 (3ª Cerca → 3ª Amplia → 1ªP). Capturas `juego_primera_persona_*.png`.
- **Pendiente de revisión visual:** en primera persona con la caja cargada, la caja ocupa la parte baja de la pantalla y tapa las manos (`juego_primera_persona_con_caja.png`). No hay línea base para saber si es el diseño previsto. No se modificó.
- **Causa sin confirmar:** a bajo fps (3 fps) el personaje rebotaba (py 0.65↔1.0); a 8 fps quedó estable en 0.861. Es compatible con el render por software, pero no se verificó. Repetir con GPU real (PC/iPhone) antes de descartar un problema de código.

## No probado
- iPhone 11 real (táctil, rendimiento, contorno en pantalla chica, atuendos en movimiento).
- Fluidez real a 60 fps y con GPU.
