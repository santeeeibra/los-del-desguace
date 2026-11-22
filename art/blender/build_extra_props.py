"""
Los del Desguace — Generador reproducible en Blender 5.2.3 LTS para los 8 props faltantes
y las 2 herramientas de mano faltantes (`wire_tool`, `spray_can`).

Uso:
    blender -b --factory-startup -P art/blender/build_extra_props.py -- all 512
    blender -b --factory-startup -P art/blender/build_extra_props.py -- spring 512
    blender -b --factory-startup -P art/blender/build_extra_props.py -- tools 512
"""

import bpy
import bmesh
import math
import os
import sys
from mathutils import Euler, Matrix, Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(ROOT, "..", ".."))
PROPS_ART_DIR = os.path.join(REPO, "art", "props")
PROPS_GLB_DIR = os.path.join(REPO, "public", "models", "props", "variants")
TOOLS_GLB_DIR = os.path.join(REPO, "public", "models", "tools")

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
WHICH = argv[0] if len(argv) > 0 else "all"
RES = int(argv[1]) if len(argv) > 1 else 512


def hex_rgba(h, a=1.0):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]

    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (lin(srgb[0]), lin(srgb[1]), lin(srgb[2]), a)


PAL = {
    "teal": hex_rgba("#3e8c84"),
    "teal_dark": hex_rgba("#275954"),
    "mustard": hex_rgba("#e2a82e"),
    "red": hex_rgba("#b83a28"),
    "red_dark": hex_rgba("#7a2216"),
    "steel": hex_rgba("#8e969e"),
    "dark_steel": hex_rgba("#2e3338"),
    "brass": hex_rgba("#d4a43c"),
    "copper": hex_rgba("#c96f32"),
    "wood": hex_rgba("#7d522d"),
    "leather": hex_rgba("#4a2a12"),
    "cream": hex_rgba("#efeae0"),
    "glow_cyan": hex_rgba("#64f2d6"),
    "glow_amber": hex_rgba("#ffbb44"),
}


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mat(name, color, metallic=0.1, roughness=0.55, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None and emission_strength > 0:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def add_mesh(name, bm, mat):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def add_box(name, size, loc, mat, rot=(0, 0, 0), bevel=0.008):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges, offset=bevel, segments=2, affect="EDGES")
    obj = add_mesh(name, bm, mat)
    obj.location = loc
    obj.rotation_euler = rot
    return obj


def add_cyl(name, r1, r2, h, segs, loc, mat, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=h)
    obj = add_mesh(name, bm, mat)
    obj.location = loc
    obj.rotation_euler = rot
    return obj


def add_torus(name, major_r, minor_r, maj_segs, min_segs, loc, mat, rot=(0, 0, 0)):
    bm = bmesh.new()
    for i in range(maj_segs):
        a0 = 2 * math.pi * i / maj_segs
        ca, sa = math.cos(a0), math.sin(a0)
        for j in range(min_segs):
            b0 = 2 * math.pi * j / min_segs
            r = major_r + minor_r * math.cos(b0)
            bm.verts.new((r * ca, r * sa, minor_r * math.sin(b0)))
    bm.verts.ensure_lookup_table()
    for i in range(maj_segs):
        ni = (i + 1) % maj_segs
        for j in range(min_segs):
            nj = (j + 1) % min_segs
            v0 = bm.verts[i * min_segs + j]
            v1 = bm.verts[ni * min_segs + j]
            v2 = bm.verts[ni * min_segs + nj]
            v3 = bm.verts[i * min_segs + nj]
            bm.faces.new((v0, v1, v2, v3))
    obj = add_mesh(name, bm, mat)
    obj.location = loc
    obj.rotation_euler = rot
    return obj


