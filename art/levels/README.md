# Arte 3D de Niveles de Invento — Blender

Arte visual de los niveles de expedición (ver `docs/PEDIDO_ANTIGRAVITY_NIVELES.md`).
Cada `.glb` aporta únicamente la malla visual y los empties de referencia en coordenadas locales del nivel (`+Z` hacia la meta, `+Y` arriba, origen en `origin`); todos los colliders, checkpoints, física y lógica permanecen en `src/environment/ExpeditionLevels.tsx` y `src/modes/expeditionLevels.ts`.
`src/environment/LevelArt.tsx` detecta automáticamente cada `.glb` en `public/models/levels/` y oculta el greybox de prueba.

---

## Archivos entregados

### Nivel 1 — El Puente del Abismo

| Ruta | Descripción |
| --- | --- |
| `art/levels/build_level1_puente.py` | Script fuente reproducible de Blender 5.2.3 LTS (texturas procedurales, modelado, UVs, empties, exportación WebP y 5 renders de control) |
| `art/levels/level-1-puente.blend` | Escena fuente Blender con los 8 materiales empaquetados y los 6 empties |
| `art/levels/textures/lvl1_*.png` | 6 texturas procedurales 512×512 px sin pérdida |
| `art/levels/previews/level1_*.png` | 5 renders EEVEE de control (bahía, aérea, abismo/senda a pie, faro de meta y vista del taller) |
| `public/models/levels/level-1-puente.glb` | Modelo final optimizado para juego (WebP + `KHR_mesh_quantization`) |

### Nivel 2 — El Callejón de los Autos

| Ruta | Descripción |
| --- | --- |
| `art/levels/build_level2_callejon.py` | Script fuente reproducible de Blender 5.2.3 LTS (texturas procedurales 1024 px del escenario y 512 px de autos, modelado, UVs, 8 empties, exportación WebP y 6 renders de control) |
| `art/levels/level-2-autos.blend` | Escena fuente del escenario con los 8 materiales empaquetados y los 8 empties (sin autos) |
| `art/levels/cars-pack.blend` | Escena fuente con los 4 modelos de autos, 4 variantes débiles (`X` amarilla) y 4 juegos de 4 trozos |
| `art/levels/textures/lvl2_*.png` | 6 texturas procedurales 1024×1024 px del escenario + 8 atlas 512×512 px de autos (`car_*.png`, `car_weak_*.png`) |
| `art/levels/previews/level2_*.png` | 6 renders EEVEE de control (desde la bahía, aéreo, barrera A liviana, barrera B pesada, portón con tuerca luminosa y catálogo de autos) |
| `public/models/levels/level-2-autos.glb` | Escenario final optimizado para juego — **solo escenario + 8 empties, sin autos adentro** (WebP + `KHR_mesh_quantization`) |
| `public/models/levels/cars/car-{sedan,van,pickup,wagon}.glb` | 4 carrocerías enteras (`4.20 × 1.48 × 1.86 m`, origen al centro, 1 material, 512 px WebP) |
| `public/models/levels/cars/car-weak-{sedan,van,pickup,wagon}.glb` | 4 variantes débiles con `X` grande de pintura amarilla visible en laterales y techo |
| `public/models/levels/cars/car-chunks-{sedan,van,pickup,wagon}.glb` | 4 paquetes de trozos (`roof`, `hood`, `door`, `chassis`), cada uno centrado en su propio origen `(0, 0, 0)` |

---

## Cómo regenerar Nivel 1 y Nivel 2

### Nivel 1

```powershell
& "D:\pep-opus55-60s\herramientas\blender-5.2.3-windows-x64\blender.exe" -b --factory-startup -P art/levels/build_level1_puente.py
npx -y @gltf-transform/cli@4 quantize public/models/levels/level-1-puente.glb public/models/levels/level-1-puente.glb
npx -y @gltf-transform/cli@4 inspect public/models/levels/level-1-puente.glb
```

### Nivel 2 (escenario + 12 GLBs de autos)

