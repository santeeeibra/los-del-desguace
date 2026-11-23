"""
Los del Desguace — Flota de 6 Coches Reutilizables de Alta Calidad para Escenarios
(Blender 5.2.3 LTS + horneado Cycles 1024 px `baseColor`/`ORM`/`normal` → 1 material WebP).

Genera 6 modelos distintos en `public/models/environment/` (+ actualiza `rusted_car_shell.glb`
y `catalog.json`):
  1. car_sedan_classic.glb     — Sedán clásico 70s (rojo óxido)
  2. car_pickup_rust.glb       — Pickup de taller con caja de madera y barra antivuelco (turquesa)
  3. car_van_cargo.glb         — Furgoneta de reparto con portaequipajes (amarillo mostaza)
  4. car_hatchback_compact.glb — Compacto hatchback urbano (verde militar)
  5. car_jeep_offroad.glb      — 4x4 todo terreno con jaula tubular y rueda de auxilio (arena/ocre)
  6. car_coupe_muscle.glb      — Coupé fastback con toma de aire y doble escape (azul acero)
  + rusted_car_shell.glb       — Carcasa de sedán desarmado sin ruedas (actualiza la del kit)

Uso:
    blender -b --factory-startup -P art/blender/build_reusable_cars.py -- all 1024
"""

import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import build_props as bp  # noqa: E402
import build_extra_props as bep  # noqa: E402

REPO = os.path.normpath(os.path.join(ROOT, "..", ".."))
CAR_ART_DIR = os.path.join(REPO, "art", "environment", "cars")
ENV_GLB_DIR = os.path.join(REPO, "public", "models", "environment")

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
WHICH = argv[0] if len(argv) > 0 else "all"
RES = int(argv[1]) if len(argv) > 1 else 1024

PAL = {
    "red": (bp.hex_rgba("#bd3c26"), bp.hex_rgba("#7f2214")),
    "teal": (bp.hex_rgba("#38857d"), bp.hex_rgba("#21524d")),
    "mustard": (bp.hex_rgba("#dfa42c"), bp.hex_rgba("#a87518")),
    "olive": (bp.hex_rgba("#52643a"), bp.hex_rgba("#334022")),
    "sand": (bp.hex_rgba("#c9a368"), bp.hex_rgba("#8e6d3d")),
    "steel_blue": (bp.hex_rgba("#46677d"), bp.hex_rgba("#2a4252")),
    "dark": (bp.hex_rgba("#292e34"), bp.hex_rgba("#181b1f")),
    "glass": (bp.hex_rgba("#1b262e"), bp.hex_rgba("#10171c")),
    "chrome": bp.hex_rgba("#bfc6cc"),
    "brass": bp.hex_rgba("#d8a63c"),
    "rubber": bp.hex_rgba("#232426"),
    "headlight": bp.hex_rgba("#f5ebd2"),
    "taillight": bp.hex_rgba("#c92a1e"),
    "amber": bp.hex_rgba("#f09a24"),
}


def car_mats(paint_key, wear=1.05, rust=0.65):
    c1, c2 = PAL[paint_key]
    return {
        "body": bp.mat_painted_metal(f"A_Body_{paint_key}", c1, c2, wear_amt=wear, rust_amt=rust, paint_rough=0.46),
        "dark": bp.mat_painted_metal("A_CarDark", PAL["dark"][0], PAL["dark"][1], wear_amt=0.85, rust_amt=0.45, paint_rough=0.62),
        "glass": bp.mat_painted_metal("A_CarGlass", PAL["glass"][0], PAL["glass"][1], wear_amt=0.05, rust_amt=0.0, paint_rough=0.14),
        "chrome": bp.mat_bare_metal("A_CarChrome", PAL["chrome"], rough=0.24),
        "brass": bp.mat_bare_metal("A_CarBrass", PAL["brass"], rough=0.30),
        "rubber": bep.mat_rubber("A_CarRubber"),
        "wood": bp.mat_wood("A_CarWood"),
        "headlight": bp.mat_flat("A_Headlight", PAL["headlight"], rough=0.15),
        "taillight": bp.mat_flat("A_Taillight", PAL["taillight"], rough=0.22),
        "amber": bp.mat_flat("A_Amber", PAL["amber"], rough=0.22),
    }


