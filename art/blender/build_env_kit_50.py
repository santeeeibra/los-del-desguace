"""
Los del Desguace — Kit Modular Completo de 50 Piezas Reutilizables para Escenarios
(Blender 5.2.3 LTS + horneado Cycles `baseColor`/`ORM`/`normal` → 1 solo material WebP).

Las 6 piezas ya generadas por `build_env_kit.py` se complementan con 44 piezas nuevas
organizadas en 7 categorías (total = 50 `.glb` en `public/models/environment/`).

Uso:
    blender -b --factory-startup -P art/blender/build_env_kit_50.py -- batch1 512
    blender -b --factory-startup -P art/blender/build_env_kit_50.py -- all 512
    blender -b --factory-startup -P art/blender/build_env_kit_50.py -- sheets 512
"""

import bpy
import bmesh
import json
import math
import os
import random
import sys
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import build_props as bp  # noqa: E402
import build_extra_props as bep  # noqa: E402

REPO = os.path.normpath(os.path.join(ROOT, "..", ".."))
ENV_ART_DIR = os.path.join(REPO, "art", "environment")
ENV_GLB_DIR = os.path.join(REPO, "public", "models", "environment")

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
WHICH = argv[0] if len(argv) > 0 else "all"
RES = int(argv[1]) if len(argv) > 1 else 512

C = {
    **bep.C,
    "concrete": bp.hex_rgba("#7f7c76"),
    "concrete_dark": bp.hex_rgba("#585652"),
    "orange": bp.hex_rgba("#e86b24"),
    "orange_dark": bp.hex_rgba("#a84512"),
    "wood": bp.hex_rgba("#7c5330"),
    "wood_dark": bp.hex_rgba("#4c3018"),
    "olive": bp.hex_rgba("#536139"),
    "olive_dark": bp.hex_rgba("#364023"),
    "rock": bp.hex_rgba("#605c58"),
    "rock_dark": bp.hex_rgba("#3e3c3a"),
    "mud": bp.hex_rgba("#4a3828"),
    "mud_dark": bp.hex_rgba("#2a1f16"),
    "glow_warm": bp.hex_rgba("#ffdf6e"),
    "glow_cyan": bp.hex_rgba("#66f2dc"),
}


# ---------------------------------------------------------------------------
# Materiales compartidos (reutilizan shaders de desgaste/suciedad de build_props)
# ---------------------------------------------------------------------------

def mats():
    return {
        "teal": bp.mat_painted_metal("A_Teal", C["teal"], C["teal_dark"], wear_amt=1.0, rust_amt=0.65),
        "red": bp.mat_painted_metal("A_Red", C["red"], C["red_dark"], wear_amt=1.0, rust_amt=0.6),
        "yellow": bp.mat_painted_metal("A_Yellow", C["mustard"], C["mustard_dark"], wear_amt=0.95, rust_amt=0.35),
        "hazard": bp.mat_painted_metal("A_Hazard", C["mustard"], C["mustard_dark"], wear_amt=0.9, band=True, rust_amt=0.3),
        "orange": bp.mat_painted_metal("A_Orange", C["orange"], C["orange_dark"], wear_amt=0.85, rust_amt=0.25),
        "dark": bp.mat_painted_metal("A_Dark", C["dark_steel"], C["dark_steel2"], wear_amt=1.0, rust_amt=0.6),
        "steel": bp.mat_bare_metal("A_Steel", C["steel"], rough=0.34),
        "brass": bp.mat_bare_metal("A_Brass", C["brass"], rough=0.28),
        "copper": bp.mat_bare_metal("A_Copper", C["copper"], rough=0.34),
        "wood": bp.mat_wood("A_Wood"),
        "concrete": bp.mat_painted_metal("A_Concrete", C["concrete"], C["concrete_dark"], wear_amt=0.35, rust_amt=0.0, paint_rough=0.9),
        "rubber": bep.mat_rubber("A_Rubber"),
        "rock": bp.mat_painted_metal("A_Rock", C["rock"], C["rock_dark"], wear_amt=0.25, rust_amt=0.0, paint_rough=0.92),
        "mud": bp.mat_painted_metal("A_Mud", C["mud"], C["mud_dark"], wear_amt=0.15, rust_amt=0.0, paint_rough=0.45),
        "olive": bp.mat_painted_metal("A_Olive", C["olive"], C["olive_dark"], wear_amt=0.2, rust_amt=0.0, paint_rough=0.88),
        "cream": bep.mat_fabric("A_Cream", C["cream"], C["cream_dark"], rough=0.65),
        "glow_warm": bp.mat_flat("A_GlowWarm", C["glow_warm"], rough=0.18),
        "glow_cyan": bp.mat_flat("A_GlowCyan", C["glow_cyan"], rough=0.18),
    }


def make_rock_blob(name, radius, seed, mat, loc=(0, 0, 0), scale=(1.0, 1.0, 0.7)):
    r = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=radius)
    for v in bm.verts:
        n = 0.78 + 0.42 * r.random()
        v.co.x *= scale[0] * n
        v.co.y *= scale[1] * n
        v.co.z *= scale[2] * n
        if v.co.z < -radius * scale[2] * 0.45:
            v.co.z = -radius * scale[2] * 0.45  # Base plana para apoyar
    return bep.add_bm(name, bm, mat, loc)


# ---------------------------------------------------------------------------
# Categoría 1: Estructuras y Contenedores (7 nuevas + container_rust = 8)
# ---------------------------------------------------------------------------

def build_container_red_open():
    m = mats()
    objs = [
        bp.make_box("Floor", (2.44, 5.90, 0.14), (0, 0, 0.07), m["dark"], bevel=0.015),
        bp.make_box("Roof", (2.48, 5.96, 0.14), (0, 0, 2.53), m["red"], bevel=0.015),
        bp.make_box("WallL", (0.12, 5.90, 2.38), (-1.18, 0, 1.30), m["red"], bevel=0.012),
        bp.make_box("WallR", (0.12, 5.90, 2.38), (1.18, 0, 1.30), m["red"], bevel=0.012),
        bp.make_box("WallBack", (2.36, 0.12, 2.38), (0, 2.90, 1.30), m["red"], bevel=0.012),
        # Puertas delanteras abiertas hacia afuera (-Y)
        bp.make_box("DoorL", (1.15, 0.09, 2.34), (-1.55, -3.45, 1.30), m["red"], bevel=0.012, rot=(0, 0, -0.95)),
        bp.make_box("DoorR", (1.15, 0.09, 2.34), (1.58, -3.42, 1.30), m["red"], bevel=0.012, rot=(0, 0, 1.05)),
    ]
    for sx in (-1.20, 1.20):
        for sy in (-2.94, 2.94):
            objs.append(bp.make_box(f"Post_{sx}_{sy}", (0.16, 0.16, 2.60), (sx, sy, 1.30), m["dark"], bevel=0.014))
    for i in range(12):
        y = -2.4 + i * 0.44
        for sx in (-1.25, 1.25):
            objs.append(bp.make_box(f"Rib_{sx}_{i}", (0.06, 0.14, 2.24), (sx, y, 1.30), m["red"], bevel=0.008))
    return bp.join(objs, "ContainerRedOpen")


def build_container_short():
    m = mats()
    objs = [
        bp.make_box("Core", (2.32, 2.92, 2.34), (0, 0, 1.25), m["yellow"], bevel=0.02),
        bp.make_box("FrameBot", (2.46, 3.06, 0.14), (0, 0, 0.07), m["dark"], bevel=0.015),
        bp.make_box("FrameTop", (2.46, 3.06, 0.14), (0, 0, 2.43), m["dark"], bevel=0.015),
    ]
    for sx in (-1.16, 1.16):
        for sy in (-1.46, 1.46):
            objs.append(bp.make_box(f"Post_{sx}_{sy}", (0.15, 0.15, 2.50), (sx, sy, 1.25), m["dark"], bevel=0.012))
    for i in range(6):
        y = -1.1 + i * 0.44
        for sx in (-1.18, 1.18):
            objs.append(bp.make_box(f"Rib_{sx}_{i}", (0.07, 0.14, 2.16), (sx, y, 1.25), m["yellow"], bevel=0.008))
    for sx in (-0.35, 0.35):
        objs.append(bp.make_cylinder(f"Bar_{sx}", 0.022, 2.15, 10, (sx, -1.50, 1.25), m["steel"], bevel=0.004))
    return bp.join(objs, "ContainerShort")