def add_helix(name, radius, tube_r, height, turns, segs_per_turn, tube_segs, loc, mat, axis="Z"):
    bm = bmesh.new()
    total = int(turns * segs_per_turn) + 1
    rings = []
    for k in range(total):
        t = k / max(1, total - 1)
        ang = t * turns * 2 * math.pi
        z = -height / 2 + t * height
        cx, cy = radius * math.cos(ang), radius * math.sin(ang)
        center = Vector((cx, cy, z))
        tangent = Vector((-radius * math.sin(ang), radius * math.cos(ang), height / (turns * 2 * math.pi))).normalized()
        up = Vector((0, 0, 1))
        side = tangent.cross(up).normalized()
        binorm = side.cross(tangent).normalized()
        ring = []
        for j in range(tube_segs):
            b = 2 * math.pi * j / tube_segs
            p = center + side * (tube_r * math.cos(b)) + binorm * (tube_r * math.sin(b))
            ring.append(bm.verts.new(p))
        rings.append(ring)
    for k in range(len(rings) - 1):
        for j in range(tube_segs):
            nj = (j + 1) % tube_segs
            bm.faces.new((rings[k][j], rings[k + 1][j], rings[k + 1][nj], rings[k][nj]))
    bmesh.ops.contextual_create(bm, geom=rings[0])
    bmesh.ops.contextual_create(bm, geom=rings[-1])
    obj = add_mesh(name, bm, mat)
    obj.location = loc
    if axis == "Y":
        obj.rotation_euler = (math.pi / 2, 0, 0)
    return obj


# --- Nota de ejes Blender (Z-up) -> glTF/Three.js (Y-up) ---
# En el exportador glTF con `export_yup=True`:
#   Blender (X, Y, Z) -> Three.js (X, Z, -Y)
# Así: altura Y en Three.js = Z en Blender; frente +Z en Three.js = -Y en Blender.


def build_spring():
    steel = make_mat("M_SpringSteel", PAL["steel"], metallic=0.82, roughness=0.32)
    dark = make_mat("M_SpringDark", PAL["dark_steel"], metallic=0.65, roughness=0.45)
    mustard = make_mat("M_SpringMustard", PAL["mustard"], metallic=0.15, roughness=0.48)
    objs = [
        add_cyl("Spring_Base", 0.17, 0.18, 0.055, 24, (0, 0, -0.19), dark),
        add_cyl("Spring_BaseRing", 0.175, 0.175, 0.018, 24, (0, 0, -0.155), mustard),
        add_helix("Spring_Coil", 0.125, 0.022, 0.30, 4.2, 22, 10, (0, 0, 0.0), steel),
        add_cyl("Spring_TopPlate", 0.18, 0.17, 0.05, 24, (0, 0, 0.19), mustard),
        add_cyl("Spring_TopCap", 0.11, 0.11, 0.02, 20, (0, 0, 0.215), dark),
    ]
    return objs


def build_balloon():
    red = make_mat("M_BalloonRed", PAL["red"], metallic=0.05, roughness=0.38)
    mustard = make_mat("M_BalloonMustard", PAL["mustard"], metallic=0.08, roughness=0.42)
    brass = make_mat("M_BalloonBrass", PAL["brass"], metallic=0.78, roughness=0.35)
    leather = make_mat("M_BalloonRope", PAL["leather"], metallic=0.0, roughness=0.85)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=0.27)
    for v in bm.verts:
        # Alarga en Z y afina hacia abajo (forma de globo aerostático / pera)
        t = (v.co.z + 0.27) / 0.54
        taper = 0.55 + 0.55 * math.sin(t * math.pi * 0.85)
        v.co.x *= taper
        v.co.y *= taper
        v.co.z = v.co.z * 1.15 + 0.04
    balloon_obj = add_mesh("Balloon_Envelope", bm, red)
    objs = [
        balloon_obj,
        add_torus("Balloon_Band", 0.268, 0.014, 24, 10, (0, 0, 0.08), mustard),
        add_cyl("Balloon_Neck", 0.075, 0.055, 0.07, 16, (0, 0, -0.24), brass),
        add_cyl("Balloon_Rope", 0.014, 0.014, 0.12, 10, (0, 0, -0.31), leather),
        add_cyl("Balloon_Mount", 0.05, 0.06, 0.04, 14, (0, 0, -0.33), brass),
    ]
    return objs


