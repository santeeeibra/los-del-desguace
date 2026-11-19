"""Soporte de carga (cargo_rack) — canasta tubular redondeada con piso de madera cálida."""
import random

from propkit.core import COL, add_attrs, hex_rgba, join, make_box, make_cylinder, orient
from propkit.materials import mat_bare_metal, mat_painted_metal, mat_wood

KIND = "cargoRack"
NOMINAL_DIMS = (0.90, 0.24, 0.70)  # ancho X, alto Y, fondo Z (m, Y arriba)
COLLIDER_HINT = "CuboidCollider args=[0.45, 0.12, 0.35]"
SHRINK_MATS = ()
PALETTE_KEYS = ("mustard", "wood_a", "wood_b", "wood_edge", "steel", "grime")


def build(seed=7):
    rng = random.Random(seed)
    rails = mat_painted_metal("A_RackYellow", COL["mustard"], hex_rgba("#c48418"), 0.9, rust_amt=0.3, edge_radius=0.007)
    wood = mat_wood("A_RackWood")
    steel = mat_bare_metal("A_RackSteel", COL["steel"], 0.34)

    parts = []
    # Listones de madera redondeados en la base
    for i, dy in enumerate((-0.22, -0.075, 0.075, 0.22)):
        parts.append(
            make_box(f"Plank_{i}", (0.82, 0.125, 0.042), (0.0, dy, -0.075), wood, rng.random(), (1, 0, 0), 0.010, 2)
        )

    # Marco tubular lateral y trasero redondeado
    for sx in (-1, 1):
        side = make_cylinder(f"SideBar_{sx}", 0.026, 0.66, 12, (sx * 0.42, 0.0, 0.055), rails, bevel=0.006, segs=2)
        orient(side, (0, 1, 0))
        add_attrs(side.data, rng.random(), (0, 1, 0))
        parts.append(side)
        for sy in (-1, 1):
            post = make_cylinder(f"Post_{sx}_{sy}", 0.028, 0.16, 12, (sx * 0.42, sy * 0.31, -0.01), steel, bevel=0.005, segs=2)
            parts.append(post)

    back = make_cylinder("BackBar", 0.026, 0.86, 12, (0.0, 0.31, 0.055), rails, bevel=0.006, segs=2)
    orient(back, (1, 0, 0))
    add_attrs(back.data, 0.2, (1, 0, 0))
    parts.append(back)

    return join(parts, "CargoRack")