def make_profile_extrude(name, pts_yz, width, mat, bevel=0.035, x_taper_top=1.0):
    """Extruye un perfil lateral (y, z) a lo largo de X con estrechamiento superior opcional."""
    bm = bmesh.new()
    hw = width * 0.5
    z_min = min(z for _, z in pts_yz)
    z_max = max(z for _, z in pts_yz)
    z_span = max(z_max - z_min, 1e-4)
    v_l, v_r = [], []
    for y, z in pts_yz:
        t = (z - z_min) / z_span
        w_scale = 1.0 - (1.0 - x_taper_top) * (t ** 1.3)
        v_l.append(bm.verts.new((-hw * w_scale, y, z)))
        v_r.append(bm.verts.new((hw * w_scale, y, z)))
    n = len(pts_yz)
    for i in range(n):
        ni = (i + 1) % n
        bm.faces.new((v_l[i], v_r[i], v_r[ni], v_l[ni]))
    bm.faces.new(list(reversed(v_l)))
    bm.faces.new(v_r)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges, offset=bevel, segments=2, affect="EDGES")
    return bep.add_bm(name, bm, mat)


def add_wheel(objs, prefix, x, y, r, w, m):
    """Rueda automotriz completa: neumático biselado + llanta cóncava + maza + 5 bulones."""
    side = 1.0 if x > 0 else -1.0
    tire = bep.make_torus(f"{prefix}_Tire", r * 0.68, r * 0.32, 22, 10, m["rubber"], (x, y, r), (0, math.pi / 2, 0))
    tire.scale = (1.0, 1.0, w / (r * 0.64))
    rim = bp.make_cylinder(f"{prefix}_Rim", r * 0.56, w * 0.78, 18, (x, y, r), m["chrome"], bevel=0.012)
    rim.rotation_euler = (0, math.pi / 2, 0)
    hub = bp.make_cylinder(f"{prefix}_Hub", r * 0.22, w * 0.92, 12, (x + side * 0.015, y, r), m["dark"], bevel=0.008)
    hub.rotation_euler = (0, math.pi / 2, 0)
    objs.extend([tire, rim, hub])
    # Guardabarros / arco oscuro envolviendo la parte superior de la rueda
    arch = bp.make_box(f"{prefix}_Arch", (0.14, r * 2.15, 0.10), (x + side * 0.04, y, r * 2.02), m["dark"], bevel=0.02)
    objs.append(arch)


def add_front_fascia(objs, y_front, width, z_mid, m, round_lights=True, quad_lights=False):
    """Parrilla delantera con listones, faros con aro cromado, paragolpes y patente."""
    # Paragolpes delantero + uñas
    objs.append(bp.make_box("BumperF", (width + 0.10, 0.18, 0.16), (0, y_front - 0.10, z_mid - 0.22), m["chrome"], bevel=0.025))
    for sx in (-width * 0.28, width * 0.28):
        objs.append(bp.make_box(f"BumperGuardF_{sx}", (0.09, 0.12, 0.24), (sx, y_front - 0.16, z_mid - 0.20), m["dark"], bevel=0.014))
    # Parrilla principal + listones horizontales
    gw = width * 0.62
    objs.append(bp.make_box("GrilleRecess", (gw, 0.08, 0.22), (0, y_front - 0.02, z_mid + 0.02), m["dark"], bevel=0.012))
    for gz in (-0.06, 0.02, 0.10):
        objs.append(bp.make_box(f"GrilleBar_{gz}", (gw - 0.06, 0.05, 0.025), (0, y_front - 0.05, z_mid + gz), m["chrome"], bevel=0.004))
    # Faros delanteros
    offsets = (-width * 0.39, width * 0.39) if not quad_lights else (-width * 0.40, -width * 0.28, width * 0.28, width * 0.40)
    for idx, hx in enumerate(offsets):
        if round_lights:
            bezel = bp.make_cylinder(f"HLBezel_{idx}", 0.095, 0.07, 16, (hx, y_front - 0.03, z_mid + 0.04), m["chrome"], bevel=0.008)
            bezel.rotation_euler = (math.pi / 2, 0, 0)
            lens = bp.make_cylinder(f"HLLens_{idx}", 0.078, 0.05, 16, (hx, y_front - 0.055, z_mid + 0.04), m["headlight"], bevel=0.006)
            lens.rotation_euler = (math.pi / 2, 0, 0)
            objs.extend([bezel, lens])
        else:
            objs.append(bp.make_box(f"HLBezel_{idx}", (0.22, 0.07, 0.14), (hx, y_front - 0.03, z_mid + 0.04), m["chrome"], bevel=0.012))
            objs.append(bp.make_box(f"HLLens_{idx}", (0.18, 0.05, 0.10), (hx, y_front - 0.055, z_mid + 0.04), m["headlight"], bevel=0.006))
        objs.append(bp.make_box(f"TurnSig_{idx}", (0.12, 0.05, 0.05), (hx, y_front - 0.04, z_mid - 0.09), m["amber"], bevel=0.006))