def build_fan():
    teal = make_mat("M_FanTeal", PAL["teal"], metallic=0.25, roughness=0.42)
    brass = make_mat("M_FanBrass", PAL["brass"], metallic=0.78, roughness=0.32)
    dark = make_mat("M_FanDark", PAL["dark_steel"], metallic=0.65, roughness=0.45)
    mustard = make_mat("M_FanBlade", PAL["mustard"], metallic=0.2, roughness=0.42)
    # Ducto cilíndrico con espesor
    bm = bmesh.new()
    segs = 28
    r_out, r_in, h = 0.26, 0.235, 0.24
    ring_verts = []
    for z in (-h / 2, h / 2):
        for r in (r_out, r_in):
            ring = [bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z)) for i in range(segs)]
            ring_verts.append(ring)
    # outer, inner, bottom, top
    for i in range(segs):
        ni = (i + 1) % segs
        bm.faces.new((ring_verts[0][i], ring_verts[0][ni], ring_verts[2][ni], ring_verts[2][i]))
        bm.faces.new((ring_verts[3][i], ring_verts[3][ni], ring_verts[1][ni], ring_verts[1][i]))
        bm.faces.new((ring_verts[1][i], ring_verts[1][ni], ring_verts[0][ni], ring_verts[0][i]))
        bm.faces.new((ring_verts[2][i], ring_verts[2][ni], ring_verts[3][ni], ring_verts[3][i]))
    duct = add_mesh("Fan_Duct", bm, teal)
    objs = [
        duct,
        add_torus("Fan_RingTop", 0.252, 0.022, 28, 10, (0, 0, 0.12), brass),
        add_torus("Fan_RingBot", 0.252, 0.022, 28, 10, (0, 0, -0.12), brass),
        add_box("Fan_StrutX", (0.48, 0.036, 0.024), (0, 0, -0.09), dark, bevel=0.004),
        add_box("Fan_StrutY", (0.036, 0.48, 0.024), (0, 0, -0.09), dark, bevel=0.004),
        add_cyl("Fan_Hub", 0.065, 0.055, 0.10, 18, (0, 0, 0.0), brass),
    ]
    for k in range(4):
        ang = k * math.pi / 2
        bx = math.cos(ang) * 0.13
        by = math.sin(ang) * 0.13
        objs.append(add_box(f"Fan_Blade_{k}", (0.17, 0.065, 0.012), (bx, by, 0.01), mustard, rot=(0.35, 0.0, ang), bevel=0.002))
    return objs


def build_horn():
    # Frente +Z en Three.js = -Y en Blender
    dark = make_mat("M_HornDark", PAL["dark_steel"], metallic=0.65, roughness=0.45)
    brass = make_mat("M_HornBrass", PAL["brass"], metallic=0.82, roughness=0.30)
    copper = make_mat("M_HornCopper", PAL["copper"], metallic=0.75, roughness=0.35)
    red = make_mat("M_HornRed", PAL["red"], metallic=0.15, roughness=0.45)
    objs = [
        add_box("Horn_Base", (0.18, 0.22, 0.07), (0, 0.02, -0.11), dark, bevel=0.008),
        add_cyl("Horn_Compressor", 0.075, 0.075, 0.18, 18, (0, 0.10, 0.0), brass, rot=(math.pi / 2, 0, 0)),
        add_cyl("Horn_Throat", 0.045, 0.08, 0.14, 20, (0, -0.03, 0.03), copper, rot=(math.pi / 2, 0, 0)),
        add_cyl("Horn_Bell", 0.15, 0.078, 0.14, 24, (0, -0.16, 0.03), red, rot=(math.pi / 2, 0, 0)),
        add_torus("Horn_Lip", 0.15, 0.016, 24, 10, (0, -0.225, 0.03), brass, rot=(math.pi / 2, 0, 0)),
    ]
    return objs


