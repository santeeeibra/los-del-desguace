"""
Los del Desguace — Generador reproducible del arte 3D de Nivel 2: El Callejón de los Autos.

Uso (Blender 5.2.3 LTS, sin interfaz):
    blender -b --factory-startup -P art/levels/build_level2_callejon.py
    (luego ejecutar gltf-transform quantize sobre level-2-autos.glb y cars/*.glb)

Entregables generados:
  1. public/models/levels/level-2-autos.glb  (SOLO escenario + 8 empties exactos, sin autos)
  2. public/models/levels/cars/:
       - car-sedan.glb, car-van.glb, car-pickup.glb, car-wagon.glb
       - car-weak-sedan.glb, car-weak-van.glb, car-weak-pickup.glb, car-weak-wagon.glb
       - car-chunks-sedan.glb, car-chunks-van.glb, car-chunks-pickup.glb, car-chunks-wagon.glb
  3. art/levels/level-2-autos.blend, art/levels/cars-pack.blend
  4. art/levels/previews/level2_01..06.png (renders EEVEE de control con autos instanciados solo para preview)
"""

import bpy
import bmesh
import math
import os
import numpy as np
from mathutils import Euler, Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
TEX_DIR = os.path.join(ROOT, "textures")
PREVIEW_DIR = os.path.join(ROOT, "previews")
LEVELS_DIR = os.path.normpath(os.path.join(ROOT, "..", "..", "public", "models", "levels"))
CARS_DIR = os.path.join(LEVELS_DIR, "cars")
LEVEL_GLB = os.path.join(LEVELS_DIR, "level-2-autos.glb")
LEVEL_BLEND = os.path.join(ROOT, "level-2-autos.blend")
CARS_BLEND = os.path.join(ROOT, "cars-pack.blend")

# Medidas exactas del código (ExpeditionLevels.tsx & carBarriers.ts)
CATWALK_Y = 5.0
CATWALK_X = -7.0
UP_RAMP_ANGLE = math.atan2(CATWALK_Y, 17.0)
DOWN_RAMP_ANGLE = math.atan2(CATWALK_Y, 12.0)
UP_LEN = math.hypot(17.0, CATWALK_Y)
DOWN_LEN = math.hypot(12.0, CATWALK_Y)

CAR_SIZE = (4.2, 1.5, 1.9)  # (X, Y, Z)
CAR_VARIANTS = ("sedan", "van", "pickup", "wagon")


def tx_to_bl(x, y, z):
    """Three.js (X, Y-up, +Z adelante) -> Blender (X, -Z, Y)."""
    return Vector((x, -z, y))


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h, a=1.0):
    h = h.lstrip("#")
    vals = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return (srgb_to_lin(vals[0]), srgb_to_lin(vals[1]), srgb_to_lin(vals[2]), a)


# ---------------------------------------------------------------------------
# Texturas procedurales limpias (numpy contiguo -> PNG -> pack)
# ---------------------------------------------------------------------------