def add_rear_fascia(objs, y_rear, width, z_mid, m, dual_exhaust=False):
    objs.append(bp.make_box("BumperR", (width + 0.10, 0.18, 0.16), (0, y_rear + 0.10, z_mid - 0.22), m["chrome"], bevel=0.025))
    objs.append(bp.make_box("PlateR", (0.38, 0.04, 0.18), (0, y_rear + 0.04, z_mid - 0.02), m["headlight"], bevel=0.006))
    for sx in (-width * 0.36, width * 0.36):
        objs.append(bp.make_box(f"TailFrame_{sx}", (0.28, 0.07, 0.13), (sx, y_rear + 0.02, z_mid + 0.04), m["dark"], bevel=0.01))
        objs.append(bp.make_box(f"TailLens_{sx}", (0.22, 0.05, 0.09), (sx, y_rear + 0.045, z_mid + 0.04), m["taillight"], bevel=0.006))
    ex_xs = (-width * 0.28, width * 0.28) if dual_exhaust else (width * 0.26,)
    for sx in ex_xs:
        ex = bp.make_cylinder(f"Exhaust_{sx}", 0.045, 0.26, 12, (sx, y_rear + 0.10, z_mid - 0.32), m["chrome"], bevel=0.006)
        ex.rotation_euler = (math.pi / 2, 0, 0)
        objs.append(ex)


def add_mirrors_and_handles(objs, y_mirror, y_handles, width, z_belt, m):
    for sx in (-1.0, 1.0):
        objs.append(bp.make_box(f"MirArm_{sx}", (0.14, 0.04, 0.04), (sx * (width * 0.50 + 0.05), y_mirror, z_belt + 0.08), m["dark"], bevel=0.005))
        objs.append(bp.make_box(f"MirHead_{sx}", (0.08, 0.12, 0.14), (sx * (width * 0.50 + 0.13), y_mirror + 0.02, z_belt + 0.12), m["chrome"], bevel=0.012))
        for idx, hy in enumerate(y_handles):
            objs.append(bp.make_box(f"Handle_{sx}_{idx}", (0.05, 0.15, 0.04), (sx * (width * 0.50 + 0.02), hy, z_belt - 0.05), m["chrome"], bevel=0.006))
        # Moldura lateral cromada
        objs.append(bp.make_box(f"SideTrim_{sx}", (0.04, 2.8, 0.04), (sx * (width * 0.50 + 0.01), 0.0, z_belt - 0.22), m["chrome"], bevel=0.005))


# ---------------------------------------------------------------------------
# 6 Modelos de Coches Reutilizables (+ carcasa desarmada)
# ---------------------------------------------------------------------------

def build_sedan_classic(with_wheels=True):
    m = car_mats("red", wear=1.1, rust=0.65)
    z0 = 0.0 if with_wheels else -0.22
    # Silueta clásica de 3 volúmenes (capó largo, cabina inclinada, baúl)
    lower = make_profile_extrude("LowerBody", [
        (-2.12, 0.34 + z0), (2.10, 0.34 + z0), (2.14, 0.82 + z0), (1.12, 0.88 + z0),
        (-0.98, 0.88 + z0), (-2.14, 0.80 + z0),
    ], 1.82, m["body"], bevel=0.05, x_taper_top=0.95)
    cabin = make_profile_extrude("Cabin", [
        (-0.92, 0.85 + z0), (1.18, 0.85 + z0), (0.82, 1.44 + z0), (-0.42, 1.44 + z0),
    ], 1.62, m["body"], bevel=0.045, x_taper_top=0.84)
    # Vidrios exteriores sobre la cabina (parabrisas, luneta y laterales bien legibles)
    glass_fb = make_profile_extrude("GlassFB", [
        (-0.96, 0.90 + z0), (1.22, 0.90 + z0), (0.85, 1.38 + z0), (-0.45, 1.38 + z0),
    ], 1.36, m["glass"], bevel=0.012, x_taper_top=0.86)
    glass_side = make_profile_extrude("GlassSide", [
        (-0.68, 0.92 + z0), (0.94, 0.92 + z0), (0.68, 1.36 + z0), (-0.30, 1.36 + z0),
    ], 1.66, m["glass"], bevel=0.010, x_taper_top=0.86)

    objs = [
        lower, cabin, glass_fb, glass_side,
        bp.make_box("Underbody", (1.58, 3.85, 0.16), (0, 0, 0.28 + z0), m["dark"], bevel=0.02),
        # Nervadura del capó y pilares B
        bp.make_box("HoodCrease", (0.48, 1.05, 0.05), (0, -1.52, 0.87 + z0), m["body"], bevel=0.015),
        bp.make_box("PillarBL", (0.08, 0.11, 0.56), (-0.74, 0.12, 1.15 + z0), m["body"], bevel=0.01),
        bp.make_box("PillarBR", (0.08, 0.11, 0.56), (0.74, 0.12, 1.15 + z0), m["body"], bevel=0.01),
    ]
    add_front_fascia(objs, -2.14, 1.82, 0.62 + z0, m, round_lights=True, quad_lights=True)
    add_rear_fascia(objs, 2.12, 1.82, 0.64 + z0, m, dual_exhaust=False)
    add_mirrors_and_handles(objs, -0.78, (-0.18, 0.52), 1.82, 0.86 + z0, m)
    if with_wheels:
        for sx in (-0.86, 0.86):
            add_wheel(objs, f"W_F_{sx}", sx, -1.32, 0.34, 0.24, m)
            add_wheel(objs, f"W_R_{sx}", sx, 1.28, 0.34, 0.24, m)
    return bp.join(objs, "CarSedanClassic" if with_wheels else "RustedCarShell")