def build_gyro():
    dark = make_mat("M_GyroDark", PAL["dark_steel"], metallic=0.65, roughness=0.42)
    brass = make_mat("M_GyroBrass", PAL["brass"], metallic=0.82, roughness=0.30)
    teal = make_mat("M_GyroTeal", PAL["teal"], metallic=0.35, roughness=0.38)
    glow = make_mat("M_GyroGlow", PAL["glow_cyan"], metallic=0.1, roughness=0.25, emission=PAL["glow_cyan"], emission_strength=1.4)
    objs = [
        add_box("Gyro_Base", (0.34, 0.34, 0.05), (0, 0, -0.165), dark, bevel=0.008),
        add_torus("Gyro_OuterRing", 0.165, 0.02, 24, 10, (0, 0, 0.01), dark, rot=(math.pi / 2, 0, 0)),
        add_torus("Gyro_GimbalRing", 0.135, 0.018, 24, 10, (0, 0, 0.01), brass, rot=(0, math.pi / 2, 0.35)),
        add_cyl("Gyro_Flywheel", 0.105, 0.105, 0.055, 22, (0, 0, 0.01), teal),
        add_cyl("Gyro_Axle", 0.022, 0.022, 0.24, 14, (0, 0, 0.01), brass),
        add_cyl("Gyro_CoreGlow", 0.045, 0.045, 0.07, 16, (0, 0, 0.01), glow),
    ]
    return objs


def build_boxing_glove():
    # Frente +Z en Three.js = -Y en Blender
    dark = make_mat("M_GloveDark", PAL["dark_steel"], metallic=0.65, roughness=0.45)
    steel = make_mat("M_GloveSteel", PAL["steel"], metallic=0.82, roughness=0.32)
    red = make_mat("M_GloveRed", PAL["red"], metallic=0.05, roughness=0.48)
    cream = make_mat("M_GloveTrim", PAL["cream"], metallic=0.0, roughness=0.65)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=0.14)
    bmesh.ops.scale(bm, vec=(1.05, 1.15, 0.92), verts=bm.verts)
    glove = add_mesh("BoxingGlove_Fist", bm, red)
    glove.location = (0, -0.15, 0.0)
    thumb_bm = bmesh.new()
    bmesh.ops.create_uvsphere(thumb_bm, u_segments=14, v_segments=10, radius=0.065)
    bmesh.ops.scale(thumb_bm, vec=(0.8, 1.2, 0.85), verts=thumb_bm.verts)
    thumb = add_mesh("BoxingGlove_Thumb", thumb_bm, red)
    thumb.location = (0.105, -0.10, -0.02)
    objs = [
        add_box("BoxingGlove_Bracket", (0.16, 0.07, 0.18), (0, 0.24, 0), dark, bevel=0.008),
        add_helix("BoxingGlove_Spring", 0.065, 0.014, 0.24, 4.0, 18, 8, (0, 0.08, 0), steel, axis="Y"),
        add_cyl("BoxingGlove_Cuff", 0.088, 0.082, 0.07, 18, (0, -0.02, 0), cream, rot=(math.pi / 2, 0, 0)),
        glove,
        thumb,
    ]
    return objs


def build_drone_rotor():
    teal = make_mat("M_DroneTeal", PAL["teal"], metallic=0.25, roughness=0.42)
    brass = make_mat("M_DroneBrass", PAL["brass"], metallic=0.80, roughness=0.32)
    dark = make_mat("M_DroneDark", PAL["dark_steel"], metallic=0.65, roughness=0.45)
    mustard = make_mat("M_DroneBlade", PAL["mustard"], metallic=0.18, roughness=0.40)
    objs = [
        add_cyl("DroneRotor_Motor", 0.105, 0.12, 0.085, 20, (0, 0, -0.055), teal),
        add_torus("DroneRotor_Shroud", 0.255, 0.017, 28, 10, (0, 0, 0.015), brass),
        add_box("DroneRotor_StrutX", (0.50, 0.025, 0.016), (0, 0, -0.025), dark, bevel=0.003),
        add_box("DroneRotor_StrutY", (0.025, 0.50, 0.016), (0, 0, -0.025), dark, bevel=0.003),
        add_cyl("DroneRotor_Hub", 0.042, 0.036, 0.055, 16, (0, 0, 0.02), brass),
        add_box("DroneRotor_BladeA", (0.44, 0.055, 0.010), (0, 0, 0.03), mustard, rot=(0.22, 0, 0), bevel=0.002),
        add_box("DroneRotor_BladeB", (0.055, 0.44, 0.010), (0, 0, 0.03), mustard, rot=(0, 0.22, 0), bevel=0.002),
    ]
    return objs


