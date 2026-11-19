"""Motor de desguace (engine) — bloque V-4 estilizado con tapas, poleas, filtro y escapes."""
import math
import random

from propkit.core import COL, hex_rgba, join, make_box, make_cylinder, orient, add_attrs
from propkit.materials import mat_bare_metal, mat_painted_metal

KIND = "engine"
NOMINAL_DIMS = (0.68, 0.56, 0.56)  # ancho, alto, fondo de juego (Y arriba), m
COLLIDER_HINT = "CuboidCollider args=[0.34, 0.28, 0.28]"
SHRINK_MATS = ()
PALETTE_KEYS = ("metal_dark", "teal", "teal_dark", "red", "steel", "brass", "rust", "grime")


def build(seed=7):
    rng = random.Random(seed)
    cast_iron = mat_painted_metal(
        "A_EngineBlock", COL["metal_dark"], hex_rgba("#25282e"), 1.25, rust_amt=0.75, edge_radius=0.005
    )
    valve_paint = mat_painted_metal(
        "A_ValveCover", COL["teal"], COL["teal_dark"], 1.10, rust_amt=0.50, edge_radius=0.005
    )
    filter_paint = mat_painted_metal(
        "A_AirFilter", COL["red"], hex_rgba("#9c3224"), 1.05, rust_amt=0.35, edge_radius=0.004
    )
    steel = mat_bare_metal("A_EngineSteel", COL["steel"], 0.30)
    brass = mat_bare_metal("A_EngineBrass", COL["brass"], 0.28)
    exhaust_mat = mat_bare_metal("A_ExhaustRust", hex_rgba("#7e4a32"), 0.58, wear_tint=0.2)

    parts = []

    # Cárter inferior (oil pan)
    parts.append(
        make_box("OilPan", (0.38, 0.34, 0.095), (0.0, 0.0, -0.225), cast_iron, rng.random(), (0, 1, 0), 0.005, 1)
    )
    # Bloque motor central
    parts.append(
        make_box("Crankcase", (0.40, 0.32, 0.22), (0.0, 0.0, -0.075), cast_iron, rng.random(), (0, 1, 0), 0.006, 2)
    )

    # Bancadas de cilindros en V (izquierda y derecha)
    bank_angle = 0.46  # ~26 grados
    for sx in (-1, 1):
        rot_y = sx * bank_angle
        bx = sx * 0.145
        bz = 0.075
        # Bloque de cilindros con aletas
        parts.append(
            make_box(
                f"CylBank_{sx}",
                (0.15, 0.30, 0.14),
                (bx, 0.0, bz),
                steel,
                rng.random(),
                (0, 1, 0),
                0.004,
                1,
                rot=(0.0, rot_y, 0.0),
            )
        )
        # Tapa de balancines (valve cover)
        vx = sx * 0.185
        vz = 0.155
        parts.append(
            make_box(
                f"ValveCover_{sx}",
                (0.165, 0.315, 0.058),
                (vx, 0.0, vz),
                valve_paint,
                rng.random(),
                (0, 1, 0),
                0.006,
                2,
                rot=(0.0, rot_y, 0.0),
            )
        )
        # Tapón de aceite en una tapa
        if sx == 1:
            cap = make_cylinder("OilCap", 0.026, 0.024, 10, (vx + 0.01, -0.08, vz + 0.036), brass, 0.002, 1, False)
            cap.rotation_euler = (0.0, rot_y, 0.0)
            add_attrs(cap.data, 0.1, (0, 0, 1))
            parts.append(cap)

        # Colectores de escape laterales (2 tubos por lado)
        for dy in (-0.075, 0.075):
            pipe = make_cylinder(
                f"Exhaust_{sx}_{dy:.2f}", 0.028, 0.11, 10, (sx * 0.255, dy, 0.02), exhaust_mat, 0.003, 1, True
            )
            orient(pipe, (sx * 0.9, 0.0, -0.45))
            add_attrs(pipe.data, rng.random(), (sx, 0, 0))
            parts.append(pipe)

    # Admisión central + filtro de aire redondo arriba
    parts.append(
        make_box("Intake", (0.16, 0.22, 0.09), (0.0, 0.0, 0.115), steel, rng.random(), (0, 1, 0), 0.004, 1)
    )
    parts.append(
        make_cylinder("AirFilter", 0.115, 0.085, 20, (0.0, -0.01, 0.205), filter_paint, 0.005, 2, True)
    )
    parts.append(
        make_cylinder("FilterNut", 0.022, 0.022, 6, (0.0, -0.01, 0.254), brass, 0.002, 1, False)
    )

    # Frente (-Y): tapa de distribución, poleas y alternador
    parts.append(
        make_box("TimingCover", (0.28, 0.04, 0.24), (0.0, -0.175, -0.05), cast_iron, rng.random(), (1, 0, 0), 0.004, 1)
    )
    pulleys = [
        ("CrankPulley", 0.078, 0.038, (0.0, -0.215, -0.125)),
        ("WaterPulley", 0.052, 0.034, (0.0, -0.215, 0.025)),
        ("AltPulley", 0.038, 0.034, (0.165, -0.210, -0.015)),
    ]
    for pname, pr, pd, ploc in pulleys:
        pul = make_cylinder(pname, pr, pd, 16, ploc, steel, 0.003, 1, True)
        orient(pul, (0, 1, 0))
        add_attrs(pul.data, rng.random(), (0, 1, 0))
        parts.append(pul)
        nut = make_cylinder(f"{pname}_Nut", pr * 0.34, 0.018, 6, (ploc[0], ploc[1] - 0.020, ploc[2]), brass, 0.002, 1, False)
        orient(nut, (0, 1, 0))
        add_attrs(nut.data, 0.2, (0, 1, 0))
        parts.append(nut)

    # Alternador lateral
    alt = make_cylinder("Alternator", 0.058, 0.12, 12, (0.165, -0.115, -0.015), steel, 0.004, 1, True)
    orient(alt, (0, 1, 0))
    add_attrs(alt.data, 0.3, (0, 1, 0))
    parts.append(alt)

    # Parte trasera (+Y): volante de inercia (flywheel)
    fly = make_cylinder("Flywheel", 0.145, 0.045, 24, (0.0, 0.185, -0.095), steel, 0.004, 1, True)
    orient(fly, (0, 1, 0))
    add_attrs(fly.data, 0.1, (0, 1, 0))
    parts.append(fly)

    return join(parts, "Engine")
