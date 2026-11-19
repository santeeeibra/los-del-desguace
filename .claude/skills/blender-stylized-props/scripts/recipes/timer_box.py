"""Temporizador (timerBox) — módulo redondeado con dial analógico amigable y bisel de latón."""
import random

from propkit.core import COL, add_attrs, hex_rgba, join, make_box, make_cylinder, orient
from propkit.materials import mat_bare_metal, mat_flat, mat_painted_metal

KIND = "timerBox"
NOMINAL_DIMS = (0.36, 0.28, 0.36)
COLLIDER_HINT = "CuboidCollider args=[0.18, 0.14, 0.18]"
SHRINK_MATS = ()
PALETTE_KEYS = ("metal_dark", "mustard", "brass", "red", "steel", "grime")


def build(seed=7):
    rng = random.Random(seed)
    body = mat_painted_metal("A_TimerBody", COL["metal_dark"], hex_rgba("#272c33"), 0.85, rust_amt=0.25, edge_radius=0.008)
    accent = mat_painted_metal("A_TimerMustard", COL["mustard"], hex_rgba("#c48418"), 0.8, rust_amt=0.2, edge_radius=0.006)
    brass = mat_bare_metal("A_TimerBrass", COL["brass"], 0.28)
    dial = mat_flat("A_TimerDial", hex_rgba("#fbedd1"), rough=0.4)
    hand = mat_painted_metal("A_TimerHand", COL["red"], hex_rgba("#9c3224"), 0.5, rust_amt=0.1, edge_radius=0.003)

    parts = []
    # Cuerpo muy biselado (cantos suaves) + base circular
    parts.append(make_box("Housing", (0.33, 0.33, 0.18), (0.0, 0.0, -0.03), body, rng.random(), (1, 0, 0), 0.035, 3))
    parts.append(make_cylinder("Bezel", 0.135, 0.06, 24, (0.0, 0.0, 0.075), accent, bevel=0.010, segs=2))
    parts.append(make_cylinder("DialFace", 0.11, 0.02, 24, (0.0, 0.0, 0.10), dial, bevel=0.003, segs=1))
    # Aguja + perno central
    parts.append(make_box("Hand", (0.024, 0.082, 0.018), (0.015, 0.025, 0.116), hand, 0.1, (0, 1, 0), 0.004, 2, rot=(0, 0, -0.5)))
    parts.append(make_cylinder("CenterPin", 0.022, 0.028, 12, (0.0, 0.0, 0.118), brass, bevel=0.003, segs=1))
    # Terminales laterales redondeados
    for sx in (-1, 1):
        plug = make_cylinder(f"Plug_{sx}", 0.026, 0.04, 12, (sx * 0.165, 0.0, -0.02), brass, bevel=0.004, segs=1)
        orient(plug, (1, 0, 0))
        add_attrs(plug.data, 0.2, (1, 0, 0))
        parts.append(plug)
    return join(parts, "TimerBox")