def build_workshop_shed():
    m = mats()
    objs = [
        bp.make_box("Slab", (5.4, 4.4, 0.14), (0, 0, 0.07), m["concrete"], bevel=0.015),
        # Techo inclinado de chapa acanalada
        bp.make_box("Roof", (5.8, 4.8, 0.14), (0, 0, 3.45), m["red"], bevel=0.015, rot=(0.14, 0, 0)),
        bp.make_box("BackWall", (5.1, 0.12, 2.95), (0, 2.02, 1.62), m["teal"], bevel=0.01),
    ]
    for sx in (-2.5, 2.5):
        for sy, h in ((-1.95, 3.65), (1.95, 3.10)):
            objs.append(bp.make_box(f"Col_{sx}_{sy}", (0.20, 0.20, h), (sx, sy, h * 0.5 + 0.07), m["dark"], bevel=0.012))
    for i in range(9):
        x = -2.4 + i * 0.60
        objs.append(bp.make_box(f"RoofRib_{i}", (0.14, 4.82, 0.08), (x, 0, 3.54), m["dark"], bevel=0.008, rot=(0.14, 0, 0)))
    objs.append(bp.make_box("BeamFront", (5.2, 0.16, 0.20), (0, -1.95, 3.58), m["yellow"], bevel=0.01))
    objs.append(bp.make_box("LightBar", (2.6, 0.18, 0.10), (0, -0.4, 3.32), m["glow_warm"], bevel=0.008))
    return bp.join(objs, "WorkshopShed")


def build_control_booth():
    m = mats()
    objs = [
        bp.make_box("Base", (2.6, 2.4, 0.20), (0, 0, 0.10), m["concrete"], bevel=0.015),
        bp.make_box("Body", (2.35, 2.15, 2.45), (0, 0, 1.42), m["teal"], bevel=0.02),
        bp.make_box("Roof", (2.75, 2.55, 0.18), (0, -0.05, 2.72), m["dark"], bevel=0.018),
        # Ventana frontal luminosa + visera + repisa
        bp.make_box("WinFrame", (1.65, 0.14, 0.95), (0, -1.08, 1.72), m["dark"], bevel=0.012),
        bp.make_box("WinGlass", (1.46, 0.08, 0.78), (0, -1.11, 1.72), m["glow_cyan"], bevel=0.006),
        bp.make_box("Visor", (1.85, 0.45, 0.08), (0, -1.26, 2.24), m["yellow"], bevel=0.008, rot=(-0.2, 0, 0)),
        bp.make_box("ACUnit", (0.65, 0.42, 0.46), (1.26, 0.25, 1.85), m["cream"], bevel=0.012),
        bp.make_cylinder("RoofBeacon", 0.12, 0.22, 14, (0, 0, 2.92), m["glow_warm"], bevel=0.01),
    ]
    return bp.join(objs, "ControlBooth")


def build_steel_gantry():
    m = mats()
    objs = [
        bp.make_box("BaseL", (1.1, 1.4, 0.36), (-3.6, 0, 0.18), m["concrete"], bevel=0.02),
        bp.make_box("BaseR", (1.1, 1.4, 0.36), (3.6, 0, 0.18), m["concrete"], bevel=0.02),
        bp.make_box("ColL", (0.45, 0.45, 5.2), (-3.6, 0, 2.95), m["dark"], bevel=0.018),
        bp.make_box("ColR", (0.45, 0.45, 5.2), (3.6, 0, 2.95), m["dark"], bevel=0.018),
        bp.make_box("TopBeam", (8.2, 0.55, 0.65), (0, 0, 5.65), m["yellow"], bevel=0.02),
        bp.make_box("Trolley", (0.85, 0.72, 0.42), (0.8, 0, 5.18), m["red"], bevel=0.015),
        bp.make_cylinder("Cable", 0.03, 1.1, 10, (0.8, 0, 4.45), m["steel"]),
        bep.make_torus("Hook", 0.16, 0.04, 16, 8, m["brass"], (0.8, 0, 3.80), (math.pi / 2, 0, 0)),
    ]
    for sx in (-3.6, 3.6):
        objs.append(bp.make_box(f"Brace_{sx}", (0.22, 0.22, 1.4), (sx - 0.55 * (1 if sx > 0 else -1), 0, 4.85), m["dark"], bevel=0.01, rot=(0, 0.75 * (1 if sx > 0 else -1), 0)))
    return bp.join(objs, "SteelGantry")


def build_concrete_pillar():
    m = mats()
    objs = [
        bp.make_box("Foot", (1.25, 1.25, 0.35), (0, 0, 0.175), m["dark"], bevel=0.02),
        bp.make_box("Shaft", (0.85, 0.85, 4.2), (0, 0, 2.45), m["concrete"], bevel=0.025),
        bp.make_box("Band", (0.90, 0.90, 0.55), (0, 0, 1.15), m["hazard"], bevel=0.01),
        bp.make_box("Cap", (1.20, 1.20, 0.30), (0, 0, 4.65), m["dark"], bevel=0.02),
    ]
    return bp.join(objs, "ConcretePillar")


def build_scaffold_tower():
    m = mats()
    objs = [
        bp.make_box("Deck1", (2.1, 2.1, 0.10), (0, 0, 1.80), m["wood"], bevel=0.01),
        bp.make_box("Deck2", (2.1, 2.1, 0.10), (0, 0, 3.60), m["wood"], bevel=0.01),
    ]
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            objs.append(bp.make_cylinder(f"Pipe_{sx}_{sy}", 0.045, 4.5, 10, (sx, sy, 2.25), m["steel"], bevel=0.004))
    for z in (1.8, 3.6, 4.45):
        objs.append(bp.make_box(f"BarX1_{z}", (2.06, 0.06, 0.06), (0, -1.0, z), m["yellow"], bevel=0.006))
        objs.append(bp.make_box(f"BarX2_{z}", (2.06, 0.06, 0.06), (0, 1.0, z), m["yellow"], bevel=0.006))
        objs.append(bp.make_box(f"BarY1_{z}", (0.06, 2.06, 0.06), (-1.0, 0, z), m["yellow"], bevel=0.006))
        objs.append(bp.make_box(f"BarY2_{z}", (0.06, 2.06, 0.06), (1.0, 0, z), m["yellow"], bevel=0.006))
    # Cruceta diagonal frontal y trasera
    for sy in (-1.0, 1.0):
        objs.append(bp.make_box(f"DiagA_{sy}", (2.5, 0.04, 0.05), (0, sy, 0.92), m["dark"], bevel=0.004, rot=(0, 0.68, 0)))
        objs.append(bp.make_box(f"DiagB_{sy}", (2.5, 0.04, 0.05), (0, sy, 2.72), m["dark"], bevel=0.004, rot=(0, -0.68, 0)))
    return bp.join(objs, "ScaffoldTower")


# ---------------------------------------------------------------------------
# Categoría 2: Caminos, Rampas y Puentes (6 nuevas + scrap_ramp + metal_catwalk = 8)
# ---------------------------------------------------------------------------

def build_catwalk_stairs():
    m = mats()
    steps = 8
    objs = [
        bp.make_box("StringerL", (0.10, 3.8, 0.24), (-0.75, 0, 1.10), m["dark"], bevel=0.01, rot=(-0.56, 0, 0)),
        bp.make_box("StringerR", (0.10, 3.8, 0.24), (0.75, 0, 1.10), m["dark"], bevel=0.01, rot=(-0.56, 0, 0)),
        bp.make_box("RailL", (0.06, 3.8, 0.06), (-0.75, 0, 2.05), m["yellow"], bevel=0.008, rot=(-0.56, 0, 0)),
        bp.make_box("RailR", (0.06, 3.8, 0.06), (0.75, 0, 2.05), m["yellow"], bevel=0.008, rot=(-0.56, 0, 0)),
    ]
    for i in range(steps):
        t = (i + 0.5) / steps
        y = 1.5 - t * 3.0
        z = 0.14 + t * 2.0
        objs.append(bp.make_box(f"Step_{i}", (1.45, 0.34, 0.07), (0, y, z), m["steel"], bevel=0.008))
    for sx in (-0.75, 0.75):
        objs.append(bp.make_box(f"PostB_{sx}", (0.07, 0.07, 1.0), (sx, 1.55, 0.55), m["dark"], bevel=0.006))
        objs.append(bp.make_box(f"PostT_{sx}", (0.07, 0.07, 1.0), (sx, -1.55, 2.55), m["dark"], bevel=0.006))
    return bp.join(objs, "CatwalkStairs")


