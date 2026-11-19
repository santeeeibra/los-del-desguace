"""Interruptor palanca (switchBox) — caja redondeada con palanca roja chunky y pernos."""
import random

from propkit.core import COL, add_attrs, hex_rgba, join, make_box, make_cylinder, orient
from propkit.materials import mat_bare_metal, mat_painted_metal

KIND = "switchBox"
NOMINAL_DIMS = (0.36, 0.28, 0.36)
COLLIDER_HINT = "CuboidCollider args=[0.18, 0.14, 0.18]"
SHRINK_MATS = ()
PALETTE_KEYS = ("metal_dark", "red", "brass", "steel", "grime")


def build(seed=7):
    rng = random.Random(seed)
    body = mat_painted_metal("A_SwitchBody", COL["metal_dark"], hex_rgba("#272c33"), 0.85, rust_amt=0.25, edge_radius=0.008)
    lever = mat_painted_metal("A_SwitchLever", COL["red"], hex_rgba("#a63b2b"), 0.8, rust_amt=0.15, edge_radius=0.005)
    brass = mat_bare_metal("A_SwitchBrass", COL["brass"], 0.28)
    steel = mat_bare_metal("A_SwitchSteel", COL["steel"], 0.3)

    parts = []
    parts.append(make_box("Housing", (0.33, 0.33, 0.16), (0.0, 0.0, -0.04), body, rng.random(), (1, 0, 0), 0.036, 3))
    parts.append(make_cylinder("Collar", 0.075, 0.04, 18, (0.0, 0.0, 0.05), steel, bevel=0.006, segs=2))
    # Palanca cilíndrica inclinada con pomo esférico/redondeado
    arm = make_cylinder("Arm", 0.022, 0.13, 12, (0.0, 0.028, 0.095), steel, bevel=0.004, segs=1)
    arm.rotation_euler = (-0.42, 0.0, 0.0)
    add_attrs(arm.data, 0.1, (0, 0, 1))
    parts.append(arm)
    knob = make_cylinder("Knob", 0.042, 0.058, 16, (0.0, 0.052, 0.142), lever, bevel=0.015, segs=2)
    knob.rotation_euler = (-0.42, 0.0, 0.0)
    add_attrs(knob.data, 0.2, (0, 0, 1))
    parts.append(knob)
    for sx in (-1, 1):
        plug = make_cylinder(f"Plug_{sx}", 0.024, 0.04, 12, (sx * 0.165, 0.0, -0.04), brass, bevel=0.004, segs=1)
        orient(plug, (1, 0, 0))
        add_attrs(plug.data, 0.2, (1, 0, 0))
        parts.append(plug)
    return join(parts, "SwitchBox")