def build_pickup_rust():
    m = car_mats("teal", wear=1.15, rust=0.75)
    # Cabina + trompa alta + caja trasera abierta con paredes reales
    front = make_profile_extrude("FrontAndCabBase", [
        (-2.22, 0.42), (0.15, 0.42), (0.15, 1.02), (-0.98, 1.02), (-2.24, 0.96),
    ], 1.92, m["body"], bevel=0.05, x_taper_top=0.96)
    cab = make_profile_extrude("CabTop", [
        (-0.92, 0.98), (0.15, 0.98), (0.10, 1.66), (-0.52, 1.66),
    ], 1.78, m["body"], bevel=0.045, x_taper_top=0.88)
    cab_glass = make_profile_extrude("CabGlass", [
        (-0.96, 1.04), (0.19, 1.04), (0.13, 1.58), (-0.56, 1.58),
    ], 1.52, m["glass"], bevel=0.012, x_taper_top=0.89)
    cab_side = make_profile_extrude("CabSideGlass", [
        (-0.74, 1.06), (0.02, 1.06), (-0.02, 1.55), (-0.44, 1.55),
    ], 1.82, m["glass"], bevel=0.010, x_taper_top=0.90)

    objs = [
        front, cab, cab_glass, cab_side,
        bp.make_box("ChassisFrame", (1.66, 4.15, 0.18), (0, 0, 0.35), m["dark"], bevel=0.02),
        # Caja abierta trasera (piso de madera + paredes laterales + portón trasero)
        bp.make_box("BedFloor", (1.76, 1.98, 0.14), (0, 1.18, 0.56), m["wood"], bevel=0.015),
        bp.make_box("BedWallL", (0.14, 2.04, 0.56), (-0.89, 1.20, 0.78), m["body"], bevel=0.02),
        bp.make_box("BedWallR", (0.14, 2.04, 0.56), (0.89, 1.20, 0.78), m["body"], bevel=0.02),
        bp.make_box("Tailgate", (1.92, 0.14, 0.56), (0, 2.18, 0.78), m["body"], bevel=0.02),
        # Barra antivuelco tubular + 2 faros de techo
        bp.make_cylinder("RollL", 0.048, 0.78, 12, (-0.72, 0.32, 1.42), m["dark"], bevel=0.006),
        bp.make_cylinder("RollR", 0.048, 0.78, 12, (0.72, 0.32, 1.42), m["dark"], bevel=0.006),
        bp.make_box("RollTop", (1.52, 0.09, 0.09), (0, 0.32, 1.80), m["dark"], bevel=0.01),
        bp.make_box("RollBraceL", (0.08, 0.75, 0.08), (-0.72, 0.68, 1.42), m["dark"], bevel=0.008, rot=(-0.78, 0, 0)),
        bp.make_box("RollBraceR", (0.08, 0.75, 0.08), (0.72, 0.68, 1.42), m["dark"], bevel=0.008, rot=(-0.78, 0, 0)),
    ]
    for sx in (-0.34, 0.34):
        rl = bp.make_cylinder(f"RoofLamp_{sx}", 0.09, 0.10, 14, (sx, 0.25, 1.92), m["dark"], bevel=0.008)
        rl.rotation_euler = (math.pi / 2, 0, 0)
        gl = bp.make_cylinder(f"RoofLens_{sx}", 0.075, 0.05, 14, (sx, 0.20, 1.92), m["headlight"], bevel=0.006)
        gl.rotation_euler = (math.pi / 2, 0, 0)
        objs.extend([rl, gl])
    add_front_fascia(objs, -2.24, 1.92, 0.74, m, round_lights=False)
    add_rear_fascia(objs, 2.24, 1.92, 0.72, m)
    add_mirrors_and_handles(objs, -0.82, (-0.25,), 1.92, 1.00, m)
    for sx in (-0.92, 0.92):
        add_wheel(objs, f"W_F_{sx}", sx, -1.42, 0.40, 0.28, m)
        add_wheel(objs, f"W_R_{sx}", sx, 1.38, 0.40, 0.28, m)
    return bp.join(objs, "CarPickupRust")


