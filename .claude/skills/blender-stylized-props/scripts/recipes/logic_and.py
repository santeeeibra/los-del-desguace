"""Puerta lógica AND (logicAnd) — módulo teal redondeado con 2 bornes de entrada y 1 de salida."""
import random

from propkit.core import COL, add_attrs, hex_rgba, join, make_box, make_cylinder, orient
from propkit.materials import mat_bare_metal, mat_painted_metal

KIND = "logicAnd"
NOMINAL_DIMS = (0.36, 0.28, 0.36)
COLLIDER_HINT = "CuboidCollider args=[0.18, 0.14, 0.18]"
SHRINK_MATS = ()
PALETTE_KEYS = ("teal", "teal_dark", "brass", "steel", "grime")


def build(seed=7):
    rng = random.Random(seed)
    shell = mat_painted_metal("A_AndShell", COL["teal"], COL["teal_dark"], 0.9, rust_amt=0.25, edge_radius=0.008)
    brass = mat_bare_metal("A_AndBrass", COL["brass"], 0.28)
    copper = mat_bare_metal("A_AndCopper", hex_rgba("#c96f3b"), 0.30)

    parts = []
    parts.append(make_box("Shell", (0.33, 0.33, 0.17), (0.0, 0.0, -0.03), shell, rng.random(), (1, 0, 0), 0.038, 3))
    # 2 cúpulas de entrada (latón) y 1 cúpula de salida (cobre)
    for sx in (-1, 1):
        parts.append(make_cylinder(f"InPin_{sx}", 0.042, 0.055, 16, (sx * 0.08, -0.06, 0.075), brass, bevel=0.008, segs=2))
    parts.append(make_cylinder("OutPin", 0.052, 0.065, 18, (0.0, 0.075, 0.08), copper, bevel=0.010, segs=2))
    return join(parts, "LogicAnd")