def make_image(name, arr_rgba, is_data=False):
    os.makedirs(TEX_DIR, exist_ok=True)
    h, w, _ = arr_rgba.shape
    img = bpy.data.images.new(name, width=w, height=h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = "Non-Color" if is_data else "sRGB"
    flat = np.ascontiguousarray(np.flipud(arr_rgba), dtype=np.float32).ravel()
    img.pixels.foreach_set(flat)
    img.update()
    path = os.path.join(TEX_DIR, f"{name}.png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img.pack()
    assert float(np.max(flat)) > 0.1, f"Textura {name} vacía"
    return img


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
        c00 = grid[y0, x0]
        c10 = grid[y0, x1]
        c01 = grid[y1, x0]
        c11 = grid[y1, x1]
        val = (c00 * (1 - sx) + c10 * sx) * (1 - sy) + (c01 * (1 - sx) + c11 * sx) * sy
        acc += val * amp
        tot += amp
        amp *= 0.5
    return acc / tot


def generate_level_textures():
    """Texturas procedurales 1024 px para el escenario del Nivel 2 (<= 8 materiales)."""
    S = 1024
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    tex = {}

    # 1. Hormigón / asfalto de callejón con losas, marcas de neumáticos y manchas cálidas
    n1 = fbm_grid(S, S, seed=101, octaves=(4, 10, 24, 64))
    gx = (xx % (S / 4)) / (S / 4)
    gy = (yy % (S / 4)) / (S / 4)
    seam = ((gx < 0.022) | (gy < 0.022)).astype(np.float32)
    stain = np.clip((n1 - 0.58) * 2.2, 0.0, 0.28)
    rgb = np.zeros((S, S, 4), dtype=np.float32)
    base = np.array([0.52, 0.47, 0.43], dtype=np.float32)
    for c in range(3):
        rgb[:, :, c] = np.clip(base[c] + (n1 - 0.5) * 0.11 - stain * 0.22 - seam * 0.14, 0.08, 0.88)
    rgb[:, :, 3] = 1.0
    tex["concrete"] = make_image("lvl2_concrete", rgb)

    # 2. Madera de pasarela y banco del taller
    n2 = fbm_grid(S, S, seed=102, octaves=(4, 12, 32, 64))
    planks = 6
    pid = np.floor(yy / (S / planks)).astype(np.int32)
    py = (yy % (S / planks)) / (S / planks)
    pseam = ((py < 0.042) | (py > 0.958)).astype(np.float32)
    off = ((pid % 2) * 0.5 + 0.18) * S
    vseam = (np.abs(((xx + off) % (S * 0.5)) - 2.0) < 3.0).astype(np.float32)
    grain = np.sin(yy * 0.14 + n2 * 9.0) * 0.5 + 0.5
    tint = np.array([0.80, 0.54, 0.28], dtype=np.float32)
    var = (pid % 3 - 1) * 0.05
    rgb = np.zeros((S, S, 4), dtype=np.float32)
    for c in range(3):
        v = tint[c] + var + (grain - 0.5) * 0.09 + (n2 - 0.5) * 0.07
        rgb[:, :, c] = np.clip(v * (1.0 - 0.55 * np.maximum(pseam, vseam)), 0.06, 0.95)
    rgb[:, :, 3] = 1.0
    tex["wood"] = make_image("lvl2_wood", rgb)

    # 3. Contenedor ondulado turquesa gastado con óxido
    n3 = fbm_grid(S, S, seed=103, octaves=(4, 10, 24, 48))
    rib = (np.sin(xx * (2 * math.pi * 20 / S)) * 0.5 + 0.5) * 0.16
    rmask = np.clip((n3 - 0.56) * 3.4, 0.0, 0.85)
    teal = np.array([0.24, 0.52, 0.49], dtype=np.float32)
    rust = np.array([0.66, 0.30, 0.16], dtype=np.float32)
    rgb = np.zeros((S, S, 4), dtype=np.float32)
    for c in range(3):
        rgb[:, :, c] = np.clip(teal[c] * (1 - rmask) + rust[c] * rmask + rib - 0.08, 0.06, 0.92)
    rgb[:, :, 3] = 1.0
    tex["container_teal"] = make_image("lvl2_container_teal", rgb)

    # 4. Contenedor ondulado óxido/terracota cálido
    n4 = fbm_grid(S, S, seed=104, octaves=(4, 10, 24, 48))
    rib4 = (np.sin(xx * (2 * math.pi * 20 / S)) * 0.5 + 0.5) * 0.16
    dmask = np.clip((n4 - 0.52) * 2.8, 0.0, 0.8)
    terra = np.array([0.74, 0.37, 0.21], dtype=np.float32)
    steel = np.array([0.46, 0.43, 0.41], dtype=np.float32)
    rgb = np.zeros((S, S, 4), dtype=np.float32)
    for c in range(3):
        rgb[:, :, c] = np.clip(terra[c] * (1 - dmask) + steel[c] * dmask + rib4 - 0.08, 0.06, 0.92)
    rgb[:, :, 3] = 1.0
    tex["container_rust"] = make_image("lvl2_container_rust", rgb)

    # 5. Acero pesado oscuro (zona barrera B, portón, neumáticos y refuerzos)
    n5 = fbm_grid(S, S, seed=105, octaves=(4, 12, 28, 56))
    plate = (((xx % (S / 4)) < 6) | ((yy % (S / 4)) < 6)).astype(np.float32)
    rmask5 = np.clip((n5 - 0.62) * 3.0, 0.0, 0.55)
    iron = np.array([0.27, 0.27, 0.29], dtype=np.float32)
    dark_rust = np.array([0.44, 0.22, 0.13], dtype=np.float32)
    rgb = np.zeros((S, S, 4), dtype=np.float32)
    for c in range(3):
        rgb[:, :, c] = np.clip((iron[c] * (1 - rmask5) + dark_rust[c] * rmask5) * (1 - 0.35 * plate) + (n5 - 0.5) * 0.08, 0.05, 0.8)
    rgb[:, :, 3] = 1.0
    tex["heavy_steel"] = make_image("lvl2_heavy_steel", rgb)

    # 6. Franjas de peligro mostaza y carbón
    n6 = fbm_grid(S, S, seed=106, octaves=(6, 16, 32))
    stripe = (((xx + yy) / (S / 8.0)) % 1.0 < 0.56).astype(np.float32)
    yel = np.array([0.96, 0.74, 0.20], dtype=np.float32)
    blk = np.array([0.17, 0.14, 0.13], dtype=np.float32)
    rgb = np.zeros((S, S, 4), dtype=np.float32)
    for c in range(3):
        rgb[:, :, c] = np.clip(blk[c] * (1 - stripe) + yel[c] * stripe + (n6 - 0.5) * 0.08, 0.05, 0.98)
    rgb[:, :, 3] = 1.0
    tex["hazard"] = make_image("lvl2_hazard", rgb)

    return tex


def make_mat(name, base_img=None, base_hex="#888888", rough=0.8, metal=0.1, emissive_hex=None, emissive_str=0.0):
    m = bpy.data.materials.new(name)
    m.use_backface_culling = True
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if base_img is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = base_img
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = hex_rgba(base_hex)
    if emissive_hex is not None:
        bsdf.inputs["Emission Color"].default_value = hex_rgba(emissive_hex)
        bsdf.inputs["Emission Strength"].default_value = emissive_str
    return m


def create_level_materials(tex):
    """Exactamente 8 materiales compartidos para todo el escenario Nivel 2."""
    return {
        "concrete": make_mat("M_AlleyConcrete", tex["concrete"], rough=0.88, metal=0.06),
        "wood": make_mat("M_WorkshopWood", tex["wood"], rough=0.84, metal=0.02),
        "teal": make_mat("M_ContainerTeal", tex["container_teal"], rough=0.70, metal=0.35),
        "rust": make_mat("M_ContainerRust", tex["container_rust"], rough=0.72, metal=0.38),
        "heavy": make_mat("M_HeavySteel", tex["heavy_steel"], rough=0.62, metal=0.52),
        "hazard": make_mat("M_HazardStripes", tex["hazard"], rough=0.55, metal=0.12),
        "rubber": make_mat("M_ScrapRubber", None, base_hex="#232224", rough=0.92, metal=0.05),
        "glow": make_mat("M_GiantNutGlow", None, base_hex="#ffe170", rough=0.28, metal=0.35, emissive_hex="#ffb828", emissive_str=2.4),
    }


# ---------------------------------------------------------------------------
# Constructor BMesh en coordenadas Three.js
# ---------------------------------------------------------------------------

class BucketBuilder:
    def __init__(self, mats):
        self.mats = mats
        self.bms = {k: bmesh.new() for k in mats}

    def _xform(self, verts, center_tx, rot_tx=(0.0, 0.0, 0.0)):
        rm = Euler(rot_tx, "XYZ").to_matrix().to_4x4()
        cx, cy, cz = center_tx
        for v in verts:
            p = rm @ v.co
            v.co = tx_to_bl(p.x + cx, p.y + cy, p.z + cz)

    def add_box(self, mat_key, center_tx, size_tx, rot_tx=(0.0, 0.0, 0.0), bevel=0.0):
        bm = self.bms[mat_key]
        sx, sy, sz = size_tx
        res = bmesh.ops.create_cube(bm, size=1.0)
        verts = res["verts"]
        for v in verts:
            v.co.x *= sx
            v.co.y *= sy
            v.co.z *= sz
        if bevel > 0.0:
            edges = list({e for v in verts for e in v.link_edges})
            bres = bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect="EDGES", clamp_overlap=True)
            verts = [v for v in ({v for f in bres["faces"] for v in f.verts} | set(bres["verts"]) | set(verts)) if v.is_valid]
        self._xform(verts, center_tx, rot_tx)

    def add_cylinder(self, mat_key, center_tx, r_top, r_bot, height, segs=12, rot_tx=(0.0, 0.0, 0.0)):
        bm = self.bms[mat_key]
        res = bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=False, segments=segs,
            radius1=r_bot, radius2=r_top, depth=height,
        )
        verts = res["verts"]
        for v in verts:
            x, y, z = v.co.x, v.co.y, v.co.z
            v.co = Vector((x, z, -y))
        self._xform(verts, center_tx, rot_tx)

    def add_hex_nut(self, mat_key, center_tx, outer_r, inner_r, depth, rot_tx=(0.0, 0.0, 0.0)):
        """Tuerca hexagonal con agujero central real (para la tuerca gigante luminosa del portón)."""
        bm = self.bms[mat_key]
        # 6 segmentos trapezoidales formando un anillo hexagonal hueco
        segs = 6
        verts_all = []
        for i in range(segs):
            a0 = (i / segs) * math.tau + math.pi / 6
            a1 = ((i + 1) / segs) * math.tau + math.pi / 6
            pts = [
                (math.cos(a0) * inner_r, math.sin(a0) * inner_r, -depth * 0.5),
                (math.cos(a0) * outer_r, math.sin(a0) * outer_r, -depth * 0.5),
                (math.cos(a1) * outer_r, math.sin(a1) * outer_r, -depth * 0.5),
                (math.cos(a1) * inner_r, math.sin(a1) * inner_r, -depth * 0.5),
                (math.cos(a0) * inner_r, math.sin(a0) * inner_r, depth * 0.5),
                (math.cos(a0) * outer_r, math.sin(a0) * outer_r, depth * 0.5),
                (math.cos(a1) * outer_r, math.sin(a1) * outer_r, depth * 0.5),
                (math.cos(a1) * inner_r, math.sin(a1) * inner_r, depth * 0.5),
            ]
            vs = [bm.verts.new(p) for p in pts]
            verts_all.extend(vs)
            faces = [
                (0, 3, 2, 1), (4, 5, 6, 7),
                (1, 2, 6, 5), (3, 0, 4, 7),
                (0, 1, 5, 4), (2, 3, 7, 6),
            ]
            for f in faces:
                bm.faces.new([vs[k] for k in f])
        self._xform(verts_all, center_tx, rot_tx)

    def add_chevron(self, mat_key, center_tx, width=1.6, length=1.0, thick=0.014, yaw_y=0.0, pitch_x=0.0):
        arm_len = width * 0.56
        arm_w = width * 0.22
        rm = Euler((pitch_x, yaw_y, 0.0), "XYZ").to_matrix().to_4x4()
        for side in (-1, 1):
            lp = rm @ Vector((side * width * 0.24, 0.0, -length * 0.12))
            self.add_box(
                mat_key,
                (center_tx[0] + lp.x, center_tx[1] + lp.y, center_tx[2] + lp.z),
                (arm_len, thick, arm_w),
                rot_tx=(pitch_x, yaw_y + side * 0.72, 0.0),
            )

    def finalize(self, collection, prefix="L2"):
        uv_scale = {
            "concrete": 0.18, "wood": 0.36, "teal": 0.24, "rust": 0.24,
            "heavy": 0.28, "hazard": 0.55, "rubber": 0.5, "glow": 0.3,
        }
        objs = []
        for key, bm in self.bms.items():
            if len(bm.verts) == 0:
                bm.free()
                continue
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            uv_layer = bm.loops.layers.uv.new("UVMap")
            sc = uv_scale.get(key, 0.25)
            for face in bm.faces:
                n = face.normal
                ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
                for loop in face.loops:
                    co = loop.vert.co
                    if az >= ax and az >= ay:
                        u, v = co.x * sc, co.y * sc
                    elif ax >= ay:
                        u, v = co.y * sc, co.z * sc
                    else:
                        u, v = co.x * sc, co.z * sc
                    loop[uv_layer].uv = (u, v)
            bmesh.ops.triangulate(bm, faces=bm.faces)
            mesh = bpy.data.meshes.new(f"{prefix}_{key}")
            bm.to_mesh(mesh)
            bm.free()
            mesh.materials.append(self.mats[key])
            obj = bpy.data.objects.new(f"{prefix}_{key}", mesh)
            collection.objects.link(obj)
            objs.append(obj)
        return objs