def build_van_cargo():
    m = car_mats("mustard", wear=1.05, rust=0.6)
    body = make_profile_extrude("VanBody", [
        (-2.15, 0.36), (2.15, 0.36), (2.18, 1.15), (2.06, 1.86),
        (-1.42, 1.86), (-1.92, 1.18), (-2.18, 1.06),
    ], 1.94, m["body"], bevel=0.06, x_taper_top=0.92)
    windshield = make_profile_extrude("VanWindshield", [
        (-1.98, 1.18), (-1.46, 1.76), (-1.18, 1.76), (-1.65, 1.18),
    ], 1.66, m["glass"], bevel=0.012, x_taper_top=0.92)
    side_win = bp.make_box("VanSideWin", (1.98, 0.78, 0.56), (0, -1.10, 1.46), m["glass"], bevel=0.012)

    objs = [
        body, windshield, side_win,
        bp.make_box("VanUnder", (1.70, 4.05, 0.16), (0, 0, 0.30), m["dark"], bevel=0.02),
        # Portaequipajes de techo con barras transversales
        bp.make_box("RackL", (0.07, 2.65, 0.08), (-0.76, 0.45, 1.98), m["dark"], bevel=0.008),
        bp.make_box("RackR", (0.07, 2.65, 0.08), (0.76, 0.45, 1.98), m["dark"], bevel=0.008),
    ]
    for ry in (-0.75, 0.05, 0.85, 1.65):
        objs.append(bp.make_box(f"RackBar_{ry}", (1.58, 0.06, 0.06), (0, ry, 2.00), m["chrome"], bevel=0.006))
        for sx in (-0.76, 0.76):
            objs.append(bp.make_box(f"RackFoot_{sx}_{ry}", (0.06, 0.06, 0.14), (sx, ry, 1.91), m["dark"], bevel=0.004))
    # Relieve lateral de paneles de carga
    for sx in (-0.98, 0.98):
        objs.append(bp.make_box(f"SidePanel_{sx}", (0.04, 2.15, 0.62), (sx, 0.78, 1.40), m["body"], bevel=0.015))
    add_front_fascia(objs, -2.18, 1.94, 0.68, m, round_lights=True)
    add_rear_fascia(objs, 2.18, 1.94, 0.66, m)
    add_mirrors_and_handles(objs, -1.55, (-0.95, 0.32), 1.94, 1.08, m)
    for sx in (-0.92, 0.92):
        add_wheel(objs, f"W_F_{sx}", sx, -1.32, 0.36, 0.25, m)
        add_wheel(objs, f"W_R_{sx}", sx, 1.32, 0.36, 0.25, m)
    return bp.join(objs, "CarVanCargo")