def build_bridge_deck_wood():
    m = mats()
    objs = [
        bp.make_box("BeamL", (0.24, 5.0, 0.34), (-1.45, 0, 0.17), m["dark"], bevel=0.014),
        bp.make_box("BeamR", (0.24, 5.0, 0.34), (1.45, 0, 0.17), m["dark"], bevel=0.014),
        bp.make_box("CurbL", (0.18, 5.0, 0.22), (-1.65, 0, 0.45), m["yellow"], bevel=0.01),
        bp.make_box("CurbR", (0.18, 5.0, 0.22), (1.65, 0, 0.45), m["yellow"], bevel=0.01),
    ]
    for i in range(11):
        y = -2.25 + i * 0.45
        objs.append(bp.make_box(f"Plank_{i}", (3.45, 0.40, 0.12), (0, y, 0.38), m["wood"], bevel=0.012))
    return bp.join(objs, "BridgeDeckWood")


def build_bridge_deck_steel():
    m = mats()
    objs = [
        bp.make_box("Plate", (3.8, 5.0, 0.22), (0, 0, 0.25), m["dark"], bevel=0.015),
        bp.make_box("CurbL", (0.24, 5.0, 0.32), (-1.82, 0, 0.45), m["hazard"], bevel=0.012),
        bp.make_box("CurbR", (0.24, 5.0, 0.32), (1.82, 0, 0.45), m["hazard"], bevel=0.012),
    ]
    for i in range(6):
        y = -2.1 + i * 0.84
        objs.append(bp.make_box(f"Rib_{i}", (3.4, 0.12, 0.16), (0, y, 0.08), m["steel"], bevel=0.008))
    return bp.join(objs, "BridgeDeckSteel")


def build_ramp_wide_low():
    m = mats()
    length = math.hypot(6.4, 1.0)
    ang = math.atan2(1.0, 6.4)
    objs = [
        bp.make_box("Deck", (5.4, length, 0.18), (0, 0, 0.50), m["dark"], bevel=0.015, rot=(-ang, 0, 0)),
        bp.make_box("CurbL", (0.28, length, 0.26), (-2.56, 0, 0.62), m["yellow"], bevel=0.012, rot=(-ang, 0, 0)),
        bp.make_box("CurbR", (0.28, length, 0.26), (2.56, 0, 0.62), m["yellow"], bevel=0.012, rot=(-ang, 0, 0)),
        bp.make_box("BackWall", (5.4, 0.24, 0.98), (0, -3.08, 0.49), m["concrete"], bevel=0.015),
    ]
    return bp.join(objs, "RampWideLow")


def build_jump_kicker():
    m = mats()
    length = math.hypot(3.6, 1.5)
    ang = math.atan2(1.5, 3.6)
    objs = [
        bp.make_box("Deck", (3.2, length, 0.16), (0, 0, 0.78), m["red"], bevel=0.014, rot=(-ang, 0, 0)),
        bp.make_box("CurbL", (0.22, length, 0.24), (-1.52, 0, 0.90), m["hazard"], bevel=0.01, rot=(-ang, 0, 0)),
        bp.make_box("CurbR", (0.22, length, 0.24), (1.52, 0, 0.90), m["hazard"], bevel=0.01, rot=(-ang, 0, 0)),
        bp.make_box("LegL", (0.24, 0.24, 1.48), (-1.40, -1.65, 0.74), m["dark"], bevel=0.012),
        bp.make_box("LegR", (0.24, 0.24, 1.48), (1.40, -1.65, 0.74), m["dark"], bevel=0.012),
        bp.make_box("Brace", (2.8, 0.16, 0.16), (0, -1.65, 0.75), m["steel"], bevel=0.008),
    ]
    return bp.join(objs, "JumpKicker")


def build_platform_hex():
    m = mats()
    objs = [
        bp.make_cylinder("HexDeck", 2.4, 0.28, 6, (0, 0, 0.24), m["dark"], bevel=0.02),
        bp.make_cylinder("HexTrim", 2.1, 0.06, 6, (0, 0, 0.40), m["yellow"], bevel=0.008),
        bp.make_cylinder("HexCore", 1.7, 0.07, 6, (0, 0, 0.41), m["concrete"], bevel=0.008),
    ]
    for i in range(6):
        a = i * math.pi / 3.0
        objs.append(bp.make_cylinder(f"Foot_{i}", 0.18, 0.22, 8, (1.85 * math.cos(a), 1.85 * math.sin(a), 0.11), m["steel"], bevel=0.01))
    return bp.join(objs, "PlatformHex")


# ---------------------------------------------------------------------------
# Categoría 3: Barreras, Cercos y Seguridad (7 nuevas + tire_barrier = 8)
# ---------------------------------------------------------------------------

def build_jersey_concrete():
    m = mats()
    # Perfil trapezoidal de barrera New Jersey
    bm = bmesh.new()
    prof = [(-0.34, 0.0), (0.34, 0.0), (0.28, 0.22), (0.14, 0.38), (0.10, 0.92), (-0.10, 0.92), (-0.14, 0.38), (-0.28, 0.22)]
    v_a = [bm.verts.new((-1.3, y, z)) for y, z in prof]
    v_b = [bm.verts.new((1.3, y, z)) for y, z in prof]
    n = len(prof)
    for i in range(n):
        ni = (i + 1) % n
        bm.faces.new((v_a[i], v_b[i], v_b[ni], v_a[ni]))
    bm.faces.new(list(reversed(v_a)))
    bm.faces.new(v_b)
    bmesh.ops.bevel(bm, geom=bm.edges, offset=0.015, segments=2, affect="EDGES")
    body = bep.add_bm("JerseyBody", bm, m["concrete"])
    stripe = bp.make_box("TopStripe", (2.45, 0.22, 0.14), (0, 0, 0.84), m["hazard"], bevel=0.008)
    return bp.join([body, stripe], "JerseyConcrete")


def build_fence_corrugated():
    m = mats()
    objs = [
        bp.make_box("Panel", (3.4, 0.08, 1.85), (0, 0, 1.05), m["teal"], bevel=0.008),
        bp.make_box("PostL", (0.16, 0.18, 2.25), (-1.72, 0, 1.125), m["wood"], bevel=0.012),
        bp.make_box("PostR", (0.16, 0.18, 2.25), (1.72, 0, 1.125), m["wood"], bevel=0.012),
        bp.make_box("RailTop", (3.55, 0.12, 0.10), (0, 0.06, 1.85), m["wood"], bevel=0.008),
        bp.make_box("RailBot", (3.55, 0.12, 0.10), (0, 0.06, 0.38), m["wood"], bevel=0.008),
    ]
    for i in range(9):
        x = -1.48 + i * 0.37
        objs.append(bp.make_box(f"Rib_{i}", (0.10, 0.12, 1.82), (x, -0.02, 1.05), m["red"] if i % 4 == 0 else m["teal"], bevel=0.006))
    return bp.join(objs, "FenceCorrugated")


def build_fence_chainlink():
    m = mats()
    objs = [
        bp.make_cylinder("PostL", 0.045, 2.2, 10, (-1.6, 0, 1.1), m["steel"], bevel=0.004),
        bp.make_cylinder("PostR", 0.045, 2.2, 10, (1.6, 0, 1.1), m["steel"], bevel=0.004),
        bp.make_box("TopRail", (3.24, 0.06, 0.06), (0, 0, 2.15), m["steel"], bevel=0.005),
        bp.make_box("BotRail", (3.24, 0.06, 0.06), (0, 0, 0.18), m["steel"], bevel=0.005),
        bp.make_box("MidRail", (3.24, 0.05, 0.05), (0, 0, 1.15), m["dark"], bevel=0.004),
    ]
    for i in range(7):
        x = -1.2 + i * 0.4
        objs.append(bp.make_box(f"Bar_{i}", (0.03, 0.03, 1.95), (x, 0, 1.16), m["dark"], bevel=0.003))
    return bp.join(objs, "FenceChainlink")


