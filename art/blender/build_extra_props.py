"""
Los del Desguace — Generador reproducible en Blender 5.2.3 LTS con horneado Cycles (1024 px)
para los 8 props faltantes y las 2 herramientas de mano (`wire_tool`, `spray_can`).

Reutiliza los shaders procedurales (pintura gastada, metal cepillado, suciedad/AO) y el
pipeline de horneado (`baseColor` sRGB + `ORM` + `normal` → 1 solo material glTF WebP) de
`art/blender/build_props.py` para lograr coherencia visual 100% con el resto del taller.

Uso:
    blender -b --factory-startup -P art/blender/build_extra_props.py -- all 1024
    blender -b --factory-startup -P art/blender/build_extra_props.py -- horn 1024
"""

import bpy
import bmesh
import math
import os
import sys
from mathutils import Euler, Matrix, Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import build_props as bp  # noqa: E402

REPO = os.path.normpath(os.path.join(ROOT, "..", ".."))
PROPS_ART_DIR = os.path.join(REPO, "art", "props")
PROPS_GLB_DIR = os.path.join(REPO, "public", "models", "props", "variants")
TOOLS_GLB_DIR = os.path.join(REPO, "public", "models", "tools")

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
WHICH = argv[0] if len(argv) > 0 else "all"
RES = int(argv[1]) if len(argv) > 1 else 1024

C = {
    "teal": bp.hex_rgba("#3e8c84"),
    "teal_dark": bp.hex_rgba("#275954"),
    "mustard": bp.hex_rgba("#e2a82e"),
    "mustard_dark": bp.hex_rgba("#b8821d"),
    "red": bp.hex_rgba("#c8432b"),
    "red_dark": bp.hex_rgba("#8c2718"),
    "steel": bp.hex_rgba("#9aa3ab"),
    "dark_steel": bp.hex_rgba("#2d3339"),
    "dark_steel2": bp.hex_rgba("#1f2328"),
    "brass": bp.hex_rgba("#d8a63c"),
    "copper": bp.hex_rgba("#cf7034"),
    "leather": bp.hex_rgba("#523018"),
    "leather_dark": bp.hex_rgba("#341d0e"),
    "cream": bp.hex_rgba("#ebe4d5"),
    "cream_dark": bp.hex_rgba("#cbc1ad"),
    "rubber": bp.hex_rgba("#262729"),
    "glow_cyan": bp.hex_rgba("#6af2d8"),
}


# ---------------------------------------------------------------------------
# Helpers geométricos avanzados
# ---------------------------------------------------------------------------

def add_bm(name, bm, mat, loc=(0, 0, 0), rot=(0, 0, 0)):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bp.link_obj(bpy.data.objects.new(name, mesh))
    obj.data.materials.append(mat)
    obj.location = loc
    obj.rotation_euler = rot
    bp.smooth(obj, 42.0)
    return obj


def make_torus(name, major_r, minor_r, maj_segs, min_segs, mat, loc=(0, 0, 0), rot=(0, 0, 0)):
    bm = bmesh.new()
    for i in range(maj_segs):
        a = 2.0 * math.pi * i / maj_segs
        ca, sa = math.cos(a), math.sin(a)
        for j in range(min_segs):
            b = 2.0 * math.pi * j / min_segs
            r = major_r + minor_r * math.cos(b)
            bm.verts.new((r * ca, r * sa, minor_r * math.sin(b)))
    bm.verts.ensure_lookup_table()
    for i in range(maj_segs):
        ni = (i + 1) % maj_segs
        for j in range(min_segs):
            nj = (j + 1) % min_segs
            bm.faces.new((
                bm.verts[i * min_segs + j],
                bm.verts[ni * min_segs + j],
                bm.verts[ni * min_segs + nj],
                bm.verts[i * min_segs + nj],
            ))
    return add_bm(name, bm, mat, loc, rot)


def make_helix(name, radius, tube_r, height, turns, segs_per_turn, tube_segs, mat, loc=(0, 0, 0), rot=(0, 0, 0)):
    bm = bmesh.new()
    total = int(turns * segs_per_turn) + 1
    rings = []
    for k in range(total):
        t = k / max(1, total - 1)
        ang = t * turns * 2.0 * math.pi
        z = -height / 2.0 + t * height
        # Aplanar suavemente los extremos para apoyar en los platos
        if t < 0.08:
            z = -height / 2.0 + (t / 0.08) * 0.02 * height
        elif t > 0.92:
            z = height / 2.0 - ((1.0 - t) / 0.08) * 0.02 * height
        center = Vector((radius * math.cos(ang), radius * math.sin(ang), z))
        tangent = Vector((-radius * math.sin(ang), radius * math.cos(ang), height / (turns * 2.0 * math.pi))).normalized()
        up = Vector((0, 0, 1))
        side = tangent.cross(up).normalized()
        binorm = side.cross(tangent).normalized()
        ring = []
        for j in range(tube_segs):
            b = 2.0 * math.pi * j / tube_segs
            ring.append(bm.verts.new(center + side * (tube_r * math.cos(b)) + binorm * (tube_r * math.sin(b))))
        rings.append(ring)
    for k in range(len(rings) - 1):
        for j in range(tube_segs):
            nj = (j + 1) % tube_segs
            bm.faces.new((rings[k][j], rings[k + 1][j], rings[k + 1][nj], rings[k][nj]))
    bmesh.ops.contextual_create(bm, geom=rings[0])
    bmesh.ops.contextual_create(bm, geom=rings[-1])
    return add_bm(name, bm, mat, loc, rot)


def make_bolts_ring(prefix, count, radius, z, bolt_r, bolt_h, mat, angle_offset=0.0):
    objs = []
    for i in range(count):
        a = angle_offset + 2.0 * math.pi * i / count
        objs.append(bp.make_cylinder(
            f"{prefix}_{i}", bolt_r, bolt_h, 6,
            (radius * math.cos(a), radius * math.sin(a), z), mat, bevel=bolt_r * 0.15,
        ))
    return objs