def build_hatchback_compact():
    m = car_mats("olive", wear=1.0, rust=0.55)
    body = make_profile_extrude("HatchBody", [
        (-1.72, 0.32), (1.68, 0.32), (1.72, 0.86), (1.36, 1.42),
        (-0.36, 1.42), (-0.88, 0.88), (-1.75, 0.78),
    ], 1.68, m["body"], bevel=0.05, x_taper_top=0.88)
    win_fb = make_profile_extrude("HatchWinFB", [
        (-0.92, 0.90), (1.74, 0.90), (1.40, 1.36), (-0.40, 1.36),
    ], 1.34, m["glass"], bevel=0.012, x_taper_top=0.88)
    win_side = make_profile_extrude("HatchWinSide", [
        (-0.62, 0.92), (1.30, 0.92), (1.12, 1.35), (-0.26, 1.35),
    ], 1.72, m["glass"], bevel=0.010, x_taper_top=0.90)

    objs = [
        body, win_fb, win_side,
        bp.make_box("HatchUnder", (1.46, 3.15, 0.14), (0, 0, 0.26), m["dark"], bevel=0.02),
        bp.make_box("Spoiler", (1.42, 0.22, 0.06), (0, 1.42, 1.44), m["dark"], bevel=0.01, rot=(-0.18, 0, 0)),
        bp.make_box("PillarBL", (0.07, 0.10, 0.50), (-0.72, 0.22, 1.14), m["body"], bevel=0.008),
        bp.make_box("PillarBR", (0.07, 0.10, 0.50), (0.72, 0.22, 1.14), m["body"], bevel=0.008),
    ]
    add_front_fascia(objs, -1.75, 1.68, 0.58, m, round_lights=False)
    add_rear_fascia(objs, 1.72, 1.68, 0.58, m)
    add_mirrors_and_handles(objs, -0.72, (-0.08, 0.62), 1.68, 0.86, m)
    for sx in (-0.80, 0.80):
        add_wheel(objs, f"W_F_{sx}", sx, -1.08, 0.32, 0.22, m)
        add_wheel(objs, f"W_R_{sx}", sx, 1.04, 0.32, 0.22, m)
    return bp.join(objs, "CarHatchbackCompact")


def build_jeep_offroad():
    m = car_mats("sand", wear=1.15, rust=0.65)
    objs = [
        # Carrocería cuadrada 4x4 sin techo (cabina abierta)
        bp.make_box("Hood", (1.68, 1.32, 0.56), (0, -1.12, 0.86), m["body"], bevel=0.045),
        bp.make_box("TubFloor", (1.68, 2.35, 0.22), (0, 0.62, 0.62), m["dark"], bevel=0.02),
        bp.make_box("SideL", (0.16, 2.32, 0.48), (-0.78, 0.62, 0.92), m["body"], bevel=0.025),
        bp.make_box("SideR", (0.16, 2.32, 0.48), (0.78, 0.62, 0.92), m["body"], bevel=0.025),
        bp.make_box("RearWall", (1.72, 0.16, 0.52), (0, 1.72, 0.92), m["body"], bevel=0.025),
        # Guardabarros planos altos
        bp.make_box("FenderFL", (0.28, 0.95, 0.08), (-0.94, -1.25, 1.00), m["dark"], bevel=0.015),
        bp.make_box("FenderFR", (0.28, 0.95, 0.08), (0.94, -1.25, 1.00), m["dark"], bevel=0.015),
        bp.make_box("FenderRL", (0.28, 0.95, 0.08), (-0.94, 1.15, 1.00), m["dark"], bevel=0.015),
        bp.make_box("FenderRR", (0.28, 0.95, 0.08), (0.94, 1.15, 1.00), m["dark"], bevel=0.015),
        # Parabrisas rebatible con marco y vidrio visible
        bp.make_box("WSFrame", (1.58, 0.08, 0.56), (0, -0.44, 1.40), m["body"], bevel=0.018, rot=(-0.22, 0, 0)),
        bp.make_box("WSGlass", (1.38, 0.11, 0.40), (0, -0.44, 1.40), m["glass"], bevel=0.008, rot=(-0.22, 0, 0)),
        # Asientos interiores
        bp.make_box("SeatL", (0.52, 0.52, 0.42), (-0.38, 0.25, 0.92), m["dark"], bevel=0.03),
        bp.make_box("SeatR", (0.52, 0.52, 0.42), (0.38, 0.25, 0.92), m["dark"], bevel=0.03),
        # Jaula antivuelco tubular completa
        bp.make_cylinder("CageFL", 0.04, 0.78, 10, (-0.72, 0.45, 1.48), m["dark"], bevel=0.005),
        bp.make_cylinder("CageFR", 0.04, 0.78, 10, (0.72, 0.45, 1.48), m["dark"], bevel=0.005),
        bp.make_box("CageTop", (1.50, 0.08, 0.08), (0, 0.45, 1.86), m["dark"], bevel=0.01),
        bp.make_box("CageBackL", (0.07, 1.25, 0.07), (-0.72, 1.02, 1.50), m["dark"], bevel=0.008, rot=(-0.58, 0, 0)),
        bp.make_box("CageBackR", (0.07, 1.25, 0.07), (0.72, 1.02, 1.50), m["dark"], bevel=0.008, rot=(-0.58, 0, 0)),
        # Bidón trasero rojo + rueda de auxilio colgada atrás
        bp.make_box("Jerrycan", (0.22, 0.36, 0.46), (-0.54, 1.94, 0.96), m["taillight"], bevel=0.02),
    ]
    spare = bep.make_torus("SpareTire", 0.26, 0.12, 20, 10, m["rubber"], (0.18, 1.96, 1.02), (math.pi / 2, 0, 0))
    spare_rim = bp.make_cylinder("SpareRim", 0.20, 0.16, 16, (0.18, 1.96, 1.02), m["chrome"], bevel=0.01)
    spare_rim.rotation_euler = (math.pi / 2, 0, 0)
    objs.extend([spare, spare_rim])
    # Parrilla clásica de 7 ranuras verticales
    for i in range(7):
        gx = -0.42 + i * 0.14
        objs.append(bp.make_box(f"Slot_{i}", (0.06, 0.06, 0.32), (gx, -1.80, 0.88), m["dark"], bevel=0.006))
    add_front_fascia(objs, -1.82, 1.72, 0.84, m, round_lights=True)
    add_rear_fascia(objs, 1.82, 1.72, 0.82, m)
    for sx in (-0.90, 0.90):
        add_wheel(objs, f"W_F_{sx}", sx, -1.25, 0.42, 0.30, m)
        add_wheel(objs, f"W_R_{sx}", sx, 1.15, 0.42, 0.30, m)
    return bp.join(objs, "CarJeepOffroad")