def build_guardrail_steel():
    m = mats()
    objs = [
        bp.make_box("RailUpper", (3.6, 0.12, 0.14), (0, -0.05, 0.72), m["steel"], bevel=0.012),
        bp.make_box("RailLower", (3.6, 0.12, 0.14), (0, -0.05, 0.52), m["steel"], bevel=0.012),
    ]
    for x in (-1.5, 0.0, 1.5):
        objs.append(bp.make_box(f"Post_{x}", (0.12, 0.12, 0.92), (x, 0.04, 0.46), m["dark"], bevel=0.008))
        objs.append(bp.make_box(f"Refl_{x}", (0.09, 0.04, 0.12), (x, -0.12, 0.62), m["yellow"], bevel=0.004))
    return bp.join(objs, "GuardrailSteel")


def build_road_barricade():
    m = mats()
    objs = [
        bp.make_box("BoardTop", (1.9, 0.07, 0.28), (0, 0, 0.90), m["hazard"], bevel=0.008),
        bp.make_box("BoardMid", (1.9, 0.07, 0.22), (0, 0, 0.54), m["wood"], bevel=0.008),
        bp.make_cylinder("Beacon", 0.09, 0.16, 12, (0, 0, 1.12), m["glow_warm"], bevel=0.008),
    ]
    for sx in (-0.75, 0.75):
        objs.append(bp.make_box(f"LegF_{sx}", (0.09, 0.09, 1.12), (sx, -0.22, 0.54), m["dark"], bevel=0.006, rot=(0.24, 0, 0)))
        objs.append(bp.make_box(f"LegB_{sx}", (0.09, 0.09, 1.12), (sx, 0.22, 0.54), m["dark"], bevel=0.006, rot=(-0.24, 0, 0)))
    return bp.join(objs, "RoadBarricade")


def build_traffic_cone_group():
    m = mats()
    objs = []
    for i, (cx, cy) in enumerate(((0.0, 0.0), (-0.52, 0.34), (0.48, 0.28))):
        objs.append(bp.make_box(f"Base_{i}", (0.36, 0.36, 0.05), (cx, cy, 0.025), m["rubber"], bevel=0.008))
        cone = bp.lathe(f"Cone_{i}", [
            (0.0, 0.05), (0.14, 0.05), (0.05, 0.64), (0.035, 0.66), (0.0, 0.66),
        ], 16, m["orange"])
        cone.location = (cx, cy, 0)
        objs.append(cone)
        band = bp.lathe(f"Band_{i}", [(0.098, 0.32), (0.078, 0.46)], 16, m["cream"])
        band.location = (cx, cy, 0)
        objs.append(band)
    return bp.join(objs, "TrafficConeGroup")


def build_bollard_heavy():
    m = mats()
    objs = [
        bp.make_cylinder("Base", 0.24, 0.08, 16, (0, 0, 0.04), m["dark"], bevel=0.008),
        bp.make_cylinder("Body", 0.14, 0.92, 18, (0, 0, 0.54), m["yellow"], bevel=0.015),
        bp.make_cylinder("Band", 0.146, 0.18, 18, (0, 0, 0.72), m["dark"], bevel=0.006),
        bp.make_cylinder("Cap", 0.14, 0.08, 18, (0, 0, 1.02), m["dark"], bevel=0.02),
    ]
    return bp.join(objs, "BollardHeavy")


# ---------------------------------------------------------------------------
# Categoría 4: Iluminación, Energía y Señalética (6 nuevas + floodlight + goal_arch = 8)
# ---------------------------------------------------------------------------

def build_street_lamp_rust():
    m = mats()
    objs = [
        bp.make_cylinder("Base", 0.26, 0.35, 12, (0, 0, 0.175), m["concrete"], bevel=0.015),
        bp.make_cylinder("Pole", 0.08, 4.4, 12, (0, 0, 2.45), m["dark"], bevel=0.008),
        bp.make_box("Arm", (0.10, 1.15, 0.10), (0, -0.52, 4.68), m["dark"], bevel=0.008, rot=(-0.18, 0, 0)),
        bp.make_box("Shade", (0.46, 0.62, 0.18), (0, -1.06, 4.74), m["teal"], bevel=0.015),
        bp.make_box("Bulb", (0.34, 0.46, 0.08), (0, -1.06, 4.62), m["glow_warm"], bevel=0.008),
    ]
    return bp.join(objs, "StreetLampRust")


def build_generator_industrial():
    m = mats()
    objs = [
        bp.make_box("Skid", (2.3, 1.5, 0.18), (0, 0, 0.09), m["dark"], bevel=0.015),
        bp.make_box("Housing", (2.05, 1.25, 1.25), (0, 0, 0.80), m["red"], bevel=0.025),
        bp.make_box("Panel", (0.65, 0.10, 0.62), (-0.45, -0.64, 0.92), m["dark"], bevel=0.01),
        bp.make_box("Gauge", (0.28, 0.08, 0.20), (-0.45, -0.68, 1.02), m["glow_cyan"], bevel=0.005),
        bp.make_cylinder("Exhaust", 0.07, 0.72, 12, (0.72, 0.25, 1.72), m["steel"], bevel=0.006),
        bp.make_cylinder("Muffler", 0.14, 0.42, 14, (0.72, 0.25, 1.56), m["dark"], bevel=0.01),
        bp.make_box("FuelTank", (0.85, 0.92, 0.26), (-0.35, 0, 1.55), m["yellow"], bevel=0.015),
    ]
    return bp.join(objs, "GeneratorIndustrial")


def build_transformer_box():
    m = mats()
    objs = [
        bp.make_box("Pad", (1.6, 1.3, 0.18), (0, 0, 0.09), m["concrete"], bevel=0.015),
        bp.make_box("Cabinet", (1.35, 1.05, 1.65), (0, 0, 1.00), m["teal"], bevel=0.02),
        bp.make_box("DoorTrim", (1.15, 0.08, 1.42), (0, -0.52, 1.00), m["dark"], bevel=0.01),
        bp.make_box("WarnSign", (0.36, 0.06, 0.36), (0, -0.55, 1.25), m["hazard"], bevel=0.006),
    ]
    for sx in (-0.38, 0.0, 0.38):
        objs.append(bp.make_cylinder(f"Ins_{sx}", 0.07, 0.32, 12, (sx, 0, 1.98), m["cream"], bevel=0.008))
        objs.append(bp.make_cylinder(f"Tip_{sx}", 0.03, 0.12, 10, (sx, 0, 2.18), m["copper"], bevel=0.004))
    return bp.join(objs, "TransformerBox")


def build_arrow_sign_post():
    m = mats()
    objs = [
        bp.make_box("Base", (0.55, 0.55, 0.14), (0, 0, 0.07), m["concrete"], bevel=0.012),
        bp.make_box("Post", (0.14, 0.14, 2.45), (0, 0, 1.30), m["wood"], bevel=0.01),
        bp.make_box("Board", (1.25, 0.08, 0.42), (0.15, -0.09, 2.15), m["yellow"], bevel=0.01),
        bp.make_box("TipA", (0.36, 0.08, 0.36), (0.76, -0.09, 2.15), m["yellow"], bevel=0.008, rot=(0, 0.785, 0)),
        bp.make_box("Stripe", (0.85, 0.09, 0.12), (0.12, -0.10, 2.15), m["dark"], bevel=0.004),
    ]
    return bp.join(objs, "ArrowSignPost")


def build_billboard_workshop():
    m = mats()
    objs = [
        bp.make_box("BaseL", (0.75, 0.85, 0.30), (-2.1, 0, 0.15), m["concrete"], bevel=0.018),
        bp.make_box("BaseR", (0.75, 0.85, 0.30), (2.1, 0, 0.15), m["concrete"], bevel=0.018),
        bp.make_box("LegL", (0.24, 0.24, 3.6), (-2.1, 0, 2.05), m["dark"], bevel=0.012),
        bp.make_box("LegR", (0.24, 0.24, 3.6), (2.1, 0, 2.05), m["dark"], bevel=0.012),
        bp.make_box("Frame", (5.2, 0.24, 2.3), (0, -0.05, 3.55), m["dark"], bevel=0.02),
        bp.make_box("Board", (4.85, 0.14, 1.95), (0, -0.12, 3.55), m["wood"], bevel=0.012),
        bp.make_box("Header", (4.6, 0.16, 0.38), (0, -0.15, 4.18), m["yellow"], bevel=0.008),
    ]
    for sx in (-1.5, 0.0, 1.5):
        objs.append(bp.make_box(f"LampArm_{sx}", (0.10, 0.55, 0.08), (sx, -0.35, 4.72), m["steel"], bevel=0.006))
        objs.append(bp.make_box(f"Lamp_{sx}", (0.34, 0.22, 0.14), (sx, -0.62, 4.65), m["glow_warm"], bevel=0.006))
    return bp.join(objs, "BillboardWorkshop")


