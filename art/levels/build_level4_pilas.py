"""
Los del Desguace — Generador reproducible del arte 3D de Nivel 4: Operación: Pilas del Control.

Uso (Blender 5.2.3 LTS, sin interfaz):
    blender -b --factory-startup -P art/levels/build_level4_pilas.py
    npx -y @gltf-transform/cli@4 quantize public/models/levels/level-4-pilas.glb public/models/levels/level-4-pilas.glb

Contrato con `src/environment/ExpeditionLevels.tsx` (Level4Batteries):
  - Coordenadas locales del nivel: origen (0,0,0), +Z hacia la cima, +Y arriba, metros.
  - Conversión Three.js -> Blender (Z-up): (tx, ty, tz) -> (tx, -tz, ty).
  - Bahía + patio: x = -30..30, z = 0..56, tope y = 0. Bahía pintada 12x10 en (0, 0, 8).
  - Rampa 1: z = 56..100, sube de y = 0 a y = 18, ancho 12 m (postes magnéticos en x = ±9, z = 66, 78, 90).
  - Meseta: z = 100..108, y = 18, ancho 14 m.
  - Rampa 2: z = 108..128, sube de y = 18 a y = 30, ancho 10 m.
  - Cima: z = 128..140, y = 30, ancho 16 m (pórtico en z = 134).
  - Escalones ocultos Tuerca Dorada: x = -22, z = 66, 70, 74, 79 (topes y = 1.2, 2.2, 3.2, 4.2).
  - Libres de geometría: faro en (-16, 0, 34), generador en (11, 0, 8), autos donantes en (16, 0, 36) y (24, 0, 46).
  - 6 Empties: spawn, bay, checkpoint_1, checkpoint_2, goal, golden_nut.
"""

import bpy
import bmesh
import math
import os
import random
import numpy as np
from mathutils import Euler, Matrix, Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
TEX_DIR = os.path.join(ROOT, "textures")
PREVIEW_DIR = os.path.join(ROOT, "previews")
GLB_DIR = os.path.normpath(os.path.join(ROOT, "..", "..", "public", "models", "levels"))
GLB_PATH = os.path.join(GLB_DIR, "level-4-pilas.glb")
BLEND_PATH = os.path.join(ROOT, "level-4-pilas.blend")

rng = random.Random(20261124)

RAMP1 = (56.0, 100.0, 0.0, 18.0)
RAMP2 = (108.0, 128.0, 18.0, 30.0)


def tx_to_bl(x, y, z):
    return Vector((x, -z, y))


def fbm_grid(w, h, seed=0, octaves=(4, 8, 16, 32)):
    r = np.random.default_rng(seed)
    acc = np.zeros((h, w), dtype=np.float32)
    amp = 0.5
    tot = 0.0
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    for freq in octaves:
        grid = r.random((freq, freq), dtype=np.float32)
        u = (xx / w) * freq
        v = (yy / h) * freq
        x0 = np.floor(u).astype(np.int32) % freq
        y0 = np.floor(v).astype(np.int32) % freq
        x1 = (x0 + 1) % freq
        y1 = (y0 + 1) % freq
        fx = u - np.floor(u)
        fy = v - np.floor(v)
        sx = fx * fx * (3 - 2 * fx)
        sy = fy * fy * (3 - 2 * fy)
        val = ((grid[y0, x0] * (1 - sx) + grid[y0, x1] * sx) * (1 - sy)
               + (grid[y1, x0] * (1 - sx) + grid[y1, x1] * sx) * sy)
        acc += val * amp
        tot += amp
        amp *= 0.5
    return acc / tot


