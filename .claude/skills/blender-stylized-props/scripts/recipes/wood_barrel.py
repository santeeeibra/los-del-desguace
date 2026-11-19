"""Barril de madera (wood_barrel) — duelas curvadas con veta, tapas hundidas y aros de hierro remachados."""
import math
import random

import bmesh
import bpy

from propkit.core import (
    COL,
    NB,
    add_attrs,
    apply_bevel,
    hex_rgba,
    join,
    lathe,
    link_obj,
    make_box,
    make_cylinder,
    new_mat,
    smooth,
)
from propkit.materials import mat_bare_metal

KIND = "wood_barrel"
NOMINAL_DIMS = (0.74, 0.96, 0.74)  # ancho, alto, fondo de juego (Y arriba), m
COLLIDER_HINT = "CylinderCollider args=[0.48, 0.36]"
SHRINK_MATS = ()
PALETTE_KEYS = ("wood_a", "wood_b", "wood_edge", "grime", "metal_dark", "steel", "rust")


def mat_barrel_wood(name):
    """Madera mate de duelas con veta vertical, variación por tabla y cantos gastados."""
    m = new_mat(name)
    nb = NB(m)
    tc = nb.node("ShaderNodeTexCoord")
    p = tc.outputs["Object"]
    rand = nb.node("ShaderNodeAttribute", attribute_name="rand", attribute_type="GEOMETRY").outputs["Fac"]
    axis = nb.node("ShaderNodeAttribute", attribute_name="axis", attribute_type="GEOMETRY").outputs["Vector"]

    stretch = nb.vmath("ADD", nb.vmath("SCALE", axis, scale=-0.92), (1.0, 1.0, 1.0))
    q = nb.vmath("MULTIPLY", p, stretch)
    q = nb.vmath("ADD", q, nb.vmath("SCALE", (11.3, 6.7, 4.1), scale=rand))
    grain = nb.noise(q, 10.0, 3.0, 0.55, 0.6)
    fine = nb.noise(q, 36.0, 1.0, 0.5)
    g = nb.maprange(grain, 0.36, 0.66)
    tone = nb.math("ADD", nb.math("MULTIPLY", g, 0.65), nb.math("MULTIPLY", fine, 0.25))
    col = nb.mixc(tone, COL["wood_a"], COL["wood_b"])

    col = nb.hsv(
        col,
        nb.math("ADD", 0.485, nb.math("MULTIPLY", rand, 0.03)),
        1.0,
        nb.math("ADD", 0.88, nb.math("MULTIPLY", rand, 0.18)),
    )

    edge = nb.edge_mask(0.004, 0.02, 0.25)
    col = nb.mixc(nb.math("MULTIPLY", edge, 0.50), col, COL["wood_edge"])
    ao = nb.ao(0.04)
    col = nb.mixc(nb.math("MULTIPLY", nb.math("SUBTRACT", 1.0, ao), 0.78), col, COL["grime"])

    _, _, z = nb.sep(p)
    low = nb.maprange(z, -0.48, -0.28, 0.38, 0.0)
    col = nb.mixc(nb.math("MULTIPLY", low, nb.maprange(fine, 0.3, 0.7)), col, COL["grime"])

    rough = nb.math("ADD", 0.76, nb.math("MULTIPLY", fine, 0.12))
    rough = nb.math("SUBTRACT", rough, nb.math("MULTIPLY", edge, 0.08))
    height = nb.math("ADD", nb.math("MULTIPLY", g, 0.6), nb.math("MULTIPLY", fine, 0.4))
    nb.finish(col, rough, 0.0, height, 0.22, 0.0015)
    return m


def _make_stave(name, a0, a1, mat, rand_val):
    """Crea una duela curvada con panza de barril."""
    zs = [-0.48, -0.24, 0.0, 0.24, 0.48]
    bm = bmesh.new()
    rings = []
    for z in zs:
        t = z / 0.48
        r_out = 0.364 - 0.046 * (t * t)
        r_in = r_out - 0.032
        v0 = bm.verts.new((r_out * math.cos(a0), r_out * math.sin(a0), z))
        v1 = bm.verts.new((r_out * math.cos(a1), r_out * math.sin(a1), z))
        v2 = bm.verts.new((r_in * math.cos(a1), r_in * math.sin(a1), z))
        v3 = bm.verts.new((r_in * math.cos(a0), r_in * math.sin(a0), z))
        rings.append((v0, v1, v2, v3))

    for k in range(len(rings) - 1):
        A, B = rings[k], rings[k + 1]
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((A[i], A[j], B[j], B[i]))
    bm.faces.new((rings[0][3], rings[0][2], rings[0][1], rings[0][0]))
    bm.faces.new((rings[-1][0], rings[-1][1], rings[-1][2], rings[-1][3]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = link_obj(bpy.data.objects.new(name, mesh))
    mesh.materials.append(mat)
    smooth(obj, 32)
    apply_bevel(obj, 0.0035, 1)
    add_attrs(obj.data, rand_val, (0, 0, 1))
    return obj


def build(seed=7):
    rng = random.Random(seed)
    wood = mat_barrel_wood("A_BarrelWood")
    iron = mat_bare_metal("A_BarrelIron", hex_rgba("#2d3138"), 0.52, wear_tint=0.22)

    parts = []
    num_staves = 16
    step = (2.0 * math.pi) / num_staves
    gap = step * 0.055
    for i in range(num_staves):
        a0 = i * step + gap * 0.5
        a1 = (i + 1) * step - gap * 0.5
        parts.append(_make_stave(f"Stave_{i}", a0, a1, wood, rng.random()))

    # Tapas superior e inferior hundidas
    for sz in (-1, 1):
        lid = make_cylinder(f"Lid_{sz}", 0.305, 0.030, 16, (0.0, 0.0, sz * 0.435), wood, bevel=0.003, segs=1)
        add_attrs(lid.data, rng.random(), (1, 0, 0))
        parts.append(lid)

    # 4 aros metálicos (2 centrales, 2 en los extremos) siguiendo el radio de la panza
    hoop_zs = (-0.41, -0.19, 0.19, 0.41)
    for idx, hz in enumerate(hoop_zs):
        t = hz / 0.48
        r_base = 0.364 - 0.046 * (t * t)
        r_in = r_base - 0.004
        r_out = r_base + 0.011
        hh = 0.022
        prof = [
            (r_in, hz - hh),
            (r_out, hz - hh * 0.85),
            (r_out, hz + hh * 0.85),
            (r_in, hz + hh),
            (r_in, hz - hh),
        ]
        hoop = lathe(f"Hoop_{idx}", prof, 24, iron)
        smooth(hoop, 35)
        add_attrs(hoop.data, rng.random(), (0, 0, 1))
        parts.append(hoop)

        # Remaches en cada aro
        for r_idx in range(4):
            ra = (r_idx / 4.0) * 2.0 * math.pi + idx * 0.4
            rx = math.cos(ra) * (r_out + 0.002)
            ry = math.sin(ra) * (r_out + 0.002)
            parts.append(
                make_box(f"Rivet_{idx}_{r_idx}", (0.012, 0.012, 0.014), (rx, ry, hz), iron, 0.2, (0, 0, 1), 0.002, 1)
            )

    return join(parts, "WoodBarrel")
