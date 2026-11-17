"""Bidón (canister) — receta aprobada. Extraída de art/blender/build_props.py."""
import math
import random

from propkit.core import COL, hex_rgba, join, lathe, make_box, make_cylinder, smooth, add_attrs
from propkit.materials import mat_painted_metal, mat_bare_metal

# Contrato de receta (ver SKILL.md)
KIND = "canister"                       # tipo de GrabbableKind al que da apariencia
NOMINAL_DIMS = (0.459, 0.765, 0.459)    # ancho, alto, fondo de juego (Y arriba), m
COLLIDER_HINT = "CylinderCollider args=[0.38, 0.22] (half-height, radio)"
SHRINK_MATS = ()                        # materiales casi invisibles a reducir en UV
PALETTE_KEYS = ("teal", "teal_dark", "mustard", "stripe_dark", "steel", "rust", "grime", "brass", "red")

def build(seed=7):
    paint = mat_painted_metal("A_BarrelPaint", COL["teal"], COL["teal_dark"], 1.15, band=True, edge_radius=0.012)
    brass = mat_bare_metal("A_Brass", COL["brass"], 0.3)
    lever = mat_painted_metal("A_LeverRed", COL["red"], hex_rgba("#a63b2b"), 1.4, rust_amt=0.3,
                              paint_rough=0.45, edge_radius=0.003)

    R = 0.212
    prof = [
        (0.0, -0.352), (0.12, -0.352), (0.185, -0.353), (0.198, -0.357),
        # Reborde inferior (chime enrollado)
        (0.204, -0.366), (0.207, -0.375), (0.213, -0.380), (0.220, -0.379),
        (0.225, -0.373), (0.226, -0.364), (0.222, -0.356), (0.215, -0.351),
    ]

    def wall(z0, z1, step=0.05):
        n = max(1, int(round((z1 - z0) / step)))
        return [(R, z0 + (z1 - z0) * i / n) for i in range(n + 1)]

    def hoop(zc):
        return [(0.2155, zc - 0.022), (0.2215, zc - 0.012), (0.2245, zc),
                (0.2215, zc + 0.012), (0.2155, zc + 0.022)]

    prof += wall(-0.345, -0.155)
    prof += hoop(-0.125)
    prof += wall(-0.095, 0.095)
    prof += hoop(0.125)
    prof += wall(0.155, 0.332)
    # Aro de cierre de la tapa (open-head) y tapa hundida con nervio
    prof += [
        (0.2155, 0.337), (0.2225, 0.341), (0.2285, 0.348), (0.2295, 0.360),
        (0.2265, 0.371), (0.2190, 0.378), (0.2070, 0.380), (0.1975, 0.375),
        (0.1930, 0.367), (0.1800, 0.364), (0.1500, 0.364), (0.1460, 0.3685),
        (0.1360, 0.3685), (0.1320, 0.364), (0.0600, 0.363), (0.0, 0.363),
    ]
    body = lathe("BarrelBody", prof, 32, paint)

    # Abolladuras suaves
    dents = [  # (ángulo, z, radio, profundidad) — aprobadas con seed=7
        (0.75, 0.035, 0.075, 0.011),
        (2.95, -0.235, 0.055, 0.008),
        (4.55, 0.235, 0.060, 0.006),
        (5.60, 0.372, 0.045, 0.006),
        (1.90, -0.372, 0.040, 0.005),
    ]
    if seed != 7:  # variantes: misma cantidad de abolladuras, posiciones nuevas
        rng = random.Random(seed)
        dents = [(rng.uniform(0, 2 * math.pi), dz if abs(dz) > 0.3 else rng.uniform(-0.3, 0.3), rad, depth)
                 for (_, dz, rad, depth) in dents]
    me = body.data
    for v in me.vertices:
        r = math.hypot(v.co.x, v.co.y)
        if r < 0.19:
            continue
        a = math.atan2(v.co.y, v.co.x)
        push = 0.0
        for da, dz, rad, depth in dents:
            dth = (a - da + math.pi) % (2 * math.pi) - math.pi
            d = math.hypot(dth * r, v.co.z - dz)
            if d < rad:
                f = 1.0 - (d / rad) ** 2
                push += depth * f * f
        if push > 0:
            k = (r - push) / r
            v.co.x *= k
            v.co.y *= k
    smooth(body, 42)
    add_attrs(me, 0.0, (0, 0, 1))

    parts = [body]
    # Tapón principal (latón) con tuerca hexagonal y respiradero
    parts.append(make_cylinder("Bung", 0.034, 0.012, 16, (0.105, 0.035, 0.369), brass, 0.0025, 1, False))
    parts.append(make_cylinder("BungNut", 0.020, 0.010, 6, (0.105, 0.035, 0.380), brass, 0.0015, 1, False))
    parts.append(make_cylinder("Vent", 0.019, 0.010, 12, (-0.105, -0.06, 0.368), brass, 0.002, 1, False))
    # Cierre de palanca del aro
    lv = make_box("Lever", (0.026, 0.024, 0.026), (0.2300, 0.0, 0.357), lever, 0, (0, 1, 0), 0.004, 2)
    parts.append(lv)
    for i, off in enumerate((-0.024, 0.024)):
        parts.append(make_box(f"Lug{i}", (0.018, 0.010, 0.030), (0.2265, off, 0.357), lever, 0, (0, 0, 1), 0.003, 1))
    obj = join(parts, "Barrel")
    return obj