def build_radio_antenna_mast():
    m = mats()
    objs = [
        bp.make_box("Base", (1.4, 1.4, 0.30), (0, 0, 0.15), m["concrete"], bevel=0.02),
    ]
    for sx in (-0.42, 0.42):
        for sy in (-0.42, 0.42):
            objs.append(bp.make_cylinder(f"Leg_{sx}_{sy}", 0.045, 5.4, 8, (sx * 0.8, sy * 0.8, 2.95), m["dark"], bevel=0.004))
    for z in (1.2, 2.4, 3.6, 4.8):
        objs.append(bp.make_box(f"RingX_{z}", (0.84, 0.06, 0.06), (0, -0.34, z), m["red"], bevel=0.005))
        objs.append(bp.make_box(f"RingX2_{z}", (0.84, 0.06, 0.06), (0, 0.34, z), m["red"], bevel=0.005))
    objs.append(bp.make_cylinder("Spire", 0.035, 1.8, 10, (0, 0, 6.2), m["steel"], bevel=0.003))
    objs.append(bp.make_cylinder("Beacon", 0.11, 0.22, 12, (0, 0, 7.15), m["glow_warm"], bevel=0.01))
    dish = bp.lathe("Dish", [(0.0, 0.0), (0.52, 0.14), (0.54, 0.18), (0.48, 0.19), (0.0, 0.06)], 20, m["cream"])
    dish.rotation_euler = (math.pi / 2 - 0.3, 0, 0)
    dish.location = (0, -0.52, 4.35)
    objs.append(dish)
    return bp.join(objs, "RadioAntennaMast")


# ---------------------------------------------------------------------------
# Categoría 5: Taller, Bancos y Herramienta Pesada (6 piezas)
# ---------------------------------------------------------------------------

def build_workbench_heavy():
    m = mats()
    objs = [
        bp.make_box("Top", (2.2, 0.95, 0.12), (0, 0, 0.94), m["wood"], bevel=0.015),
        bp.make_box("Shelf", (2.0, 0.82, 0.07), (0, 0, 0.28), m["wood"], bevel=0.01),
        bp.make_box("Backboard", (2.2, 0.08, 0.72), (0, 0.44, 1.32), m["dark"], bevel=0.01),
        # Morsa / tornillo de banco en la esquina
        bp.make_box("ViseBase", (0.28, 0.34, 0.16), (0.78, -0.32, 1.08), m["teal"], bevel=0.012),
        bp.make_cylinder("ViseHandle", 0.018, 0.28, 10, (0.78, -0.54, 1.08), m["steel"], bevel=0.003),
    ]
    objs[-1].rotation_euler = (0, math.pi / 2, 0)
    for sx in (-0.98, 0.98):
        for sy in (-0.38, 0.38):
            objs.append(bp.make_box(f"Leg_{sx}_{sy}", (0.10, 0.10, 0.90), (sx, sy, 0.45), m["dark"], bevel=0.008))
    return bp.join(objs, "WorkbenchHeavy")


def build_tool_rack_wall():
    m = mats()
    objs = []
    for sx in (-0.95, 0.95):
        for sy in (-0.32, 0.32):
            objs.append(bp.make_box(f"Post_{sx}_{sy}", (0.07, 0.07, 2.05), (sx, sy, 1.025), m["dark"], bevel=0.006))
    for z in (0.20, 0.85, 1.50, 2.02):
        objs.append(bp.make_box(f"Shelf_{z}", (1.96, 0.70, 0.06), (0, 0, z), m["steel"], bevel=0.006))
    # Cajas y latas decorativas en los estantes
    objs.append(bp.make_box("Bin1", (0.55, 0.48, 0.34), (-0.52, 0, 1.05), m["red"], bevel=0.01))
    objs.append(bp.make_box("Bin2", (0.55, 0.48, 0.34), (0.15, 0, 1.05), m["yellow"], bevel=0.01))
    objs.append(bp.make_cylinder("Can1", 0.14, 0.32, 14, (0.65, 0, 1.69), m["teal"], bevel=0.006))
    objs.append(bp.make_cylinder("Can2", 0.14, 0.32, 14, (-0.40, 0, 1.69), m["orange"], bevel=0.006))
    objs.append(bp.make_box("CrateLow", (0.72, 0.54, 0.44), (0.30, 0, 0.45), m["wood"], bevel=0.012))
    return bp.join(objs, "ToolRackWall")


def build_anvil_stump():
    m = mats()
    objs = [
        bp.make_cylinder("Stump", 0.34, 0.62, 14, (0, 0, 0.31), m["wood"], bevel=0.018),
        bep.make_torus("Band1", 0.342, 0.016, 20, 8, m["dark"], (0, 0, 0.48)),
        bep.make_torus("Band2", 0.342, 0.016, 20, 8, m["dark"], (0, 0, 0.16)),
        # Yunque metálico encima
        bp.make_box("AnvilFoot", (0.44, 0.28, 0.10), (0, 0, 0.67), m["dark"], bevel=0.012),
        bp.make_box("AnvilWaist", (0.30, 0.20, 0.18), (0, 0, 0.79), m["dark"], bevel=0.012),
        bp.make_box("AnvilTop", (0.56, 0.26, 0.14), (0.04, 0, 0.93), m["steel"], bevel=0.014),
    ]
    horn = bp.lathe("AnvilHorn", [(0.0, 0.0), (0.10, 0.0), (0.04, 0.24), (0.0, 0.28)], 14, m["steel"])
    horn.rotation_euler = (0, -math.pi / 2, 0)
    horn.location = (-0.22, 0, 0.93)
    objs.append(horn)
    return bp.join(objs, "AnvilStump")


def build_oil_tank_stand():
    m = mats()
    tank = bp.lathe("TankBody", [
        (0.0, -0.95), (0.48, -0.92), (0.58, -0.78), (0.58, 0.78), (0.48, 0.92), (0.0, 0.95),
    ], 22, m["red"])
    tank.rotation_euler = (0, math.pi / 2, 0)
    tank.location = (0, 0, 1.55)
    objs = [
        tank,
        bp.make_cylinder("Cap", 0.11, 0.14, 12, (0, 0, 2.18), m["brass"], bevel=0.008),
        bp.make_cylinder("Spigot", 0.04, 0.24, 10, (1.02, 0, 1.38), m["brass"], bevel=0.004),
    ]
    objs[-1].rotation_euler = (0, math.pi / 2, 0)
    for sx in (-0.65, 0.65):
        for sy in (-0.48, 0.48):
            objs.append(bp.make_box(f"Leg_{sx}_{sy}", (0.12, 0.12, 1.25), (sx, sy, 0.625), m["dark"], bevel=0.008))
        objs.append(bp.make_box(f"Cradle_{sx}", (0.16, 1.05, 0.14), (sx, 0, 1.06), m["dark"], bevel=0.01))
    return bp.join(objs, "OilTankStand")


def build_compressor_cart():
    m = mats()
    tank = bp.lathe("CompTank", [
        (0.0, -0.52), (0.20, -0.49), (0.24, -0.40), (0.24, 0.40), (0.20, 0.49), (0.0, 0.52),
    ], 20, m["red"])
    tank.rotation_euler = (0, math.pi / 2, 0)
    tank.location = (0, 0, 0.44)
    objs = [
        tank,
        bp.make_box("Motor", (0.34, 0.28, 0.28), (-0.12, 0, 0.80), m["dark"], bevel=0.014),
        bp.make_cylinder("PumpHead", 0.11, 0.26, 14, (0.20, 0, 0.80), m["steel"], bevel=0.008),
        bp.make_cylinder("Gauge", 0.07, 0.05, 14, (0.35, -0.18, 0.72), m["cream"], bevel=0.005),
        bp.make_box("Handle", (0.10, 0.48, 0.06), (-0.62, 0, 0.76), m["yellow"], bevel=0.008),
    ]
    objs[3].rotation_euler = (math.pi / 2, 0, 0)
    for sy in (-0.30, 0.30):
        w = bp.make_cylinder(f"Wheel_{sy}", 0.18, 0.08, 16, (0.25, sy, 0.18), m["rubber"], bevel=0.01)
        w.rotation_euler = (math.pi / 2, 0, 0)
        objs.append(w)
    objs.append(bp.make_box("Foot", (0.10, 0.42, 0.22), (-0.38, 0, 0.11), m["dark"], bevel=0.008))
    return bp.join(objs, "CompressorCart")


