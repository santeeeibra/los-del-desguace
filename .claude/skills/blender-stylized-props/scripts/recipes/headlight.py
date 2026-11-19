"""Faro halógeno (headlight) — carcasa industrial, lente cálida, aro metálico y soporte en U."""
import random

from propkit.core import COL, add_attrs, hex_rgba, join, lathe, make_box, make_cylinder, orient, smooth
from propkit.materials import mat_bare_metal, mat_flat, mat_painted_metal

KIND = "headlight"
NOMINAL_DIMS = (0.30, 0.34, 0.32)  # ancho X, alto Y, fondo Z (m, Y arriba)
COLLIDER_HINT = "CuboidCollider args=[0.15, 0.17, 0.16]"
SHRINK_MATS = ()
PALETTE_KEYS = ("mustard", "metal_dark", "steel", "brass", "rust", "grime")


def build(seed=7):
    rng = random.Random(seed)
    housing_paint = mat_painted_metal(
        "A_LampBody", COL["mustard"], hex_rgba("#b87e1b"), 1.0, rust_amt=0.45, edge_radius=0.004
    )
    bracket_paint = mat_painted_metal(
        "A_LampBracket", COL["metal_dark"], hex_rgba("#24282e"), 0.9, rust_amt=0.4, edge_radius=0.004
    )
    steel = mat_bare_metal("A_LampSteel", COL["steel"], 0.28)
    lens_mat = mat_flat("A_LampLens", hex_rgba("#fff0b8"), rough=0.18)

    # Carcasa cónica/cilíndrica apuntando hacia -Y (frente)
    prof = [
        (0.0, -0.10),
        (0.085, -0.10),
        (0.115, -0.06),
        (0.132, 0.02),
        (0.135, 0.085),
        (0.118, 0.092),
        (0.0, 0.092),
    ]
    body = lathe("LampHousing", prof, 24, housing_paint)
    orient(body, (0, -1, 0))
    body.location = (0.0, 0.0, 0.03)
    smooth(body, 38)
    add_attrs(body.data, rng.random(), (0, 1, 0))

    # Bisel frontal de acero
    bezel = make_cylinder("Bezel", 0.138, 0.032, 24, (0.0, -0.095, 0.03), steel, bevel=0.004, segs=1)
    orient(bezel, (0, 1, 0))
    add_attrs(bezel.data, 0.1, (0, 1, 0))

    # Lente emisiva/vidrio
    lens = make_cylinder("Lens", 0.116, 0.016, 20, (0.0, -0.106, 0.03), lens_mat, bevel=0.002, segs=1)
    orient(lens, (0, 1, 0))
    add_attrs(lens.data, 0.0, (0, 1, 0))

    parts = [body, bezel, lens]

    # Aletas traseras de refrigeración
    for dx in (-0.05, 0.0, 0.05):
        parts.append(
            make_box(f"Fin_{dx:.2f}", (0.014, 0.04, 0.10), (dx, 0.115, 0.03), steel, rng.random(), (0, 0, 1), 0.002, 1)
        )

    # Soporte en U + base
    parts.append(
        make_box("BasePlate", (0.18, 0.14, 0.026), (0.0, 0.0, -0.145), bracket_paint, rng.random(), (1, 0, 0), 0.003, 1)
    )
    for sx in (-1, 1):
        parts.append(
            make_box(
                f"Arm_{sx}", (0.024, 0.06, 0.18), (sx * 0.135, 0.0, -0.05), bracket_paint, rng.random(), (0, 0, 1), 0.003, 1
            )
        )
        bolt = make_cylinder(f"PivotBolt_{sx}", 0.018, 0.024, 6, (sx * 0.148, 0.0, 0.03), steel, 0.002, 1, False)
        orient(bolt, (1, 0, 0))
        add_attrs(bolt.data, 0.2, (1, 0, 0))
        parts.append(bolt)

    return join(parts, "Headlight")
