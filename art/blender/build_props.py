"""
Los del Desguace - generador reproducible de props estilizados (bidón y caja).

Uso (Blender 5.2, sin interfaz):
    blender -b -P art/blender/build_props.py -- all 1024
    blender -b -P art/blender/build_props.py -- barrel 1024
    blender -b -P art/blender/build_props.py -- crate 1024

Por cada prop:
  1. Modela la malla de juego (bordes biselados, detalles reales en geometría).
  2. Crea materiales procedurales de autoría (pintura gastada, madera, metal).
  3. Hornea a texturas glTF: baseColor (sRGB), ORM (AO/rough/metal) y normal.
  4. Sustituye los materiales por uno único horneado, compatible con glTF.
  5. Guarda el .blend fuente, las texturas PNG fuente, la exportación .glb
     (texturas WebP) y renders de vista previa.

Medidas y pivotes coinciden con los colliders del juego
(src/props/GrabbableProps.tsx):
  - caja (crate):    cuboid half-extents 0.32 x 0.30 x 0.32, pivote al centro.
  - bidón (canister): cilindro half-height 0.38, radio 0.22, pivote al centro.
Blender es Z-arriba; el exportador glTF convierte a Y-arriba.
"""

import bpy
import bmesh
import math
import os
import random
import sys

import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
TEX_DIR = os.path.join(ROOT, "textures")
PREVIEW_DIR = os.path.join(ROOT, "previews")
GLB_DIR = os.path.normpath(os.path.join(ROOT, "..", "..", "public", "models", "props"))

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
WHICH = argv[0] if len(argv) > 0 else "all"
RES = int(argv[1]) if len(argv) > 1 else 1024


def hex_rgba(h, a=1.0):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]

    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (lin(srgb[0]), lin(srgb[1]), lin(srgb[2]), a)


# Paleta (alineada con src/config/visualConfig.ts PALETTE)
COL = {
    "teal": hex_rgba("#3e8c84"),
    "teal_dark": hex_rgba("#2c6b66"),
    "mustard": hex_rgba("#e2a82e"),
    "stripe_dark": hex_rgba("#2b2926"),
    "steel": hex_rgba("#a7adb3"),
    "rust": hex_rgba("#8f4a2a"),
    "grime": hex_rgba("#3b2f25"),
    "brass": hex_rgba("#d49d3b"),
    "red": hex_rgba("#c84b36"),
    "metal_dark": hex_rgba("#3b4048"),
    "wood_a": hex_rgba("#c48a55"),
    "wood_b": hex_rgba("#8f5b32"),
    "wood_edge": hex_rgba("#dcae7a"),
    "stencil": hex_rgba("#2a2420"),
    "core": hex_rgba("#2a1c12"),
}


# ---------------------------------------------------------------------------
# Escena
# ---------------------------------------------------------------------------

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.55, 0.62, 0.72, 1.0)
        bg.inputs["Strength"].default_value = 0.6
    world.light_settings.distance = 0.12
    scene.view_settings.view_transform = "Standard"
    return scene


def link_obj(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def set_active(obj):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def add_attrs(mesh, rand, axis):
    a = mesh.attributes.new("rand", "FLOAT", "POINT")
    a.data.foreach_set("value", [rand] * len(mesh.vertices))
    b = mesh.attributes.new("axis", "FLOAT_VECTOR", "POINT")
    b.data.foreach_set("vector", list(axis) * len(mesh.vertices))


def apply_bevel(obj, width, segments, harden=True):
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "NONE"
    mod.harden_normals = harden
    set_active(obj)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def smooth(obj, angle_deg=40.0):
    obj.data.shade_smooth()
    try:
        obj.data.set_sharp_from_angle(angle=math.radians(angle_deg))
    except Exception:
        pass


def make_box(name, size, loc, mat, rand=0.0, axis=(1, 0, 0), bevel=0.004, segs=1, rot=(0, 0, 0)):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bm.to_mesh(mesh)
    bm.free()
    obj = link_obj(bpy.data.objects.new(name, mesh))
    obj.location = loc
    obj.rotation_euler = rot
    mesh.materials.append(mat)
    smooth(obj, 30)
    if bevel > 0:
        apply_bevel(obj, bevel, segs)
    add_attrs(obj.data, rand, axis)
    return obj


def make_cylinder(name, radius, depth, verts, loc, mat, bevel=0.0, segs=1, cap_bottom=True, rand=0.0):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts,
                          radius1=radius, radius2=radius, depth=depth)
    if not cap_bottom:
        bottom = [f for f in bm.faces if f.normal.z < -0.9]
        bmesh.ops.delete(bm, geom=bottom, context="FACES")
    bm.to_mesh(mesh)
    bm.free()
    obj = link_obj(bpy.data.objects.new(name, mesh))
    obj.location = loc
    mesh.materials.append(mat)
    smooth(obj, 35)
    if bevel > 0:
        apply_bevel(obj, bevel, segs)
    add_attrs(obj.data, rand, (0, 0, 1))
    return obj