def make_image(name, arr_rgba):
    os.makedirs(TEX_DIR, exist_ok=True)
    h, w, _ = arr_rgba.shape
    img = bpy.data.images.new(name, width=w, height=h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = "sRGB"
    flat = np.ascontiguousarray(np.flipud(arr_rgba), dtype=np.float32).ravel()
    img.pixels.foreach_set(flat)
    img.update()
    path = os.path.join(TEX_DIR, f"{name}.png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


def generate_textures():
    S = 512
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    tex = {}

    # 1. Asfalto / patio nocturno de hormigón gris oscuro con juntas y manchas de aceite
    n1 = fbm_grid(S, S, seed=41, octaves=(4, 12, 32, 64))
    n2 = fbm_grid(S, S, seed=42, octaves=(4, 8, 16))
    seam = (((xx % 128) < 3) | ((yy % 128) < 3)).astype(np.float32)
    oil = np.clip((n2 - 0.58) * 3.2, 0.0, 1.0)
    r = 0.24 + 0.08 * n1 - 0.07 * seam - 0.08 * oil
    g = 0.25 + 0.08 * n1 - 0.07 * seam - 0.08 * oil
    b = 0.28 + 0.09 * n1 - 0.06 * seam - 0.07 * oil
    tex["asphalt"] = make_image("lvl4_asphalt", np.dstack([np.clip(r, 0, 1), np.clip(g, 0, 1), np.clip(b, 0, 1), np.ones((S, S))]))

    # 2. Chapa antideslizante oscura para rampas (con patrón romboidal + óxido en bordes)
    n3 = fbm_grid(S, S, seed=43, octaves=(6, 16, 48))
    diag1 = np.abs(np.sin((xx + yy) * 0.14))
    diag2 = np.abs(np.sin((xx - yy) * 0.14))
    tread = ((diag1 > 0.85) | (diag2 > 0.85)).astype(np.float32) * 0.08
    rust = np.clip((n3 - 0.62) * 3.0, 0.0, 1.0)
    r = 0.19 + 0.07 * n3 + tread + 0.26 * rust
    g = 0.22 + 0.07 * n3 + tread + 0.09 * rust
    b = 0.26 + 0.08 * n3 + tread - 0.05 * rust
    tex["ramp_steel"] = make_image("lvl4_ramp_steel", np.dstack([np.clip(r, 0, 1), np.clip(g, 0, 1), np.clip(b, 0, 1), np.ones((S, S))]))

    # 3. Franja de peligro amarilla y negra desgastada
    n4 = fbm_grid(S, S, seed=44, octaves=(8, 24, 64))
    stripe = (((xx + yy) % 64) < 32).astype(np.float32)
    r = np.where(stripe > 0.5, 0.88 - 0.16 * n4, 0.14 + 0.06 * n4)
    g = np.where(stripe > 0.5, 0.66 - 0.14 * n4, 0.14 + 0.06 * n4)
    b = np.where(stripe > 0.5, 0.14 + 0.05 * n4, 0.15 + 0.06 * n4)
    tex["hazard"] = make_image("lvl4_hazard", np.dstack([np.clip(r, 0, 1), np.clip(g, 0, 1), np.clip(b, 0, 1), np.ones((S, S))]))

    # 4. Roca nocturna / ladera de montaña con estratos de chatarra
    n5 = fbm_grid(S, S, seed=45, octaves=(4, 12, 32, 64))
    strata = 0.5 + 0.5 * np.sin(yy * 0.08 + n5 * 5.0)
    r = 0.18 + 0.10 * n5 + 0.06 * strata
    g = 0.19 + 0.09 * n5 + 0.04 * strata
    b = 0.23 + 0.10 * n5 + 0.05 * strata
    tex["rock"] = make_image("lvl4_rock", np.dstack([np.clip(r, 0, 1), np.clip(g, 0, 1), np.clip(b, 0, 1), np.ones((S, S))]))

    # 5. Contenedor oxidado corrugado
    n6 = fbm_grid(S, S, seed=46, octaves=(4, 16, 48))
    rib = 0.5 + 0.5 * np.sin(xx * 0.28)
    rust2 = np.clip((n6 - 0.52) * 2.5, 0.0, 1.0)
    r = 0.20 + 0.08 * rib + 0.34 * rust2
    g = 0.36 + 0.08 * rib - 0.08 * rust2
    b = 0.38 + 0.08 * rib - 0.16 * rust2
    tex["container"] = make_image("lvl4_container", np.dstack([np.clip(r, 0, 1), np.clip(g, 0, 1), np.clip(b, 0, 1), np.ones((S, S))]))

    # 6. Madera de escalones y cercos
    n7 = fbm_grid(S, S, seed=47, octaves=(4, 16, 48))
    plank = ((yy % 85) < 4).astype(np.float32)
    r = 0.38 + 0.12 * n7 - 0.16 * plank
    g = 0.24 + 0.08 * n7 - 0.12 * plank
    b = 0.14 + 0.05 * n7 - 0.08 * plank
    tex["wood"] = make_image("lvl4_wood", np.dstack([np.clip(r, 0, 1), np.clip(g, 0, 1), np.clip(b, 0, 1), np.ones((S, S))]))

    return tex


def make_tex_mat(name, img, rough=0.78, metal=0.1, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if img is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    if emission is not None:
        bsdf.inputs["Base Color"].default_value = emission
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def box_uv(bm, scale=0.25):
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in f.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                loop[uv_layer].uv = (co.x * scale, co.y * scale)
            elif ax >= ay:
                loop[uv_layer].uv = (co.y * scale, co.z * scale)
            else:
                loop[uv_layer].uv = (co.x * scale, co.z * scale)


class MeshBatch:
    def __init__(self, name, mat, uv_scale=0.18):
        self.name = name
        self.mat = mat
        self.uv_scale = uv_scale
        self.bm = bmesh.new()

    def add_box(self, tx, ty, tz, sx, sy, sz, rot_tx=(0.0, 0.0, 0.0)):
        """Agrega una caja en coordenadas Three.js (centro tx,ty,tz; tamaño sx,sy,sz)."""
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        bmesh.ops.scale(tmp, vec=(sx, sz, sy), verts=tmp.verts)
        # Rotación Three.js (rx, ry, rz) -> Blender (rx, -rz, ry)
        rot_bl = Euler((rot_tx[0], -rot_tx[2], rot_tx[1]), "XYZ").to_matrix().to_4x4()
        loc_bl = tx_to_bl(tx, ty, tz)
        mat = Matrix.Translation(loc_bl) @ rot_bl
        bmesh.ops.transform(tmp, matrix=mat, verts=tmp.verts)
        # Copiar al bmesh principal
        vmap = [self.bm.verts.new(v.co) for v in tmp.verts]
        for f in tmp.faces:
            self.bm.faces.new([vmap[v.index] for v in f.verts])
        tmp.free()

    def add_cyl(self, tx, ty, tz, r1, r2, h, segs=12, rot_tx=(0.0, 0.0, 0.0)):
        tmp = bmesh.new()
        bmesh.ops.create_cone(tmp, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=h)
        rot_bl = Euler((rot_tx[0], -rot_tx[2], rot_tx[1]), "XYZ").to_matrix().to_4x4()
        mat = Matrix.Translation(tx_to_bl(tx, ty, tz)) @ rot_bl
        bmesh.ops.transform(tmp, matrix=mat, verts=tmp.verts)
        vmap = [self.bm.verts.new(v.co) for v in tmp.verts]
        for f in tmp.faces:
            self.bm.faces.new([vmap[v.index] for v in f.verts])
        tmp.free()

    def finalize(self):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        box_uv(self.bm, self.uv_scale)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(self.mat)
        return obj


def add_empty(name, tx, ty, tz):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.empty_display_size = 1.2
    e.location = tx_to_bl(tx, ty, tz)
    bpy.context.collection.objects.link(e)
    return e


def build_level4():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    tex = generate_textures()

    m_asphalt = make_tex_mat("M_L4_Asphalt", tex["asphalt"], rough=0.86, metal=0.05)
    m_ramp = make_tex_mat("M_L4_RampSteel", tex["ramp_steel"], rough=0.58, metal=0.45)
    m_hazard = make_tex_mat("M_L4_Hazard", tex["hazard"], rough=0.65, metal=0.10)
    m_rock = make_tex_mat("M_L4_Rock", tex["rock"], rough=0.92, metal=0.04)
    m_cont = make_tex_mat("M_L4_Container", tex["container"], rough=0.62, metal=0.35)
    m_wood = make_tex_mat("M_L4_Wood", tex["wood"], rough=0.84, metal=0.02)
    m_glow = make_tex_mat("M_L4_BeaconGlow", None, rough=0.2, metal=0.0, emission=(1.0, 0.78, 0.25, 1.0), emission_strength=3.0)

    b_asphalt = MeshBatch("L4_Yard_Asphalt", m_asphalt, 0.10)
    b_ramp = MeshBatch("L4_Ramps_Steel", m_ramp, 0.16)
    b_hazard = MeshBatch("L4_Hazard_Stripes", m_hazard, 0.28)
    b_rock = MeshBatch("L4_Mountain_Rock", m_rock, 0.08)
    b_cont = MeshBatch("L4_Containers_Props", m_cont, 0.20)
    b_wood = MeshBatch("L4_Wood_Fences_Steps", m_wood, 0.22)
    b_glow = MeshBatch("L4_Night_Lights", m_glow, 0.5)

    # 1. Bahía de armado + patio nocturno (tope exacto y = 0)
    b_asphalt.add_box(0, -6.5, 28, 60.0, 13.0, 56.0)
    # Pista pintada de la bahía (12x10 en z = 8)
    b_hazard.add_box(0, 0.015, 8, 12.0, 0.03, 10.0)
    b_asphalt.add_box(0, 0.022, 8, 10.8, 0.02, 8.8)

    # Cerco perimetral con postes y tablas
    b_wood.add_box(0, 0.45, -0.8, 60.0, 0.9, 0.36)
    b_wood.add_box(-30.2, 0.85, 28, 0.38, 1.7, 56.0)
    b_wood.add_box(30.2, 0.85, 28, 0.38, 1.7, 56.0)
    for x in range(-28, 30, 4):
        b_wood.add_box(x, 0.6, -0.8, 0.28, 1.25, 0.48)
    for z in range(2, 56, 6):
        b_wood.add_box(-30.2, 1.0, z, 0.52, 2.0, 0.32)
        b_wood.add_box(30.2, 1.0, z, 0.52, 2.0, 0.32)

    # Contenedores y utilería en los bordes del patio (libres autos en (16,36),(24,46), faro (-16,34), gen (11,8))
    b_cont.add_box(-25.5, 1.3, 10, 2.6, 2.6, 7.2, (0, 0.08, 0))
    b_cont.add_box(-25.5, 1.3, 21, 2.6, 2.6, 6.4, (0, -0.06, 0))
    b_cont.add_box(25.5, 1.3, 14, 2.6, 2.6, 7.0, (0, -0.10, 0))
    b_cont.add_box(25.5, 3.9, 14, 2.6, 2.6, 6.2, (0, 0.05, 0))
    b_cont.add_box(-24.5, 1.3, 46, 2.6, 2.6, 6.8, (0, 0.14, 0))

    # Postes de luz cálida en la bahía
    for lx, lz in ((-10, 2), (10, 2), (-10, 15), (10, 15), (-8, 54), (8, 54)):
        b_ramp.add_cyl(lx, 2.4, lz, 0.09, 0.11, 4.8, 10)
        b_glow.add_box(lx, 4.85, lz, 0.42, 0.24, 0.42)

    # 2. Rampa 1 (z = 56..100, y = 0..18, ancho 12 m)
    z0, z1, y0, y1 = RAMP1
    len1 = math.hypot(z1 - z0, y1 - y0)
    ang1 = math.atan2(y1 - y0, z1 - z0)
    b_ramp.add_box(0, (y0 + y1) / 2 - 0.5, (z0 + z1) / 2, 12.0, 1.0, len1, (-ang1, 0, 0))
    # Cordones de peligro a ambos lados de Rampa 1
    for sx in (-5.75, 5.75):
        b_hazard.add_box(sx, (y0 + y1) / 2 + 0.12, (z0 + z1) / 2, 0.45, 0.28, len1, (-ang1, 0, 0))
    # Pilares bajo Rampa 1
    for z in (66, 78, 90, 98):
        ry = y0 + (z - z0) / (z1 - z0) * (y1 - y0)
        for sx in (-5.0, 5.0):
            b_ramp.add_box(sx, (ry - 1.0) / 2 - 3.0, z, 0.9, ry + 5.0, 0.9)

    # 3. Meseta intermedia (z = 100..108, y = 18, ancho 14 m)
    b_asphalt.add_box(0, 17.5, 104, 14.0, 1.0, 8.4)
    for sx in (-6.75, 6.75):
        b_hazard.add_box(sx, 18.14, 104, 0.45, 0.30, 8.4)
        b_ramp.add_box(sx * 0.8, 7.0, 104, 1.1, 20.0, 1.1)
        b_glow.add_box(sx * 0.92, 20.6, 104, 0.4, 0.35, 0.4)
        b_ramp.add_cyl(sx * 0.92, 19.3, 104, 0.08, 0.1, 2.4, 8)

    # 4. Rampa 2 (z = 108..128, y = 18..30, ancho 10 m)
    z0, z1, y0, y1 = RAMP2
    len2 = math.hypot(z1 - z0, y1 - y0)
    ang2 = math.atan2(y1 - y0, z1 - z0)
    b_ramp.add_box(0, (y0 + y1) / 2 - 0.5, (z0 + z1) / 2, 10.0, 1.0, len2, (-ang2, 0, 0))
    for sx in (-4.75, 4.75):
        b_hazard.add_box(sx, (y0 + y1) / 2 + 0.12, (z0 + z1) / 2, 0.42, 0.28, len2, (-ang2, 0, 0))
    for z in (114, 122):
        ry = y0 + (z - z0) / (z1 - z0) * (y1 - y0)
        for sx in (-4.2, 4.2):
            b_ramp.add_box(sx, (ry - 1.0) / 2 - 3.0, z, 0.9, ry + 5.0, 0.9)

    # 5. Cima (z = 128..140, y = 30, ancho 16 m) + Torre repetidora de TV de desguace
    b_asphalt.add_box(0, 29.5, 134, 16.0, 1.0, 12.0)
    b_hazard.add_box(0, 30.015, 134, 7.0, 0.03, 5.0)
    b_asphalt.add_box(0, 30.022, 134, 5.8, 0.02, 3.8)
    for sx in (-7.75, 7.75):
        b_hazard.add_box(sx, 30.15, 134, 0.45, 0.30, 12.0)
    # Antena de TV decorativa detrás de la meta (z = 139.2)
    b_ramp.add_cyl(0, 35.5, 139.0, 0.22, 0.45, 11.0, 10)
    b_ramp.add_box(0, 39.2, 139.0, 4.8, 0.22, 0.22)
    b_ramp.add_box(0, 37.6, 139.0, 3.4, 0.18, 0.18)
    b_glow.add_cyl(0, 41.3, 139.0, 0.35, 0.35, 0.55, 12)

    # 6. Montaña de chatarra y roca flanqueando las rampas (estética dramática sin invadir calzada)
    for z in range(60, 140, 8):
        ridge_y = min(30.0, max(2.0, (z - 52.0) * 0.38))
        for side in (-1, 1):
            bx = side * (16.5 + rng.uniform(0.0, 4.5))
            if side == -1 and 62 <= z <= 84:
                bx -= 11.0  # Dejar libre la ruta oculta de la Tuerca Dorada en x = -22
            bw = rng.uniform(7.0, 12.0)
            bd = rng.uniform(8.0, 12.0)
            bh = ridge_y + rng.uniform(4.0, 10.0)
            b_rock.add_box(bx, bh / 2 - 6.0, z, bw, bh, bd, (0, rng.uniform(-0.25, 0.25), 0))

    # 7. Escalones ocultos hacia la Tuerca Dorada (x = -22)
    for (sx, sy, sz, sw, sh, sd) in (
        (-22, 0.6, 66, 3.0, 1.2, 3.0),
        (-22, 1.6, 70, 3.0, 1.2, 3.0),
        (-22, 2.6, 74, 3.0, 1.2, 3.0),
        (-22, 3.6, 79, 5.0, 1.2, 5.0),
    ):
        b_wood.add_box(sx, sy, sz, sw, sh, sd)
        b_ramp.add_box(sx, (sy - sh / 2) / 2 - 2.0, sz, 0.45, sy + 4.0, 0.45)

    objs = [b.finalize() for b in (b_asphalt, b_ramp, b_hazard, b_rock, b_cont, b_wood, b_glow)]

    # 8. Empties del contrato
    empties = [
        add_empty("spawn", 0, 1.8, 4),
        add_empty("bay", 0, 0, 8),
        add_empty("checkpoint_1", 0, 10.4, 80),
        add_empty("checkpoint_2", 0, 19.8, 104),
        add_empty("goal", 0, 31.6, 134),
        add_empty("golden_nut", -22, 5.0, 79),
    ]

    # Exportar GLB
    os.makedirs(GLB_DIR, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs + empties:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=GLB_PATH,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_image_format="WEBP",
        export_image_quality=84,
        export_cameras=False,
        export_lights=False,
    )
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH, relative_remap=True, compress=True)

    # Previews nocturnos
    render_previews()
    tris = sum(len(o.data.polygons) * 2 for o in objs if o.type == "MESH")
    print(f"[LEVEL4] OK tris~={tris} glb={os.path.getsize(GLB_PATH)} bytes -> {GLB_PATH}")


def render_previews():
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("NightWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.04, 0.06, 0.11, 1.0)
        bg.inputs["Strength"].default_value = 0.75

    moon_d = bpy.data.lights.new("Moon", "SUN")
    moon_d.energy = 2.2
    moon_d.color = (0.68, 0.78, 1.0)
    moon = bpy.data.objects.new("Moon", moon_d)
    bpy.context.collection.objects.link(moon)
    moon.rotation_euler = (math.radians(42), math.radians(15), math.radians(-30))

    warm_d = bpy.data.lights.new("BayLamp", "POINT")
    warm_d.energy = 15000.0
    warm_d.color = (1.0, 0.80, 0.45)
    warm = bpy.data.objects.new("BayLamp", warm_d)
    bpy.context.collection.objects.link(warm)
    warm.location = tx_to_bl(0, 12, 12)

    cam_d = bpy.data.cameras.new("Cam")
    cam_d.clip_end = 500.0
    cam_d.lens = 32.0
    cam = bpy.data.objects.new("Cam", cam_d)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam

    shots = [
        ("level4_01_from_bay.png", (0, 5.5, 2), (0, 14, 95)),
        ("level4_02_aerial.png", (55, 58, 45), (0, 12, 82)),
        ("level4_03_ramps_mountain.png", (-24, 16, 62), (0, 18, 106)),
        ("level4_04_summit.png", (20, 39, 118), (0, 32, 136)),
    ]
    for fname, pos_tx, tgt_tx in shots:
        p = tx_to_bl(*pos_tx)
        t = tx_to_bl(*tgt_tx)
        cam.location = p
        cam.rotation_euler = (t - p).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(PREVIEW_DIR, fname)
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    build_level4()