def build_flag():
    brass = make_mat("M_FlagBrass", PAL["brass"], metallic=0.82, roughness=0.30)
    dark = make_mat("M_FlagDark", PAL["dark_steel"], metallic=0.65, roughness=0.45)
    red = make_mat("M_FlagRed", PAL["red"], metallic=0.05, roughness=0.62)
    mustard = make_mat("M_FlagStripe", PAL["mustard"], metallic=0.05, roughness=0.58)
    objs = [
        add_cyl("Flag_Mount", 0.045, 0.05, 0.06, 14, (-0.14, 0, -0.32), dark),
        add_cyl("Flag_Mast", 0.018, 0.022, 0.70, 12, (-0.14, 0, 0.0), brass),
        add_cyl("Flag_Finial", 0.028, 0.015, 0.035, 14, (-0.14, 0, 0.355), brass),
        add_box("Flag_Cloth", (0.28, 0.024, 0.20), (0.01, 0, 0.23), red, bevel=0.004),
        add_box("Flag_Stripe", (0.045, 0.028, 0.20), (0.10, 0, 0.23), mustard, bevel=0.003),
    ]
    return objs


def build_wire_tool():
    # Herramienta en mano: +Z hacia adelante en Three.js = -Y en Blender
    teal = make_mat("M_WireTeal", PAL["teal"], metallic=0.25, roughness=0.44)
    dark = make_mat("M_WireDark", PAL["dark_steel"], metallic=0.6, roughness=0.46)
    copper = make_mat("M_WireCopper", PAL["copper"], metallic=0.72, roughness=0.38)
    brass = make_mat("M_WireBrass", PAL["brass"], metallic=0.80, roughness=0.32)
    leather = make_mat("M_WireGrip", PAL["leather"], metallic=0.0, roughness=0.85)
    glow = make_mat("M_WireGlow", PAL["glow_cyan"], metallic=0.1, roughness=0.25, emission=PAL["glow_cyan"], emission_strength=1.3)
    objs = [
        add_box("Wire_Grip", (0.036, 0.04, 0.095), (0, 0.005, -0.055), leather, bevel=0.004),
        add_box("Wire_Body", (0.064, 0.145, 0.068), (0, -0.03, 0.01), teal, bevel=0.006),
        add_cyl("Wire_Spool", 0.036, 0.036, 0.056, 16, (0, -0.015, 0.062), copper, rot=(0, math.pi / 2, 0)),
        add_cyl("Wire_SpoolCapL", 0.044, 0.044, 0.008, 16, (-0.03, -0.015, 0.062), dark, rot=(0, math.pi / 2, 0)),
        add_cyl("Wire_SpoolCapR", 0.044, 0.044, 0.008, 16, (0.03, -0.015, 0.062), dark, rot=(0, math.pi / 2, 0)),
        add_box("Wire_Glow", (0.036, 0.014, 0.016), (0, -0.106, 0.018), glow, bevel=0.002),
        add_box("Wire_JawL", (0.015, 0.11, 0.028), (-0.022, -0.165, 0.008), brass, rot=(0, 0, 0.14), bevel=0.002),
        add_box("Wire_JawR", (0.015, 0.11, 0.028), (0.022, -0.165, 0.008), brass, rot=(0, 0, -0.14), bevel=0.002),
    ]
    return objs


