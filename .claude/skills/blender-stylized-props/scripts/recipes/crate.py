"""Caja de madera (crate) — receta aprobada. Extraída de art/blender/build_props.py."""
import math
import random

from propkit.core import COL, hex_rgba, join, make_box, make_cylinder, orient
from propkit.materials import mat_wood, mat_painted_metal, mat_bare_metal, mat_flat

# Contrato de receta (ver SKILL.md)
KIND = "crate"
NOMINAL_DIMS = (0.64, 0.60, 0.64)       # ancho, alto, fondo de juego (Y arriba), m
COLLIDER_HINT = "CuboidCollider args=[0.32, 0.30, 0.32] (half-extents)"
SHRINK_MATS = ("A_Core",)
PALETTE_KEYS = ("wood_a", "wood_b", "wood_edge", "stencil", "metal_dark", "steel", "rust", "grime", "core")

def build(seed=7):
    rng = random.Random(seed)  # seed=7 aprobada
    wood = mat_wood("A_Wood")
    metal = mat_painted_metal("A_CornerMetal", COL["metal_dark"], hex_rgba("#30343b"), 1.3,
                              rust_amt=0.45, paint_rough=0.55, edge_radius=0.004)
    nails = mat_bare_metal("A_Nail", hex_rgba("#8d8f92"), 0.4, 0.4)
    core = mat_flat("A_Core", COL["core"])

    H = 0.30          # media altura
    W = 0.32          # media anchura
    POST = 0.052      # sección del poste de esquina
    PL_T = 0.020      # grosor de tabla
    RAIL_H = 0.064
    LID_T = 0.024
    GAP = 0.006
    parts = []

    def jitter(s=0.0012):
        return rng.uniform(-s, s)

    def r01():
        return rng.random()

    # Núcleo oscuro interior (se ve por las juntas)
    parts.append(make_box("Core", (2 * (W - 0.02), 2 * (W - 0.02), 2 * (H - 0.02)), (0, 0, 0), core, 0, (1, 0, 0), 0))

    inner_h = H - LID_T
    # Postes verticales de esquina
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(make_box("Post", (POST, POST, 2 * inner_h),
                                  (sx * (W - POST / 2), sy * (W - POST / 2), 0), wood, r01(), (0, 0, 1), 0.005, 2))

    # Caras laterales: travesaños arriba/abajo + 3 tablas rehundidas
    span = 2 * (W - POST)
    plank_zone = 2 * (inner_h - RAIL_H)
    plank_h = (plank_zone - 2 * GAP) / 3.0
    for face in range(4):
        ang = face * math.pi / 2
        c, s = math.cos(ang), math.sin(ang)
        # eje normal de la cara: (c, s); eje a lo largo: (-s, c)
        along_axis = (abs(-s), abs(c), 0)

        def place(offset_n, offset_t, z, size_t, size_z, depth, mat, rnd, bevel, segs=1):
            nx_, ny_ = c * offset_n - s * offset_t, s * offset_n + c * offset_t
            size = (depth, size_t, size_z) if abs(c) > 0.5 else (size_t, depth, size_z)
            return make_box("Board", size, (nx_, ny_, z), mat, rnd, along_axis, bevel, segs,
                            rot=(0, 0, jitter(0.006)))

        rail_n = W - 0.017 / 2
        for sz in (-1, 1):
            parts.append(place(rail_n, 0, sz * (inner_h - RAIL_H / 2), span, RAIL_H, 0.017, wood, r01(), 0.004, 2))
        plank_n = W - 0.012 - PL_T / 2
        for k in range(3):
            zc = -plank_zone / 2 + plank_h / 2 + k * (plank_h + GAP)
            parts.append(place(plank_n + jitter(0.0015), jitter(), zc + jitter(0.001),
                               span - 0.004, plank_h, PL_T, wood, r01(), 0.0035))
            # Clavos en los extremos de cada tabla (sobre los postes)
            for st in (-1, 1):
                t = st * (W - POST / 2)
                nx_, ny_ = c * (W + 0.0005) - s * t, s * (W + 0.0005) + c * t
                nail = make_cylinder("Nail", 0.0055, 0.004, 6, (0, 0, 0), nails, 0.0012, 1, False)
                orient(nail, (c, s, 0))
                nail.location = (nx_, ny_, zc + jitter(0.01))
                parts.append(nail)

    # Tapa y fondo: 4 tablas a lo largo de X
    lid_w = (2 * W - 3 * GAP) / 4.0
    for sz in (-1, 1):
        for k in range(4):
            yc = -W + lid_w / 2 + k * (lid_w + GAP)
            parts.append(make_box("Lid", (2 * W - 0.002 + jitter(0.002), lid_w, LID_T),
                                  (jitter(0.002), yc, sz * (H - LID_T / 2)), wood, r01(), (1, 0, 0), 0.004, 1,
                                  rot=(0, 0, jitter(0.004))))

    # Esquineros metálicos con clavos
    CAP = 0.084
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                cx = sx * (W - CAP / 2 + 0.0035)
                cy = sy * (W - CAP / 2 + 0.0035)
                cz = sz * (H - CAP / 2 + 0.0035)
                parts.append(make_box("Cap", (CAP, CAP, CAP), (cx, cy, cz), metal, r01(), (0, 0, 1), 0.007, 2))
                off = W + 0.0035
                offz = H + 0.0035
                inner = CAP * 0.45
                for (loc, nrm) in (
                    ((sx * off, sy * (W - inner), sz * (H - inner)), (sx, 0, 0)),
                    ((sx * (W - inner), sy * off, sz * (H - inner)), (0, sy, 0)),
                    ((sx * (W - inner), sy * (W - inner), sz * offz), (0, 0, sz)),
                ):
                    nail = make_cylinder("CapNail", 0.0065, 0.004, 6, (0, 0, 0), nails, 0.0015, 1, False)
                    orient(nail, nrm)
                    nail.location = loc
                    parts.append(nail)

    obj = join(parts, "Crate")
    return obj