def make_blade(name, length, root_w, tip_w, thick, pitch, mat, loc=(0, 0, 0), rot_z=0.0):
    """Aspa perfilada con torsión aerodinámica y punta redondeada."""
    bm = bmesh.new()
    steps = 7
    rings = []
    for s in range(steps):
        t = s / (steps - 1)
        x = 0.035 + t * length
        w = root_w + (tip_w - root_w) * math.sin(t * math.pi * 0.72)
        th = thick * (1.0 - 0.55 * t)
        ang = pitch * (1.0 - 0.35 * t)
        ca, sa = math.cos(ang), math.sin(ang)
        pts_2d = [
            (0.0, -w * 0.5),
            (th * 0.65, -w * 0.18),
            (th * 0.55, w * 0.25),
            (0.0, w * 0.5),
            (-th * 0.4, w * 0.15),
            (-th * 0.45, -w * 0.2),
        ]
        ring = []
        for pz, py in pts_2d:
            ry = py * ca - pz * sa
            rz = py * sa + pz * ca
            ring.append(bm.verts.new((x, ry, rz)))
        rings.append(ring)
    n = len(rings[0])
    for s in range(steps - 1):
        for j in range(n):
            nj = (j + 1) % n
            bm.faces.new((rings[s][j], rings[s + 1][j], rings[s + 1][nj], rings[s][nj]))
    bmesh.ops.contextual_create(bm, geom=rings[0])
    bmesh.ops.contextual_create(bm, geom=rings[-1])
    return add_bm(name, bm, mat, loc, (0, 0, rot_z))


def mat_fabric(name, col1, col2, rough=0.82):
    return bp.mat_painted_metal(name, col1, col2, wear_amt=0.12, rust_amt=0.0, paint_rough=rough, edge_radius=0.004)


def mat_rubber(name):
    return bp.mat_painted_metal(name, C["rubber"], bp.hex_rgba("#18191b"), wear_amt=0.18, rust_amt=0.0, paint_rough=0.88, edge_radius=0.004)


# ---------------------------------------------------------------------------
# 10 recetas de alto detalle (Blender Z-up -> glTF Y-up: frente +Z = -Y Blender)
# ---------------------------------------------------------------------------

def build_spring():
    m_steel = bp.mat_bare_metal("A_SpringSteel", C["steel"], rough=0.30)
    m_dark = bp.mat_painted_metal("A_SpringDark", C["dark_steel"], C["dark_steel2"], wear_amt=0.95, rust_amt=0.55)
    m_yellow = bp.mat_painted_metal("A_SpringYellow", C["mustard"], C["mustard_dark"], wear_amt=1.0, rust_amt=0.4)
    m_rubber = mat_rubber("A_SpringRubber")
    m_brass = bp.mat_bare_metal("A_SpringBrass", C["brass"], rough=0.30)

    objs = [
        # Base con goma inferior y plato biselado
        bp.make_cylinder("BaseRubber", 0.165, 0.022, 28, (0, 0, -0.209), m_rubber, bevel=0.004),
        bp.lathe("BasePlate", [
            (0.0, -0.198), (0.175, -0.198), (0.182, -0.188), (0.182, -0.162),
            (0.168, -0.152), (0.135, -0.152), (0.135, -0.140), (0.0, -0.140),
        ], 28, m_dark),
        # Guía telescópica interna
        bp.make_cylinder("InnerSleeve", 0.056, 0.17, 20, (0, 0, -0.075), m_dark, bevel=0.004),
        bp.make_cylinder("InnerRod", 0.036, 0.24, 20, (0, 0, 0.05), m_steel, bevel=0.003),
        make_torus("SealRing", 0.052, 0.010, 20, 10, m_brass, (0, 0, 0.01)),
        # Resorte helicoidal grueso
        make_helix("Coil", 0.125, 0.023, 0.295, 4.5, 24, 12, m_steel, (0, 0, 0.0)),
        # Plato superior de impacto + tapa con bulones
        bp.lathe("TopPlate", [
            (0.0, 0.142), (0.140, 0.142), (0.172, 0.152), (0.184, 0.166),
            (0.184, 0.196), (0.174, 0.208), (0.0, 0.208),
        ], 28, m_yellow),
        bp.make_cylinder("TopCap", 0.112, 0.024, 24, (0, 0, 0.212), m_dark, bevel=0.005),
    ]
    objs += make_bolts_ring("TopBolt", 6, 0.082, 0.224, 0.011, 0.012, m_steel)
    objs += make_bolts_ring("BaseBolt", 6, 0.152, -0.152, 0.012, 0.016, m_brass)
    return bp.join(objs, "Spring")


