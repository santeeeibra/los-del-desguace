---
name: blender-stylized-props
description: Crear o variar props estilizados de Los del Desguace en Blender (modelado, materiales procedurales, horneado glTF, exportación GLB optimizada, renders y reporte) sin tocar física ni recursos aprobados. Usar para "hacer un objeto en Blender", "nueva variante de bidón/caja", "mejorar el aspecto de un prop".
---

# Props estilizados con Blender

Procedimiento comprobado con el bidón y la caja (`art/blender/build_props.py`, aprobados).

## Reglas
- Si Blender no aparece, informarlo y parar. No sustituir por primitivas Three.js.
- Solo apariencia. Colliders, masa, pivote lógico, IDs y agarre siguen en `src/props/` y no se tocan.
- Nunca sobrescribir: cada ejecución crea una variante nueva. Los GLB aprobados (`public/models/props/*.glb`) y `art/blender/` son solo lectura.
- Mientras otro agente (p. ej. Hydrogen) trabaje, no editar archivos compartidos (`src/`, `package.json`, configs). Entregar la variante y proponer la integración por separado.
- Sin baterías de pruebas: `--dry-run` + revisar renders alcanza.

## Uso
```bash
python .claude/skills/blender-stylized-props/scripts/make_prop.py --find-blender
python .claude/skills/blender-stylized-props/scripts/make_prop.py --recipe barrel --dry-run
python .claude/skills/blender-stylized-props/scripts/make_prop.py --recipe crate --seed 21 --res 1024
```
Opciones: `--variant`, `--seed` (7 = aprobada), `--res 256|512|1024|2048`,
`--dims ancho,alto,fondo` (m, Y arriba), `--pivot center|bottom`,
`--palette paleta.json`, `--blender RUTA`, `--no-quantize`, `--report archivo.glb`.

Blender se busca en: `--blender`, `BLENDER_PATH`, `config.local.json`
(`blender` o `search_roots`; copiar de `config.example.json`, excluido de git),
`PATH` y rutas estándar de Windows/macOS/Linux.

## Estado de verificación
Pasó: compilación de sintaxis, `--find-blender`, `--dry-run` de `barrel` y `crate`
(3 726 y 5 260 triángulos, iguales a los aprobados) y `--report` sobre los GLB aprobados.
**Pendiente:** el proceso completo (horneado, exportación, cuantización y reporte) todavía no
se ejecutó desde la skill; solo desde `art/blender/build_props.py`, de donde se extrajo.

## Salidas por variante
- `art/props/<receta>/<vNNN>/`: `<receta>.blend`, `textures/*.png`, `previews/*_full.png|*_closeup.png`, `spec.json`, `report.json`, `report.md`.
- `public/models/props/variants/<receta>-<vNNN>.glb`: WebP + `KHR_mesh_quantization`, 1 material, una sola cara.
- El reporte lista bytes, triángulos, materiales, texturas y extensiones glTF.

## Estructura
- `scripts/propkit/`: **reutilizable**.
  - `core`: escena, mallas, `lathe`, biseles, nodos y paleta.
  - `materials`: pintura gastada, metal desnudo, madera con estarcido.
  - `bake`: UV, horneado baseColor/ORM/normal, material glTF, export, previews y métricas.
- `scripts/recipes/`: **recetas artísticas** (`barrel.py`, `crate.py`). Para un objeto nuevo, copiar una receta y seguir `ART_DIRECTION.md`.
- `scripts/make_prop.py`: CLI (variantes, detección de Blender, cuantización y reporte). `blender_entry.py` corre dentro de Blender.

## Integrar (solo con permiso y fuera del trabajo de otros)
Apuntar `src/props/propModelConfig.ts` al GLB elegido. `PropModel` lo clona compartiendo material y texturas. `?props=legacy` compara con las primitivas.