def orient(obj, normal):
    """Alinea el eje Z local (eje del cilindro) con la normal dada."""
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(normal).normalized())


def join(objs, name):
    set_active(objs[0])
    for o in objs:
        o.select_set(True)
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.name = name
    set_active(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def lathe(name, profile, segments, mat):
    """Revoluciona un perfil (r, z) cerrado de centro inferior a centro superior."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r < 1e-6:
            rings.append([bm.verts.new((0.0, 0.0, z))])
        else:
            ring = []
            for i in range(segments):
                a = 2.0 * math.pi * i / segments
                ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
            rings.append(ring)
    n = segments
    for k in range(len(rings) - 1):
        A, B = rings[k], rings[k + 1]
        if len(A) == 1 and len(B) == 1:
            continue
        for i in range(n):
            j = (i + 1) % n
            if len(A) == 1:
                bm.faces.new((A[0], B[j], B[i]))
            elif len(B) == 1:
                bm.faces.new((A[i], A[j], B[0]))
            else:
                bm.faces.new((A[i], A[j], B[j], B[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = link_obj(bpy.data.objects.new(name, mesh))
    mesh.materials.append(mat)
    return obj


# ---------------------------------------------------------------------------
# Constructor de nodos
# ---------------------------------------------------------------------------

class NB:
    def __init__(self, mat):
        mat.use_nodes = True
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.x = 0

    def node(self, t, **props):
        n = self.nt.nodes.new(t)
        n.location = (self.x, 0)
        self.x += 40
        for k, v in props.items():
            setattr(n, k, v)
        return n

    def put(self, sock, v):
        if v is None:
            return
        if isinstance(v, bpy.types.NodeSocket):
            self.nt.links.new(v, sock)
        else:
            sock.default_value = v

    def math(self, op, a, b=None, clamp=False):
        n = self.node("ShaderNodeMath", operation=op, use_clamp=clamp)
        self.put(n.inputs[0], a)
        if b is not None:
            self.put(n.inputs[1], b)
        return n.outputs[0]

    def vmath(self, op, a, b=None, scale=None):
        n = self.node("ShaderNodeVectorMath", operation=op)
        self.put(n.inputs[0], a)
        if b is not None:
            self.put(n.inputs[1], b)
        if scale is not None:
            self.put(n.inputs["Scale"], scale)
        return n.outputs["Value"] if op in ("DOT_PRODUCT", "LENGTH", "DISTANCE") else n.outputs["Vector"]

    def _mix(self, dtype, fac, a, b, blend="MIX"):
        n = self.node("ShaderNodeMix", data_type=dtype, blend_type=blend, clamp_factor=True)
        ins = {s.identifier: s for s in n.inputs}
        outs = {s.identifier: s for s in n.outputs}
        self.put(ins["Factor_Float"], fac)
        suffix = "Color" if dtype == "RGBA" else "Float"
        self.put(ins["A_" + suffix], a)
        self.put(ins["B_" + suffix], b)
        return outs["Result_" + suffix]

    def mixc(self, fac, a, b, blend="MIX"):
        return self._mix("RGBA", fac, a, b, blend)

    def mixf(self, fac, a, b):
        return self._mix("FLOAT", fac, a, b)

    def maprange(self, v, fmin, fmax, tmin=0.0, tmax=1.0, smooth=True):
        n = self.node("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP" if smooth else "LINEAR", clamp=True)
        self.put(n.inputs["Value"], v)
        n.inputs["From Min"].default_value = fmin
        n.inputs["From Max"].default_value = fmax
        n.inputs["To Min"].default_value = tmin
        n.inputs["To Max"].default_value = tmax
        return n.outputs["Result"]

    def noise(self, vec, scale, detail=2.0, rough=0.5, distortion=0.0):
        n = self.node("ShaderNodeTexNoise")
        self.put(n.inputs["Vector"], vec)
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough
        n.inputs["Distortion"].default_value = distortion
        return n.outputs["Fac"]

    def sep(self, vec):
        n = self.node("ShaderNodeSeparateXYZ")
        self.put(n.inputs[0], vec)
        return n.outputs["X"], n.outputs["Y"], n.outputs["Z"]

    def hsv(self, color, hue=0.5, sat=1.0, val=1.0):
        n = self.node("ShaderNodeHueSaturation")
        self.put(n.inputs["Color"], color)
        self.put(n.inputs["Hue"], hue)
        self.put(n.inputs["Saturation"], sat)
        self.put(n.inputs["Value"], val)
        return n.outputs["Color"]

    def edge_mask(self, radius, lo, hi):
        """Bordes convexos: diferencia entre normal biselada y normal real."""
        geo = self.node("ShaderNodeNewGeometry")
        bev = self.node("ShaderNodeBevel", samples=8)
        bev.inputs["Radius"].default_value = radius
        d = self.vmath("DOT_PRODUCT", bev.outputs["Normal"], geo.outputs["Normal"])
        e = self.math("SUBTRACT", 1.0, d)
        return self.maprange(e, lo, hi)

    def ao(self, distance, inside=False):
        n = self.node("ShaderNodeAmbientOcclusion", samples=16, inside=inside, only_local=True)
        n.inputs["Distance"].default_value = distance
        return n.outputs["AO"]

    def finish(self, base, rough, metal, height, bump_strength, bump_distance):
        bsdf = self.node("ShaderNodeBsdfPrincipled")
        self.put(bsdf.inputs["Base Color"], base)
        self.put(bsdf.inputs["Roughness"], rough)
        self.put(bsdf.inputs["Metallic"], metal)
        if height is not None:
            bump = self.node("ShaderNodeBump")
            bump.inputs["Strength"].default_value = bump_strength
            bump.inputs["Distance"].default_value = bump_distance
            self.put(bump.inputs["Height"], height)
            self.nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
        out = self.node("ShaderNodeOutputMaterial")
        self.nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        return bsdf


def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_fake_user = True  # conservar materiales de autoría en el .blend
    return m


# ---------------------------------------------------------------------------
# Materiales de autoría
# ---------------------------------------------------------------------------

def mat_painted_metal(name, paint, paint2, wear_amt=1.0, band=False, rust_amt=0.6,
                      paint_rough=0.5, edge_radius=0.006):
    m = new_mat(name)
    nb = NB(m)
    tc = nb.node("ShaderNodeTexCoord")
    p = tc.outputs["Object"]
    x, y, z = nb.sep(p)

    n_low = nb.noise(p, 3.0, 2.0, 0.5)
    n_mid = nb.noise(p, 14.0, 4.0, 0.6)
    n_hi = nb.noise(p, 48.0, 2.0, 0.5)

    paint_col = nb.mixc(nb.maprange(n_low, 0.35, 0.7), paint, paint2)

    if band:
        ang = nb.math("ARCTAN2", y, x)
        az = nb.math("ABSOLUTE", z)
        band_mask = nb.maprange(az, 0.052, 0.046)
        diag = nb.math("ADD", nb.math("MULTIPLY", ang, 0.215), z)
        stripes = nb.maprange(nb.math("FRACT", nb.math("MULTIPLY", diag, 11.0)), 0.47, 0.53)
        band_col = nb.mixc(stripes, COL["mustard"], COL["stripe_dark"])
        # Fino filete crema bordeando la banda
        pin = nb.math("MULTIPLY", nb.maprange(az, 0.058, 0.055), nb.maprange(az, 0.052, 0.055))
        band_col_full = nb.mixc(pin, band_col, hex_rgba("#e9dcc0"))
        band_any = nb.math("MAXIMUM", band_mask, pin)
        paint_col = nb.mixc(band_any, paint_col, band_col_full)

    edge = nb.edge_mask(edge_radius, 0.008, 0.12)
    bottom = nb.maprange(z, -0.38, -0.30, 0.35, 0.0)
    wear_in = nb.math("ADD", nb.math("MULTIPLY", edge, 1.25 * wear_amt),
                      nb.math("MULTIPLY", nb.math("SUBTRACT", n_mid, 0.5), 1.1))
    wear_in = nb.math("ADD", wear_in, nb.math("MULTIPLY", bottom, wear_amt))
    wear = nb.maprange(wear_in, 0.52, 0.60)

    ao = nb.ao(0.05)
    cavity = nb.math("SUBTRACT", 1.0, ao)
    streak = nb.noise(nb.vmath("MULTIPLY", p, (26.0, 26.0, 3.0)), 1.0, 3.0, 0.55)
    low_dirt = nb.maprange(z, -0.38, -0.12, 0.45, 0.0)
    grime = nb.math("ADD", nb.math("MULTIPLY", cavity, 0.7),
                    nb.math("MULTIPLY", low_dirt, nb.maprange(streak, 0.4, 0.65)), clamp=True)
    paint_col = nb.mixc(nb.math("MULTIPLY", grime, 0.55), paint_col, COL["grime"])

    rust = nb.math("MULTIPLY", nb.maprange(nb.math("ADD", n_hi, nb.math("MULTIPLY", bottom, 0.8)), 0.45, 0.62),
                   rust_amt)
    metal_col = nb.mixc(rust, COL["steel"], COL["rust"])
    base = nb.mixc(wear, paint_col, metal_col)

    rough_paint = nb.math("ADD", paint_rough, nb.math("MULTIPLY", n_low, 0.12))
    rough_paint = nb.math("ADD", rough_paint, nb.math("MULTIPLY", grime, 0.2))
    rough_metal = nb.mixf(rust, 0.32, 0.85)
    rough = nb.mixf(wear, rough_paint, rough_metal)
    metal = nb.math("MULTIPLY", wear, nb.math("SUBTRACT", 1.0, rust))

    height = nb.math("ADD", nb.math("SUBTRACT", 1.0, nb.math("MULTIPLY", wear, 0.8)),
                     nb.math("MULTIPLY", n_hi, 0.06))
    nb.finish(base, rough, metal, height, 0.35, 0.0015)
    return m


def mat_bare_metal(name, color, rough=0.32, wear_tint=0.25):
    m = new_mat(name)
    nb = NB(m)
    p = nb.node("ShaderNodeTexCoord").outputs["Object"]
    n = nb.noise(p, 40.0, 3.0, 0.55)
    edge = nb.edge_mask(0.003, 0.02, 0.2)
    ao = nb.ao(0.02)
    col = nb.mixc(nb.math("MULTIPLY", nb.math("SUBTRACT", 1.0, ao), 0.7), color, COL["grime"])
    col = nb.mixc(nb.math("MULTIPLY", edge, wear_tint), col, (0.95, 0.9, 0.8, 1))
    r = nb.math("ADD", rough, nb.math("MULTIPLY", n, 0.15))
    r = nb.math("SUBTRACT", r, nb.math("MULTIPLY", edge, 0.12))
    nb.finish(col, r, 0.95, n, 0.12, 0.001)
    return m


def mat_wood(name):
    m = new_mat(name)
    nb = NB(m)
    tc = nb.node("ShaderNodeTexCoord")
    p = tc.outputs["Object"]
    rand = nb.node("ShaderNodeAttribute", attribute_name="rand", attribute_type="GEOMETRY").outputs["Fac"]
    axis = nb.node("ShaderNodeAttribute", attribute_name="axis", attribute_type="GEOMETRY").outputs["Vector"]

    # Veta alargada en el eje largo de cada tabla
    stretch = nb.vmath("ADD", nb.vmath("SCALE", axis, scale=-0.93), (1.0, 1.0, 1.0))
    q = nb.vmath("MULTIPLY", p, stretch)
    q = nb.vmath("ADD", q, nb.vmath("SCALE", (13.1, 7.7, 3.3), scale=rand))
    grain = nb.noise(q, 9.0, 3.0, 0.55, 0.6)
    fine = nb.noise(q, 34.0, 1.0, 0.5)
    g = nb.maprange(grain, 0.38, 0.66)
    tone = nb.math("ADD", nb.math("MULTIPLY", g, 0.65), nb.math("MULTIPLY", fine, 0.25))
    col = nb.mixc(tone, COL["wood_a"], COL["wood_b"])

    # Variación moderada por tabla
    col = nb.hsv(col, nb.math("ADD", 0.485, nb.math("MULTIPLY", rand, 0.03)), 1.0,
                 nb.math("ADD", 0.9, nb.math("MULTIPLY", rand, 0.17)))

    # Estarcido (flecha) en las caras laterales, como la caja original
    geo = nb.node("ShaderNodeNewGeometry")
    nx, ny, nz = nb.sep(geo.outputs["Normal"])
    x, y, z = nb.sep(p)
    m_y = nb.math("GREATER_THAN", nb.math("ABSOLUTE", ny), 0.9)
    m_x = nb.math("GREATER_THAN", nb.math("ABSOLUTE", nx), 0.9)
    u = nb.math("ADD", nb.math("MULTIPLY", x, m_y), nb.math("MULTIPLY", y, m_x))
    au = nb.math("ABSOLUTE", u)
    v = z

    def between(val, lo, hi):
        return nb.math("MULTIPLY", nb.math("GREATER_THAN", val, lo), nb.math("LESS_THAN", val, hi))

    shaft = nb.math("MULTIPLY", nb.math("LESS_THAN", au, 0.017), between(v, -0.058, 0.012))
    head_w = nb.math("MULTIPLY", nb.math("SUBTRACT", 0.064, v), 0.9)
    head = nb.math("MULTIPLY", between(v, 0.011, 0.064), nb.math("LESS_THAN", au, head_w))
    icon = nb.math("MAXIMUM", shaft, head)
    icon = nb.math("MULTIPLY", icon, nb.math("MAXIMUM", m_x, m_y))
    spray = nb.maprange(nb.noise(p, 22.0, 3.0, 0.55), 0.28, 0.5, 0.5, 0.88)
    icon_a = nb.math("MULTIPLY", icon, spray)
    col = nb.mixc(icon_a, col, COL["stencil"])

    # Cantos gastados y aclarados; huecos oscurecidos
    edge = nb.edge_mask(0.004, 0.02, 0.25)
    col = nb.mixc(nb.math("MULTIPLY", edge, 0.55), col, COL["wood_edge"])
    ao = nb.ao(0.035)
    col = nb.mixc(nb.math("MULTIPLY", nb.math("SUBTRACT", 1.0, ao), 0.75), col, COL["grime"])
    low = nb.maprange(z, -0.30, -0.18, 0.35, 0.0)
    col = nb.mixc(nb.math("MULTIPLY", low, nb.maprange(fine, 0.3, 0.7)), col, COL["grime"])

    rough = nb.math("ADD", 0.76, nb.math("MULTIPLY", fine, 0.12))
    rough = nb.math("SUBTRACT", rough, nb.math("MULTIPLY", edge, 0.1))
    rough = nb.mixf(icon_a, rough, 0.62)
    height = nb.math("ADD", nb.math("MULTIPLY", g, 0.6), nb.math("MULTIPLY", fine, 0.4))
    nb.finish(col, rough, 0.0, height, 0.22, 0.0015)
    return m


def mat_flat(name, color, rough=1.0):
    m = new_mat(name)
    nb = NB(m)
    nb.finish(color, rough, 0.0, None, 0, 0)
    return m


# ---------------------------------------------------------------------------
# Bidón
# ---------------------------------------------------------------------------

def build_barrel():
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
    dents = [  # (ángulo, z, radio, profundidad)
        (0.75, 0.035, 0.075, 0.011),
        (2.95, -0.235, 0.055, 0.008),
        (4.55, 0.235, 0.060, 0.006),
        (5.60, 0.372, 0.045, 0.006),
        (1.90, -0.372, 0.040, 0.005),
    ]
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


# ---------------------------------------------------------------------------
# Caja
# ---------------------------------------------------------------------------

def build_crate():
    rng = random.Random(7)
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


# ---------------------------------------------------------------------------
# UV, horneado y material final
# ---------------------------------------------------------------------------

def unwrap(obj, shrink_mats=()):
    set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(52), island_margin=0.0, area_weight=0.0,
                             scale_to_bounds=False)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode="OBJECT")
    # Reducir islas de superficies casi invisibles (núcleo) para ganar resolución
    if shrink_mats:
        me = obj.data
        uv = me.uv_layers.active.data
        idx = [i for i, m in enumerate(me.materials) if m and m.name in shrink_mats]
        for poly in me.polygons:
            if poly.material_index in idx:
                for li in poly.loop_indices:
                    uv[li].uv = uv[li].uv * 0.08
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin=0.006)
    bpy.ops.object.mode_set(mode="OBJECT")


def new_image(name, res, non_color):
    img = bpy.data.images.new(name, res, res, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    return img


def principled_of(mat):
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            return n
    return None


def output_of(mat):
    for n in mat.node_tree.nodes:
        if n.type == "OUTPUT_MATERIAL":
            return n
    return None


def bake(obj, img, kind, samples):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.render.bake.margin = 10
    scene.render.bake.use_clear = True
    mats = [m for m in obj.data.materials if m]
    temp_nodes = []
    for m in mats:
        nt = m.node_tree
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        nt.nodes.active = tex
        temp_nodes.append((m, tex))
        if kind in ("base", "rough", "metal"):
            bsdf = principled_of(m)
            out = output_of(m)
            inp = bsdf.inputs[{"base": "Base Color", "rough": "Roughness", "metal": "Metallic"}[kind]]
            emis = nt.nodes.new("ShaderNodeEmission")
            temp_nodes.append((m, emis))
            if inp.links:
                nt.links.new(inp.links[0].from_socket, emis.inputs["Color"])
            else:
                dv = inp.default_value
                emis.inputs["Color"].default_value = tuple(dv) if kind == "base" else (dv, dv, dv, 1.0)
            nt.links.new(emis.outputs["Emission"], out.inputs["Surface"])
    set_active(obj)
    if kind in ("base", "rough", "metal"):
        bpy.ops.object.bake(type="EMIT")
    elif kind == "normal":
        bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT")
    elif kind == "ao":
        bpy.ops.object.bake(type="AO")
    for m, n in temp_nodes:
        m.node_tree.nodes.remove(n)
    for m in mats:
        bsdf, out = principled_of(m), output_of(m)
        m.node_tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])


def px(img):
    a = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(-1, 4)


def save_png(img, path):
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img.filepath = bpy.path.relpath(path)


def gltf_output_group():
    name = "glTF Material Output"
    g = bpy.data.node_groups.get(name)
    if g:
        return g
    g = bpy.data.node_groups.new(name, "ShaderNodeTree")
    g.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    g.nodes.new("NodeGroupInput")
    return g


def bake_all(obj, key, res):
    os.makedirs(TEX_DIR, exist_ok=True)
    base = new_image(f"{key}_baseColor", res, False)
    rough = new_image(f"{key}_rough_tmp", res, True)
    metal = new_image(f"{key}_metal_tmp", res, True)
    ao = new_image(f"{key}_ao_tmp", res, True)
    normal = new_image(f"{key}_normal", res, True)

    bake(obj, base, "base", 16)
    bake(obj, rough, "rough", 4)
    bake(obj, metal, "metal", 4)
    bake(obj, ao, "ao", 96)
    bake(obj, normal, "normal", 8)

    # ORM: R=AO, G=roughness, B=metalness (convención glTF)
    a_ao, a_r, a_m = px(ao), px(rough), px(metal)
    occl = 0.35 + 0.65 * a_ao[:, 0]  # AO suavizada para estilo
    orm = new_image(f"{key}_orm", res, True)
    o = np.ones((res * res, 4), dtype=np.float32)
    o[:, 0], o[:, 1], o[:, 2] = occl, a_r[:, 0], a_m[:, 0]
    orm.pixels.foreach_set(o.ravel())

    # Un toque de oclusión integrado al color (three solo la aplica a luz indirecta)
    b = px(base)
    k = (1.0 - 0.28 * (1.0 - a_ao[:, 0]))[:, None]
    b[:, :3] *= k
    base.pixels.foreach_set(b.ravel())

    save_png(base, os.path.join(TEX_DIR, f"{key}_baseColor.png"))
    save_png(orm, os.path.join(TEX_DIR, f"{key}_orm.png"))
    save_png(normal, os.path.join(TEX_DIR, f"{key}_normal.png"))
    for tmp in (rough, metal, ao):
        bpy.data.images.remove(tmp)
    return base, orm, normal


def final_material(key, base, orm, normal):
    m = bpy.data.materials.new(f"M_{key.capitalize()}")
    m.use_backface_culling = True  # glTF doubleSided = false
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    t_base = nt.nodes.new("ShaderNodeTexImage")
    t_base.image = base
    nt.links.new(t_base.outputs["Color"], bsdf.inputs["Base Color"])
    t_orm = nt.nodes.new("ShaderNodeTexImage")
    t_orm.image = orm
    sepc = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(t_orm.outputs["Color"], sepc.inputs["Color"])
    nt.links.new(sepc.outputs["Green"], bsdf.inputs["Roughness"])
    nt.links.new(sepc.outputs["Blue"], bsdf.inputs["Metallic"])
    grp = nt.nodes.new("ShaderNodeGroup")
    grp.node_tree = gltf_output_group()
    nt.links.new(sepc.outputs["Red"], grp.inputs["Occlusion"])
    t_n = nt.nodes.new("ShaderNodeTexImage")
    t_n.image = normal
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(t_n.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def strip_bake_attrs(obj):
    for name in ("rand", "axis"):
        a = obj.data.attributes.get(name)
        if a:
            obj.data.attributes.remove(a)


def export_glb(obj, key):
    os.makedirs(GLB_DIR, exist_ok=True)
    path = os.path.join(GLB_DIR, f"{key}.glb")
    set_active(obj)
    kwargs = dict(
        filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_tangents=True, export_materials="EXPORT",
        export_image_format="WEBP", export_image_quality=86, export_cameras=False, export_lights=False,
        export_extras=False, export_animations=False,
    )
    try:
        bpy.ops.export_scene.gltf(export_vertex_color="NONE", **kwargs)
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs)
    return path


def render_previews(obj, key):
    os.makedirs(PREVIEW_DIR, exist_ok=True)
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
    scene.view_settings.view_transform = "AgX" if "AgX" in [i.identifier for i in scene.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"

    sun_d = bpy.data.lights.new("Sun", "SUN")
    sun_d.energy = 3.2
    sun_d.color = (1.0, 0.92, 0.8)
    sun_d.angle = math.radians(4)
    sun = link_obj(bpy.data.objects.new("Sun", sun_d))
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))

    floor_m = bpy.data.materials.new("PreviewFloor")
    floor_m.use_nodes = True
    principled_of(floor_m).inputs["Base Color"].default_value = hex_rgba("#8c8379")
    principled_of(floor_m).inputs["Roughness"].default_value = 0.9
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=3.0)
    fm = bpy.data.meshes.new("Floor")
    bm.to_mesh(fm)
    bm.free()
    floor = link_obj(bpy.data.objects.new("PreviewFloor", fm))
    fm.materials.append(floor_m)
    zmin = min((obj.matrix_world @ Vector(c)).z for c in obj.bound_box)
    floor.location.z = zmin

    cam_d = bpy.data.cameras.new("Cam")
    cam = link_obj(bpy.data.objects.new("Cam", cam_d))
    scene.camera = cam

    def shoot(loc, target, lens, fname):
        cam.location = loc
        d = Vector(target) - Vector(loc)
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        cam_d.lens = lens
        scene.render.filepath = os.path.join(PREVIEW_DIR, fname)
        bpy.ops.render.render(write_still=True)

    shoot((1.25, -1.55, 0.85), (0, 0, -0.02), 50, f"{key}_full.png")
    shoot((0.40, -0.46, 0.66), (0.03, -0.03, 0.24), 38, f"{key}_closeup.png")

    for o in (sun, floor, cam):
        bpy.data.objects.remove(o, do_unlink=True)


def report(obj, key, path):
    me = obj.data
    me.calc_loop_triangles()
    tris = len(me.loop_triangles)
    xs = [(obj.matrix_world @ Vector(c)) for c in obj.bound_box]
    mn = Vector((min(v.x for v in xs), min(v.y for v in xs), min(v.z for v in xs)))
    mx = Vector((max(v.x for v in xs), max(v.y for v in xs), max(v.z for v in xs)))
    size = os.path.getsize(path)
    print(f"[REPORT] {key}: tris={tris} verts={len(me.vertices)} materials={len(me.materials)} "
          f"bbox_min={tuple(round(c, 4) for c in mn)} bbox_max={tuple(round(c, 4) for c in mx)} "
          f"glb_bytes={size}")


def run(key):
    reset_scene()
    if key == "barrel":
        obj = build_barrel()
        unwrap(obj)
    else:
        obj = build_crate()
        unwrap(obj, shrink_mats=("A_Core",))
    base, orm, normal = bake_all(obj, key, RES)
    final = final_material(key, base, orm, normal)
    obj.data.materials.clear()
    obj.data.materials.append(final)
    strip_bake_attrs(obj)
    path = export_glb(obj, key)
    render_previews(obj, key)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, f"{key}.blend"), relative_remap=True, compress=True)
    report(obj, key, path)


if __name__ == "__main__":
    keys = ["barrel", "crate"] if WHICH == "all" else [WHICH]
    for k in keys:
        run(k)