```powershell
& "D:\pep-opus55-60s\herramientas\blender-5.2.3-windows-x64\blender.exe" -b --factory-startup -P art/levels/build_level2_callejon.py
npx -y @gltf-transform/cli@4 quantize public/models/levels/level-2-autos.glb public/models/levels/level-2-autos.glb
Get-ChildItem public/models/levels/cars/*.glb | ForEach-Object { npx -y @gltf-transform/cli@4 quantize $_.FullName $_.FullName }
npx -y @gltf-transform/cli@4 inspect public/models/levels/level-2-autos.glb
```

Probado con **Blender 5.2.3 LTS** y **glTF-Transform CLI 4.5.1**.

---

## Métricas reales — Nivel 1 (`level-1-puente.glb`)

| Métrica | Real | Presupuesto pedido | Estado |
| --- | --- | --- | --- |
| Triángulos totales | **9 292** | ≤ 60 000 | ✅ (15 % del límite) |
| Vértices GPU (`uploadVertexCount`) | **20 344** | — | ✅ |
| Mallas / Draw calls | **8** | — | ✅ |
| Materiales | **8** | ≤ 8 | ✅ |
| Texturas embebidas | **6 × 512² WebP** (`2.8–30 KB` c/u, `8.4 MB` VRAM) | ≤ 1024 px WebP | ✅ |
| Peso `.glb` cuantizado | **613.89 KB** | ≤ 6 MB | ✅ (10 % del límite) |
| Luces / Cámaras en `.glb` | **0 / 0** | 0 | ✅ |
| Extensiones glTF | `EXT_texture_webp`, `KHR_materials_emissive_strength`, `KHR_mesh_quantization` | WebP + quantization | ✅ |

### Empties verificados (coordenadas locales Three.js Y-up)

| Empty | Coordenada exportada `[x, y, z]` | Referencia `expeditionLevels.ts` |
| --- | --- | --- |
| `spawn` | `[0, 1.8, 4]` | `spawnLocal: [0, 1.8, 4]` |
| `bay` | `[0, 0, 6]` | `bayLocal: [0, 0, 6]` |
| `checkpoint_1` | `[0, 1.8, 46]` | `checkpointsLocal[0]: [0, 1.8, 46]` |
| `checkpoint_2` | `[0, 1.8, 84]` | `checkpointsLocal[1]: [0, 1.8, 84]` |
| `goal` | `[0, 1.6, 96]` | `goalLocal: [0, 1.6, 96]` |
| `golden_nut` | `[0, -10.2, 46]` | `goldenNutLocal: [0, -10.2, 46]` |

---

## Métricas reales — Nivel 2 (`level-2-autos.glb`)

| Métrica | Real | Presupuesto pedido | Estado |
| --- | --- | --- | --- |
| Triángulos totales | **8 112** | ≤ 60 000 | ✅ (13.5 % del límite) |
| Vértices GPU (`uploadVertexCount`) | **16 994** | — | ✅ |
| Mallas / Draw calls | **8** | — | ✅ |
| Materiales | **8** | ≤ 8 | ✅ |
| Texturas embebidas | **6 × 1024² WebP** (`5.9–59.5 KB` c/u, `33.5 MB` VRAM) | ≤ 1024 px WebP | ✅ |
| Peso `.glb` cuantizado | **574.33 KB** (`710.24 KB` pre-quantize) | ≤ 6 MB | ✅ (9.6 % del límite) |
| Luces / Cámaras en `.glb` | **0 / 0** | 0 | ✅ |
| Autos dentro del escenario | **0** (tramos `z=33..41` y `z=60..70` despejados) | 0 | ✅ |
| Extensiones glTF | `EXT_texture_webp`, `KHR_materials_emissive_strength`, `KHR_mesh_quantization` | WebP + quantization | ✅ |

### Empties verificados — Nivel 2 (coordenadas locales Three.js Y-up)

