"""Ala aerodinámica (wing) — chapa remachada de desguace con costillas y borde de ataque metálico."""
import random

from propkit.core import COL, hex_rgba, join, make_box, make_cylinder
from propkit.materials import mat_bare_metal, mat_painted_metal

KIND = "wing"
NOMINAL_DIMS = (1.10, 0.14, 0.48)  # envergadura X, grosor Y, cuerda Z (m, Y arriba)
COLLIDER_HINT = "CuboidCollider args=[0.55, 0.07, 0.24]"
SHRINK_MATS = ()
PALETTE_KEYS = ("teal", "teal_dark", "mustard", "steel", "rust", "grime")


def build(seed=7):
    rng = random.Random(seed)
    wing_paint = mat_painted_metal(
        "A_WingTeal", COL["teal"], COL["teal_dark"], 1.15, rust_amt=0.45, edge_radius=0.004
    )
    tip_paint = mat_painted_metal(
        "A_WingTip", COL["mustard"], hex_rgba("#b87e1b"), 1.0, rust_amt=0.35, edge_radius=0.004
    )
    steel = mat_bare_metal("A_WingSteel", COL["steel"], 0.32)

    parts = []
    # Cuerpo principal del ala (en Blender Z arriba -> grosor en Z, cuerda en Y, envergadura en X)
    parts.append(
        make_box("WingCore", (0.94, 0.40, 0.075), (0.0, 0.0, 0.0), wing_paint, rng.random(), (1, 0, 0), 0.006, 2)
    )
    # Punteras amarillas (wingtips) con ligero ángulo hacia arriba
    for sx in (-1, 1):
        parts.append(
            make_box(
                f"WingTip_{sx}",
                (0.14, 0.36, 0.070),
                (sx * 0.50, 0.01, 0.022),
                tip_paint,
                rng.random(),
                (1, 0, 0),
                0.005,
                2,
                rot=(0.0, -sx * 0.22, 0.0),
            )
        )

    # Borde de ataque de acero (-Y)
    parts.append(
        make_box("LeadingEdge", (0.96, 0.07, 0.082), (0.0, -0.20, 0.0), steel, rng.random(), (1, 0, 0), 0.006, 2)
    )

    # Costillas de refuerzo sobre el ala
    for dx in (-0.34, -0.17, 0.0, 0.17, 0.34):
        parts.append(
            make_box(f"Rib_{dx:.2f}", (0.026, 0.38, 0.095), (dx, 0.0, 0.0), steel, rng.random(), (0, 1, 0), 0.003, 1)
        )

    # Soporte central inferior para soldar al chasis
    parts.append(
        make_box("MountBracket", (0.18, 0.20, 0.045), (0.0, 0.0, -0.052), steel, rng.random(), (1, 0, 0), 0.003, 1)
    )
    for rx in (-0.06, 0.06):
        parts.append(
            make_cylinder(f"MountBolt_{rx:.2f}", 0.012, 0.02, 6, (rx, 0.0, -0.072), steel, 0.002, 1, False)
        )

    return join(parts, "Wing")