# ---------------------------------------------------------------------------
# 1. ESCENARIO NIVEL 2: EL CALLEJÓN DE LOS AUTOS (SIN AUTOS ADENTRO)
# ---------------------------------------------------------------------------

def build_level2_scenario(b: BucketBuilder):
    # =========================================================================
    # BAHÍA DE ARMADO (24 x 14 m, z = -1..13, tope EXACTO en y = 0)
    # =========================================================================
    b.add_box("concrete", (0, -6.5, 6.0), (24.0, 13.0, 14.0))
    # Pista pintada 11 x 8 m centrada en (0, 0, 6) — altura 1.2 cm (< 3 cm)
    b.add_box("hazard", (0, 0.006, 2.15), (11.0, 0.012, 0.34))
    b.add_box("hazard", (0, 0.006, 9.85), (11.0, 0.012, 0.34))
    b.add_box("hazard", (-5.33, 0.006, 6.0), (0.34, 0.012, 7.4))
    b.add_box("hazard", (5.33, 0.006, 6.0), (0.34, 0.012, 7.4))
    b.add_chevron("hazard", (0, 0.008, 11.4), width=2.2, length=1.2, thick=0.012)

    # Muretes perimetrales de la bahía (alineados con colliders x=±11.8 y z=-0.8)
    for side in (-1, 1):
        b.add_box("wood", (side * 11.8, 0.52, 6.0), (0.36, 1.04, 13.8), bevel=0.04)
        for z in (-0.5, 3.0, 6.5, 10.0, 12.7):
            b.add_box("heavy", (side * 11.8, 0.62, z), (0.46, 1.24, 0.44), bevel=0.03)
    b.add_box("wood", (0, 0.52, -0.8), (23.8, 1.04, 0.36), bevel=0.04)
    for x in (-9, -4.5, 0, 4.5, 9):
        b.add_box("heavy", (x, 0.62, -0.8), (0.44, 1.24, 0.46), bevel=0.03)

    # Banco de herramientas (izq) y estante con piezas (der), fuera de la pista de 11 m
    b.add_box("wood", (-9.4, 0.92, 4.2), (1.4, 0.14, 4.2), bevel=0.03)
    for dz in (-1.8, 0.0, 1.8):
        b.add_box("heavy", (-9.9, 0.44, 4.2 + dz), (0.16, 0.88, 0.16))
        b.add_box("heavy", (-8.9, 0.44, 4.2 + dz), (0.16, 0.88, 0.16))
    b.add_box("wood", (-10.1, 1.65, 4.2), (0.12, 1.3, 4.0), bevel=0.02)
    b.add_box("teal", (-9.4, 1.15, 3.0), (0.65, 0.34, 0.85), bevel=0.03)
    b.add_box("heavy", (-9.3, 1.12, 5.1), (0.55, 0.28, 0.72), bevel=0.03)

    b.add_box("heavy", (9.6, 1.5, 4.6), (1.3, 0.1, 5.0))
    b.add_box("heavy", (9.6, 2.6, 4.6), (1.3, 0.1, 5.0))
    b.add_box("wood", (9.6, 0.55, 4.6), (1.3, 0.1, 5.0))
    for dz in (-2.4, 0.0, 2.4):
        for dx in (-0.58, 0.58):
            b.add_box("heavy", (9.6 + dx, 1.55, 4.6 + dz), (0.12, 3.1, 0.12))
    b.add_box("wood", (9.5, 0.96, 3.1), (0.72, 0.72, 0.72), bevel=0.04)
    b.add_cylinder("teal", (9.5, 1.95, 3.5), 0.26, 0.26, 0.78, segs=10)
    b.add_cylinder("rubber", (9.5, 2.98, 5.6), 0.38, 0.38, 0.26, segs=12, rot_tx=(0, 0, math.pi / 2))

    # Faroles de la bahía
    for lx, lz in ((-10.6, 1.5), (-10.6, 8.8), (10.6, 1.5), (10.6, 8.8)):
        b.add_cylinder("heavy", (lx, 2.0, lz), 0.1, 0.14, 4.0, segs=8)
        b.add_box("heavy", (lx + (-0.55 if lx > 0 else 0.55), 3.85, lz), (1.1, 0.14, 0.16))
        b.add_box("glow", (lx + (-0.95 if lx > 0 else 0.95), 3.62, lz), (0.38, 0.28, 0.38), bevel=0.04)

    # Hombros de cierre entre la bahía (24 m) y la boca del callejón (17 m, z = 13..14)
    b.add_box("heavy", (-10.75, 3.0, 13.5), (3.5, 6.0, 1.0), bevel=0.05)
    b.add_box("heavy", (10.75, 3.0, 13.5), (3.5, 6.0, 1.0), bevel=0.05)
    # Cartel sin texto en la boca del callejón (x = +6.6, z = 12.1): ícono de impacto / flecha
    b.add_box("wood", (6.2, 1.1, 12.2), (0.18, 2.2, 0.18))
    b.add_box("wood", (7.8, 1.1, 12.2), (0.18, 2.2, 0.18))
    b.add_box("wood", (7.0, 2.05, 12.2), (2.1, 1.15, 0.16), bevel=0.04)
    b.add_box("hazard", (7.0, 2.05, 12.10), (1.4, 0.24, 0.05))
    b.add_box("hazard", (7.4, 2.05, 12.10), (0.45, 0.45, 0.05), rot_tx=(0, 0, math.pi / 4))

    # =========================================================================
    # CALLEJÓN (z = 13..98, ANCHO EXACTO 17 m, x = -8.5..+8.5, tope en y = 0)
    # =========================================================================
    b.add_box("concrete", (0, -3.5, 55.5), (17.0, 7.0, 85.0))
    # Líneas guía sutiles a los costados del callejón (y = +0.006)
    b.add_box("hazard", (-8.15, 0.006, 55.5), (0.24, 0.012, 83.0))
    b.add_box("hazard", (8.15, 0.006, 55.5), (0.24, 0.012, 83.0))

    # ZONA BARRERA A (LIVIANA, z = 33..41): libre de arte sólido, marcada sutil y abierta
    b.add_box("hazard", (0, 0.006, 32.8), (15.6, 0.012, 0.26))
    b.add_box("hazard", (0, 0.006, 41.2), (15.6, 0.012, 0.26))
    b.add_chevron("hazard", (0, 0.008, 29.0), width=2.4, length=1.2, thick=0.012)
    # Postes livianos de señalización en las paredes de Barrera A
    for side in (-1, 1):
        b.add_box("hazard", (side * 8.42, 2.8, 33.0), (0.16, 5.2, 0.32))
        b.add_box("glow", (side * 8.35, 5.5, 37.0), (0.26, 0.26, 0.55), bevel=0.03)

    # ZONA CHECKPOINT 1 (z = 50): hueco limpio entre barreras con flechas hacia Barrera B
    b.add_chevron("hazard", (0, 0.008, 53.5), width=2.6, length=1.3, thick=0.012)

    # ZONA BARRERA B (PESADA, z = 60..70): libre de arte sólido, pero marco visual
    # claramente más grueso, oscuro e imponente que Barrera A!
    b.add_box("hazard", (0, 0.007, 59.5), (16.4, 0.014, 0.72))
    b.add_box("hazard", (0, 0.007, 70.5), (16.4, 0.014, 0.72))
    # Doble pórtico metálico pesado a 6.4 m de alto (por encima de la pila de 4.5 m y libre el paso!)
    for pz in (59.5, 70.5):
        for side in (-1, 1):
            b.add_box("heavy", (side * 8.35, 3.2, pz), (0.65, 6.4, 0.85), bevel=0.04)
            b.add_box("hazard", (side * 8.20, 1.2, pz - 0.44), (0.35, 2.4, 0.08))
        b.add_box("heavy", (0, 6.55, pz), (18.2, 0.95, 0.95), bevel=0.05)
        b.add_box("hazard", (0, 6.55, pz - 0.50), (16.0, 0.42, 0.08))
        for gx in (-5.5, 0.0, 5.5):
            b.add_box("glow", (gx, 6.0, pz - 0.42), (0.55, 0.28, 0.28), bevel=0.03)

    # =========================================================================
    # PAREDES LATERALES DE 6 m (x = ±9.0, caras interiores en x = ±8.5, z = 13..98)
    # Hechas de contenedores apilados de 3 m + 3 m, torres de neumáticos y barriles
    # =========================================================================
    cont_len = 8.4
    for i in range(10):
        zc = 17.3 + i * 8.5
        is_heavy_zone = 56.0 <= zc <= 74.0
        # Nivel inferior (y = 0..3) y nivel superior (y = 3..6) en ambos lados
        for side in (-1, 1):
            # En la zona de Barrera B las paredes son más oscuras y pesadas (acero blindado)
            if is_heavy_zone:
                mat_bot = "heavy"
                mat_top = "heavy" if i % 2 == 0 else "rust"
            else:
                mat_bot = "teal" if (i + (1 if side > 0 else 0)) % 2 == 0 else "rust"
                mat_top = "rust" if mat_bot == "teal" else "teal"
            # Contenedor base (cara interior exactamente en x = ±8.5, grosor 2.4 m hacia afuera)
            b.add_box(mat_bot, (side * 9.7, 1.5, zc), (2.4, 2.96, cont_len), bevel=0.05)
            # Contenedor superior ligeramente desfasado hacia afuera para silueta orgánica
            out_shift = 0.12 if (i % 2 == 0) else 0.0
            b.add_box(mat_top, (side * (9.7 + out_shift), 4.5, zc), (2.4, 2.96, cont_len), bevel=0.05)
            # Costillas / refuerzos verticales entre contenedores
            b.add_box("heavy", (side * 8.52, 3.0, zc - cont_len * 0.5), (0.22, 6.0, 0.26))

            # Decoración sobre el tope de las paredes (y > 6 m): torres de neumáticos, barriles, chapas
            # En lado izquierdo dejamos libre el sector del ramal de Tuerca Dorada (z = 86..94)
            if side == 1 or zc < 82.0:
                if i % 3 == 0:
                    # Torre de neumáticos apilados sobre el contenedor
                    for t_idx in range(3):
                        b.add_cylinder("rubber", (side * 9.6, 6.22 + t_idx * 0.42, zc - 1.5), 0.52, 0.52, 0.36, segs=12)
                elif i % 3 == 1:
                    # Grupo de bidones y caja arriba
                    b.add_cylinder("teal", (side * 9.5, 6.45, zc + 1.2), 0.34, 0.34, 0.9, segs=10)
                    b.add_cylinder("rust", (side * 10.2, 6.45, zc + 1.8), 0.34, 0.34, 0.9, segs=10)
                else:
                    # Chapa inclinada / silueta de chatarra en la cresta
                    b.add_box("rust", (side * 9.9, 6.55, zc), (1.4, 1.1, 3.2), rot_tx=(0.06, 0.14 * side, 0.08 * side), bevel=0.04)

    # =========================================================================
    # RUTA A PIE ELEVADA (alineada <= 1 cm con colliders de ExpeditionLevels.tsx!)
    # Up ramp: pos=[-7, 2.26, 21.58], size=[3, 0.5, UP_LEN], rotX=-UP_RAMP_ANGLE
    # Catwalk: pos=[-7, 4.75, 58],    size=[3, 0.5, 56]     (tope y=5.0, z=30..86)
    # Down ramp: pos=[-7, 2.27, 91.90], size=[3, 0.5, DOWN_LEN], rotX=+DOWN_RAMP_ANGLE
    # =========================================================================
    # Rampa de acceso (sube de z=13, y=0 hasta z=30, y=5)
    b.add_box("wood", (CATWALK_X, CATWALK_Y * 0.5 - 0.24, 21.58), (3.0, 0.44, UP_LEN), rot_tx=(-UP_RAMP_ANGLE, 0, 0))
    # Pasarela principal (z=30..86, x=-8.5..-5.5, tope EXACTO en y=5.0)
    b.add_box("wood", (CATWALK_X, CATWALK_Y - 0.21, 58.0), (3.0, 0.42, 56.0))
    # Vigas metálicas bajo la pasarela (libres por encima de Barrera B!)
    b.add_box("heavy", (CATWALK_X - 1.32, CATWALK_Y - 0.34, 58.0), (0.18, 0.26, 56.0))
    b.add_box("heavy", (CATWALK_X + 1.32, CATWALK_Y - 0.34, 58.0), (0.18, 0.26, 56.0))
    # Rampa de bajada al final del callejón (baja de z=86, y=5 hasta z=98, y=0)
    b.add_box("wood", (CATWALK_X, CATWALK_Y * 0.5 - 0.23, 91.90), (3.0, 0.44, DOWN_LEN), rot_tx=(DOWN_RAMP_ANGLE, 0, 0))

    # Baranda interior (lado del callejón x = -5.58) y postes + faroles a lo largo de la pasarela
    b.add_box("heavy", (-5.58, CATWALK_Y + 0.96, 58.0), (0.12, 0.12, 56.0))
    b.add_box("wood", (-5.58, CATWALK_Y + 0.52, 58.0), (0.10, 0.10, 56.0))
    for k in range(11):
        pz = 31.0 + k * 5.4
        b.add_box("heavy", (-5.58, CATWALK_Y + 0.52, pz), (0.16, 1.06, 0.16))
        # Ménsulas diagonales fijadas a la pared izquierda (despejadas sobre la 3ra fila de Barrera B!)
        b.add_box("heavy", (-8.05, CATWALK_Y - 0.52, pz), (1.05, 0.20, 0.20), rot_tx=(0, 0, 0.52))
        if k % 2 == 0:
            b.add_box("heavy", (-5.58, CATWALK_Y + 1.48, pz), (0.12, 0.95, 0.12))
            b.add_box("glow", (-5.58, CATWALK_Y + 2.02, pz), (0.28, 0.28, 0.28), bevel=0.03)
        if k < 10:
            b.add_chevron("hazard", (CATWALK_X, CATWALK_Y + 0.012, pz + 2.5), width=1.4, length=0.8, thick=0.012)

    # Barandas y flechas sobre la rampa de subida y la de bajada
    for r_cz, r_len, pitch, y_off in (
        (21.58, UP_LEN, -UP_RAMP_ANGLE, CATWALK_Y * 0.5),
        (91.90, DOWN_LEN, DOWN_RAMP_ANGLE, CATWALK_Y * 0.5),
    ):
        b.add_box("heavy", (-5.58, y_off + 0.95, r_cz), (0.12, 0.12, r_len - 0.5), rot_tx=(pitch, 0, 0))
        b.add_box("wood", (-5.58, y_off + 0.50, r_cz), (0.10, 0.10, r_len - 0.5), rot_tx=(pitch, 0, 0))
        for t in (-0.32, 0.0, 0.32):
            cos_a, sin_a = math.cos(pitch), math.sin(pitch)
            lz = t * r_len
            # En Three.js: rotX(pitch) mueve (0, 0, lz) a y' = -lz*sin(pitch), z' = lz*cos(pitch)
            py = y_off - lz * sin_a
            pz = r_cz + lz * cos_a
            b.add_box("heavy", (-5.58, py + 0.52, pz), (0.16, 1.05, 0.16))
            ny = 0.025 * cos_a
            nz = 0.025 * sin_a
            b.add_chevron("hazard", (CATWALK_X, py + ny, pz + nz), width=1.4, length=0.85, thick=0.012, pitch_x=pitch)

    # Ramal decorativo de Tuerca Dorada sobre el contenedor izquierdo (x = -9.5, y = 6.0, z = 90)
    b.add_box("wood", (-9.5, 6.06, 90.0), (2.4, 0.14, 4.4), bevel=0.02)
    b.add_cylinder("hazard", (-9.5, 6.18, 90.0), 0.95, 1.15, 0.14, segs=6)
    b.add_box("heavy", (-10.6, 6.9, 90.0), (0.14, 1.6, 0.14))
    b.add_box("glow", (-10.6, 7.75, 90.0), (0.28, 0.28, 0.28), bevel=0.03)

    # =========================================================================
    # PORTÓN DEL TALLER (META en z = 96, 8 m de ancho) + TUERCA GIGANTE LUMINOSA
    # Visible desde la bahía a 90 m por encima de ambas barreras!
    # =========================================================================
    # Muro de cierre al fondo (z = 98.5, alineado con collider)
    b.add_box("heavy", (0, 3.0, 98.5), (17.0, 6.0, 1.0))
    # Portón corredizo de taller de 8 m de ancho × 5.4 m de alto (z = 97.8, delante del muro)
    b.add_box("rust", (0, 2.7, 97.85), (8.0, 5.4, 0.36), bevel=0.04)
    # Relieves verticales del portón corredizo + franja de advertencia inferior
    for gx in (-3.2, -1.6, 0.0, 1.6, 3.2):
        b.add_box("heavy", (gx, 2.7, 97.62), (0.18, 5.1, 0.12))
    b.add_box("hazard", (0, 0.55, 97.62), (7.8, 0.85, 0.10))
    # Riel corredizo superior + columnas gruesas del portón (enmarcando los 8 m)
    for side in (-1, 1):
        b.add_box("heavy", (side * 4.45, 3.6, 97.5), (0.9, 7.2, 1.1), bevel=0.05)
        b.add_box("hazard", (side * 4.45, 1.1, 96.92), (0.72, 2.1, 0.08))
    b.add_box("heavy", (0, 7.35, 97.5), (11.6, 1.1, 1.2), bevel=0.06)
    b.add_box("hazard", (0, 7.35, 96.88), (10.2, 0.52, 0.08))
    # Pedestal + TUERCA GIGANTE LUMINOSA arriba del portón (centro en y = 11.4, radio 2.9 m -> visible a 95 m!)
    b.add_box("heavy", (-1.6, 8.6, 97.4), (0.45, 1.8, 0.45))
    b.add_box("heavy", (1.6, 8.6, 97.4), (0.45, 1.8, 0.45))
    b.add_hex_nut("glow", (0, 11.4, 97.3), outer_r=3.0, inner_r=1.45, depth=0.75)
    b.add_hex_nut("heavy", (0, 11.4, 97.8), outer_r=3.25, inner_r=1.35, depth=0.35)
    # Flechas de llegada en el suelo frente al portón
    b.add_chevron("hazard", (0, 0.008, 86.0), width=2.8, length=1.4, thick=0.012)
    b.add_chevron("hazard", (0, 0.008, 91.5), width=2.8, length=1.4, thick=0.012)