| Empty | Coordenada exportada `[x, y, z]` | Referencia pedido |
| --- | --- | --- |
| `spawn` | `[0, 1.8, 4]` | `(0, 1.8, 4)` |
| `bay` | `[0, 0, 6]` | `(0, 0, 6)` |
| `checkpoint_1` | `[0, 1.8, 50]` | `(0, 1.8, 50)` |
| `checkpoint_2` | `[0, 1.8, 80]` | `(0, 1.8, 80)` |
| `goal` | `[0, 1.6, 96]` | `(0, 1.6, 96)` |
| `golden_nut` | `[-9.5, 7.2, 90]` | `(-9.5, 7.2, 90)` |
| `barrier_a_origin` | `[0, 0, 37]` | `(0, 0, 37)` |
| `barrier_b_origin` | `[0, 0, 65]` | `(0, 0, 65)` |

### Métricas reales — Autos modulares (`public/models/levels/cars/*.glb`)

Presupuesto por auto: ≤ 1 500 triángulos, 1 material, textura 512×512 WebP, caja `4.2 × 1.5 × 1.9 m` centrada en `(0, 0, 0)`, 0 luces y 0 cámaras.

| Archivo | Triángulos | Peso `.glb` (cuant.) | Materiales / Textura | Bounding box `[x × y × z]` / Nodos |
| --- | --- | --- | --- | --- |
| `car-sedan.glb` | **528** | **29.73 KB** | 1 / 512² WebP | `4.20 × 1.48 × 1.86 m`, centro `(0, 0, 0)` |
| `car-van.glb` | **528** | **30.30 KB** | 1 / 512² WebP | `4.20 × 1.48 × 1.86 m`, centro `(0, 0, 0)` |
| `car-pickup.glb` | **572** | **33.96 KB** | 1 / 512² WebP | `4.20 × 1.48 × 1.86 m`, centro `(0, 0, 0)` |
| `car-wagon.glb` | **528** | **30.70 KB** | 1 / 512² WebP | `4.20 × 1.48 × 1.86 m`, centro `(0, 0, 0)` |
| `car-weak-sedan.glb` | **528** | **34.24 KB** | 1 / 512² WebP (`X` amarilla) | `4.20 × 1.48 × 1.86 m`, centro `(0, 0, 0)` |
| `car-weak-van.glb` | **528** | **35.16 KB** | 1 / 512² WebP (`X` amarilla) | `4.20 × 1.48 × 1.86 m`, centro `(0, 0, 0)` |
| `car-weak-pickup.glb` | **572** | **37.92 KB** | 1 / 512² WebP (`X` amarilla) | `4.20 × 1.48 × 1.86 m`, centro `(0, 0, 0)` |
| `car-weak-wagon.glb` | **528** | **36.75 KB** | 1 / 512² WebP (`X` amarilla) | `4.20 × 1.48 × 1.86 m`, centro `(0, 0, 0)` |
| `car-chunks-sedan.glb` | **220** | **14.88 KB** | 1 / 512² WebP | 4 nodos: `roof`, `hood`, `door`, `chassis` (c/u en `(0,0,0)`) |
| `car-chunks-van.glb` | **308** | **20.73 KB** | 1 / 512² WebP | 4 nodos: `roof`, `hood`, `door`, `chassis` (c/u en `(0,0,0)`) |
| `car-chunks-pickup.glb` | **220** | **16.90 KB** | 1 / 512² WebP | 4 nodos: `roof`, `hood`, `door`, `chassis` (c/u en `(0,0,0)`) |
| `car-chunks-wagon.glb` | **308** | **21.14 KB** | 1 / 512² WebP | 4 nodos: `roof`, `hood`, `door`, `chassis` (c/u en `(0,0,0)`) |

*(50 autos instanciados simultáneamente en iPhone 11 suman ~27 000 triángulos totales — muy por debajo del presupuesto móvil.)*

---

## Estado de Nivel 3

Según `docs/PEDIDO_ANTIGRAVITY_NIVELES.md` y `AGENTS.md`, **Nivel 3 (*Helicóptero con imán*)** sigue pendiente de aprobación explícita del creador antes de modelar `level-3-olla.glb`.

---

## Procedencia

- **Recursos externos: ninguno.** Toda la geometría y las texturas procedurales de Nivel 1 y Nivel 2 (escenario + autos) se generan íntegramente desde `art/levels/build_level1_puente.py` y `art/levels/build_level2_callejon.py` (sin imágenes ni mallas de terceros).
