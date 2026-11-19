"""Cohete propulsor (thruster) — tanque presurizado, banda de peligro, tuberías y tobera acampanada."""
import random

from propkit.core import COL, add_attrs, hex_rgba, join, lathe, make_box, make_cylinder, smooth
from propkit.materials import mat_bare_metal, mat_painted_metal

KIND = "thruster"
NOMINAL_DIMS = (0.34, 0.68, 0.34)  # ancho, alto, fondo de juego (Y arriba), m
COLLIDER_HINT = "CylinderCollider args=[0.34, 0.16]"
SHRINK_MATS = ()
PALETTE_KEYS = ("red", "mustard", "stripe_dark", "steel", "brass", "rust", "grime")


def build(seed=7):
    rng = random.Random(seed)
    tank_paint = mat_painted_metal(
        "A_ThrusterRed", COL["red"], hex_rgba("#9c3224"), 1.15, band=True, rust_amt=0.5, edge_radius=0.008
    )
    nozzle_mat = mat_bare_metal("A_NozzleSteel", hex_rgba("#4c525c"), 0.42, wear_tint=0.25)
    brass = mat_bare_metal("A_ThrusterBrass", COL["brass"], 0.28)
    steel = mat_bare_metal("A_ThrusterSteel", COL["steel"], 0.32)

    # Perfil completo: tobera abajo (-0.34..-0.14) + tanque (-0.14..+0.34)
    nozzle_prof = [
        (0.0, -0.31),
        (0.115, -0.34),
        (0.145, -0.34),
        (0.148, -0.31),
        (0.110, -0.22),
        (0.078, -0.15),
        (0.095, -0.12),
        (0.0, -0.12),
    ]
    nozzle = lathe("Nozzle", nozzle_prof, 24, nozzle_mat)
    smooth(nozzle, 40)
    add_attrs(nozzle.data, 0.1, (0, 0, 1))

    tank_prof = [
        (0.0, -0.12),
        (0.120, -0.12),
        (0.152, -0.09),
        (0.156, 0.24),
        (0.142, 0.295),
        (0.105, 0.328),
        (0.055, 0.340),
        (0.0, 0.340),
    ]
    tank = lathe("Tank", tank_prof, 24, tank_paint)
    smooth(tank, 40)
    add_attrs(tank.data, 0.2, (0, 0, 1))

    parts = [nozzle, tank]

    # Abrazaderas metálicas y 3 aletas estabilizadoras
    for dz in (-0.05, 0.18):
        parts.append(make_cylinder(f"Clamp_{dz:.2f}", 0.164, 0.028, 24, (0.0, 0.0, dz), steel, 0.003, 1, True))

    # Válvula superior de latón
    parts.append(make_cylinder("TopValve", 0.035, 0.032, 12, (0.0, 0.0, 0.345), brass, 0.002, 1, False))

    # Tubería lateral de combustible
    parts.append(make_box("FuelPipe", (0.032, 0.032, 0.34), (0.158, 0.0, 0.05), brass, rng.random(), (0, 0, 1), 0.004, 1))

    return join(parts, "Thruster")
