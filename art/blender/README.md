# Props estilizados — Blender

Primera mejora artística: **bidón** (`canister`) y **caja de madera** (`crate`).
Solo cambia la representación visual; colliders, pivotes, IDs, masas y agarre
siguen en `src/props/GrabbableProps.tsx` / `grabbableRegistry.ts`.

## Archivos

| Ruta | Qué es |
| --- | --- |
| `build_props.py` | Script fuente reproducible: modelado, materiales procedurales, horneado y exportación |
| `barrel.blend`, `crate.blend` | Fuentes Blender (malla final + materiales de autoría `A_*` con fake user + material horneado `M_*`) |
| `textures/*.png` | Texturas horneadas sin pérdida (baseColor sRGB, ORM = AO/rough/metal, normal tangente OpenGL) |
| `previews/*.png` | Renders de control |
| `public/models/props/barrel.glb`, `crate.glb` | Exportación para el juego (WebP + `KHR_mesh_quantization`) |

## Regenerar

```bash
blender -b --factory-startup -P art/blender/build_props.py -- all 1024
npx -y @gltf-transform/cli@4 quantize public/models/props/barrel.glb public/models/props/barrel.glb
npx -y @gltf-transform/cli@4 quantize public/models/props/crate.glb public/models/props/crate.glb
```

Probado con Blender 5.2.3 LTS (portable). `?props=legacy` en la URL muestra
las primitivas anteriores para comparar.

## Métricas (1024 px)

| Prop | Triángulos | Vértices GPU | Materiales | Texturas | GLB |
| --- | --- | --- | --- | --- | --- |
| Bidón | 3 726 | 3 395 | 1 (`M_Barrel`) | 3 × 1024² WebP | 269 KB |
| Caja | 5 260 | 7 096 | 1 (`M_Crate`) | 3 × 1024² WebP | 467 KB |

Cada tipo comparte geometría, material y texturas entre todas sus instancias
(`useGLTF` + `scene.clone()`), así que en escena hay 2 materiales y 6 texturas
para los 8 objetos.

## Procedencia y licencias

- **Recursos externos: ninguno.** Geometría y texturas se generan íntegramente
  con `build_props.py` (ruido procedural de Blender, sin imágenes, HDRI ni
  modelos de terceros). Paleta tomada de `src/config/visualConfig.ts`.
- **Blender 5.2.3** (GPL-2.0-or-later) — herramienta; lo que produce no queda
  sujeto a la GPL.
- **glTF-Transform CLI 4** (MIT, Don McCurdy) — ejecutado con `npx` solo para
  `inspect` y `quantize`; no se agregó como dependencia.
- No se instalaron `mcp-for-blender` ni `gltfjsx`: Blender se controla de forma
  headless con su propio Python, y el componente de carga es manual
  (`src/props/PropModels.tsx`).