def add_level2_empties(collection):
    """8 Empties exactos pedidos por el contrato del Nivel 2."""
    specs = {
        "spawn": (0.0, 1.8, 4.0),
        "bay": (0.0, 0.0, 6.0),
        "checkpoint_1": (0.0, 1.8, 50.0),
        "checkpoint_2": (0.0, 1.8, 80.0),
        "goal": (0.0, 1.6, 96.0),
        "golden_nut": (-9.5, 7.2, 90.0),
        "barrier_a_origin": (0.0, 0.0, 37.0),
        "barrier_b_origin": (0.0, 0.0, 65.0),
    }
    out = []
    for name, pos in specs.items():
        emp = bpy.data.objects.new(name, None)
        emp.empty_display_type = "PLAIN_AXES"
        emp.empty_display_size = 1.2
        emp.location = tx_to_bl(*pos)
        collection.objects.link(emp)
        out.append(emp)
    return out


# ---------------------------------------------------------------------------
# 2. AUTOS APLASTADOS MODULARES (4 carrocerías × [normal, weak-X, chunks])
#    Cada auto: 4.2 x 1.5 x 1.9 m (X, Y, Z), origen (0,0,0), 1 material, 512 px, <= 1500 tris
# ---------------------------------------------------------------------------

CAR_PALETTE = {
    "sedan":  (0.71, 0.33, 0.23),  # terracota óxido gastado
    "van":    (0.77, 0.56, 0.25),  # ocre mostaza apagado
    "pickup": (0.49, 0.56, 0.39),  # verde oliva desguace
    "wagon":  (0.43, 0.51, 0.58),  # azul pizarra desteñido
}


