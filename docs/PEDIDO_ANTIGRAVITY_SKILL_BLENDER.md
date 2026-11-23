# Pedido para Antigravity: usar la skill `blender-stylized-props`

Los primeros modelos (bidón, caja, los 10 props de piezas locas y las herramientas) se ven bien porque siguen una dirección artística concreta. El kit de entorno de 50 piezas (`art/blender/build_env_kit_50.py`) y los autos se hicieron con los ayudantes viejos a 512 px: formas de caja y una textura de manchas que parece camuflaje en vez de óxido. Hay que pasar los modelos nuevos por la skill.

## Dónde está
- Instrucciones: `.claude/skills/blender-stylized-props/SKILL.md`
- Criterio artístico (leer completo antes de modelar): `.claude/skills/blender-stylized-props/ART_DIRECTION.md`
- Técnica reutilizable: `.claude/skills/blender-stylized-props/scripts/propkit/` (`core`, `materials`, `bake`)
- Recetas de ejemplo para copiar: `.claude/skills/blender-stylized-props/scripts/recipes/` (`barrel.py`, `crate.py`, `wheel.py`, `chassis.py`, etc.)
- CLI: `.claude/skills/blender-stylized-props/scripts/make_prop.py`

## Cómo trabajar
1. Copiar una receta parecida a `scripts/recipes/<nombre>.py` y adaptarla (contrato `KIND`, `NOMINAL_DIMS`, `build(seed)`).
2. Probar con `--dry-run` y mirar los renders `*_full` y `*_closeup`.
3. Cerrar con `--res 1024` para piezas que se ven de cerca (autos, container, barriles). Usar `--res 512` solo para fondo lejano.
   ```bash
   python .claude/skills/blender-stylized-props/scripts/make_prop.py --recipe <nombre> --seed 7 --res 1024
   ```
4. Cada ejecución crea una variante nueva (`art/props/<receta>/vNNN/` y `public/models/props/variants/<receta>-vNNN.glb`). No sobrescribir GLB aprobados.

## Criterios que no se pueden saltear
- **Silueta primero:** biseles reales de 3 a 7 mm y geometría para lo que cambia la silueta (guardabarros, nervaduras, ventanas, rebordes, esquineros).
- **Material:** pintura con desgaste solo en bordes, óxido abajo, suciedad en cavidades. Madera mate con veta. Metal y madera claramente distintos.
- **Nada de manchas procedurales grandes** como único detalle.
- **Presupuesto:** unos 3,5 a 5,5 mil triángulos por prop de mano, 1 material, texturas WebP. Cuidar el peso en iPhone 11.
- **Paleta** de `src/config/visualConfig.ts`.

## Límites
- Solo apariencia. No tocar colliders, masas, pivotes lógicos ni nada de `src/`.
- Avisar si el flujo completo de la skill (horneado, exportación, cuantización, reporte) falla. Todavía no se probó de punta a punta desde `make_prop.py`.

## Prioridad sugerida
1. Autos (sedán, pickup, van, auto oxidado): están en trabajo.
2. Container (rojo abierto, corto, oxidado) y barriles agrupados.
3. Pila de chatarra, neumáticos, banco de taller.
