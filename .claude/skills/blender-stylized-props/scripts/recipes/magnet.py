"""Electroimán (magnet) — herradura industrial redondeada con bobina de cobre y polos de acero."""
import math
import random

from propkit.core import COL, add_attrs, hex_rgba, join, make_box, make_cylinder, orient
from propkit.materials import mat_bare_metal, mat_painted_metal

KIND = "magnet"
NOMINAL_DIMS = (0.44, 0.32, 0.44)
COLLIDER_HINT = "CuboidCollider args=[0.22, 0.16, 0.22]"
SHRINK_MATS = ()
PALETTE_KEYS = ("red", "steel", "brass", "metal_dark", "grime")


def build(seed=7):
    rng = random.Random(seed)
    red = mat_painted_metal("A_MagnetRed", COL["red"], hex_rgba("#9c3224"), 0.95, rust_amt=0.3, edge_radius=0.008)
    steel = mat_bare_metal("A_MagnetSteel", COL["steel"], 0.28)
    copper = mat_bare_metal("A_MagnetCopper", hex_rgba("#c96f3b"), 0.30)

    parts = []
    # Base redondeada + núcleo bobina de cobre
    parts.append(make_box("Base", (0.38, 0.38, 0.12), (0.0, 0.0, -0.09), red, rng.random(), (1, 0, 0), 0.032, 3))
    parts.append(make_cylinder("Coil", 0.145, 0.12, 24, (0.0, 0.0, 0.02), copper, bevel=0.012, segs=2))
    # Anillos de acero arriba del electroimán
    parts.append(make_cylinder("TopPlate", 0.17, 0.045, 24, (0.0, 0.0, 0.10), steel, bevel=0.008, segs=2))
    # Polos laterales redondeados
    for sx in (-1, 1):
        parts.append(make_cylinder(f"Pole_{sx}", 0.055, 0.18, 14, (sx * 0.14, 0.0, 0.03), red, bevel=0.012, segs=2))
    return join(parts, "Magnet")
