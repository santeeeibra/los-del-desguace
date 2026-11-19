"""Llave inglesa estilizada (wrench) — acero forjado, boca fija, corona regulable con latón y mango rojo."""
import random

from propkit.core import COL, add_attrs, hex_rgba, join, make_box, make_cylinder, orient
from propkit.materials import mat_bare_metal, mat_painted_metal

KIND = "wrench"
NOMINAL_DIMS = (0.16, 0.56, 0.05)  # ancho X, largo Y (alto), grosor Z (m, Y arriba)
COLLIDER_HINT = "CuboidCollider args=[0.08, 0.28, 0.025]"
SHRINK_MATS = ()
PALETTE_KEYS = ("steel", "brass", "red", "metal_dark", "grime")


def build(seed=7):
    rng = random.Random(seed)
    steel = mat_bare_metal("A_WrenchSteel", COL["steel"], 0.28, wear_tint=0.30)
    brass = mat_bare_metal("A_WrenchBrass", COL["brass"], 0.26)
    grip = mat_painted_metal(
        "A_WrenchGrip", COL["red"], hex_rgba("#9c3224"), 0.85, rust_amt=0.15, paint_rough=0.65, edge_radius=0.004
    )

    parts = []

    # Mango central de acero forjado (en Blender Z arriba = largo de la llave)
    parts.append(make_box("Shaft", (0.044, 0.022, 0.34), (0.0, 0.0, -0.02), steel, rng.random(), (0, 0, 1), 0.004, 2))
    # Funda roja antideslizante en la zona de agarre
    parts.append(make_box("GripSleeve", (0.054, 0.030, 0.19), (0.0, 0.0, -0.10), grip, rng.random(), (0, 0, 1), 0.005, 2))

    # Pomo / ojal inferior
    ring_bot = make_cylinder("BottomRing", 0.036, 0.024, 16, (0.0, 0.0, -0.245), steel, 0.003, 1, True)
    orient(ring_bot, (0, 1, 0))
    add_attrs(ring_bot.data, 0.1, (0, 1, 0))
    parts.append(ring_bot)

    # Cabeza superior de llave inglesa (base + 2 mordazas formando la boca en U)
    parts.append(make_box("HeadBase", (0.115, 0.028, 0.075), (0.0, 0.0, 0.175), steel, rng.random(), (1, 0, 0), 0.005, 2))
    parts.append(
        make_box(
            "JawLeft", (0.040, 0.026, 0.088), (-0.042, 0.0, 0.235), steel, rng.random(), (0, 0, 1), 0.004, 2, rot=(0, -0.15, 0)
        )
    )
    parts.append(
        make_box(
            "JawRight", (0.036, 0.026, 0.082), (0.044, 0.0, 0.232), steel, rng.random(), (0, 0, 1), 0.004, 2, rot=(0, 0.15, 0)
        )
    )

    # Tornillo sinfín de latón en la cabeza
    worm = make_cylinder("WormGear", 0.016, 0.044, 12, (0.0, 0.0, 0.165), brass, 0.002, 1, True)
    orient(worm, (1, 0, 0))
    add_attrs(worm.data, 0.2, (1, 0, 0))
    parts.append(worm)

    return join(parts, "Wrench")