def make_car_atlas_texture(variant, weak=False):
    """
    Atlas 512x512 único por carrocería (1 material por auto!).
    Regiones UV (u, v en [0, 1]):
      - [0.00..0.50, 0.50..1.00]: Pintura principal gastada con manchas de óxido (si weak: X amarilla gigante!)
      - [0.50..1.00, 0.50..1.00]: Techo / capó gastado (si weak: X amarilla gigante!)
      - [0.00..0.50, 0.00..0.50]: Vidrios oscuros sucios / marcos
      - [0.50..1.00, 0.00..0.50]: Paragolpes / chasis / ruedas oscuras oxidadas
    """
    S = 512
    H = S // 2
    n = fbm_grid(S, S, seed=200 + CAR_VARIANTS.index(variant) * 13 + (7 if weak else 0), octaves=(4, 10, 24, 48))
    rgb = np.zeros((S, S, 4), dtype=np.float32)
    base = np.array(CAR_PALETTE[variant], dtype=np.float32)
    rust = np.array([0.46, 0.22, 0.12], dtype=np.float32)
    # Si es variante weak (Barrera B pesada), tono base ligeramente más oscuro y pesado para contraste!
    if weak:
        base = base * 0.72
    rmask = np.clip((n - 0.54) * 3.0, 0.0, 0.72)

    # Cuadrante superior izquierdo (laterales) y superior derecho (techo/capó)
    for c in range(3):
        paint = base[c] * (1 - rmask) + rust[c] * rmask + (n - 0.5) * 0.08
        rgb[0:H, :, c] = np.clip(paint[0:H, :], 0.05, 0.94)

    # Cuadrante inferior izquierdo: vidrio sucio oscuro (#232c30)
    glass = np.array([0.16, 0.21, 0.23], dtype=np.float32)
    for c in range(3):
        rgb[H:S, 0:H, c] = np.clip(glass[c] + (n[H:S, 0:H] - 0.5) * 0.08, 0.04, 0.45)

    # Cuadrante inferior derecho: metal oscuro / paragolpes / ruedas (#262528)
    metal = np.array([0.20, 0.19, 0.20], dtype=np.float32)
    for c in range(3):
        mval = metal[c] * (1 - rmask[H:S, H:S] * 0.6) + rust[c] * (rmask[H:S, H:S] * 0.6)
        rgb[H:S, H:S, c] = np.clip(mval, 0.04, 0.55)

    # Si es variante débil (`weak`): pintar una X AMARILLA GIGANTE en ambos cuadrantes de carrocería!
    if weak:
        yel = np.array([0.98, 0.79, 0.15], dtype=np.float32)
        yy, xx = np.mgrid[0:H, 0:H].astype(np.float32) / float(H)
        # Dos diagonales gruesas con ligero desgaste en bordes
        d1 = np.abs(xx - yy)
        d2 = np.abs(xx + yy - 1.0)
        margin = (xx > 0.08) & (xx < 0.92) & (yy > 0.08) & (yy < 0.92)
        x_mask = (((d1 < 0.115) | (d2 < 0.115)) & margin).astype(np.float32)
        # Aplicar X amarilla en lateral (0..H, 0..H) y en techo (0..H, H..S)
        for qx in (0, H):
            for c in range(3):
                patch = rgb[0:H, qx:qx + H, c]
                rgb[0:H, qx:qx + H, c] = patch * (1.0 - x_mask) + yel[c] * x_mask

    rgb[:, :, 3] = 1.0
    tag = f"car_weak_{variant}" if weak else f"car_{variant}"
    return make_image(tag, rgb)