def build_coupe_muscle():
    m = car_mats("steel_blue", wear=1.05, rust=0.55)
    lower = make_profile_extrude("MuscleLower", [
        (-2.24, 0.30), (2.16, 0.30), (2.22, 0.82), (1.42, 0.88),
        (-0.88, 0.88), (-2.26, 0.74),
    ], 1.90, m["body"], bevel=0.05, x_taper_top=0.94)
    # Techo fastback aerodinámico cayendo hasta la cola
    fastback = make_profile_extrude("MuscleFastback", [
        (-0.78, 0.85), (1.76, 0.85), (0.62, 1.36), (-0.28, 1.36),
    ], 1.66, m["body"], bevel=0.045, x_taper_top=0.82)
    win_fb = make_profile_extrude("MuscleGlassFB", [
        (-0.82, 0.89), (1.78, 0.89), (0.65, 1.31), (-0.32, 1.31),
    ], 1.36, m["glass"], bevel=0.012, x_taper_top=0.84)
    win_side = make_profile_extrude("MuscleGlassSide", [
        (-0.56, 0.91), (0.98, 0.91), (0.52, 1.29), (-0.18, 1.29),
    ], 1.70, m["glass"], bevel=0.010, x_taper_top=0.85)

    objs = [
        lower, fastback, win_fb, win_side,
        bp.make_box("Under", (1.66, 4.10, 0.14), (0, 0, 0.24), m["dark"], bevel=0.02),
        # Toma de aire agresiva en el capó (hood scoop)
        bp.make_box("ScoopBody", (0.56, 0.72, 0.16), (0, -1.42, 0.92), m["dark"], bevel=0.02),
        bp.make_box("ScoopMouth", (0.46, 0.08, 0.10), (0, -1.78, 0.92), m["chrome"], bevel=0.008),
        # Alerón trasero bajo
        bp.make_box("Wing", (1.72, 0.24, 0.06), (0, 2.02, 0.98), m["dark"], bevel=0.01),
        bp.make_box("WingLegL", (0.08, 0.14, 0.16), (-0.62, 2.02, 0.88), m["dark"], bevel=0.008),
        bp.make_box("WingLegR", (0.08, 0.14, 0.16), (0.62, 2.02, 0.88), m["dark"], bevel=0.008),
    ]
    add_front_fascia(objs, -2.26, 1.90, 0.56, m, round_lights=True, quad_lights=True)
    add_rear_fascia(objs, 2.20, 1.90, 0.60, m, dual_exhaust=True)
    add_mirrors_and_handles(objs, -0.68, (0.05,), 1.90, 0.84, m)
    for sx in (-0.90, 0.90):
        add_wheel(objs, f"W_F_{sx}", sx, -1.40, 0.34, 0.25, m)
        add_wheel(objs, f"W_R_{sx}", sx, 1.32, 0.36, 0.30, m)
    return bp.join(objs, "CarCoupeMuscle")