def build_crane_hook_jib():
    m = mats()
    objs = [
        bp.make_cylinder("Base", 0.48, 0.22, 16, (0, 0, 0.11), m["concrete"], bevel=0.015),
        bp.make_cylinder("Mast", 0.18, 3.8, 16, (0, 0, 2.05), m["yellow"], bevel=0.012),
        bp.make_box("Boom", (0.22, 2.8, 0.28), (0, -1.25, 3.82), m["yellow"], bevel=0.014),
        bp.make_box("Brace", (0.14, 1.8, 0.14), (0, -0.78, 3.20), m["dark"], bevel=0.01, rot=(-0.62, 0, 0)),
        bp.make_cylinder("Pulley", 0.16, 0.10, 14, (0, -2.42, 3.60), m["dark"], bevel=0.008),
        bp.make_cylinder("Rope", 0.025, 1.3, 10, (0, -2.42, 2.88), m["steel"]),
        bep.make_torus("Hook", 0.15, 0.036, 16, 8, m["brass"], (0, -2.42, 2.15), (0, math.pi / 2, 0)),
    ]
    objs[4].rotation_euler = (0, math.pi / 2, 0)
    return bp.join(objs, "CraneHookJib")


# ---------------------------------------------------------------------------
# Categoría 6: Chatarra, Vehículos y Relleno de Desguace (6 piezas)
# ---------------------------------------------------------------------------

def build_scrap_pile_metal():
    m = mats()
    r = random.Random(601)
    objs = [make_rock_blob("Core", 1.15, 602, m["dark"], (0, 0, 0.35), (1.2, 1.0, 0.55))]
    for i in range(10):
        ang = i * 0.65
        mat = m["red"] if i % 3 == 0 else (m["teal"] if i % 3 == 1 else m["steel"])
        objs.append(bp.make_box(
            f"Plate_{i}", (r.uniform(0.6, 1.3), r.uniform(0.4, 1.0), 0.08),
            (r.uniform(-0.7, 0.7), r.uniform(-0.6, 0.6), r.uniform(0.25, 0.95)),
            mat, bevel=0.008, rot=(r.uniform(-0.6, 0.6), r.uniform(-0.6, 0.6), ang),
        ))
    objs.append(bep.make_torus("ScrapWheel", 0.34, 0.12, 16, 8, m["rubber"], (0.65, -0.45, 0.32), (0.7, 0.2, 0.4)))
    return bp.join(objs, "ScrapPileMetal")


def build_barrel_cluster():
    m = mats()
    objs = [
        bp.make_box("Pallet", (1.45, 1.35, 0.14), (0, 0, 0.07), m["wood"], bevel=0.012),
        bp.make_cylinder("B1", 0.28, 0.88, 18, (-0.36, -0.28, 0.58), m["red"], bevel=0.012),
        bp.make_cylinder("B2", 0.28, 0.88, 18, (0.34, -0.22, 0.58), m["teal"], bevel=0.012),
        bp.make_cylinder("B3", 0.28, 0.88, 18, (-0.02, 0.34, 0.58), m["yellow"], bevel=0.012),
    ]
    b4 = bp.make_cylinder("B4", 0.28, 0.88, 18, (0.95, 0.38, 0.28), m["teal"], bevel=0.012)
    b4.rotation_euler = (math.pi / 2, 0, 0.5)
    objs.append(b4)
    return bp.join(objs, "BarrelCluster")


def build_crate_stack_pallet():
    m = mats()
    objs = [
        bp.make_box("Pallet", (1.6, 1.4, 0.14), (0, 0, 0.07), m["wood"], bevel=0.012),
        bp.make_box("Crate1", (0.72, 0.66, 0.64), (-0.38, -0.26, 0.46), m["wood"], bevel=0.016),
        bp.make_box("Crate2", (0.68, 0.64, 0.60), (0.38, -0.24, 0.44), m["wood"], bevel=0.016, rot=(0, 0, 0.08)),
        bp.make_box("Crate3", (0.74, 0.68, 0.62), (0.02, 0.25, 0.45), m["wood"], bevel=0.016, rot=(0, 0, -0.06)),
        bp.make_box("CrateTop", (0.66, 0.62, 0.58), (-0.05, -0.10, 1.04), m["wood"], bevel=0.016, rot=(0, 0, 0.18)),
        bp.make_box("Strap", (0.70, 0.66, 0.06), (-0.05, -0.10, 1.04), m["dark"], bevel=0.005, rot=(0, 0, 0.18)),
    ]
    return bp.join(objs, "CrateStackPallet")


def build_tire_pile_loose():
    m = mats()
    coords = [
        (-0.48, -0.32, 0.18, (0, 0, 0)),
        (0.45, -0.28, 0.18, (0, 0, 0)),
        (0.0, 0.42, 0.18, (0, 0, 0)),
        (-0.22, -0.05, 0.48, (0.14, -0.1, 0)),
        (0.28, 0.12, 0.49, (-0.12, 0.15, 0)),
        (0.02, 0.05, 0.78, (0.22, 0.12, 0)),
    ]
    objs = [bep.make_torus(f"T_{i}", 0.34, 0.16, 20, 10, m["rubber"], (x, y, z), rot) for i, (x, y, z, rot) in enumerate(coords)]
    return bp.join(objs, "TirePileLoose")


def build_rusted_car_shell():
    m = mats()
    objs = [
        bp.make_box("Chassis", (1.85, 4.10, 0.58), (0, 0, 0.32), m["red"], bevel=0.06),
        bp.make_box("Cabin", (1.62, 1.95, 0.68), (0, 0.22, 0.88), m["red"], bevel=0.08),
        bp.make_box("Windshield", (1.46, 0.12, 0.54), (0, -0.74, 0.88), m["dark"], bevel=0.02, rot=(0.35, 0, 0)),
        bp.make_box("BumperF", (1.92, 0.20, 0.22), (0, -2.08, 0.24), m["steel"], bevel=0.02),
        bp.make_box("BumperR", (1.92, 0.20, 0.22), (0, 2.08, 0.24), m["steel"], bevel=0.02),
        bp.make_box("Grille", (1.20, 0.08, 0.28), (0, -2.05, 0.42), m["dark"], bevel=0.01),
    ]
    return bp.join(objs, "RustedCarShell")


def build_pipe_stack_bundle():
    m = mats()
    objs = [
        bp.make_box("ChockL", (1.65, 0.18, 0.14), (0, -1.25, 0.07), m["wood"], bevel=0.01),
        bp.make_box("ChockR", (1.65, 0.18, 0.14), (0, 1.25, 0.07), m["wood"], bevel=0.01),
    ]
    layout = [(-0.46, 0.32), (0.0, 0.32), (0.46, 0.32), (-0.23, 0.72), (0.23, 0.72), (0.0, 1.10)]
    for i, (px, pz) in enumerate(layout):
        p = bp.make_cylinder(f"Pipe_{i}", 0.21, 3.6, 16, (px, 0, pz), m["steel"] if i % 2 == 0 else m["red"], bevel=0.01)
        p.rotation_euler = (math.pi / 2, 0, 0)
        objs.append(p)
    return bp.join(objs, "PipeStackBundle")


# ---------------------------------------------------------------------------
# Categoría 7: Terreno, Vegetación Árida y Naturaleza de Desguace (6 piezas)
# ---------------------------------------------------------------------------

def build_rock_boulder_large():
    m = mats()
    return bp.join([make_rock_blob("Boulder", 1.35, 701, m["rock"], (0, 0, 0.58), (1.25, 1.0, 0.75))], "RockBoulderLarge")