def build_balloon():
    m_red = mat_fabric("A_BalloonRed", C["red"], C["red_dark"], rough=0.72)
    m_yellow = mat_fabric("A_BalloonYellow", C["mustard"], C["mustard_dark"], rough=0.74)
    m_teal = mat_fabric("A_BalloonTeal", C["teal"], C["teal_dark"], rough=0.76)
    m_rope = mat_fabric("A_BalloonRope", C["leather"], C["leather_dark"], rough=0.92)
    m_brass = bp.mat_bare_metal("A_BalloonBrass", C["brass"], rough=0.32)
    m_dark = bp.mat_painted_metal("A_BalloonDark", C["dark_steel"], C["dark_steel2"], wear_amt=0.8)

    # Envolvente con 12 gajos reales (costillas radiales)
    bm = bmesh.new()
    u_segs, v_segs = 36, 20
    rings = []
    for iv in range(1, v_segs):
        t = iv / v_segs  # 0 fondo -> 1 cima
        z = -0.22 + t * 0.56
        base_r = 0.055 + 0.225 * math.sin(math.pow(t, 0.72) * math.pi)
        ring = []
        for iu in range(u_segs):
            a = 2.0 * math.pi * iu / u_segs
            lobe = 1.0 + 0.042 * abs(math.sin(a * 6.0))
            r = base_r * lobe
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    v_bot = bm.verts.new((0, 0, -0.22))
    v_top = bm.verts.new((0, 0, 0.345))
    for iu in range(u_segs):
        ni = (iu + 1) % u_segs
        bm.faces.new((v_bot, rings[0][ni], rings[0][iu]))
        bm.faces.new((rings[-1][iu], rings[-1][ni], v_top))
    for iv in range(len(rings) - 1):
        for iu in range(u_segs):
            ni = (iu + 1) % u_segs
            f = bm.faces.new((rings[iv][iu], rings[iv][ni], rings[iv + 1][ni], rings[iv + 1][iu]))
            # Banda ecuatorial y gajos alternados
            if 9 <= iv <= 11:
                f.material_index = 1
            elif (iu // 3) % 3 == 0:
                f.material_index = 2
            else:
                f.material_index = 0
    env = add_bm("BalloonEnvelope", bm, m_red)
    env.data.materials.append(m_yellow)
    env.data.materials.append(m_teal)

    objs = [
        env,
        # Arnés de sogas ecuatorial y cuello
        make_torus("EqRopeTop", 0.212, 0.010, 32, 10, m_rope, (0, 0, 0.14)),
        make_torus("EqRopeBot", 0.258, 0.010, 32, 10, m_rope, (0, 0, 0.03)),
        bp.make_cylinder("TopCap", 0.052, 0.022, 16, (0, 0, 0.34), m_brass, bevel=0.004),
        # Cuello de bronce con válvula y aro de anclaje
        bp.lathe("NeckCollar", [
            (0.0, -0.265), (0.068, -0.265), (0.075, -0.255), (0.075, -0.225),
            (0.062, -0.215), (0.0, -0.215),
        ], 20, m_brass),
        bp.make_cylinder("ValveStem", 0.014, 0.045, 10, (0.075, 0, -0.24), m_dark, bevel=0.002),
        bp.make_cylinder("MainRope", 0.015, 0.095, 12, (0, 0, -0.30), m_rope),
        bp.make_cylinder("MountBase", 0.058, 0.032, 16, (0, 0, -0.335), m_dark, bevel=0.005),
        make_torus("MountRing", 0.028, 0.008, 16, 8, m_brass, (0, 0, -0.31), (math.pi / 2, 0, 0)),
    ]
    # 4 tirantes de soga bajando desde la banda ecuatorial al cuello
    for k in range(4):
        a = k * math.pi / 2.0 + math.pi / 4.0
        for s in range(5):
            t = s / 4.0
            r = 0.07 + t * 0.19
            z = -0.23 + t * 0.26
            objs.append(bp.make_cylinder(
                f"Strap_{k}_{s}", 0.007, 0.085, 8,
                (r * math.cos(a), r * math.sin(a), z), m_rope,
            ))
            objs[-1].rotation_euler = (0, -0.62, a)
    return bp.join(objs, "Balloon")


def build_fan():
    m_teal = bp.mat_painted_metal("A_FanTeal", C["teal"], C["teal_dark"], wear_amt=1.0, band=True, rust_amt=0.5)
    m_brass = bp.mat_bare_metal("A_FanBrass", C["brass"], rough=0.30)
    m_dark = bp.mat_painted_metal("A_FanDark", C["dark_steel"], C["dark_steel2"], wear_amt=0.9, rust_amt=0.5)
    m_yellow = bp.mat_painted_metal("A_FanBlade", C["mustard"], C["mustard_dark"], wear_amt=0.85, rust_amt=0.25)
    m_steel = bp.mat_bare_metal("A_FanSteel", C["steel"], rough=0.28)

    # Ducto hueco con boca acampanada y costillas exteriores
    duct = bp.lathe("FanDuct", [
        (0.228, -0.132), (0.262, -0.132), (0.268, -0.118), (0.256, -0.095),
        (0.256, -0.025), (0.266, -0.015), (0.266, 0.015), (0.256, 0.025),
        (0.256, 0.095), (0.268, 0.118), (0.262, 0.132), (0.228, 0.132),
        (0.224, 0.115), (0.224, -0.115), (0.228, -0.132),
    ], 32, m_teal)

    objs = [
        duct,
        make_torus("RingTop", 0.254, 0.016, 32, 10, m_brass, (0, 0, 0.130)),
        make_torus("RingBot", 0.254, 0.016, 32, 10, m_brass, (0, 0, -0.130)),
        # Cruces de soporte + carcasa motor
        bp.make_box("StrutX", (0.47, 0.032, 0.024), (0, 0, -0.095), m_dark, bevel=0.004),
        bp.make_box("StrutY", (0.032, 0.47, 0.024), (0, 0, -0.095), m_dark, bevel=0.004),
        bp.make_cylinder("MotorPod", 0.072, 0.11, 22, (0, 0, -0.055), m_dark, bevel=0.006),
        bp.lathe("HubSpinner", [
            (0.0, -0.005), (0.062, -0.005), (0.062, 0.042),
            (0.044, 0.072), (0.018, 0.092), (0.0, 0.098),
        ], 20, m_brass),
    ]
    objs += make_bolts_ring("TopRivet", 8, 0.254, 0.144, 0.009, 0.010, m_steel)
    objs += make_bolts_ring("BotRivet", 8, 0.254, -0.144, 0.009, 0.010, m_steel)
    objs += make_bolts_ring("HubBolt", 4, 0.042, 0.058, 0.007, 0.010, m_steel)
    for k in range(4):
        objs.append(make_blade(f"Blade_{k}", 0.175, 0.056, 0.072, 0.012, 0.42, m_yellow, (0, 0, 0.018), k * math.pi / 2.0))
    return bp.join(objs, "Fan")


def build_horn():
    """Bocina con trompeta HUECA real apuntando a -Y (Blender) = +Z (Three.js)."""
    m_dark = bp.mat_painted_metal("A_HornDark", C["dark_steel"], C["dark_steel2"], wear_amt=0.9, rust_amt=0.55)
    m_brass = bp.mat_bare_metal("A_HornBrass", C["brass"], rough=0.28)
    m_copper = bp.mat_bare_metal("A_HornCopper", C["copper"], rough=0.32)
    m_red = bp.mat_painted_metal("A_HornRed", C["red"], C["red_dark"], wear_amt=0.95, rust_amt=0.35)
    m_steel = bp.mat_bare_metal("A_HornSteel", C["steel"], rough=0.30)

    # Trompeta hueca: perfil lathe en Z y luego rotado para abrir hacia -Y
    bell = bp.lathe("HornBellHollow", [
        # Base trasera cerrada -> garganta -> campana exterior -> labio -> interior hueco -> cono acústico
        (0.0, 0.0), (0.045, 0.0), (0.048, 0.06), (0.064, 0.13), (0.098, 0.20),
        (0.148, 0.255), (0.158, 0.268), (0.154, 0.278), (0.142, 0.274),
        (0.105, 0.225), (0.062, 0.155), (0.036, 0.075), (0.018, 0.075),
        (0.001, 0.115), (0.0, 0.118),
    ], 32, m_red)
    bell.rotation_euler = (math.pi / 2.0, 0, 0)
    bell.location = (0, 0.035, 0.042)

    lip = make_torus("HornLip", 0.152, 0.014, 32, 12, m_brass, (0, -0.238, 0.042), (math.pi / 2.0, 0, 0))
    throat_ring = make_torus("ThroatRing", 0.056, 0.010, 20, 10, m_copper, (0, -0.03, 0.042), (math.pi / 2.0, 0, 0))

    comp = bp.lathe("Compressor", [
        (0.0, -0.095), (0.062, -0.095), (0.072, -0.085), (0.072, 0.075),
        (0.062, 0.088), (0.032, 0.095), (0.0, 0.095),
    ], 24, m_brass)
    comp.rotation_euler = (math.pi / 2.0, 0, 0)
    comp.location = (0, 0.11, -0.005)

    objs = [
        bell, lip, throat_ring, comp,
        # Base con orejas y bulones
        bp.make_box("BasePlate", (0.20, 0.24, 0.048), (0, 0.03, -0.128), m_dark, bevel=0.007),
        bp.make_box("SaddleBack", (0.15, 0.036, 0.085), (0, 0.11, -0.08), m_dark, bevel=0.005),
        bp.make_box("SaddleFront", (0.11, 0.036, 0.095), (0, -0.02, -0.06), m_dark, bevel=0.005),
        # Abrazadera de bronce y tubo de aire
        make_torus("CompStrap", 0.074, 0.009, 24, 8, m_dark, (0, 0.11, -0.005), (math.pi / 2.0, 0, 0)),
        bp.make_cylinder("AirPipe", 0.013, 0.09, 12, (0.055, 0.04, 0.02), m_copper, bevel=0.002),
        bp.make_cylinder("ValveCap", 0.022, 0.03, 12, (0, 0.14, 0.078), m_steel, bevel=0.003),
    ]
    for sx in (-0.072, 0.072):
        for sy in (-0.065, 0.125):
            objs.append(bp.make_cylinder(f"Bolt_{sx}_{sy}", 0.011, 0.014, 6, (sx, sy, -0.10), m_steel, bevel=0.002))
    return bp.join(objs, "Horn")


def build_gyro():
    m_dark = bp.mat_painted_metal("A_GyroDark", C["dark_steel"], C["dark_steel2"], wear_amt=0.95, rust_amt=0.5)
    m_brass = bp.mat_bare_metal("A_GyroBrass", C["brass"], rough=0.28)
    m_teal = bp.mat_painted_metal("A_GyroTeal", C["teal"], C["teal_dark"], wear_amt=0.85, rust_amt=0.3)
    m_steel = bp.mat_bare_metal("A_GyroSteel", C["steel"], rough=0.28)
    m_glow = bp.mat_flat("A_GyroGlow", C["glow_cyan"], rough=0.18)

    objs = [
        # Base pesada biselada con 4 bulones
        bp.make_box("GyroBase", (0.35, 0.35, 0.052), (0, 0, -0.172), m_dark, bevel=0.012),
        bp.make_cylinder("Pedestal", 0.085, 0.045, 20, (0, 0, -0.13), m_dark, bevel=0.005),
        # Soportes laterales del cardán exterior
        bp.make_box("PillarL", (0.038, 0.052, 0.21), (-0.165, 0, -0.055), m_dark, bevel=0.005),
        bp.make_box("PillarR", (0.038, 0.052, 0.21), (0.165, 0, -0.055), m_dark, bevel=0.005),
        # Cardán exterior e interior con bujes de bronce
        make_torus("OuterRing", 0.165, 0.018, 32, 12, m_dark, (0, 0, 0.02), (math.pi / 2.0, 0, 0)),
        bp.make_cylinder("TrunnionL", 0.024, 0.045, 14, (-0.165, 0, 0.02), m_brass, bevel=0.003),
        bp.make_cylinder("TrunnionR", 0.024, 0.045, 14, (0.165, 0, 0.02), m_brass, bevel=0.003),
        make_torus("InnerRing", 0.132, 0.015, 32, 12, m_brass, (0, 0, 0.02), (0.28, math.pi / 2.0, 0.45)),
        # Volante de inercia con aro de bronce y núcleo luminoso
        bp.lathe("Flywheel", [
            (0.0, -0.026), (0.095, -0.026), (0.106, -0.016), (0.106, 0.016),
            (0.095, 0.026), (0.0, 0.026),
        ], 28, m_teal),
        make_torus("FlywheelRim", 0.104, 0.012, 28, 10, m_brass, (0, 0, 0.02)),
        bp.make_cylinder("Axle", 0.020, 0.25, 16, (0, 0, 0.02), m_steel, bevel=0.003),
        bp.make_cylinder("CoreGlow", 0.044, 0.062, 20, (0, 0, 0.02), m_glow, bevel=0.004),
    ]
    objs[-4].location = (0, 0, 0.02)
    objs[5].rotation_euler = (0, math.pi / 2.0, 0)
    objs[6].rotation_euler = (0, math.pi / 2.0, 0)
    for sx in (-0.135, 0.135):
        for sy in (-0.135, 0.135):
            objs.append(bp.make_cylinder(f"BaseBolt_{sx}_{sy}", 0.013, 0.016, 6, (sx, sy, -0.142), m_steel, bevel=0.002))
    return bp.join(objs, "Gyro")


def build_boxing_glove():
    """Puño de resorte apuntando a -Y (Blender) = +Z (Three.js)."""
    m_dark = bp.mat_painted_metal("A_GloveDark", C["dark_steel"], C["dark_steel2"], wear_amt=0.95, rust_amt=0.55)
    m_steel = bp.mat_bare_metal("A_GloveSteel", C["steel"], rough=0.28)
    m_red = mat_fabric("A_GloveLeather", C["red"], C["red_dark"], rough=0.52)
    m_cream = mat_fabric("A_GloveCuff", C["cream"], C["cream_dark"], rough=0.68)
    m_brass = bp.mat_bare_metal("A_GloveBrass", C["brass"], rough=0.32)

    # Guante esculpido (puño con nudillos + palma + pulgar)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=18, radius=0.138)
    for v in bm.verts:
        x, y, z = v.co.x, v.co.y, v.co.z
        # Alargar hacia el frente (-Y), aplanar ligeramente abajo y marcar nudillos adelante
        y *= 1.22
        z *= 0.92
        x *= 1.04
        if y < -0.05:
            # Cresta sutil de nudillos
            z += 0.018 * math.cos(x * 16.0) * max(0.0, (-y - 0.05) / 0.12)
        if z < -0.04 and y < 0.02:
            # Pliegue de la palma cerrada
            z += 0.015
        v.co = Vector((x, y, z))
    fist = add_bm("GloveFist", bm, m_red, (0, -0.155, 0.008))

    tbm = bmesh.new()
    bmesh.ops.create_uvsphere(tbm, u_segments=18, v_segments=12, radius=0.062)
    bmesh.ops.scale(tbm, vec=(0.82, 1.32, 0.85), verts=tbm.verts)
    thumb = add_bm("GloveThumb", tbm, m_red, (0.105, -0.115, -0.025), (0.15, 0.0, -0.35))

    cuff = bp.lathe("GloveCuff", [
        (0.0, -0.045), (0.088, -0.045), (0.094, -0.035), (0.086, 0.038),
        (0.074, 0.045), (0.0, 0.045),
    ], 24, m_cream)
    cuff.rotation_euler = (math.pi / 2.0, 0, 0)
    cuff.location = (0, -0.015, 0)

    objs = [
        bp.make_box("WallPlate", (0.18, 0.055, 0.19), (0, 0.255, 0), m_dark, bevel=0.008),
        bp.make_cylinder("GuideCollar", 0.072, 0.045, 20, (0, 0.215, 0), m_dark, bevel=0.005),
        bp.make_cylinder("GuideRod", 0.026, 0.23, 14, (0, 0.11, 0), m_steel, bevel=0.003),
        make_helix("LaunchSpring", 0.066, 0.015, 0.22, 4.5, 20, 10, m_steel, (0, 0.105, 0), (math.pi / 2.0, 0, 0)),
        cuff, fist, thumb,
        make_torus("CuffTrim", 0.089, 0.010, 24, 10, m_brass, (0, 0.022, 0), (math.pi / 2.0, 0, 0)),
    ]
    objs[1].rotation_euler = (math.pi / 2.0, 0, 0)
    objs[2].rotation_euler = (math.pi / 2.0, 0, 0)
    # Cordones cruzados en el puño
    for i in range(3):
        yy = -0.035 + i * 0.022
        objs.append(bp.make_box(f"Lace_{i}", (0.048, 0.009, 0.010), (0, yy, -0.088), m_red, bevel=0.002))
    # 4 bulones en la placa trasera
    for sx in (-0.062, 0.062):
        for sz in (-0.066, 0.066):
            b = bp.make_cylinder(f"PlateBolt_{sx}_{sz}", 0.011, 0.014, 6, (sx, 0.224, sz), m_brass, bevel=0.002)
            b.rotation_euler = (math.pi / 2.0, 0, 0)
            objs.append(b)
    return bp.join(objs, "BoxingGlove")


def build_drone_rotor():
    m_teal = bp.mat_painted_metal("A_DroneTeal", C["teal"], C["teal_dark"], wear_amt=0.9, rust_amt=0.35)
    m_brass = bp.mat_bare_metal("A_DroneBrass", C["brass"], rough=0.28)
    m_copper = bp.mat_bare_metal("A_DroneCopper", C["copper"], rough=0.34)
    m_dark = bp.mat_painted_metal("A_DroneDark", C["dark_steel"], C["dark_steel2"], wear_amt=0.9, rust_amt=0.45)
    m_yellow = bp.mat_painted_metal("A_DroneBlade", C["mustard"], C["mustard_dark"], wear_amt=0.75, rust_amt=0.15)
    m_steel = bp.mat_bare_metal("A_DroneSteel", C["steel"], rough=0.28)

    objs = [
        # Base con brida y 4 bulones
        bp.make_cylinder("MotorFlange", 0.125, 0.022, 24, (0, 0, -0.095), m_dark, bevel=0.004),
        bp.make_cylinder("StatorCore", 0.092, 0.055, 24, (0, 0, -0.058), m_copper, bevel=0.004),
        bp.lathe("MotorBell", [
            (0.0, -0.082), (0.106, -0.082), (0.112, -0.072), (0.102, -0.020),
            (0.082, -0.012), (0.0, -0.012),
        ], 24, m_teal),
        # Aro protector perfilado + 4 brazos radiales
        make_torus("GuardRingTop", 0.262, 0.015, 36, 12, m_brass, (0, 0, 0.024)),
        make_torus("GuardRingBot", 0.256, 0.012, 36, 10, m_dark, (0, 0, -0.018)),
        bp.make_box("StrutX", (0.51, 0.024, 0.016), (0, 0, -0.032), m_dark, bevel=0.003),
        bp.make_box("StrutY", (0.024, 0.51, 0.016), (0, 0, -0.032), m_dark, bevel=0.003),
        # Cubo + tuerca central
        bp.lathe("Spinner", [
            (0.0, -0.010), (0.048, -0.010), (0.048, 0.036), (0.026, 0.062), (0.0, 0.068),
        ], 20, m_brass),
        bp.make_cylinder("CenterNut", 0.018, 0.020, 6, (0, 0, 0.065), m_steel, bevel=0.002),
    ]
    objs += make_bolts_ring("FlangeBolt", 4, 0.102, -0.082, 0.009, 0.012, m_steel, math.pi / 4.0)
    # 4 topes exteriores en el aro
    for k in range(4):
        a = k * math.pi / 2.0
        objs.append(bp.make_box(f"Bumper_{k}", (0.035, 0.032, 0.056), (0.262 * math.cos(a), 0.262 * math.sin(a), 0.004), m_dark, bevel=0.004, rot=(0, 0, a)))
        objs.append(make_blade(f"RotorBlade_{k}", 0.195, 0.046, 0.038, 0.010, 0.28, m_yellow, (0, 0, 0.026), a + math.pi / 4.0))
    return bp.join(objs, "DroneRotor")


def build_flag():
    m_brass = bp.mat_bare_metal("A_FlagBrass", C["brass"], rough=0.28)
    m_dark = bp.mat_painted_metal("A_FlagDark", C["dark_steel"], C["dark_steel2"], wear_amt=0.9, rust_amt=0.5)
    m_red = mat_fabric("A_FlagRed", C["red"], C["red_dark"], rough=0.78)
    m_yellow = mat_fabric("A_FlagYellow", C["mustard"], C["mustard_dark"], rough=0.76)
    m_steel = bp.mat_bare_metal("A_FlagSteel", C["steel"], rough=0.30)

    # Paño ondulado con volumen real y franja amarilla de taller
    bm = bmesh.new()
    nx, nz = 14, 8
    w, h, th = 0.30, 0.20, 0.014
    x0, z0 = -0.125, 0.13
    front_grid, back_grid = [], []
    for iz in range(nz + 1):
        vz = iz / nz
        z = z0 + vz * h
        frow, brow = [], []
        for ix in range(nx + 1):
            ux = ix / nx
            x = x0 + ux * w
            # Ondulación natural creciente desde el mástil hacia la punta
            wave = 0.024 * math.sin(ux * math.pi * 2.2 - vz * 0.8) * (ux ** 0.85)
            # Ligera caída de cola de golondrina en el extremo
            z_off = -0.018 * (ux ** 1.5)
            frow.append(bm.verts.new((x, wave + th * 0.5, z + z_off)))
            brow.append(bm.verts.new((x, wave - th * 0.5, z + z_off)))
        front_grid.append(frow)
        back_grid.append(brow)
    for iz in range(nz):
        for ix in range(nx):
            is_stripe = 8 <= ix <= 10
            mat_idx = 1 if is_stripe else 0
            f1 = bm.faces.new((front_grid[iz][ix], front_grid[iz][ix + 1], front_grid[iz + 1][ix + 1], front_grid[iz + 1][ix]))
            f2 = bm.faces.new((back_grid[iz][ix + 1], back_grid[iz][ix], back_grid[iz + 1][ix], back_grid[iz + 1][ix + 1]))
            f1.material_index = mat_idx
            f2.material_index = mat_idx
    # Bordes cerrados
    for ix in range(nx):
        bm.faces.new((back_grid[0][ix], back_grid[0][ix + 1], front_grid[0][ix + 1], front_grid[0][ix]))
        bm.faces.new((front_grid[nz][ix], front_grid[nz][ix + 1], back_grid[nz][ix + 1], back_grid[nz][ix]))
    for iz in range(nz):
        bm.faces.new((front_grid[iz][0], front_grid[iz + 1][0], back_grid[iz + 1][0], back_grid[iz][0]))
        bm.faces.new((back_grid[iz][nx], back_grid[iz + 1][nx], front_grid[iz + 1][nx], front_grid[iz][nx]))
    cloth = add_bm("FlagCloth", bm, m_red)
    cloth.data.materials.append(m_yellow)

    objs = [
        cloth,
        bp.lathe("FlagBase", [
            (0.0, -0.355), (0.062, -0.355), (0.066, -0.345), (0.056, -0.320),
            (0.036, -0.305), (0.032, -0.275), (0.0, -0.275),
        ], 20, m_dark),
        bp.make_cylinder("Mast", 0.019, 0.66, 16, (-0.142, 0, 0.01), m_brass, bevel=0.002),
        bp.lathe("Finial", [
            (0.0, 0.33), (0.024, 0.33), (0.030, 0.348), (0.022, 0.365), (0.0, 0.372),
        ], 18, m_brass),
    ]
    objs[1].location = (-0.142, 0, 0)
    objs[3].location = (-0.142, 0, 0)
    # 3 anillas sujetando la tela al mástil
    for z_ring in (0.145, 0.225, 0.305):
        objs.append(make_torus(f"Grommet_{z_ring}", 0.024, 0.006, 18, 8, m_steel, (-0.142, 0, z_ring)))
    objs += make_bolts_ring("FlagBolt", 4, 0.048, -0.325, 0.007, 0.010, m_steel)
    for b in objs[-4:]:
        b.location.x -= 0.142
    return bp.join(objs, "Flag")


def build_wire_tool():
    """Pinza de cables en mano (+Z Three.js = -Y Blender)."""
    m_teal = bp.mat_painted_metal("A_WireTeal", C["teal"], C["teal_dark"], wear_amt=0.9, rust_amt=0.3)
    m_dark = bp.mat_painted_metal("A_WireDark", C["dark_steel"], C["dark_steel2"], wear_amt=0.85, rust_amt=0.4)
    m_copper = bp.mat_bare_metal("A_WireCopper", C["copper"], rough=0.34)
    m_brass = bp.mat_bare_metal("A_WireBrass", C["brass"], rough=0.28)
    m_leather = mat_fabric("A_WireGrip", C["leather"], C["leather_dark"], rough=0.88)
    m_glow = bp.mat_flat("A_WireGlow", C["glow_cyan"], rough=0.18)

    objs = [
        # Empuñadura ergonómica con anillos y guarda-gatillo
        bp.make_box("GripCore", (0.036, 0.042, 0.10), (0, 0.006, -0.058), m_leather, bevel=0.006),
        bp.make_box("Pommel", (0.042, 0.048, 0.018), (0, 0.008, -0.108), m_dark, bevel=0.004),
        bp.make_box("Trigger", (0.014, 0.022, 0.032), (0, -0.024, -0.036), m_brass, bevel=0.003, rot=(0.35, 0, 0)),
        # Cuerpo principal biselado con placa lateral
        bp.make_box("Body", (0.066, 0.150, 0.070), (0, -0.032, 0.012), m_teal, bevel=0.008),
        bp.make_box("BodyCapBack", (0.056, 0.020, 0.058), (0, 0.048, 0.012), m_dark, bevel=0.004),
        # Carrete de cobre con bridas oscuras
        bp.make_cylinder("Spool", 0.035, 0.054, 22, (0, -0.015, 0.064), m_copper, bevel=0.003),
        bp.make_cylinder("SpoolCapL", 0.045, 0.009, 22, (-0.030, -0.015, 0.064), m_dark, bevel=0.002),
        bp.make_cylinder("SpoolCapR", 0.045, 0.009, 22, (0.030, -0.015, 0.064), m_dark, bevel=0.002),
        # Indicador eléctrico frontal
        bp.make_box("GlowBar", (0.038, 0.016, 0.018), (0, -0.108, 0.020), m_glow, bevel=0.003),
        # Tenazas conductoras de latón con puntas de cobre
        bp.make_box("JawL", (0.016, 0.115, 0.028), (-0.024, -0.165, 0.008), m_brass, bevel=0.003, rot=(0, 0, 0.14)),
        bp.make_box("JawR", (0.016, 0.115, 0.028), (0.024, -0.165, 0.008), m_brass, bevel=0.003, rot=(0, 0, -0.14)),
        bp.make_box("TipL", (0.014, 0.026, 0.024), (-0.034, -0.225, 0.008), m_copper, bevel=0.003, rot=(0, 0, 0.22)),
        bp.make_box("TipR", (0.014, 0.026, 0.024), (0.034, -0.225, 0.008), m_copper, bevel=0.003, rot=(0, 0, -0.22)),
    ]
    for i in (5, 6, 7):
        objs[i].rotation_euler = (0, math.pi / 2.0, 0)
    # Anillos de agarre en la empuñadura
    for gz in (-0.082, -0.058, -0.034):
        objs.append(bp.make_box(f"GripRib_{gz}", (0.040, 0.046, 0.008), (0, 0.006, gz), m_dark, bevel=0.002))
    return bp.join(objs, "WireTool")


def build_spray_can():
    m_steel = bp.mat_bare_metal("A_SpraySteel", C["steel"], rough=0.30)
    m_dark = bp.mat_painted_metal("A_SprayDark", C["dark_steel"], C["dark_steel2"], wear_amt=0.75, rust_amt=0.25)
    m_label = bp.mat_painted_metal("A_SprayLabel", C["teal"], C["teal_dark"], wear_amt=0.65, band=True, rust_amt=0.15)
    m_cream = mat_fabric("A_SprayCap", C["cream"], C["cream_dark"], rough=0.48)
    m_brass = bp.mat_bare_metal("A_SprayBrass", C["brass"], rough=0.30)

    # Perfil torneado realista de lata de aerosol (fondo cóncavo, rebordes engarzados, hombro curvo)
    can = bp.lathe("SprayCanBody", [
        (0.0, -0.058), (0.034, -0.058), (0.040, -0.064), (0.043, -0.062),
        (0.043, -0.050), (0.041, -0.046), (0.041, 0.072), (0.043, 0.076),
        (0.042, 0.082), (0.036, 0.095), (0.025, 0.104), (0.025, 0.110),
        (0.018, 0.112), (0.0, 0.112),
    ], 28, m_steel)

    label = bp.lathe("SprayLabel", [
        (0.0422, -0.032), (0.0425, -0.030), (0.0425, 0.062), (0.0422, 0.064),
    ], 28, m_label)

    nozzle = bp.lathe("SprayNozzle", [
        (0.0, 0.112), (0.0145, 0.112), (0.015, 0.132), (0.013, 0.138), (0.0, 0.136),
    ], 20, m_cream)

    orifice = bp.make_cylinder("SprayOrifice", 0.0048, 0.010, 12, (0, -0.013, 0.126), m_dark, bevel=0.001)
    orifice.rotation_euler = (math.pi / 2.0, 0, 0)

    objs = [
        can, label, nozzle, orifice,
        make_torus("BottomRim", 0.0415, 0.004, 28, 8, m_dark, (0, 0, -0.058)),
        make_torus("ShoulderRim", 0.0415, 0.004, 28, 8, m_brass, (0, 0, 0.078)),
        make_torus("ValveCup", 0.024, 0.0045, 22, 8, m_brass, (0, 0, 0.107)),
    ]
    return bp.join(objs, "SprayCan")


RECIPES = {
    "spring": (build_spring, "prop", "spring-v001.glb"),
    "balloon": (build_balloon, "prop", "balloon-v001.glb"),
    "fan": (build_fan, "prop", "fan-v001.glb"),
    "horn": (build_horn, "prop", "horn-v001.glb"),
    "gyro": (build_gyro, "prop", "gyro-v001.glb"),
    "boxing_glove": (build_boxing_glove, "prop", "boxing_glove-v001.glb"),
    "drone_rotor": (build_drone_rotor, "prop", "drone_rotor-v001.glb"),
    "flag": (build_flag, "prop", "flag-v001.glb"),
    "wire_tool": (build_wire_tool, "tool", "wire_tool.glb"),
    "spray_can": (build_spray_can, "tool", "spray_can.glb"),
}


def bake_fast(obj, key, res, tex_dir):
    os.makedirs(tex_dir, exist_ok=True)
    base = bp.new_image(f"{key}_baseColor", res, False)
    rough = bp.new_image(f"{key}_rough_tmp", res, True)
    metal = bp.new_image(f"{key}_metal_tmp", res, True)
    ao = bp.new_image(f"{key}_ao_tmp", res, True)
    normal = bp.new_image(f"{key}_normal", res, True)

    bp.bake(obj, base, "base", 12)
    bp.bake(obj, rough, "rough", 4)
    bp.bake(obj, metal, "metal", 4)
    bp.bake(obj, ao, "ao", 48)
    bp.bake(obj, normal, "normal", 6)

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


def render_studio_preview(obj, out_png):
    os.makedirs(os.path.dirname(out_png), exist_ok=True)
    scene = bpy.context.scene
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    scene.render.resolution_x = 960
    scene.render.resolution_y = 720
    scene.render.film_transparent = False
    scene.view_settings.view_transform = (
        "AgX" if "AgX" in [i.identifier for i in scene.view_settings.bl_rna.properties["view_transform"].enum_items]
        else "Filmic"
    )

    world = scene.world or bpy.data.worlds.new("StudioWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = bp.hex_rgba("#9ca7b4")
        bg.inputs["Strength"].default_value = 0.85

    sun_d = bpy.data.lights.new("Sun", "SUN")
    sun_d.energy = 3.2
    sun_d.color = (1.0, 0.93, 0.82)
    sun_d.angle = math.radians(4)
    sun = bp.link_obj(bpy.data.objects.new("Sun", sun_d))
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))

    floor_m = bpy.data.materials.new("PreviewFloor")
    floor_m.use_nodes = True
    bp.principled_of(floor_m).inputs["Base Color"].default_value = bp.hex_rgba("#8c8379")
    bp.principled_of(floor_m).inputs["Roughness"].default_value = 0.92
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=4.0)
    fm = bpy.data.meshes.new("Floor")
    bm.to_mesh(fm)
    bm.free()
    floor = bp.link_obj(bpy.data.objects.new("PreviewFloor", fm))
    fm.materials.append(floor_m)

    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    min_v = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    max_v = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    floor.location.z = min_v.z
    center = (min_v + max_v) * 0.5
    radius = max((max_v - min_v).length * 0.5, 0.12)

    cam_d = bpy.data.cameras.new("Cam")
    cam_d.lens = 50
    cam = bp.link_obj(bpy.data.objects.new("Cam", cam_d))
    scene.camera = cam
    cam_pos = center + Vector((radius * 2.2, -radius * 2.7, radius * 1.45))
    cam.location = cam_pos
    cam.rotation_euler = (center - cam_pos).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = out_png
    bpy.ops.render.render(write_still=True)

    for o in (sun, floor, cam):
        bpy.data.objects.remove(o, do_unlink=True)