def add_car_box(bm, uv_layer, center_tx, size_tx, uv_quad, rot_tx=(0.0, 0.0, 0.0), bevel=0.04, taper_top_x=1.0, taper_top_z=1.0):
    """
    Agrega una subpieza de auto con UV mapeado limpiamente dentro del cuadrante `uv_quad`:
      'side'   -> u [0.02..0.48], v [0.52..0.98]
      'top'    -> u [0.52..0.98], v [0.52..0.98]
      'glass'  -> u [0.02..0.48], v [0.02..0.48]
      'dark'   -> u [0.52..0.98], v [0.02..0.48]
    """
    sx, sy, sz = size_tx
    res = bmesh.ops.create_cube(bm, size=1.0)
    verts = res["verts"]
    for v in verts:
        is_top = v.co.y > 0
        v.co.x *= sx * (taper_top_x if is_top else 1.0)
        v.co.y *= sy
        v.co.z *= sz * (taper_top_z if is_top else 1.0)
    if bevel > 0.0:
        edges = list({e for v in verts for e in v.link_edges})
        bres = bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect="EDGES", clamp_overlap=True)
        verts = [v for v in ({v for f in bres["faces"] for v in f.verts} | set(bres["verts"]) | set(verts)) if v.is_valid]

    # Guardar coords locales normalizadas [0..1] para UV antes de transformar
    min_x = min(v.co.x for v in verts)
    max_x = max(v.co.x for v in verts)
    min_y = min(v.co.y for v in verts)
    max_y = max(v.co.y for v in verts)
    min_z = min(v.co.z for v in verts)
    max_z = max(v.co.z for v in verts)
    dx = max(max_x - min_x, 1e-4)
    dy = max(max_y - min_y, 1e-4)
    dz = max(max_z - min_z, 1e-4)
    local_uv_coords = {v: ((v.co.x - min_x) / dx, (v.co.y - min_y) / dy, (v.co.z - min_z) / dz) for v in verts}

    quads = {
        "side":  (0.02, 0.48, 0.52, 0.98),
        "top":   (0.52, 0.98, 0.52, 0.98),
        "glass": (0.02, 0.48, 0.02, 0.48),
        "dark":  (0.52, 0.98, 0.02, 0.48),
    }
    u0, u1, v0, v1 = quads[uv_quad]

    faces = list({f for v in verts for f in v.link_faces})
    # Transformar a Blender
    rm = Euler(rot_tx, "XYZ").to_matrix().to_4x4()
    cx, cy, cz = center_tx
    for v in verts:
        p = rm @ v.co
        v.co = tx_to_bl(p.x + cx, p.y + cy, p.z + cz)

    for f in faces:
        if not f.is_valid:
            continue
        f.normal_update()
        nx, ny, nz = abs(f.normal.x), abs(f.normal.y), abs(f.normal.z)
        for loop in f.loops:
            lx, ly, lz = local_uv_coords[loop.vert]
            # En Blender: Z es Y-ThreeJS (arriba), Y es -Z-ThreeJS (costado)
            if nz >= nx and nz >= ny:
                lu, lv = lx, lz
            elif ny >= nx:
                lu, lv = lx, ly
            else:
                lu, lv = lz, ly
            loop[uv_layer].uv = (u0 + lu * (u1 - u0), v0 + lv * (v1 - v0))


