"""Batería industrial (part) — carcasa reforzada, tapa oscura, bornes y placa metálica."""
import random

from propkit.core import COL, hex_rgba, join, make_box, make_cylinder
from propkit.materials import mat_bare_metal, mat_painted_metal

KIND = "part"
NOMINAL_DIMS = (0.54, 0.46, 0.46)  # ancho, alto, fondo de juego (Y arriba), m
COLLIDER_HINT = "CuboidCollider args=[0.27, 0.23, 0.23]"
SHRINK_MATS = ()
PALETTE_KEYS = ("red", "metal_dark", "steel", "brass", "rust", "grime")


def build(seed=7):
    rng = random.Random(seed)
    body_paint = mat_painted_metal(
        "A_BatteryRed", COL["red"], hex_rgba("#9c3224"), 1.05, rust_amt=0.45, edge_radius=0.005
    )
    lid_paint = mat_painted_metal(
        "A_BatteryLid", COL["metal_dark"], hex_rgba("#272a30"), 0.85, rust_amt=0.35, edge_radius=0.004
    )
    steel = mat_bare_metal("A_BatterySteel", COL["steel"], 0.30)
    brass = mat_bare_metal("A_BatteryBrass", COL["brass"], 0.28)
    copper = mat_bare_metal("A_BatteryCopper", hex_rgba("#c96f3b"), 0.32)

    parts = []

    # Carcasa principal
    parts.append(
        make_box("Case", (0.49, 0.41, 0.34), (0.0, 0.0, -0.045), body_paint, rng.random(), (1, 0, 0), 0.006, 2)
    )
    # Zócalo inferior reforzado
    parts.append(
        make_box("BaseSkirt", (0.52, 0.44, 0.055), (0.0, 0.0, -0.200), lid_paint, rng.random(), (1, 0, 0), 0.004, 1)
    )
    # Tapa superior saliente
    parts.append(
        make_box("TopLid", (0.53, 0.45, 0.062), (0.0, 0.0, 0.145), lid_paint, rng.random(), (1, 0, 0), 0.005, 2)
    )

    # Nervios verticales en los costados
    for sx in (-1, 1):
        for dy in (-0.11, 0.0, 0.11):
            parts.append(
                make_box(
                    f"SideRib_{sx}_{dy:.2f}",
                    (0.022, 0.036, 0.28),
                    (sx * 0.248, dy, -0.04),
                    body_paint,
                    rng.random(),
                    (0, 0, 1),
                    0.003,
                    1,
                )
            )
        # Asas laterales metálicas
        parts.append(
            make_box(
                f"HandleLug_{sx}",
                (0.032, 0.14, 0.032),
                (sx * 0.254, 0.0, 0.105),
                steel,
                rng.random(),
                (0, 1, 0),
                0.004,
                1,
            )
        )

    # 6 tapones de celdas en la tapa
    for i, dx in enumerate((-0.14, -0.07, 0.0, 0.07, 0.14)):
        parts.append(
            make_cylinder(f"CellCap_{i}", 0.024, 0.020, 10, (dx, -0.095, 0.184), lid_paint, 0.002, 1, False)
        )

    # Borne positivo (cobre + collar rojo) y borne negativo (acero + collar oscuro)
    parts.append(make_cylinder("PosCollar", 0.052, 0.026, 12, (-0.14, 0.085, 0.186), body_paint, 0.003, 1, False))
    parts.append(make_cylinder("PosPost", 0.034, 0.052, 12, (-0.14, 0.085, 0.204), copper, 0.003, 1, False))
    parts.append(make_cylinder("PosClamp", 0.022, 0.022, 6, (-0.14, 0.085, 0.220), brass, 0.002, 1, False))

    parts.append(make_cylinder("NegCollar", 0.050, 0.026, 12, (0.14, 0.085, 0.186), lid_paint, 0.003, 1, False))
    parts.append(make_cylinder("NegPost", 0.032, 0.050, 12, (0.14, 0.085, 0.203), steel, 0.003, 1, False))

    # Placa frontal metálica con remaches (ambos lados para legibilidad)
    for sy in (-1, 1):
        parts.append(
            make_box(
                f"Plate_{sy}",
                (0.32, 0.024, 0.16),
                (0.0, sy * 0.210, -0.035),
                steel,
                rng.random(),
                (1, 0, 0),
                0.003,
                1,
            )
        )
        for rx in (-0.13, 0.13):
            for rz in (-0.09, 0.02):
                parts.append(
                    make_box(
                        f"Rivet_{sy}_{rx:.2f}_{rz:.2f}",
                        (0.016, 0.012, 0.016),
                        (rx, sy * 0.222, rz),
                        brass,
                        rng.random(),
                        (0, 1, 0),
                        0.002,
                        1,
                    )
                )

    return join(parts, "Battery")
