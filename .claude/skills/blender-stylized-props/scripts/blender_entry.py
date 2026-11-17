"""Se ejecuta DENTRO de Blender (lo lanza make_prop.py). No llamar a mano salvo depuración:

    blender -b --factory-startup -P blender_entry.py -- --spec spec.json

spec.json (lo escribe make_prop.py):
  recipe, seed, res, dims (ancho,alto,fondo | null), pivot, palette {clave: "#hex"},
  out_dir (carpeta de variante), glb (ruta final), dry_run
"""
import importlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402

from propkit import bake as B  # noqa: E402
from propkit import core as C  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    spec = json.load(open(argv[argv.index("--spec") + 1], encoding="utf-8"))
    recipe = importlib.import_module(f"recipes.{spec['recipe']}")
    key = spec.get("key", spec["recipe"])

    C.reset_scene()
    C.set_palette(spec.get("palette"))
    obj = recipe.build(seed=spec.get("seed", 7))
    B.fit_dims(obj, recipe.NOMINAL_DIMS, spec.get("dims"))
    stats = {"recipe": spec["recipe"], "kind": recipe.KIND, "collider_hint": recipe.COLLIDER_HINT}

    if spec.get("dry_run"):
        stats.update(B.mesh_stats(obj))
        print("[PROPKIT] " + json.dumps(stats))
        return

    out = spec["out_dir"]
    B.unwrap(obj, shrink_mats=recipe.SHRINK_MATS)
    base, orm, normal = B.bake_all(obj, key, spec.get("res", 1024), os.path.join(out, "textures"))
    final = B.final_material(key, base, orm, normal)
    obj.data.materials.clear()
    obj.data.materials.append(final)
    B.strip_bake_attrs(obj)
    B.set_pivot(obj, spec.get("pivot", "center"))
    B.export_glb(obj, spec["glb"])
    B.render_previews(obj, key, os.path.join(out, "previews"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, f"{key}.blend"), relative_remap=True, compress=True)
    stats.update(B.mesh_stats(obj))
    with open(os.path.join(out, "blender_stats.json"), "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)
    print("[PROPKIT] " + json.dumps(stats))


main()
