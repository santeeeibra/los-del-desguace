# Herramientas (GLB)

Modelos hechos en Blender 5.2 (proyecto 3D Jutsu de Higgsfield, revisión 6) y separados por herramienta.
Origen del modelo: soldadora y amoladora en el centro de la empuñadura; tronzadora en el centro de la base, apoyada en y=0.
Ejes (glTF): Y arriba, +Z hacia adelante (boquilla de la soldadora, disco de la amoladora, frente de la tronzadora hacia -Z).

| Archivo | Piezas | Triángulos | Tamaño aprox. (m) |
|---|---|---|---|
| `welder.glb`  | 13 (`WELD_*`)  | 3 808 | 0.07 x 0.31 x 0.52 |
| `grinder.glb` | 17 (`GRIND_*`) | 4 824 | 0.20 x 0.14 x 0.39 |
| `chopsaw.glb` | 32 (`CUT_*`)   | 8 036 | 0.50 x 0.40 x 0.46 |

Solo apariencia: colisiones, masa y lógica van en `src/`. La punta de la soldadora (`WELD_tip_glow`) tiene material emisivo.
Sin integrar todavía en el juego.
