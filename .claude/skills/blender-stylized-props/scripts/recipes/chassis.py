"""Chasis tubular redondeado (chassis) — plataforma con defensas tubulares, paragolpes y ganchos."""
import math
import random

from propkit.core import COL, add_attrs, hex_rgba, join, make_box, make_cylinder, orient
from propkit.materials import mat_bare_metal, mat_painted_metal

KIND = "chassis"
NOMINAL_DIMS = (1.26, 0.18, 2.18)  # ancho X, alto Y, largo Z (m, Y arriba)
COLLIDER_HINT = "CuboidCollider args=[0.63, 0.09, 1.09]"
SHRINK_MATS = ()
PALETTE_KEYS = ("metal_dark", "mustard", "teal", "steel", "rust", "grime")


def build(seed=7):
    rng = random.Random(seed)
    deck = mat_painted_metal("A_ChassisDeck", COL["metal_dark"], hex_rgba("#24282e"), 1.05, rust_amt=0.4, edge_radius=0.008)
    rails = mat_painted_metal("A_ChassisYellow", COL["mustard"], hex_rgba("#c48418"), 0.95, rust_amt=0.3, edge_radius=0.008)
    cross = mat_painted_metal("A_ChassisTeal", COL["teal"], COL["teal_dark"], 1.0, rust_amt=0.35, edge_radius=0.006)
    steel = mat_bare_metal("A_ChassisSteel", COL["steel"], 0.32)

    parts = []
    # Plataforma central bien biselada (en Blender Y = largo, X = ancho, Z = alto)
    parts.append(make_box("Deck", (0.94, 1.88, 0.095), (0.0, 0.0, 0.0), deck, rng.random(), (0, 1, 0), 0.018, 2))

    # Tubos laterales redondeados (bumpers laterales amarillos)
    for sx in (-1, 1):
        rail = make_cylinder(f"SideRail_{sx}", 0.058, 1.88, 14, (sx * 0.51, 0.0, 0.01), rails, bevel=0.008, segs=2)
        orient(rail, (0, 1, 0))
        add_attrs(rail.data, rng.random(), (0, 1, 0))
        parts.append(rail)

    # Paragolpes delantero (+Y) y trasero (-Y) redondeados
    for sy in (-1, 1):
        bumper = make_cylinder(f"Bumper_{sy}", 0.052, 1.12, 14, (0.0, sy * 0.96, -0.01), cross, bevel=0.010, segs=2)
        orient(bumper, (1, 0, 0))
        add_attrs(bumper.data, rng.random(), (1, 0, 0))
        parts.append(bumper)
        # Esquinas redondeadas conectando tubos
        for sx in (-1, 1):
            cap = make_cylinder(f"Corner_{sx}_{sy}", 0.058, 0.14, 12, (sx * 0.51, sy * 0.94, 0.0), rails, bevel=0.012, segs=2)
            parts.append(cap)
            # Perno de eje / gancho
            bolt = make_cylinder(f"AxleHub_{sx}_{sy}", 0.036, 0.08, 10, (sx * 0.56, sy * 0.65, -0.02), steel, bevel=0.004, segs=1)
            orient(bolt, (1, 0, 0))
            add_attrs(bolt.data, 0.2, (1, 0, 0))
            parts.append(bolt)

    # Traviesas superiores suaves
    for dy in (-0.52, 0.0, 0.52):
        parts.append(make_box(f"Rib_{dy:.2f}", (0.88, 0.10, 0.032), (0.0, dy, 0.052), steel, rng.random(), (1, 0, 0), 0.008, 2))

    return join(parts, "Chassis")
