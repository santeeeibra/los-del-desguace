# Dirección artística y cómo escribir una receta nueva

Esto es criterio artístico; la técnica reutilizable vive en `scripts/propkit/`.

## Contrato de una receta (`scripts/recipes/<nombre>.py`)
```python
KIND = "crate"                  # GrabbableKind al que viste (no cambia física)
NOMINAL_DIMS = (0.64, 0.60, 0.64)  # ancho, alto, fondo de juego = collider actual
COLLIDER_HINT = "CuboidCollider args=[0.32, 0.30, 0.32]"
SHRINK_MATS = ("A_Core",)       # materiales casi invisibles: menos espacio UV
PALETTE_KEYS = (...)            # claves de COL que usa (para --palette)
def build(seed=7) -> bpy.types.Object   # malla unida, centrada, Z arriba
```
- Modelar en Blender Z arriba, centrado en el origen y con las medidas del collider. `--pivot bottom` se aplica después.
- Cada parte con `make_box` / `make_cylinder` / `lathe`, un material de autoría `A_*` y atributos `rand`/`axis` (los agregan los helpers). Al final, `join(parts, "Nombre")`.
- La aleatoriedad debe salir de `random.Random(seed)`. La semilla 7 reproduce lo aprobado.

## Criterios comprobados
- **Silueta primero.** Biseles reales de 3–7 mm (`bevel` 0.0035–0.007, `segs` 1 en tablas, 2 en piezas visibles), con normales endurecidas. Los detalles que cambian la silueta (rebordes, aros, tapón, esquineros, clavos) van en geometría.
- **Presupuesto para celular:** unos 3,5–5,5 k triángulos por prop de mano, 1 material y 3 texturas de 1024². Usar 512 para objetos de fondo.
- **Metal y madera bien distintos.** Pintura con metallic 0 y roughness alrededor de 0,5, que deja ver acero (metallic 1, roughness alrededor de 0,32) solo en bordes gastados (`edge_mask` + ruido) y óxido abajo. Madera mate (roughness alrededor de 0,8) con veta estirada por `axis`.
- **Ruido estilizado, no fotográfico:** escalas bajas (3–14) para tono y altas (40–48) solo como matiz. La variación por tabla queda moderada (valor 0,9–1,07 y matiz ±1,5 %).
- **Legibilidad:** suciedad en cavidades (AO 3–5 cm) y abajo; cantos aclarados en la madera. Un único gráfico diegético simple (banda de peligro, flecha estarcida) centrado en una tabla, sin cruzar juntas.
- **Paleta** de `src/config/visualConfig.ts` (teal, mostaza, latón, rojo, madera). Se sobrescribe con `--palette`.
- **Revisar los renders** `*_full` y `*_closeup` antes de entregar. Iterar a `--res 512` y cerrar a 1024.

## Errores ya resueltos (no repetir)
- Desgaste invisible: el radio de `edge_mask` tiene que parecerse a la curvatura (bidón 12 mm). El umbral de desgaste quedó en 0,52–0,60.
- Estarcido borroso o cortado: achicar el gráfico hasta que entre en una tabla. El spray va con alpha entre 0,5 y 0,88.
- `doubleSided`: el material final usa `use_backface_culling = True`.
- Exportador de Blender 5.2: la opción se llama `export_texcoords` (en plural) y las imágenes salen en WebP.
- Piezas que salen del collider (palanca del bidón, unos 2 cm): mantenerlas mínimas y anotarlas en el reporte.

## Ejemplos comprobados (seed 7, 1024 px)
| Receta | Triángulos | GLB | Materiales | Extensiones |
| --- | --- | --- | --- | --- |
| `barrel` | 3 726 | 269 KB | `M_Barrel` | EXT_texture_webp, KHR_mesh_quantization |
| `crate` | 5 260 | 467 KB | `M_Crate` | EXT_texture_webp, KHR_mesh_quantization |
