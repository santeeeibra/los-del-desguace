"""Rueda (wheel) — neumático todoterreno con llanta pintada, buje y tuercas."""
import math
import random

from propkit.core import (
    COL,
    NB,
    add_attrs,
    hex_rgba,
    join,
    lathe,
    make_box,
    make_cylinder,
    new_mat,
    orient,
    smooth,
)
from propkit.materials import mat_bare_metal, mat_painted_metal

KIND = "wheel"
NOMINAL_DIMS = (0.30, 0.76, 0.76)  # ancho X, alto Y, fondo Z (m, Y arriba)
COLLIDER_HINT = "CylinderCollider args=[0.14, 0.38] rotation=[0, 0, Math.PI/2]"
SHRINK_MATS = ()
PALETTE_KEYS = ("mustard", "steel", "rust", "grime", "metal_dark")


def mat_rubber(name):
    """Caucho mate gastado con polvo en los surcos y cantos aclarados."""
    m = new_mat(name)
    nb = NB(m)
    p = nb.node("ShaderNodeTexCoord").outputs["Object"]
    n_low = nb.noise(p, 5.0, 2.0, 0.5)
    n_hi = nb.noise(p, 44.0, 2.0, 0.55)

    dark_rubber = hex_rgba("#1e2024")
    worn_rubber = hex_rgba("#35383e")
    dust_rubber = hex_rgba("#4e463b")

    col = nb.mixc(nb.maprange(n_low, 0.32, 0.68), dark_rubber, worn_rubber)
    edge = nb.edge_mask(0.008, 0.015, 0.2)
    col = nb.mixc(nb.math("MULTIPLY", edge, 0.45), col, hex_rgba("#4b4f56"))

    ao = nb.ao(0.04)
    cavity = nb.math("SUBTRACT", 1.0, ao)
    col = nb.mixc(nb.math("MULTIPLY", cavity, 0.65), col, dust_rubber)

    rough = nb.math("ADD", 0.84, nb.math("MULTIPLY", n_hi, 0.1))
    rough = nb.math("SUBTRACT", rough, nb.math("MULTIPLY", edge, 0.08))
    height = nb.math("ADD", nb.math("MULTIPLY", n_low, 0.4), nb.math("MULTIPLY", n_hi, 0.2))
    nb.finish(col, rough, 0.0, height, 0.15, 0.001)
    return m


def build(seed=7):
    rng = random.Random(seed)
    rubber = mat_rubber("A_TireRubber")
    rim_paint = mat_painted_metal(
        "A_RimYellow", COL["mustard"], hex_rgba("#b87e1b"), 1.05, rust_amt=0.45, edge_radius=0.006
    )
    steel = mat_bare_metal("A_HubSteel", COL["steel"], 0.32)

    # Perfil del neumático (revolucionado en Z y luego orientado al eje X).
    # Radio exterior = 0.365 (+ tacos = 0.380), ancho = 0.260 (-0.130 a +0.130).
    tire_prof = [
        (0.195, -0.105),
        (0.215, -0.122),
        (0.265, -0.130),
        (0.325, -0.128),
        (0.356, -0.112),
        (0.365, -0.082),
        (0.366, 0.0),
        (0.365, 0.082),
        (0.356, 0.112),
        (0.325, 0.128),
        (0.265, 0.130),
        (0.215, 0.122),
        (0.195, 0.105),
        (0.195, -0.105),
    ]
    tire = lathe("Tire", tire_prof, 32, rubber)
    orient(tire, (1, 0, 0))
    smooth(tire, 40)
    add_attrs(tire.data, 0.0, (1, 0, 0))

    # Llanta metálica con garganta y disco central hundido
    rim_prof = [
        (0.072, -0.055),
        (0.130, -0.055),
        (0.165, -0.095),
        (0.198, -0.118),
        (0.212, -0.122),
        (0.212, -0.105),
        (0.195, -0.095),
        (0.195, 0.095),
        (0.212, 0.105),
        (0.212, 0.122),
        (0.198, 0.118),
        (0.165, 0.095),
        (0.130, 0.055),
        (0.072, 0.055),
        (0.072, -0.055),
    ]
    rim = lathe("Rim", rim_prof, 24, rim_paint)
    orient(rim, (1, 0, 0))
    smooth(rim, 35)
    add_attrs(rim.data, 0.1, (1, 0, 0))

    parts = [tire, rim]

    # Tacos de banda de rodamiento (silueta todoterreno)
    num_lugs = 12
    phase = rng.uniform(0, 2 * math.pi / num_lugs)
    for i in range(num_lugs):
        a = phase + (i / num_lugs) * 2.0 * math.pi
        r_lug = 0.366
        y = math.cos(a) * r_lug
        z = math.sin(a) * r_lug
        lug = make_box(
            f"Tread{i}",
            (0.245, 0.052, 0.028),
            (0.0, y, z),
            rubber,
            rand=rng.random(),
            axis=(1, 0, 0),
            bevel=0.004,
            segs=1,
            rot=(a + math.pi / 2, 0.0, 0.08 if i % 2 == 0 else -0.08),
        )
        parts.append(lug)

    # Buje central de acero
    hub = make_cylinder("Hub", 0.076, 0.290, 14, (0.0, 0.0, 0.0), steel, bevel=0.004, segs=1)
    orient(hub, (1, 0, 0))
    add_attrs(hub.data, 0.2, (1, 0, 0))
    parts.append(hub)

    # Tapacubos / pernos en ambos lados de la llanta
    for side in (-1, 1):
        for b in range(5):
            ang = (b / 5) * 2.0 * math.pi + 0.2
            by = math.cos(ang) * 0.108
            bz = math.sin(ang) * 0.108
            bolt = make_cylinder(
                f"Bolt_{side}_{b}", 0.013, 0.024, 6, (side * 0.068, by, bz), steel, bevel=0.002, segs=1
            )
            orient(bolt, (1, 0, 0))
            add_attrs(bolt.data, 0.3, (1, 0, 0))
            parts.append(bolt)

    return join(parts, "Wheel")