def build_car_mesh(variant, mat, name):
    """
    Construye una carrocería estilizada aplastada dentro de la caja exacta 4.2 x 1.5 x 1.9 m
    con origen en (0, 0, 0). Ultra liviana (~350-550 tris) para instanciar 50 autos en iPhone 11!
    """
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")

    # Chasis / bajos + paragolpes delantero y trasero (caja total max: x ±2.10, y ±0.75, z ±0.95)
    add_car_box(bm, uv, (0.0, -0.52, 0.0), (4.06, 0.36, 1.76), "dark", bevel=0.04)
    add_car_box(bm, uv, (2.02, -0.42, 0.0), (0.16, 0.24, 1.84), "dark", bevel=0.03)
    add_car_box(bm, uv, (-2.02, -0.42, 0.0), (0.16, 0.24, 1.84), "dark", bevel=0.03)

    # 4 Huecos / ruedas aplastadas estilizadas (octogonales / cajas biseladas para ultra bajo poly)
    for wx in (-1.28, 1.28):
        for wz in (-0.82, 0.82):
            add_car_box(bm, uv, (wx, -0.50, wz), (0.64, 0.48, 0.22), "dark", bevel=0.08)

    if variant == "sedan":
        # Cuerpo principal + cabina clásica centrada atrás
        add_car_box(bm, uv, (0.0, -0.14, 0.0), (4.02, 0.62, 1.82), "side", bevel=0.06, taper_top_z=0.96)
        add_car_box(bm, uv, (-0.18, 0.44, 0.0), (2.05, 0.60, 1.60), "top", bevel=0.07, taper_top_x=0.76, taper_top_z=0.84)
        # Bandas de vidrio
        add_car_box(bm, uv, (-0.18, 0.42, 0.0), (1.76, 0.36, 1.63), "glass", bevel=0.02, taper_top_x=0.80)
        add_car_box(bm, uv, (-0.18, 0.42, 0.0), (2.08, 0.34, 1.36), "glass", bevel=0.02, taper_top_x=0.78)
    elif variant == "van":
        # Furgoneta cuadrada alta con frente corto
        add_car_box(bm, uv, (0.0, -0.12, 0.0), (4.06, 0.68, 1.84), "side", bevel=0.06)
        add_car_box(bm, uv, (-0.15, 0.44, 0.0), (3.55, 0.60, 1.72), "top", bevel=0.08, taper_top_x=0.92, taper_top_z=0.90)
        # Parabrisas delantero + ventanillas laterales delanteras
        add_car_box(bm, uv, (1.58, 0.40, 0.0), (0.36, 0.40, 1.48), "glass", bevel=0.02)
        add_car_box(bm, uv, (0.95, 0.40, 0.0), (0.95, 0.36, 1.75), "glass", bevel=0.02)
    elif variant == "pickup":
        # Camioneta con cabina adelante y caja trasera abierta
        add_car_box(bm, uv, (0.0, -0.14, 0.0), (4.04, 0.62, 1.82), "side", bevel=0.06)
        # Cabina delantera
        add_car_box(bm, uv, (0.35, 0.44, 0.0), (1.42, 0.60, 1.62), "top", bevel=0.07, taper_top_x=0.84, taper_top_z=0.88)
        add_car_box(bm, uv, (0.35, 0.42, 0.0), (1.18, 0.36, 1.65), "glass", bevel=0.02)
        add_car_box(bm, uv, (0.35, 0.42, 0.0), (1.45, 0.34, 1.38), "glass", bevel=0.02)
        # Caja de carga trasera (hueco oscuro interior)
        add_car_box(bm, uv, (-1.18, 0.16, 0.0), (1.42, 0.14, 1.54), "dark", bevel=0.02)
    else:  # wagon
        # Rural larga con techo extendido hacia atrás
        add_car_box(bm, uv, (0.0, -0.14, 0.0), (4.06, 0.62, 1.82), "side", bevel=0.06, taper_top_z=0.96)
        add_car_box(bm, uv, (-0.42, 0.44, 0.0), (2.75, 0.60, 1.62), "top", bevel=0.07, taper_top_x=0.86, taper_top_z=0.86)
        add_car_box(bm, uv, (-0.42, 0.42, 0.0), (2.42, 0.36, 1.65), "glass", bevel=0.02, taper_top_x=0.88)
        add_car_box(bm, uv, (-0.42, 0.42, 0.0), (2.78, 0.34, 1.38), "glass", bevel=0.02, taper_top_x=0.86)

    # Parrilla delantera oscura
    add_car_box(bm, uv, (2.01, -0.14, 0.0), (0.08, 0.32, 1.24), "dark", bevel=0.01)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    return obj


def build_car_chunks_objects(variant, mat):
    """
    4 trozos separados (roof, hood, door, chassis), cada uno con su origen en (0, 0, 0)
    y medidas coincidentes con CAR_CHUNKS en src/modes/carBarriers.ts:
      - roof:    [3.6, 0.35, 1.7]
      - hood:    [1.2, 0.50, 1.8]
      - door:    [1.6, 0.90, 0.2]
      - chassis: [3.8, 0.40, 1.6]
    """
    specs = [
        ("roof",    (3.4, 0.30, 1.62), "top",  0.05),
        ("hood",    (1.18, 0.44, 1.74), "side", 0.05),
        ("door",    (1.56, 0.84, 0.18), "side", 0.03),
        ("chassis", (3.76, 0.36, 1.56), "dark", 0.04),
    ]
    objs = []
    for part_name, size, quad, bev in specs:
        bm = bmesh.new()
        uv = bm.loops.layers.uv.new("UVMap")
        add_car_box(bm, uv, (0.0, 0.0, 0.0), size, quad, bevel=bev)
        if part_name == "door":
            # Ventanilla oscura en la mitad superior de la puerta
            add_car_box(bm, uv, (0.0, 0.18, 0.0), (1.12, 0.32, 0.20), "glass", bevel=0.01)
        elif part_name == "roof" and variant in ("van", "wagon"):
            # Barras de portaequipaje sobre el techo
            add_car_box(bm, uv, (-0.9, 0.16, 0.0), (0.14, 0.06, 1.48), "dark", bevel=0.01)
            add_car_box(bm, uv, (0.9, 0.16, 0.0), (0.14, 0.06, 1.48), "dark", bevel=0.01)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        mesh = bpy.data.meshes.new(f"{variant}_{part_name}")
        bm.to_mesh(mesh)
        bm.free()
        mesh.materials.append(mat)
        obj = bpy.data.objects.new(part_name, mesh)
        objs.append(obj)
    return objs


def export_glb_objects(objects, filepath):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    kwargs = dict(
        filepath=filepath,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="WEBP",
        export_image_quality=84,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_animations=False,
    )
    try:
        bpy.ops.export_scene.gltf(export_vertex_color="NONE", **kwargs)
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs)