def build_spray_can():
    steel = make_mat("M_SpraySteel", PAL["cream"], metallic=0.45, roughness=0.38)
    dark = make_mat("M_SprayDark", PAL["dark_steel"], metallic=0.6, roughness=0.44)
    teal = make_mat("M_SprayLabel", PAL["teal"], metallic=0.15, roughness=0.42)
    mustard = make_mat("M_SprayBand", PAL["mustard"], metallic=0.15, roughness=0.42)
    objs = [
        add_cyl("Spray_Base", 0.042, 0.040, 0.018, 20, (0, 0, -0.055), dark),
        add_cyl("Spray_Body", 0.041, 0.041, 0.125, 20, (0, 0, 0.015), steel),
        add_cyl("Spray_Label", 0.0425, 0.0425, 0.072, 20, (0, 0, 0.012), teal),
        add_cyl("Spray_Accent", 0.043, 0.043, 0.016, 20, (0, 0, -0.015), mustard),
        add_cyl("Spray_Shoulder", 0.041, 0.024, 0.028, 20, (0, 0, 0.09), steel),
        add_cyl("Spray_Collar", 0.025, 0.025, 0.008, 18, (0, 0, 0.106), mustard),
        add_cyl("Spray_Nozzle", 0.015, 0.014, 0.024, 16, (0, 0, 0.124), steel),
        add_cyl("Spray_Orifice", 0.0045, 0.0045, 0.008, 12, (0, -0.014, 0.126), dark, rot=(math.pi / 2, 0, 0)),
    ]
    return objs


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


def render_preview(objs, out_png):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = RES
    scene.render.resolution_y = RES
    scene.render.film_transparent = True
    world = bpy.data.worlds.new("PreviewWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.14, 0.15, 0.17, 1.0)
        bg.inputs["Strength"].default_value = 1.2

    light_data = bpy.data.lights.new("KeyLight", type="SUN")
    light_data.energy = 3.2
    light_obj = bpy.data.objects.new("KeyLight", light_data)
    bpy.context.collection.objects.link(light_obj)
    light_obj.rotation_euler = (0.8, 0.2, 0.6)

    # Calcular centro y tamaño para encuadrar automáticamente
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    min_v = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    max_v = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (min_v + max_v) * 0.5
    radius = max((max_v - min_v).length * 0.5, 0.15)

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    cam_pos = center + Vector((radius * 1.9, -radius * 2.1, radius * 1.3))
    cam_obj.location = cam_pos
    cam_obj.rotation_euler = (center - cam_pos).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_obj
    scene.render.filepath = out_png
    bpy.ops.render.render(write_still=True)

    bpy.data.objects.remove(cam_obj, do_unlink=True)
    bpy.data.objects.remove(light_obj, do_unlink=True)


def export_one(key):
    builder, kind, glb_name = RECIPES[key]
    clear_scene()
    objs = builder()
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]

    if kind == "prop":
        art_dir = os.path.join(PROPS_ART_DIR, key, "v001")
        preview_dir = os.path.join(art_dir, "previews")
        os.makedirs(preview_dir, exist_ok=True)
        os.makedirs(PROPS_GLB_DIR, exist_ok=True)
        glb_path = os.path.join(PROPS_GLB_DIR, glb_name)
        blend_path = os.path.join(art_dir, f"{key}.blend")
        preview_path = os.path.join(preview_dir, f"{key}_full.png")
    else:
        os.makedirs(TOOLS_GLB_DIR, exist_ok=True)
        glb_path = os.path.join(TOOLS_GLB_DIR, glb_name)
        blend_path = None
        preview_path = os.path.join(REPO, "art", "blender", "previews", f"{key}_full.png")
        os.makedirs(os.path.dirname(preview_path), exist_ok=True)

    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
    )
    if blend_path:
        bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    render_preview(objs, preview_path)
    print(f"[build_extra_props] OK {key} -> {glb_path}")


if WHICH == "all":
    for k in RECIPES:
        export_one(k)
elif WHICH == "props":
    for k, (_, kind, _) in RECIPES.items():
        if kind == "prop":
            export_one(k)
elif WHICH == "tools":
    for k, (_, kind, _) in RECIPES.items():
        if kind == "tool":
            export_one(k)
elif WHICH in RECIPES:
    export_one(WHICH)
else:
    raise SystemExit(f"Unknown target: {WHICH}")