def build_rock_cluster_small():
    m = mats()
    objs = [
        make_rock_blob("R1", 0.62, 711, m["rock"], (-0.42, -0.15, 0.25), (1.15, 0.95, 0.70)),
        make_rock_blob("R2", 0.45, 712, m["rock"], (0.42, 0.12, 0.18), (1.05, 1.2, 0.65)),
        make_rock_blob("R3", 0.32, 713, m["rock"], (0.05, 0.48, 0.13), (1.2, 0.9, 0.60)),
    ]
    return bp.join(objs, "RockClusterSmall")


def build_cliff_slab():
    m = mats()
    objs = [
        bp.make_box("Tier1", (4.6, 3.4, 1.6), (0, 0, 0.8), m["rock"], bevel=0.14),
        bp.make_box("Tier2", (3.8, 2.7, 1.4), (-0.2, 0.15, 2.1), m["rock"], bevel=0.12, rot=(0, 0, 0.08)),
        bp.make_box("Tier3", (2.8, 2.0, 1.1), (0.25, -0.10, 3.2), m["rock"], bevel=0.10, rot=(0, 0, -0.06)),
    ]
    return bp.join(objs, "CliffSlab")


def build_mud_puddle_rim():
    m = mats()
    objs = [
        bp.make_cylinder("MudPool", 2.1, 0.08, 20, (0, 0, 0.04), m["mud"], bevel=0.02),
        bp.make_box("Plank1", (1.6, 0.32, 0.08), (-0.35, -0.45, 0.07), m["wood"], bevel=0.01, rot=(0.04, 0.06, 0.35)),
        bp.make_box("Plank2", (1.3, 0.28, 0.08), (0.55, 0.42, 0.06), m["wood"], bevel=0.01, rot=(-0.05, 0.03, -0.42)),
        bep.make_torus("SunkTire", 0.34, 0.14, 16, 8, m["rubber"], (0.72, -0.58, 0.06), (0.35, 0.2, 0)),
    ]
    return bp.join(objs, "MudPuddleRim")


def build_dead_tree_trunk():
    m = mats()
    objs = [
        bp.make_cylinder("TrunkBot", 0.22, 1.7, 10, (0, 0, 0.82), m["wood"], bevel=0.02),
        bp.make_cylinder("TrunkMid", 0.15, 1.5, 10, (0.12, 0.05, 2.18), m["wood"], bevel=0.015),
        bp.make_cylinder("BranchA", 0.08, 1.25, 8, (-0.42, -0.12, 2.45), m["wood"], bevel=0.01),
        bp.make_cylinder("BranchB", 0.07, 1.15, 8, (0.52, 0.18, 2.85), m["wood"], bevel=0.01),
    ]
    objs[1].rotation_euler = (0.08, 0.16, 0)
    objs[2].rotation_euler = (0.18, -0.82, 0.3)
    objs[3].rotation_euler = (-0.22, 0.74, -0.4)
    return bp.join(objs, "DeadTreeTrunk")


def build_bush_dry_scrub():
    m = mats()
    objs = [
        make_rock_blob("B1", 0.55, 751, m["olive"], (0, 0, 0.35), (1.2, 1.1, 0.85)),
        make_rock_blob("B2", 0.42, 752, m["olive"], (0.42, 0.18, 0.26), (1.0, 1.0, 0.80)),
        make_rock_blob("B3", 0.38, 753, m["olive"], (-0.38, -0.22, 0.24), (1.1, 0.9, 0.78)),
    ]
    return bp.join(objs, "BushDryScrub")


# ---------------------------------------------------------------------------
# Registro completo de las 44 nuevas piezas (más las 6 ya creadas = 50)
# ---------------------------------------------------------------------------

NEW_PIECES = [
    # Batch 1: Estructuras y Contenedores (7) + Caminos (3) = 10
    ("container_red_open", "structures", "Contenedor rojo abierto", build_container_red_open),
    ("container_short", "structures", "Contenedor corto amarillo", build_container_short),
    ("workshop_shed", "structures", "Tinglado de taller", build_workshop_shed),
    ("control_booth", "structures", "Caseta de control", build_control_booth),
    ("steel_gantry", "structures", "Pórtico grúa de acero", build_steel_gantry),
    ("concrete_pillar", "structures", "Pilar industrial de hormigón", build_concrete_pillar),
    ("scaffold_tower", "structures", "Torre de andamio", build_scaffold_tower),
    ("catwalk_stairs", "roads", "Escalera industrial", build_catwalk_stairs),
    ("bridge_deck_wood", "roads", "Tramo puente de madera", build_bridge_deck_wood),
    ("bridge_deck_steel", "roads", "Tramo puente de acero", build_bridge_deck_steel),
    # Batch 2: Caminos (3) + Barreras (7) = 10
    ("ramp_wide_low", "roads", "Rampa ancha baja", build_ramp_wide_low),
    ("jump_kicker", "roads", "Rampa de salto", build_jump_kicker),
    ("platform_hex", "roads", "Plataforma hexagonal", build_platform_hex),
    ("jersey_concrete", "barriers", "Barrera New Jersey", build_jersey_concrete),
    ("fence_corrugated", "barriers", "Cerco de chapa oxidada", build_fence_corrugated),
    ("fence_chainlink", "barriers", "Cerco metálico industrial", build_fence_chainlink),
    ("guardrail_steel", "barriers", "Guardarrail de acero", build_guardrail_steel),
    ("road_barricade", "barriers", "Caballete vial con baliza", build_road_barricade),
    ("traffic_cone_group", "barriers", "Grupo de conos viales", build_traffic_cone_group),
    ("bollard_heavy", "barriers", "Bolardo pesado", build_bollard_heavy),
    # Batch 3: Iluminación/Energía (6) + Taller (6) = 12
    ("street_lamp_rust", "lighting", "Farol cuello de cisne", build_street_lamp_rust),
    ("generator_industrial", "lighting", "Generador eléctrico industrial", build_generator_industrial),
    ("transformer_box", "lighting", "Caja transformador", build_transformer_box),
    ("arrow_sign_post", "lighting", "Poste flecha direccional", build_arrow_sign_post),
    ("billboard_workshop", "lighting", "Cartel grande de taller", build_billboard_workshop),
    ("radio_antenna_mast", "lighting", "Mástil antena con parabólica", build_radio_antenna_mast),
    ("workbench_heavy", "workshop", "Banco de trabajo con morsa", build_workbench_heavy),
    ("tool_rack_wall", "workshop", "Estantería industrial", build_tool_rack_wall),
    ("anvil_stump", "workshop", "Yunque sobre tronco", build_anvil_stump),
    ("oil_tank_stand", "workshop", "Tanque de combustible elevado", build_oil_tank_stand),
    ("compressor_cart", "workshop", "Compresor de aire rodante", build_compressor_cart),
    ("crane_hook_jib", "workshop", "Pluma grúa giratoria", build_crane_hook_jib),
    # Batch 4: Chatarra (6) + Terreno/Naturaleza (6) = 12
    ("scrap_pile_metal", "scrap", "Montón de chatarra metálica", build_scrap_pile_metal),
    ("barrel_cluster", "scrap", "Grupo de barriles en palet", build_barrel_cluster),
    ("crate_stack_pallet", "scrap", "Palet de cajas apiladas", build_crate_stack_pallet),
    ("tire_pile_loose", "scrap", "Pila de neumáticos sueltos", build_tire_pile_loose),
    ("rusted_car_shell", "scrap", "Carcasa de auto oxidado", build_rusted_car_shell),
    ("pipe_stack_bundle", "scrap", "Atado de tubos de acero", build_pipe_stack_bundle),
    ("rock_boulder_large", "terrain", "Roca grande facetada", build_rock_boulder_large),
    ("rock_cluster_small", "terrain", "Grupo de rocas chicas", build_rock_cluster_small),
    ("cliff_slab", "terrain", "Bloque de acantilado", build_cliff_slab),
    ("mud_puddle_rim", "terrain", "Charco de barro con tablas", build_mud_puddle_rim),
    ("dead_tree_trunk", "terrain", "Tronco seco de páramo", build_dead_tree_trunk),
    ("bush_dry_scrub", "terrain", "Matorral seco estilizado", build_bush_dry_scrub),
]