def build_all_cars():
    """Genera los 12 archivos GLB de autos y guarda art/levels/cars-pack.blend."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    os.makedirs(CARS_DIR, exist_ok=True)

    car_reports = []
    preview_meshes = {}

    for v in CAR_VARIANTS:
        img_std = make_car_atlas_texture(v, weak=False)
        mat_std = make_mat(f"M_Car_{v.capitalize()}", img_std, rough=0.78, metal=0.26)
        img_wk = make_car_atlas_texture(v, weak=True)
        mat_wk = make_mat(f"M_CarWeak_{v.capitalize()}", img_wk, rough=0.80, metal=0.28)

        # 1. Carrocería entera
        obj = build_car_mesh(v, mat_std, f"car_{v}")
        scene.collection.objects.link(obj)
        p_std = os.path.join(CARS_DIR, f"car-{v}.glb")
        export_glb_objects([obj], p_std)
        obj.data.calc_loop_triangles()
        car_reports.append((f"car-{v}.glb", len(obj.data.loop_triangles), os.path.getsize(p_std)))
        preview_meshes[(v, False)] = obj

        # 2. Variante débil con X amarilla
        obj_w = build_car_mesh(v, mat_wk, f"car_weak_{v}")
        scene.collection.objects.link(obj_w)
        p_wk = os.path.join(CARS_DIR, f"car-weak-{v}.glb")
        export_glb_objects([obj_w], p_wk)
        obj_w.data.calc_loop_triangles()
        car_reports.append((f"car-weak-{v}.glb", len(obj_w.data.loop_triangles), os.path.getsize(p_wk)))
        preview_meshes[(v, True)] = obj_w

        # 3. Trozos separados (4 objetos, cada uno centrado en su propio origen (0,0,0))
        chunks = build_car_chunks_objects(v, mat_std)
        for ch in chunks:
            scene.collection.objects.link(ch)
        p_ch = os.path.join(CARS_DIR, f"car-chunks-{v}.glb")
        export_glb_objects(chunks, p_ch)
        ch_tris = 0
        for ch in chunks:
            ch.data.calc_loop_triangles()
            ch_tris += len(ch.data.loop_triangles)
            # Renombrar tras exportar para que el siguiente variante pueda usar roof/hood/door/chassis sin .001
            ch.name = f"{v}_{ch.name}"
        car_reports.append((f"car-chunks-{v}.glb", ch_tris, os.path.getsize(p_ch)))

        # Ordenar en grilla dentro del .blend de autoría + render de catálogo
        idx = CAR_VARIANTS.index(v)
        obj.location = tx_to_bl(idx * 5.2 - 7.8, 0.75, 0.0)
        obj_w.location = tx_to_bl(idx * 5.2 - 7.8, 0.75, -3.2)
        for ci, ch in enumerate(chunks):
            ch.location = tx_to_bl(idx * 5.2 - 7.8 + (ci - 1.5) * 1.15, 0.55, 3.0)

    # Render de catálogo de los 4 modelos + variantes X + trozos (level2_06_cars_lineup.png)
    render_cars_lineup_preview()
    bpy.ops.wm.save_as_mainfile(filepath=CARS_BLEND, relative_remap=True, compress=True)
    for fname, tris, sz in car_reports:
        print(f"[REPORT] {fname}: tris={tris} glb_bytes={sz}")


def setup_eevee_preview(scene):
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.film_transparent = False
    vts = [i.identifier for i in scene.view_settings.bl_rna.properties["view_transform"].enum_items]
    scene.view_settings.view_transform = "AgX" if "AgX" in vts else "Filmic"
    world = bpy.data.worlds.new("PreviewWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = hex_rgba("#d9a97c")
        bg.inputs["Strength"].default_value = 0.85
    sun_d = bpy.data.lights.new("PreviewSun", "SUN")
    sun_d.energy = 3.4
    sun_d.color = (1.0, 0.90, 0.76)
    sun_d.angle = math.radians(3.5)
    sun = bpy.data.objects.new("PreviewSun", sun_d)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), math.radians(14), math.radians(32))
    cam_d = bpy.data.cameras.new("PreviewCam")
    cam_d.clip_end = 400.0
    cam = bpy.data.objects.new("PreviewCam", cam_d)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return world, sun, cam, cam_d


def render_cars_lineup_preview():
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    scene = bpy.context.scene
    world, sun, cam, cam_d = setup_eevee_preview(scene)
    loc_bl = tx_to_bl(0.0, 9.2, -16.2)
    tgt_bl = tx_to_bl(0.0, 0.6, 0.0)
    cam.location = loc_bl
    cam.rotation_euler = (tgt_bl - loc_bl).to_track_quat("-Z", "Y").to_euler()
    cam_d.lens = 26
    scene.render.filepath = os.path.join(PREVIEW_DIR, "level2_06_cars_lineup.png")
    bpy.ops.render.render(write_still=True)
    for o in (sun, cam):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.worlds.remove(world)


def spawn_preview_barriers(scene):
    """
    Instancia temporalmente las pilas de autos de Barrera A (2x2) y Barrera B (3x3 más oscura con X)
    SOLO para los renders de control (nunca van dentro de level-2-autos.glb!).
    """
    temp_objs = []
    meshes_std = {}
    meshes_heavy = {}
    meshes_weak = {}
    for idx, v in enumerate(CAR_VARIANTS):
        img_s = make_car_atlas_texture(v, weak=False)
        mat_s = make_mat(f"PrevCar_{v}", img_s, rough=0.78, metal=0.26)
        meshes_std[idx] = build_car_mesh(v, mat_s, f"prev_std_{v}").data

        # Versión más oscura para Barrera B pesada (como CAR_COLORS_HEAVY en CarBarriers.tsx)
        mat_h = make_mat(f"PrevHeavy_{v}", img_s, rough=0.86, metal=0.35)
        bsdf = mat_h.node_tree.nodes.get("Principled BSDF")
        tex_n = next(n for n in mat_h.node_tree.nodes if n.type == "TEX_IMAGE")
        mix = mat_h.node_tree.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 0.55
        mix.inputs[7].default_value = (0.35, 0.30, 0.28, 1.0)
        mat_h.node_tree.links.new(tex_n.outputs["Color"], mix.inputs[6])
        mat_h.node_tree.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
        meshes_heavy[idx] = build_car_mesh(v, mat_h, f"prev_heavy_{v}").data

        img_w = make_car_atlas_texture(v, weak=True)
        mat_w = make_mat(f"PrevWeak_{v}", img_w, rough=0.80, metal=0.28)
        meshes_weak[idx] = build_car_mesh(v, mat_w, f"prev_weak_{v}").data

    w, h, d = CAR_SIZE
    gap = 0.02
    for z_center, rows, high, weak_every, is_heavy in (
        (37.0, 2, 2, 0, False),
        (65.0, 3, 3, 3, True),
    ):
        idx = 0
        for level in range(high):
            for row in range(rows):
                for col in range(4):
                    x = (col - 1.5) * (w + gap)
                    y = h * 0.5 + level * (h + gap)
                    z = z_center + (row - (rows - 1) * 0.5) * (d + gap)
                    weak = weak_every > 0 and idx % weak_every == 0
                    m = meshes_weak[idx % 4] if weak else (meshes_heavy[idx % 4] if is_heavy else meshes_std[idx % 4])
                    o = bpy.data.objects.new(f"prev_car_{z_center}_{idx}", m)
                    o.location = tx_to_bl(x, y, z)
                    scene.collection.objects.link(o)
                    temp_objs.append(o)
                    idx += 1
    return temp_objs


def build_level2():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    tex = generate_level_textures()
    mats = create_level_materials(tex)
    builder = BucketBuilder(mats)
    build_level2_scenario(builder)
    mesh_objs = builder.finalize(scene.collection, prefix="L2")
    empties = add_level2_empties(scene.collection)

    # Exportar SOLO el escenario + 8 empties (SIN autos!)
    export_glb_objects(mesh_objs + empties, LEVEL_GLB)
    bpy.ops.wm.save_as_mainfile(filepath=LEVEL_BLEND, relative_remap=True, compress=True)

    total_tris = 0
    total_verts = 0
    for o in mesh_objs:
        o.data.calc_loop_triangles()
        total_tris += len(o.data.loop_triangles)
        total_verts += len(o.data.vertices)
    print(
        f"[REPORT] level-2-autos: tris={total_tris} verts={total_verts} "
        f"materials={len(mats)} meshes={len(mesh_objs)} empties={len(empties)} "
        f"glb_bytes={os.path.getsize(LEVEL_GLB)}"
    )

    # Ahora instanciamos autos temporalmente SOLO para los 5 renders de control
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    temp_cars = spawn_preview_barriers(scene)
    world, sun, cam, cam_d = setup_eevee_preview(scene)

    def shoot(loc_tx, target_tx, lens, fname):
        loc_bl = tx_to_bl(*loc_tx)
        tgt_bl = tx_to_bl(*target_tx)
        cam.location = loc_bl
        cam.rotation_euler = (tgt_bl - loc_bl).to_track_quat("-Z", "Y").to_euler()
        cam_d.lens = lens
        scene.render.filepath = os.path.join(PREVIEW_DIR, fname)
        bpy.ops.render.render(write_still=True)

    # 1. Desde la bahía mirando el callejón tapado y la tuerca gigante luminosa al fondo
    shoot((0.0, 3.4, 1.5), (0.0, 3.2, 62.0), 26, "level2_01_from_bay.png")
    # 2. Panorámica aérea completa (bahía, callejón, ambas barreras, pasarela izquierda y portón)
    shoot((-26.0, 34.0, 6.0), (1.0, 1.5, 56.0), 24, "level2_02_aerial.png")
    # 3. Barrera A (liviana, 2x2)
    shoot((2.5, 3.2, 21.0), (0.0, 1.8, 37.0), 28, "level2_03_barrier_a.png")
    # 4. Barrera B (pesada, 3x3 oscura + X amarillas + pórtico blindado)
    shoot((2.2, 3.8, 48.0), (0.0, 2.6, 65.0), 28, "level2_04_barrier_b.png")
    # 5. Portón del taller con tuerca gigante luminosa + rampa de bajada a pie
    shoot((3.2, 6.2, 72.0), (-0.4, 6.2, 97.0), 25, "level2_05_goal_gate.png")

    for o in temp_cars + [sun, cam]:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.worlds.remove(world)


if __name__ == "__main__":
    build_all_cars()
    build_level2()