def run_one(key):
    builder, kind, glb_name = RECIPES[key]
    bp.reset_scene()
    obj = builder()
    bp.unwrap(obj)

    if kind == "prop":
        art_dir = os.path.join(PROPS_ART_DIR, key, "v001")
        tex_dir = os.path.join(art_dir, "textures")
        preview_path = os.path.join(art_dir, "previews", f"{key}_full.png")
        blend_path = os.path.join(art_dir, f"{key}.blend")
        glb_path = os.path.join(PROPS_GLB_DIR, glb_name)
    else:
        art_dir = os.path.join(REPO, "art", "blender")
        tex_dir = os.path.join(art_dir, "textures")
        preview_path = os.path.join(art_dir, "previews", f"{key}_full.png")
        blend_path = None
        glb_path = os.path.join(TOOLS_GLB_DIR, glb_name)

    base, orm, normal = bake_fast(obj, key, RES, tex_dir)
    final = bp.final_material(key, base, orm, normal)
    obj.data.materials.clear()
    obj.data.materials.append(final)
    bp.strip_bake_attrs(obj)

    os.makedirs(os.path.dirname(glb_path), exist_ok=True)
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

    render_studio_preview(obj, preview_path)
    if blend_path:
        bpy.ops.wm.save_as_mainfile(filepath=blend_path, relative_remap=True, compress=True)
    bp.report(obj, key, glb_path)


if __name__ == "__main__":
    if WHICH == "all":
        targets = list(RECIPES.keys())
    elif WHICH == "props":
        targets = [k for k, (_, kind, _) in RECIPES.items() if kind == "prop"]
    elif WHICH == "tools":
        targets = [k for k, (_, kind, _) in RECIPES.items() if kind == "tool"]
    elif WHICH in RECIPES:
        targets = [WHICH]
    else:
        raise SystemExit(f"Unknown target: {WHICH}")
    for k in targets:
        run_one(k)