EXISTING_6 = [
    ("container_rust", "structures", "Contenedor corrugado oxidado"),
    ("scrap_ramp", "roads", "Rampa modular de chapa"),
    ("metal_catwalk", "roads", "Pasarela metálica elevada"),
    ("tire_barrier", "barriers", "Barrera de neumáticos"),
    ("floodlight_tower", "lighting", "Torre de reflectores"),
    ("goal_arch", "lighting", "Pórtico de meta con tuerca"),
]

BATCHES = {
    "batch1": NEW_PIECES[0:10],
    "batch2": NEW_PIECES[10:20],
    "batch3": NEW_PIECES[20:32],
    "batch4": NEW_PIECES[32:44],
}


def bake_piece(obj, key, res, tex_dir):
    os.makedirs(tex_dir, exist_ok=True)
    base = bp.new_image(f"{key}_baseColor", res, False)
    rough = bp.new_image(f"{key}_rough_tmp", res, True)
    metal = bp.new_image(f"{key}_metal_tmp", res, True)
    ao = bp.new_image(f"{key}_ao_tmp", res, True)
    normal = bp.new_image(f"{key}_normal", res, True)

    bp.bake(obj, base, "base", 8)
    bp.bake(obj, rough, "rough", 4)
    bp.bake(obj, metal, "metal", 4)
    bp.bake(obj, ao, "ao", 32)
    bp.bake(obj, normal, "normal", 4)

    a_ao, a_r, a_m = bp.px(ao), bp.px(rough), bp.px(metal)
    occl = 0.35 + 0.65 * a_ao[:, 0]
    orm = bp.new_image(f"{key}_orm", res, True)
    o = bp.np.ones((res * res, 4), dtype=bp.np.float32)
    o[:, 0], o[:, 1], o[:, 2] = occl, a_r[:, 0], a_m[:, 0]
    orm.pixels.foreach_set(o.ravel())

    b = bp.px(base)
    k = (1.0 - 0.28 * (1.0 - a_ao[:, 0]))[:, None]
    b[:, :3] *= k
    base.pixels.foreach_set(b.ravel())

    bp.save_png(base, os.path.join(tex_dir, f"{key}_baseColor.png"))
    bp.save_png(orm, os.path.join(tex_dir, f"{key}_orm.png"))
    bp.save_png(normal, os.path.join(tex_dir, f"{key}_normal.png"))
    for tmp in (rough, metal, ao):
        bpy.data.images.remove(tmp)
    return base, orm, normal


def run_piece(key, builder):
    bp.reset_scene()
    obj = builder()
    bp.unwrap(obj)

    art_dir = os.path.join(ENV_ART_DIR, key)
    tex_dir = os.path.join(art_dir, "textures")
    glb_path = os.path.join(ENV_GLB_DIR, f"{key}.glb")

    base, orm, normal = bake_piece(obj, key, RES, tex_dir)
    final = bp.final_material(key, base, orm, normal)
    obj.data.materials.clear()
    obj.data.materials.append(final)
    bp.strip_bake_attrs(obj)

    os.makedirs(ENV_GLB_DIR, exist_ok=True)
    bp.set_active(obj)
    kwargs = dict(
        filepath=glb_path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_tangents=True, export_materials="EXPORT",
        export_image_format="WEBP", export_image_quality=82, export_cameras=False, export_lights=False,
        export_extras=False, export_animations=False,
    )
    try:
        bpy.ops.export_scene.gltf(export_vertex_color="NONE", **kwargs)
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs)
    bp.report(obj, key, glb_path)


def render_category_sheets():
    """Importa los GLB ya exportados por categoría y renderiza 7 láminas de estudio mostrando las 50 piezas."""
    by_cat = {}
    for k, cat, label in EXISTING_6:
        by_cat.setdefault(cat, []).append((k, label))
    for k, cat, label, _ in NEW_PIECES:
        by_cat.setdefault(cat, []).append((k, label))

    os.makedirs(os.path.join(ENV_ART_DIR, "sheets"), exist_ok=True)
    for cat, items in by_cat.items():
        bp.reset_scene()
        imported = []
        cols = 4 if len(items) > 6 else 3
        spacing_x, spacing_y = 6.5, 6.5
        if cat in ("workshop", "scrap", "terrain", "barriers"):
            spacing_x, spacing_y = 4.2, 4.2
        elif cat == "lighting":
            spacing_x, spacing_y = 7.2, 7.2

        for idx, (k, _) in enumerate(items):
            glb = os.path.join(ENV_GLB_DIR, f"{k}.glb")
            if not os.path.exists(glb):
                continue
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=glb)
            added = [o for o in bpy.data.objects if o not in before]
            col = idx % cols
            row = idx // cols
            gx = (col - (cols - 1) * 0.5) * spacing_x
            gy = (row - ((len(items) - 1) // cols) * 0.5) * spacing_y
            for o in added:
                if o.parent is None:
                    o.location.x += gx
                    o.location.y += gy
            imported.extend(added)

        if not imported:
            continue
        bpy.context.view_layer.update()
        meshes = [o for o in imported if o.type == "MESH"]
        pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
        min_v = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        max_v = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        center = (min_v + max_v) * 0.5
        radius = max((max_v - min_v).length * 0.5, 2.0)

        scene = bpy.context.scene
        scene.render.engine = "BLENDER_EEVEE"
        scene.render.resolution_x = 1280
        scene.render.resolution_y = 720
        scene.render.film_transparent = False
        world = bpy.data.worlds.new("SheetWorld")
        scene.world = world
        world.use_nodes = True
        bg = world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs["Color"].default_value = bp.hex_rgba("#9ca7b4")
            bg.inputs["Strength"].default_value = 0.9

        sun_d = bpy.data.lights.new("Sun", "SUN")
        sun_d.energy = 3.2
        sun_d.color = (1.0, 0.94, 0.84)
        sun = bp.link_obj(bpy.data.objects.new("Sun", sun_d))
        sun.rotation_euler = (math.radians(48), math.radians(12), math.radians(32))

        floor_m = bpy.data.materials.new("FloorM")
        floor_m.use_nodes = True
        bp.principled_of(floor_m).inputs["Base Color"].default_value = bp.hex_rgba("#8c8379")
        bp.principled_of(floor_m).inputs["Roughness"].default_value = 0.92
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=radius * 3.0)
        fm = bpy.data.meshes.new("Floor")
        bm.to_mesh(fm)
        bm.free()
        floor = bp.link_obj(bpy.data.objects.new("Floor", fm))
        fm.materials.append(floor_m)
        floor.location.z = min_v.z

        cam_d = bpy.data.cameras.new("Cam")
        cam_d.lens = 42
        cam_d.clip_end = 400
        cam = bp.link_obj(bpy.data.objects.new("Cam", cam_d))
        scene.camera = cam
        cam_pos = center + Vector((radius * 1.15, -radius * 1.95, radius * 1.15))
        cam.location = cam_pos
        cam.rotation_euler = (center - cam_pos).to_track_quat("-Z", "Y").to_euler()
        out_png = os.path.join(ENV_ART_DIR, "sheets", f"sheet_{cat}.png")
        scene.render.filepath = out_png
        bpy.ops.render.render(write_still=True)
        print(f"[SHEET] {cat} ({len(items)} pcs) -> {out_png}")


def write_catalog():
    entries = []
    for k, cat, label in EXISTING_6:
        entries.append({"id": k, "category": cat, "label": label, "url": f"models/environment/{k}.glb"})
    for k, cat, label, _ in NEW_PIECES:
        entries.append({"id": k, "category": cat, "label": label, "url": f"models/environment/{k}.glb"})
    path = os.path.join(ENV_GLB_DIR, "catalog.json")
    os.makedirs(ENV_GLB_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"version": 1, "count": len(entries), "pieces": entries}, f, indent=2, ensure_ascii=False)
    print(f"[CATALOG] {len(entries)} pieces -> {path}")


if __name__ == "__main__":
    if WHICH == "sheets":
        render_category_sheets()
        write_catalog()
    elif WHICH == "catalog":
        write_catalog()
    elif WHICH in BATCHES:
        for k, _, _, fn in BATCHES[WHICH]:
            run_piece(k, fn)
    elif WHICH == "all":
        for k, _, _, fn in NEW_PIECES:
            run_piece(k, fn)
        write_catalog()
        render_category_sheets()
    else:
        found = [p for p in NEW_PIECES if p[0] == WHICH]
        if not found:
            raise SystemExit(f"Unknown target: {WHICH}")
        run_piece(found[0][0], found[0][3])