CAR_RECIPES = [
    ("car_sedan_classic", "Sedán clásico 70s", lambda: build_sedan_classic(True)),
    ("car_pickup_rust", "Pickup de taller con barra", build_pickup_rust),
    ("car_van_cargo", "Furgoneta con portaequipajes", build_van_cargo),
    ("car_hatchback_compact", "Hatchback compacto urbano", build_hatchback_compact),
    ("car_jeep_offroad", "4x4 todo terreno abierto", build_jeep_offroad),
    ("car_coupe_muscle", "Coupé fastback con toma de aire", build_coupe_muscle),
    ("rusted_car_shell", "Carcasa de sedán sin ruedas", lambda: build_sedan_classic(False)),
]


def run_car(key, fn):
    bp.reset_scene()
    obj = fn()
    bp.unwrap(obj)

    art_dir = os.path.join(CAR_ART_DIR, key)
    tex_dir = os.path.join(art_dir, "textures")
    preview_path = os.path.join(CAR_ART_DIR, "previews", f"{key}_full.png")
    glb_path = os.path.join(ENV_GLB_DIR, f"{key}.glb")

    base, orm, normal = bep.bake_fast(obj, key, RES, tex_dir)
    final = bp.final_material(key, base, orm, normal)
    obj.data.materials.clear()
    obj.data.materials.append(final)
    bp.strip_bake_attrs(obj)

    os.makedirs(ENV_GLB_DIR, exist_ok=True)
    bp.set_active(obj)
    kwargs = dict(
        filepath=glb_path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_tangents=True, export_materials="EXPORT",
        export_image_format="WEBP", export_image_quality=86, export_cameras=False, export_lights=False,
        export_extras=False, export_animations=False,
    )
    try:
        bpy.ops.export_scene.gltf(export_vertex_color="NONE", **kwargs)
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs)

    bep.render_studio_preview(obj, preview_path)
    bp.report(obj, key, glb_path)


def render_fleet_lineup():
    bp.reset_scene()
    imported = []
    keys = [k for k, _, _ in CAR_RECIPES]
    for idx, k in enumerate(keys):
        glb = os.path.join(ENV_GLB_DIR, f"{k}.glb")
        if not os.path.exists(glb):
            continue
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=glb)
        added = [o for o in bpy.data.objects if o not in before]
        col = idx % 4
        row = idx // 4
        gx = (col - 1.5) * 3.1
        gy = (row - 0.5) * 5.6
        for o in added:
            if o.parent is None:
                o.location.x += gx
                o.location.y += gy
        imported.extend(added)

    bpy.context.view_layer.update()
    meshes = [o for o in imported if o.type == "MESH"]
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    min_v = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    max_v = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (min_v + max_v) * 0.5
    radius = max((max_v - min_v).length * 0.5, 4.0)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("FleetWorld")
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
    cam_d.lens = 45
    cam = bp.link_obj(bpy.data.objects.new("Cam", cam_d))
    scene.camera = cam
    cam_pos = center + Vector((radius * 1.1, -radius * 1.95, radius * 1.05))
    cam.location = cam_pos
    cam.rotation_euler = (center - cam_pos).to_track_quat("-Z", "Y").to_euler()
    out_png = os.path.join(CAR_ART_DIR, "previews", "fleet_lineup.png")
    os.makedirs(os.path.dirname(out_png), exist_ok=True)
    scene.render.filepath = out_png
    bpy.ops.render.render(write_still=True)
    print(f"[FLEET] lineup -> {out_png}")


def update_catalog():
    cat_path = os.path.join(ENV_GLB_DIR, "catalog.json")
    if not os.path.exists(cat_path):
        return
    with open(cat_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    existing_ids = {p["id"] for p in data["pieces"]}
    for k, label, _ in CAR_RECIPES:
        if k not in existing_ids:
            data["pieces"].append({
                "id": k,
                "category": "vehicles",
                "label": label,
                "url": f"models/environment/{k}.glb",
            })
    data["count"] = len(data["pieces"])
    with open(cat_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"[CATALOG] updated -> {data['count']} pieces")


if __name__ == "__main__":
    if WHICH == "lineup":
        render_fleet_lineup()
        update_catalog()
    elif WHICH == "all":
        for k, _, fn in CAR_RECIPES:
            run_car(k, fn)
        render_fleet_lineup()
        update_catalog()
    else:
        found = [c for c in CAR_RECIPES if c[0] == WHICH]
        if not found:
            raise SystemExit(f"Unknown car: {WHICH}")
        run_car(found[0][0], found[0][2])
