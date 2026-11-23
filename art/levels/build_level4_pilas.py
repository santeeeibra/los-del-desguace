"""
Los del Desguace — Generador reproducible del arte 3D de Nivel 4: Operación: Pilas del Control (v2 rico en detalle).

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
  - Zonas libres para gameplay: faro (-16, 0, 34), generador (11, 0, 8), autos donantes (16, 0, 36) y (24, 0, 46).
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


def ramp1_y(z):
    return (z - RAMP1[0]) / (RAMP1[1] - RAMP1[0]) * RAMP1[3]


def ramp2_y(z):
    return RAMP2[2] + (z - RAMP2[0]) / (RAMP2[1] - RAMP2[0]) * (RAMP2[3] - RAMP2[2])


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

    # 1. Asfalto / patio nocturno con juntas y manchas de aceite
    n1 = fbm_grid(S, S, seed=41, octaves=(4, 12, 32, 64))
    n2 = fbm_grid(S, S, seed=42, octaves=(4, 8, 16))
    seam = (((xx % 128) < 3) | ((yy % 128) < 3)).astype(np.float32)
    oil = np.clip((n2 - 0.58) * 3.2, 0.0, 1.0)
    r = 0.25 + 0.08 * n1 - 0.07 * seam - 0.08 * oil
    g = 0.26 + 0.08 * n1 - 0.07 * seam - 0.08 * oil
    b = 0.30 + 0.09 * n1 - 0.06 * seam - 0.07 * oil
    tex["asphalt"] = make_image("lvl4_asphalt", np.dstack([np.clip(r, 0, 1), np.clip(g, 0, 1), np.clip(b, 0, 1), np.ones((S, S))]))

    # 2. Chapa antideslizante oscura para rampas y estructuras
    n3 = fbm_grid(S, S, seed=43, octaves=(6, 16, 48))
    diag1 = np.abs(np.sin((xx + yy) * 0.14))
    diag2 = np.abs(np.sin((xx - yy) * 0.14))
    tread = ((diag1 > 0.85) | (diag2 > 0.85)).astype(np.float32) * 0.08
    rust = np.clip((n3 - 0.62) * 3.0, 0.0, 1.0)
    r = 0.20 + 0.07 * n3 + tread + 0.26 * rust
    g = 0.23 + 0.07 * n3 + tread + 0.09 * rust
    b = 0.27 + 0.08 * n3 + tread - 0.05 * rust
    tex["ramp_steel"] = make_image("lvl4_ramp_steel", np.dstack([np.clip(r, 0, 1), np.clip(g, 0, 1), np.clip(b, 0, 1), np.ones((S, S))]))

    # 3. Franja de peligro amarilla y negra desgastada
    n4 = fbm_grid(S, S, seed=44, octaves=(8, 24, 64))
    stripe = (((xx + yy) % 64) < 32).astype(np.float32)
    r = np.where(stripe > 0.5, 0.90 - 0.14 * n4, 0.14 + 0.06 * n4)
    g = np.where(stripe > 0.5, 0.68 - 0.12 * n4, 0.14 + 0.06 * n4)
    b = np.where(stripe > 0.5, 0.14 + 0.05 * n4, 0.15 + 0.06 * n4)
    tex["hazard"] = make_image("lvl4_hazard", np.dstack([np.clip(r, 0, 1), np.clip(g, 0, 1), np.clip(b, 0, 1), np.ones((S, S))]))

    # 4. Roca nocturna con estratos de chatarra compactada
    n5 = fbm_grid(S, S, seed=45, octaves=(4, 12, 32, 64))
    strata = 0.5 + 0.5 * np.sin(yy * 0.08 + n5 * 5.0)
    r = 0.20 + 0.11 * n5 + 0.08 * strata
    g = 0.20 + 0.09 * n5 + 0.05 * strata
    b = 0.24 + 0.10 * n5 + 0.06 * strata
    tex["rock"] = make_image("lvl4_rock", np.dstack([np.clip(r, 0, 1), np.clip(g, 0, 1), np.clip(b, 0, 1), np.ones((S, S))]))

    # 5. Contenedor turquesa oxidado corrugado
    n6 = fbm_grid(S, S, seed=46, octaves=(4, 16, 48))
    rib = 0.5 + 0.5 * np.sin(xx * 0.28)
    rust2 = np.clip((n6 - 0.52) * 2.5, 0.0, 1.0)
    r = 0.20 + 0.08 * rib + 0.36 * rust2
    g = 0.42 + 0.08 * rib - 0.08 * rust2
    b = 0.44 + 0.08 * rib - 0.16 * rust2
    tex["container"] = make_image("lvl4_container", np.dstack([np.clip(r, 0, 1), np.clip(g, 0, 1), np.clip(b, 0, 1), np.ones((S, S))]))

    # 6. Contenedor / chapa rojo óxido corrugado
    n8 = fbm_grid(S, S, seed=48, octaves=(4, 16, 48))
    rust3 = np.clip((n8 - 0.48) * 2.2, 0.0, 1.0)
    r = 0.58 + 0.10 * rib - 0.12 * rust3
    g = 0.22 + 0.06 * rib - 0.04 * rust3
    b = 0.15 + 0.04 * rib - 0.04 * rust3
    tex["rust_red"] = make_image("lvl4_rust_red", np.dstack([np.clip(r, 0, 1), np.clip(g, 0, 1), np.clip(b, 0, 1), np.ones((S, S))]))

    # 7. Madera de tablones, cercos y escalones
    n7 = fbm_grid(S, S, seed=47, octaves=(4, 16, 48))
    plank = ((yy % 85) < 4).astype(np.float32)
    r = 0.42 + 0.12 * n7 - 0.16 * plank
    g = 0.26 + 0.08 * n7 - 0.12 * plank
    b = 0.15 + 0.05 * n7 - 0.08 * plank
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

    def _append_tmp(self, tmp, tx, ty, tz, rot_tx=(0.0, 0.0, 0.0)):
        rot_bl = Euler((rot_tx[0], -rot_tx[2], rot_tx[1]), "XYZ").to_matrix().to_4x4()
        mat = Matrix.Translation(tx_to_bl(tx, ty, tz)) @ rot_bl
        bmesh.ops.transform(tmp, matrix=mat, verts=tmp.verts)
        vmap = [self.bm.verts.new(v.co) for v in tmp.verts]
        for f in tmp.faces:
            self.bm.faces.new([vmap[v.index] for v in f.verts])
        tmp.free()

    def add_box(self, tx, ty, tz, sx, sy, sz, rot_tx=(0.0, 0.0, 0.0)):
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        bmesh.ops.scale(tmp, vec=(sx, sz, sy), verts=tmp.verts)
        self._append_tmp(tmp, tx, ty, tz, rot_tx)

    def add_cyl(self, tx, ty, tz, r1, r2, h, segs=12, rot_tx=(0.0, 0.0, 0.0)):
        tmp = bmesh.new()
        bmesh.ops.create_cone(tmp, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=h)
        self._append_tmp(tmp, tx, ty, tz, rot_tx)

    def add_tire(self, tx, ty, tz, maj_r=0.42, min_r=0.17, rot_tx=(0.0, 0.0, 0.0)):
        tmp = bmesh.new()
        maj_s, min_s = 14, 8
        for i in range(maj_s):
            a = 2 * math.pi * i / maj_s
            ca, sa = math.cos(a), math.sin(a)
            for j in range(min_s):
                b = 2 * math.pi * j / min_s
                r = maj_r + min_r * math.cos(b)
                tmp.verts.new((r * ca, r * sa, min_r * math.sin(b)))
        tmp.verts.ensure_lookup_table()
        for i in range(maj_s):
            ni = (i + 1) % maj_s
            for j in range(min_s):
                nj = (j + 1) % min_s
                tmp.faces.new((
                    tmp.verts[i * min_s + j],
                    tmp.verts[ni * min_s + j],
                    tmp.verts[ni * min_s + nj],
                    tmp.verts[i * min_s + nj],
                ))
        self._append_tmp(tmp, tx, ty, tz, rot_tx)

    def add_cable(self, p0_tx, p1_tx, sag=1.2, r=0.04, segs=6):
        p0 = Vector(p0_tx)
        p1 = Vector(p1_tx)
        for i in range(segs):
            t0 = i / segs
            t1 = (i + 1) / segs
            a = p0.lerp(p1, t0)
            b = p0.lerp(p1, t1)
            a.y -= 4.0 * sag * t0 * (1.0 - t0)
            b.y -= 4.0 * sag * t1 * (1.0 - t1)
            mid = (a + b) * 0.5
            d = b - a
            length = d.length
            if length < 1e-4:
                continue
            # Orientar caja delgada de a a b en Blender
            a_bl = tx_to_bl(a.x, a.y, a.z)
            b_bl = tx_to_bl(b.x, b.y, b.z)
            mid_bl = (a_bl + b_bl) * 0.5
            q = (b_bl - a_bl).to_track_quat("Z", "Y").to_matrix().to_4x4()
            tmp = bmesh.new()
            bmesh.ops.create_cube(tmp, size=1.0)
            bmesh.ops.scale(tmp, vec=(r * 2, r * 2, length + 0.04), verts=tmp.verts)
            bmesh.ops.transform(tmp, matrix=Matrix.Translation(mid_bl) @ q, verts=tmp.verts)
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


def add_container(batch_body, batch_frame, tx, ty, tz, rot_y=0.0):
    batch_body.add_box(tx, ty + 1.3, tz, 2.5, 2.5, 6.0, (0, rot_y, 0))
    batch_frame.add_box(tx, ty + 0.10, tz, 2.62, 0.20, 6.12, (0, rot_y, 0))
    batch_frame.add_box(tx, ty + 2.52, tz, 2.62, 0.20, 6.12, (0, rot_y, 0))


def add_tire_stack(batch_tires, tx, ty, tz, count=3):
    for k in range(count):
        batch_tires.add_tire(tx + rng.uniform(-0.08, 0.08), ty + 0.17 + k * 0.32, tz + rng.uniform(-0.08, 0.08))


def add_barrel_cluster(batch_red, batch_teal, tx, ty, tz):
    batch_red.add_cyl(tx, ty + 0.48, tz, 0.30, 0.30, 0.96, 10)
    batch_teal.add_cyl(tx + 0.72, ty + 0.48, tz + 0.25, 0.30, 0.30, 0.96, 10)
    batch_red.add_cyl(tx + 0.22, ty + 0.30, tz - 0.75, 0.30, 0.30, 0.96, 10, (math.pi / 2, 0.4, 0))


def add_floodlight(batch_steel, batch_glow, tx, ty, tz, height=5.8, rot_y=0.0):
    batch_steel.add_box(tx, ty + 0.22, tz, 0.95, 0.44, 0.95, (0, rot_y, 0))
    batch_steel.add_cyl(tx, ty + height / 2, tz, 0.11, 0.16, height, 10)
    batch_steel.add_box(tx, ty + height + 0.05, tz, 1.45, 0.18, 0.25, (0, rot_y, 0))
    batch_glow.add_box(tx - 0.42 * math.cos(rot_y), ty + height - 0.02, tz + 0.42 * math.sin(rot_y), 0.44, 0.28, 0.30, (0, rot_y, 0))
    batch_glow.add_box(tx + 0.42 * math.cos(rot_y), ty + height - 0.02, tz - 0.42 * math.sin(rot_y), 0.44, 0.28, 0.30, (0, rot_y, 0))


def build_level4():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    tex = generate_textures()

    m_asphalt = make_tex_mat("M_L4_Asphalt", tex["asphalt"], rough=0.86, metal=0.05)
    m_ramp = make_tex_mat("M_L4_RampSteel", tex["ramp_steel"], rough=0.56, metal=0.48)
    m_hazard = make_tex_mat("M_L4_Hazard", tex["hazard"], rough=0.62, metal=0.10)
    m_rock = make_tex_mat("M_L4_Rock", tex["rock"], rough=0.92, metal=0.04)
    m_cont = make_tex_mat("M_L4_ContainerTeal", tex["container"], rough=0.60, metal=0.35)
    m_red = make_tex_mat("M_L4_RustRed", tex["rust_red"], rough=0.65, metal=0.32)
    m_wood = make_tex_mat("M_L4_Wood", tex["wood"], rough=0.84, metal=0.02)
    m_glow = make_tex_mat("M_L4_WarmGlow", None, rough=0.2, metal=0.0, emission=(1.0, 0.78, 0.28, 1.0), emission_strength=3.6)

    b_asphalt = MeshBatch("L4_Yard_Asphalt", m_asphalt, 0.10)
    b_ramp = MeshBatch("L4_Ramps_Steel", m_ramp, 0.16)
    b_hazard = MeshBatch("L4_Hazard_Stripes", m_hazard, 0.28)
    b_rock = MeshBatch("L4_Mountain_Rock", m_rock, 0.08)
    b_cont = MeshBatch("L4_Containers_Teal", m_cont, 0.20)
    b_red = MeshBatch("L4_Scrap_Red", m_red, 0.20)
    b_wood = MeshBatch("L4_Wood_Structures", m_wood, 0.22)
    b_glow = MeshBatch("L4_Night_Lights", m_glow, 0.5)

    # 1. Bahía de armado + patio nocturno (tope exacto y = 0)
    b_asphalt.add_box(0, -6.5, 28, 60.0, 13.0, 56.0)
    # Pista pintada de la bahía (12x10 en z = 8) + corredor señalizado hasta la rampa (z = 14..55)
    b_hazard.add_box(0, 0.015, 8, 12.0, 0.03, 10.0)
    b_asphalt.add_box(0, 0.022, 8, 10.8, 0.02, 8.8)
    for z_mark in range(18, 54, 6):
        b_hazard.add_box(-6.4, 0.015, z_mark, 0.38, 0.03, 2.8)
        b_hazard.add_box(6.4, 0.015, z_mark, 0.38, 0.03, 2.8)

    # Tinglado / techo abierto de taller al costado izquierdo de la bahía (x = -16, z = 6)
    for px in (-21.0, -12.5):
        for pz in (2.0, 13.0):
            b_ramp.add_box(px, 2.5, pz, 0.32, 5.0, 0.32)
    b_red.add_box(-16.75, 5.15, 7.5, 9.6, 0.22, 12.2, (0, 0, -0.08))
    # Estantes y banco de trabajo bajo el tinglado (libres las piezas sueltas en x=-4..-10)
    b_wood.add_box(-19.5, 0.65, 7.5, 1.4, 1.3, 6.2)
    b_wood.add_box(-19.5, 2.0, 7.5, 1.1, 0.14, 5.8)
    b_wood.add_box(-19.5, 3.0, 7.5, 1.1, 0.14, 5.8)
    b_red.add_box(-19.4, 2.35, 6.2, 0.75, 0.55, 0.9)
    b_cont.add_box(-19.4, 2.35, 8.8, 0.75, 0.55, 1.1)
    b_glow.add_box(-16.5, 4.85, 7.5, 3.8, 0.16, 0.35)

    # Cerco perimetral con postes, chapas alternadas y vallas
    b_wood.add_box(0, 0.45, -0.8, 60.0, 0.9, 0.36)
    b_wood.add_box(-30.2, 0.85, 28, 0.38, 1.7, 56.0)
    b_wood.add_box(30.2, 0.85, 28, 0.38, 1.7, 56.0)
    for x in range(-28, 30, 4):
        b_wood.add_box(x, 0.65, -0.8, 0.28, 1.35, 0.48)
    for z in range(2, 56, 5):
        b_wood.add_box(-30.2, 1.05, z, 0.52, 2.1, 0.32)
        b_wood.add_box(30.2, 1.05, z, 0.52, 2.1, 0.32)

    # Contenedores apilados en 2 niveles bordeando el patio (respetando autos en (16,36),(24,46), faro (-16,34), gen (11,8))
    add_container(b_cont, b_ramp, -26.2, 0.0, 12, 0.06)
    add_container(b_red, b_ramp, -26.2, 2.6, 12, -0.04)
    add_container(b_red, b_ramp, -26.5, 0.0, 22, -0.08)
    add_container(b_cont, b_ramp, -25.8, 0.0, 45, 0.15)
    add_container(b_red, b_ramp, -25.8, 2.6, 45, 0.05)

    add_container(b_cont, b_ramp, 26.2, 0.0, 12, -0.07)
    add_container(b_red, b_ramp, 26.2, 2.6, 12, 0.04)
    add_container(b_red, b_ramp, 26.5, 0.0, 23, 0.09)
    add_container(b_cont, b_ramp, 22.0, 0.0, 4, 1.48)
    add_container(b_red, b_ramp, -10.0, 0.0, 52, 1.42)
    add_container(b_cont, b_ramp, 12.5, 0.0, 52, -1.45)

    # Pilas de neumáticos, barriles y vallas bajas en el patio
    for tx, tz, cnt in (
        (-13.5, 20, 4), (-11.8, 21.2, 3), (-22.0, 31, 4), (-20.4, 32.5, 2),
        (13.5, 19, 3), (15.0, 20.5, 4), (21.0, 29, 3), (11.5, 46, 4),
        (-9.5, 44, 3), (-8.0, 45.2, 2), (8.2, 28, 3), (-8.5, 26, 2),
    ):
        add_tire_stack(b_ramp, tx, 0.0, tz, cnt)

    for bx, bz in ((-11.5, 16), (16.5, 13), (-22.0, 40), (19.5, 20), (-7.5, 49), (8.5, 49)):
        add_barrel_cluster(b_red, b_cont, bx, 0.0, bz)

    # Torres de reflectores nocturnos + cables aéreos tendidos sobre el patio
    flood_pts = [
        (-11.0, 0.0, 3.0, 5.8, -0.4),
        (15.0, 0.0, 3.0, 5.8, 0.4),
        (-11.0, 0.0, 20.0, 6.2, -0.3),
        (11.0, 0.0, 20.0, 6.2, 0.3),
        (-9.5, 0.0, 54.0, 6.6, -0.2),
        (9.5, 0.0, 54.0, 6.6, 0.2),
    ]
    for fx, fy, fz, fh, fry in flood_pts:
        add_floodlight(b_ramp, b_glow, fx, fy, fz, fh, fry)
    b_ramp.add_cable((-11, 5.6, 3), (-11, 6.0, 20), sag=0.9)
    b_ramp.add_cable((15, 5.6, 3), (11, 6.0, 20), sag=0.9)
    b_ramp.add_cable((-11, 6.0, 20), (-9.5, 6.4, 54), sag=1.6)
    b_ramp.add_cable((11, 6.0, 20), (9.5, 6.4, 54), sag=1.6)
    b_ramp.add_cable((-9.5, 6.4, 54), (9.5, 6.4, 54), sag=0.8)

    # Pórtico de entrada al pie de la Rampa 1 (z = 56)
    b_ramp.add_box(-6.6, 4.2, 56.0, 0.75, 8.4, 0.75)
    b_ramp.add_box(6.6, 4.2, 56.0, 0.75, 8.4, 0.75)
    b_hazard.add_box(0.0, 8.2, 56.0, 14.2, 0.9, 0.85)
    b_glow.add_box(0.0, 7.6, 55.6, 9.0, 0.32, 0.25)

    # 2. Rampa 1 (z = 56..100, y = 0..18, ancho 12 m) + arcos de luces y pilares
    z0, z1, y0, y1 = RAMP1
    len1 = math.hypot(z1 - z0, y1 - y0)
    ang1 = math.atan2(y1 - y0, z1 - z0)
    b_ramp.add_box(0, (y0 + y1) / 2 - 0.5, (z0 + z1) / 2, 12.0, 1.0, len1, (-ang1, 0, 0))
    for sx in (-5.75, 5.75):
        b_hazard.add_box(sx, (y0 + y1) / 2 + 0.14, (z0 + z1) / 2, 0.48, 0.30, len1, (-ang1, 0, 0))
    # Balizas luminosas y pilares cada 8 m en Rampa 1
    for z in (62, 70, 78, 86, 94):
        ry = ramp1_y(z)
        for sx in (-5.85, 5.85):
            b_ramp.add_cyl(sx, ry + 0.85, z, 0.08, 0.10, 1.5, 8)
            b_glow.add_box(sx, ry + 1.65, z, 0.28, 0.28, 0.28)
            b_ramp.add_box(sx * 0.85, (ry - 1.0) / 2 - 3.0, z, 0.95, ry + 5.0, 0.95)
    # Arco estructural intermedio en el checkpoint 1 (z = 80)
    cy1 = ramp1_y(80)
    b_ramp.add_box(-6.4, cy1 + 3.6, 80, 0.6, 7.2, 0.6)
    b_ramp.add_box(6.4, cy1 + 3.6, 80, 0.6, 7.2, 0.6)
    b_hazard.add_box(0, cy1 + 7.1, 80, 13.6, 0.72, 0.65)
    b_glow.add_box(0, cy1 + 6.6, 79.7, 7.5, 0.26, 0.22)
    b_ramp.add_cable((-6.4, 8.0, 56), (-6.4, cy1 + 7.0, 80), sag=1.2)
    b_ramp.add_cable((6.4, 8.0, 56), (6.4, cy1 + 7.0, 80), sag=1.2)

    # 3. Meseta intermedia (z = 100..108, y = 18, ancho 14 m) + caseta técnica al costado
    b_asphalt.add_box(0, 17.5, 104, 14.0, 1.0, 8.4)
    for sx in (-6.75, 6.75):
        b_hazard.add_box(sx, 18.14, 104, 0.48, 0.30, 8.4)
        b_ramp.add_box(sx * 0.82, 7.0, 104, 1.2, 20.0, 1.2)
    # Caseta técnica de control en el borde derecho de la meseta (x = 9.5, z = 104, fuera de la calzada)
    b_cont.add_box(9.6, 19.6, 104, 3.8, 3.2, 5.2)
    b_ramp.add_box(9.6, 17.4, 104, 4.4, 1.2, 6.0)
    b_ramp.add_box(9.6, 8.0, 104, 1.3, 18.0, 1.3)
    b_glow.add_box(7.68, 20.0, 104, 0.14, 0.9, 2.4)
    add_floodlight(b_ramp, b_glow, -6.5, 18.0, 101.5, 4.8, -0.5)
    add_floodlight(b_ramp, b_glow, 6.5, 18.0, 106.5, 4.8, 0.5)
    b_ramp.add_cable((-6.4, cy1 + 7.0, 80), (-6.5, 22.6, 101.5), sag=1.1)
    b_ramp.add_cable((6.4, cy1 + 7.0, 80), (6.5, 22.6, 106.5), sag=1.1)

    # 4. Rampa 2 (z = 108..128, y = 18..30, ancho 10 m)
    z0, z1, y0, y1 = RAMP2
    len2 = math.hypot(z1 - z0, y1 - y0)
    ang2 = math.atan2(y1 - y0, z1 - z0)
    b_ramp.add_box(0, (y0 + y1) / 2 - 0.5, (z0 + z1) / 2, 10.0, 1.0, len2, (-ang2, 0, 0))
    for sx in (-4.75, 4.75):
        b_hazard.add_box(sx, (y0 + y1) / 2 + 0.14, (z0 + z1) / 2, 0.45, 0.30, len2, (-ang2, 0, 0))
    for z in (113, 118, 123):
        ry = ramp2_y(z)
        for sx in (-4.85, 4.85):
            b_ramp.add_cyl(sx, ry + 0.85, z, 0.08, 0.10, 1.5, 8)
            b_glow.add_box(sx, ry + 1.65, z, 0.26, 0.26, 0.26)
            b_ramp.add_box(sx * 0.85, (ry - 1.0) / 2 - 3.0, z, 0.95, ry + 5.0, 0.95)

    # 5. Cima (z = 128..140, y = 30, ancho 16 m) + Torre repetidora de TV + contenedores de energía
    b_asphalt.add_box(0, 29.5, 134, 16.0, 1.0, 12.0)
    b_hazard.add_box(0, 30.015, 134, 7.6, 0.03, 5.4)
    b_asphalt.add_box(0, 30.022, 134, 6.4, 0.02, 4.2)
    for sx in (-7.75, 7.75):
        b_hazard.add_box(sx, 30.15, 134, 0.48, 0.30, 12.0)
    # Reflectores y barriles en las esquinas de la cima
    add_floodlight(b_ramp, b_glow, -7.2, 30.0, 129.0, 5.4, -0.5)
    add_floodlight(b_ramp, b_glow, 7.2, 30.0, 129.0, 5.4, 0.5)
    add_barrel_cluster(b_red, b_cont, -6.2, 30.0, 137.5)
    add_barrel_cluster(b_red, b_cont, 5.6, 30.0, 137.5)
    # Torre de TV reticulada con reflector baliza arriba (z = 139.2)
    for tx_leg in (-1.4, 1.4):
        b_ramp.add_box(tx_leg, 36.0, 139.2, 0.32, 12.0, 0.32)
    for ty_br in (32.5, 35.5, 38.5, 41.0):
        b_ramp.add_box(0.0, ty_br, 139.2, 3.0, 0.22, 0.22)
    b_ramp.add_cyl(0, 44.0, 139.2, 0.14, 0.28, 6.5, 10)
    b_ramp.add_box(0, 44.5, 139.2, 5.6, 0.22, 0.22)
    b_ramp.add_box(0, 42.8, 139.2, 3.8, 0.18, 0.18)
    b_glow.add_cyl(0, 47.4, 139.2, 0.42, 0.42, 0.65, 12)
    b_ramp.add_cable((-6.5, 22.6, 101.5), (-7.2, 35.2, 129.0), sag=1.2)
    b_ramp.add_cable((6.5, 22.6, 106.5), (7.2, 35.2, 129.0), sag=1.2)

    # 6. Montaña de chatarra y roca escalonada + contenedores incrustados en las laderas
    for z in range(58, 144, 6):
        ridge_y = min(31.0, max(3.0, (z - 52.0) * 0.40))
        for side in (-1, 1):
            bx = side * (16.5 + rng.uniform(0.0, 5.0))
            if side == -1 and 60 <= z <= 86:
                bx -= 12.0
            bw = rng.uniform(8.0, 14.0)
            bd = rng.uniform(8.0, 12.0)
            bh = ridge_y + rng.uniform(4.0, 11.0)
            b_rock.add_box(bx, bh / 2 - 6.0, z, bw, bh, bd, (0, rng.uniform(-0.25, 0.25), 0))
            # Chatarra incrustada (contenedores viejos inclinados en la ladera)
            if rng.random() < 0.45:
                batch_c = b_cont if rng.random() < 0.5 else b_red
                batch_c.add_box(
                    bx - side * 2.5, bh - 5.2, z + rng.uniform(-1.5, 1.5),
                    2.6, 2.4, 5.6, (rng.uniform(-0.2, 0.2), rng.uniform(-0.6, 0.6), rng.uniform(-0.2, 0.2)),
                )

    # 7. Escalones ocultos hacia la Tuerca Dorada (x = -22) con barandas y farolitos
    for (sx, sy, sz, sw, sh, sd) in (
        (-22, 0.6, 66, 3.0, 1.2, 3.0),
        (-22, 1.6, 70, 3.0, 1.2, 3.0),
        (-22, 2.6, 74, 3.0, 1.2, 3.0),
        (-22, 3.6, 79, 5.0, 1.2, 5.0),
    ):
        b_wood.add_box(sx, sy, sz, sw, sh, sd)
        b_ramp.add_box(sx, (sy - sh / 2) / 2 - 2.0, sz, 0.45, sy + 4.0, 0.45)
        b_glow.add_box(sx + sw * 0.42, sy + sh * 0.5 + 0.35, sz, 0.22, 0.22, 0.22)

    objs = [b.finalize() for b in (b_asphalt, b_ramp, b_hazard, b_rock, b_cont, b_red, b_wood, b_glow)]

    # 8. Empties del contrato
    empties = [
        add_empty("spawn", 0, 1.8, 4),
        add_empty("bay", 0, 0, 8),
        add_empty("checkpoint_1", 0, 10.4, 80),
        add_empty("checkpoint_2", 0, 19.8, 104),
        add_empty("goal", 0, 31.6, 134),
        add_empty("golden_nut", -22, 5.0, 79),
    ]

    # Exportar GLB (SOLO escenario estático + empties, sin proxies de gameplay)
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

    # Agregar proxies temporales SOLO para las capturas de "escenario completo con gameplay"
    add_gameplay_proxies_for_preview(m_ramp, m_hazard, m_red, m_glow)
    render_previews()
    tris = sum(len(o.data.polygons) * 2 for o in objs if o.type == "MESH")
    print(f"[LEVEL4 v2] OK tris~={tris} glb={os.path.getsize(GLB_PATH)} bytes -> {GLB_PATH}")


def add_gameplay_proxies_for_preview(m_steel, m_hazard, m_red, m_glow):
    """Agrega siluetas de los objetos dinámicos que el código coloca en runtime (SOLO para las fotos)."""
    m_cyan = make_tex_mat("M_ProxyCyan", None, rough=0.25, metal=0.2, emission=(0.25, 0.9, 1.0, 1.0), emission_strength=2.5)
    p_steel = MeshBatch("Proxy_Steel", m_steel, 0.2)
    p_red = MeshBatch("Proxy_Red", m_red, 0.2)
    p_glow = MeshBatch("Proxy_Glow", m_glow, 0.2)
    p_cyan = MeshBatch("Proxy_Cyan", m_cyan, 0.2)

    # Faro en (-16, 0, 34)
    p_steel.add_cyl(-16, 4.5, 34, 1.2, 1.7, 9.0, 14)
    p_red.add_cyl(-16, 9.6, 34, 1.35, 1.35, 1.5, 14)
    p_glow.add_cyl(-16, 9.6, 34, 1.42, 1.42, 0.7, 14)

    # Generador en (11, 0, 8)
    p_red.add_box(11, 0.85, 8, 2.2, 1.7, 1.5)
    p_cyan.add_box(11, 1.85, 8, 0.6, 0.4, 0.6)

    # 2 Autos donantes en (16, 0.75, 36) y (24, 0.75, 46)
    for cx, cz, ry in ((16, 36, 0.2), (24, 46, -0.5)):
        p_red.add_box(cx, 0.85, cz, 2.0, 1.0, 4.0, (0, ry, 0))
        p_steel.add_box(cx, 1.55, cz - 0.3, 1.8, 0.65, 2.0, (0, ry, 0))

    # 6 Postes magnéticos en x = ±9, z = 66, 78, 90
    for z in (66, 78, 90):
        ry = ramp1_y(z)
        for sx in (-9, 9):
            p_steel.add_cyl(sx, ry + 6.0, z, 0.28, 0.34, 14.0, 12)
            p_cyan.add_cyl(sx, ry + 13.2, z, 0.42, 0.42, 0.5, 12)

    # Pórtico y pilas doradas en la cima (z = 134, y = 30)
    p_steel.add_box(-3.6, 32.8, 134, 0.55, 5.6, 0.55)
    p_steel.add_box(3.6, 32.8, 134, 0.55, 5.6, 0.55)
    p_steel.add_box(0.0, 35.6, 134, 8.0, 0.7, 0.7)
    p_glow.add_cyl(-0.55, 31.3, 134, 0.22, 0.22, 1.1, 12, (0, 0, math.pi / 2))
    p_glow.add_cyl(0.55, 31.3, 134, 0.22, 0.22, 1.1, 12, (0, 0, math.pi / 2))

    # Tuerca Dorada en (-22, 5.0, 79)
    p_glow.add_cyl(-22, 5.2, 79, 0.7, 0.7, 0.35, 6, (math.pi / 2, 0, 0))

    for b in (p_steel, p_red, p_glow, p_cyan):
        b.finalize()


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
        bg.inputs["Color"].default_value = (0.05, 0.08, 0.14, 1.0)
        bg.inputs["Strength"].default_value = 0.85

    moon_d = bpy.data.lights.new("Moon", "SUN")
    moon_d.energy = 2.4
    moon_d.color = (0.72, 0.82, 1.0)
    moon = bpy.data.objects.new("Moon", moon_d)
    bpy.context.collection.objects.link(moon)
    moon.rotation_euler = (math.radians(42), math.radians(15), math.radians(-30))

    # Luces cálidas de taller y reflector del faro para mostrar la ambientación completa
    for name, loc, energy, col in (
        ("BayLamp", (0, 12, 12), 24000.0, (1.0, 0.80, 0.45)),
        ("FaroLamp", (-16, 11, 34), 35000.0, (1.0, 0.88, 0.55)),
        ("PlateauLamp", (0, 24, 104), 22000.0, (1.0, 0.78, 0.42)),
        ("SummitLamp", (0, 38, 134), 28000.0, (1.0, 0.84, 0.45)),
    ):
        ld = bpy.data.lights.new(name, "POINT")
        ld.energy = energy
        ld.color = col
        lo = bpy.data.objects.new(name, ld)
        bpy.context.collection.objects.link(lo)
        lo.location = tx_to_bl(*loc)

    cam_d = bpy.data.cameras.new("Cam")
    cam_d.clip_end = 500.0
    cam_d.lens = 30.0
    cam = bpy.data.objects.new("Cam", cam_d)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam

    shots = [
        ("level4_01_from_bay.png", (0, 6.5, 1), (0, 12, 85)),
        ("level4_02_aerial.png", (56, 56, 42), (0, 12, 76)),
        ("level4_03_ramps_mountain.png", (-24, 14, 48), (4, 16, 98)),
        ("level4_04_summit.png", (18, 40, 116), (0, 33, 136)),
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
