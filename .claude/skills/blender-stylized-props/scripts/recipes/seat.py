"""Asiento de piloto (seat) — butaca de desguace con estructura tubular y tapizado gastado."""
import random

from propkit.core import COL, hex_rgba, join, make_box, make_cylinder
from propkit.materials import mat_bare_metal, mat_painted_metal

KIND = "seat"
NOMINAL_DIMS = (0.50, 0.62, 0.52)  # ancho X, alto Y, fondo Z (m, Y arriba)
COLLIDER_HINT = "CuboidCollider args=[0.25, 0.31, 0.26]"
SHRINK_MATS = ()
PALETTE_KEYS = ("red", "metal_dark", "steel", "rust", "grime")


def build(seed=7):
    rng = random.Random(seed)
    fabric = mat_painted_metal(
        "A_SeatFabric", COL["red"], hex_rgba("#8e3522"), 0.85, rust_amt=0.15, paint_rough=0.78, edge_radius=0.005
    )
    frame = mat_painted_metal(
        "A_SeatFrame", COL["metal_dark"], hex_rgba("#24282e"), 1.0, rust_amt=0.45, edge_radius=0.004
    )
    steel = mat_bare_metal("A_SeatSteel", COL["steel"], 0.32)

    parts = []

    # Rieles inferiores de montaje
    for sx in (-1, 1):
        parts.append(
            make_box(f"Rail_{sx}", (0.045, 0.42, 0.045), (sx * 0.16, 0.0, -0.275), steel, rng.random(), (0, 1, 0), 0.004, 1)
        )

    # Base del asiento (cojín principal + refuerzos laterales)
    parts.append(
        make_box("Cushion", (0.38, 0.40, 0.095), (0.0, -0.02, -0.19), fabric, rng.random(), (1, 0, 0), 0.012, 2)
    )
    for sx in (-1, 1):
        parts.append(
            make_box(
                f"SideBolster_{sx}",
                (0.075, 0.38, 0.13),
                (sx * 0.205, -0.02, -0.16),
                fabric,
                rng.random(),
                (0, 1, 0),
                0.010,
                2,
                rot=(0.0, sx * 0.18, 0.0),
            )
        )

    # Respaldo inclinado hacia +Y (atrás) con soporte metálico trasero
    parts.append(
        make_box(
            "Backrest",
            (0.38, 0.095, 0.42),
            (0.0, 0.165, 0.04),
            fabric,
            rng.random(),
            (0, 0, 1),
            0.012,
            2,
            rot=(-0.18, 0.0, 0.0),
        )
    )
    parts.append(
        make_box(
            "BackPlate",
            (0.32, 0.035, 0.36),
            (0.0, 0.215, 0.03),
            frame,
            rng.random(),
            (0, 0, 1),
            0.004,
            1,
            rot=(-0.18, 0.0, 0.0),
        )
    )

    # Apoyacabezas
    parts.append(
        make_box(
            "Headrest",
            (0.22, 0.085, 0.13),
            (0.0, 0.215, 0.255),
            fabric,
            rng.random(),
            (1, 0, 0),
            0.010,
            2,
            rot=(-0.14, 0.0, 0.0),
        )
    )
    for sx in (-1, 1):
        parts.append(
            make_cylinder(f"Post_{sx}", 0.014, 0.08, 8, (sx * 0.06, 0.195, 0.21), steel, 0.002, 1, False)
        )

    return join(parts, "Seat")
