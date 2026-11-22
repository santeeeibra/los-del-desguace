"""
Los del Desguace — Generador reproducible del arte 3D de Nivel 1: El Puente del Abismo.

Uso (Blender 5.2.3 LTS, sin interfaz):
    blender -b --factory-startup -P art/levels/build_level1_puente.py
    npx -y @gltf-transform/cli@4 quantize public/models/levels/level-1-puente.glb public/models/levels/level-1-puente.glb

Contrato con el código (docs/PEDIDO_ANTIGRAVITY_NIVELES.md & src/environment/ExpeditionLevels.tsx):
  - Coordenadas locales del nivel: origen (0,0,0), +Z hacia la meta, +Y arriba, metros.
  - Conversión Blender (Z-up) -> glTF/Three.js (Y-up): (tx, ty, tz) -> (tx, -tz, ty).
  - Superficies caminables/conducibles alineadas a <= 1 cm con los colliders físicos.
  - 6 Empties exactos: spawn, bay, checkpoint_1, checkpoint_2, goal, golden_nut.
  - Presupuesto: <= 60 000 tris, <= 8 materiales, texturas <= 1024 px WebP, GLB <= 6 MB, sin luces ni cámaras.
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
GLB_PATH = os.path.join(GLB_DIR, "level-1-puente.glb")
BLEND_PATH = os.path.join(ROOT, "level-1-puente.blend")

RAMP_ANGLE = math.atan2(12.0, 22.0)  # Exact match with ExpeditionLevels.tsx
rng = random.Random(20261122)


def tx_to_bl(x, y, z):
    """Convierte coordenadas Three.js (Y-up, +Z adelante) a Blender (Z-up, -Y adelante)."""
    return Vector((x, -z, y))


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h, a=1.0):
    h = h.lstrip("#")
    vals = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return (srgb_to_lin(vals[0]), srgb_to_lin(vals[1]), srgb_to_lin(vals[2]), a)


# ---------------------------------------------------------------------------
# Generación procedural de texturas estilizadas 512/1024 px (numpy -> bpy.data.images)
# ---------------------------------------------------------------------------

def make_image(name, arr_rgba, is_data=False):
    """Crea una imagen Blender y la guarda en art/levels/textures/<name>.png."""
    os.makedirs(TEX_DIR, exist_ok=True)
    h, w, _ = arr_rgba.shape
    img = bpy.data.images.new(name, width=w, height=h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = "Non-Color" if is_data else "sRGB"
    # Blender espera RGBA float [0..1] contiguo en memoria, de abajo hacia arriba
    flat = np.ascontiguousarray(np.flipud(arr_rgba), dtype=np.float32).ravel()
    img.pixels.foreach_set(flat)
    img.update()
    path = os.path.join(TEX_DIR, f"{name}.png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img.pack()
    # Verificación rápida: nunca exportar texturas negras vacías
    sample_max = float(np.max(flat))
    assert sample_max > 0.1, f"Textura {name} quedó vacía (max={sample_max})"
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


def generate_textures():
    S = 512
    textures = {}

    # 1. Madera artesanal con vetas cálidas, tablas y clavos
    n_grain = fbm_grid(S, S, seed=11, octaves=(4, 12, 32, 64))
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    planks = 6
    plank_id = np.floor(yy / (S / planks)).astype(np.int32)
    plank_y = (yy % (S / planks)) / (S / planks)
    seam = ((plank_y < 0.045) | (plank_y > 0.955)).astype(np.float32)
    offset = ((plank_id % 2) * 0.5 + 0.15) * S
    vseam = (np.abs(((xx + offset) % (S * 0.5)) - 2.0) < 2.2).astype(np.float32)
    grain = np.sin((yy * 0.25 + n_grain * 9.0)) * 0.5 + 0.5
    tint = np.array([0.82, 0.56, 0.30], dtype=np.float32)
    var = (plank_id % 3 - 1) * 0.055
    rgb = np.zeros((S, S, 4), dtype=np.float32)
    for c in range(3):
        base = tint[c] + var + (grain - 0.5) * 0.10 + (n_grain - 0.5) * 0.08
        base = base * (1.0 - 0.56 * np.maximum(seam, vseam))
        rgb[:, :, c] = np.clip(base, 0.06, 0.96)
    rgb[:, :, 3] = 1.0
    textures["wood_base"] = make_image("lvl1_wood_base", rgb, is_data=False)

    # 2. Hormigón / plataforma industrial con losas cálidas y manchas sutiles de aceite
    n_conc = fbm_grid(S, S, seed=22, octaves=(4, 8, 16, 48))
    gx = (xx % (S / 4)) / (S / 4)
    gy = (yy % (S / 4)) / (S / 4)
    grid_line = ((gx < 0.028) | (gy < 0.028)).astype(np.float32)
    rgb = np.zeros((S, S, 4), dtype=np.float32)
    cbase = np.array([0.55, 0.50, 0.45], dtype=np.float32)
    stain = np.clip((n_conc - 0.60) * 2.0, 0.0, 0.30)
    for c in range(3):
        val = cbase[c] + (n_conc - 0.5) * 0.10 - stain * 0.20 - grid_line * 0.14
        rgb[:, :, c] = np.clip(val, 0.08, 0.90)
    rgb[:, :, 3] = 1.0
    textures["deck_base"] = make_image("lvl1_deck_base", rgb, is_data=False)

    # 3. Metal oxidado remachado / chapa ondulada cálida
    n_rust = fbm_grid(S, S, seed=33, octaves=(4, 10, 24, 48))
    corr = (np.sin(xx * (2 * math.pi * 16 / S)) * 0.5 + 0.5) * 0.16
    rust_mask = np.clip((n_rust - 0.40) * 3.0, 0.0, 1.0)
    steel_c = np.array([0.54, 0.58, 0.61], dtype=np.float32)
    rust_c = np.array([0.74, 0.34, 0.18], dtype=np.float32)
    rgb = np.zeros((S, S, 4), dtype=np.float32)
    for c in range(3):
        val = steel_c[c] * (1.0 - rust_mask) + rust_c[c] * rust_mask + corr - 0.07
        rgb[:, :, c] = np.clip(val, 0.07, 0.94)
    rgb[:, :, 3] = 1.0
    textures["rust_base"] = make_image("lvl1_rust_base", rgb, is_data=False)

    # 4. Pintura de advertencia (franjas diagonales mostaza y carbón gastadas)
    n_wear = fbm_grid(S, S, seed=44, octaves=(6, 16, 32))
    stripe = (((xx + yy) / (S / 8.0)) % 1.0 < 0.56).astype(np.float32)
    yellow_c = np.array([0.96, 0.74, 0.20], dtype=np.float32)
    dark_c = np.array([0.18, 0.15, 0.14], dtype=np.float32)
    rgb = np.zeros((S, S, 4), dtype=np.float32)
    for c in range(3):
        val = dark_c[c] * (1.0 - stripe) + yellow_c[c] * stripe + (n_wear - 0.5) * 0.08
        rgb[:, :, c] = np.clip(val, 0.05, 0.98)
    rgb[:, :, 3] = 1.0
    textures["hazard_base"] = make_image("lvl1_hazard_base", rgb, is_data=False)

    # 5. Estratos de chatarra compactada (paredes del abismo)
    n_str = fbm_grid(S, S, seed=55, octaves=(4, 8, 20, 48))
    band_y = (yy + (n_str - 0.5) * 44.0) / (S / 9.0)
    band_idx = np.floor(band_y).astype(np.int32) % 5
    palette = np.array([
        [0.58, 0.40, 0.27],  # tierra / arenisca cálida
        [0.28, 0.54, 0.50],  # chapa turquesa aplastada
        [0.72, 0.36, 0.22],  # metal oxidado
        [0.44, 0.45, 0.48],  # acero compacto
        [0.78, 0.56, 0.28],  # ocre / madera prensada
    ], dtype=np.float32)
    rgb = np.zeros((S, S, 4), dtype=np.float32)
    for c in range(3):
        col = palette[band_idx, c] + (n_str - 0.5) * 0.14
        rgb[:, :, c] = np.clip(col, 0.06, 0.92)
    rgb[:, :, 3] = 1.0
    textures["strata_base"] = make_image("lvl1_strata_base", rgb, is_data=False)

    # 6. Barro de aceite oscuro con reflejos aceitosos
    n_oil = fbm_grid(S, S, seed=66, octaves=(3, 8, 20, 40))
    swirl = np.sin(n_oil * 14.0 + xx * 0.02) * 0.5 + 0.5
    rgb = np.zeros((S, S, 4), dtype=np.float32)
    rgb[:, :, 0] = np.clip(0.11 + swirl * 0.06 + n_oil * 0.06, 0.04, 0.28)
    rgb[:, :, 1] = np.clip(0.10 + swirl * 0.06 + n_oil * 0.05, 0.04, 0.28)
    rgb[:, :, 2] = np.clip(0.09 + (1.0 - swirl) * 0.08 + n_oil * 0.04, 0.04, 0.30)
    rgb[:, :, 3] = 1.0
    textures["oil_base"] = make_image("lvl1_oil_base", rgb, is_data=False)

    return textures


def create_materials(textures):
    """Crea exactamente 8 materiales compartidos compatibles con glTF PBR."""
    mats = {}

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

    mats["deck"] = make_mat("M_ConcreteDeck", textures["deck_base"], rough=0.88, metal=0.08)
    mats["wood"] = make_mat("M_WoodPlanks", textures["wood_base"], rough=0.84, metal=0.02)
    mats["rust"] = make_mat("M_RustMetal", textures["rust_base"], rough=0.64, metal=0.48)
    mats["hazard"] = make_mat("M_HazardPaint", textures["hazard_base"], rough=0.55, metal=0.12)
    mats["strata"] = make_mat("M_ScrapStrata", textures["strata_base"], rough=0.92, metal=0.14)
    mats["oil"] = make_mat("M_OilMud", textures["oil_base"], rough=0.18, metal=0.32)
    mats["teal"] = make_mat("M_WorkshopTeal", None, base_hex="#2f7a74", rough=0.62, metal=0.26)
    mats["lantern"] = make_mat("M_WarmLantern", None, base_hex="#ffe28a", rough=0.25, metal=0.0, emissive_hex="#ffb838", emissive_str=2.2)
    return mats


# ---------------------------------------------------------------------------
# Constructores bmesh en coordenadas Three.js (X, Y-up, +Z adelante)
# ---------------------------------------------------------------------------

class BucketBuilder:
    """Agrupa geometría por material para minimizar draw calls y aplicar UV box-projection limpia."""

    def __init__(self, mats):
        self.mats = mats
        self.bms = {k: bmesh.new() for k in mats}

    def _transform_verts(self, verts, center_tx, rot_tx=(0.0, 0.0, 0.0)):
        rot_m = Euler(rot_tx, "XYZ").to_matrix().to_4x4()
        cx, cy, cz = center_tx
        for v in verts:
            p = rot_m @ v.co
            tx, ty, tz = p.x + cx, p.y + cy, p.z + cz
            v.co = tx_to_bl(tx, ty, tz)

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
            b_res = bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect="EDGES", clamp_overlap=True)
            verts = [v for v in ({v for f in b_res["faces"] for v in f.verts} | set(b_res["verts"]) | set(verts)) if v.is_valid]
        self._transform_verts(verts, center_tx, rot_tx)

    def add_cylinder(self, mat_key, center_tx, radius_top, radius_bot, height, segs=12, rot_tx=(0.0, 0.0, 0.0)):
        bm = self.bms[mat_key]
        # En Three.js el cilindro por defecto tiene eje en Y; create_cone lo crea en Z local -> rotamos -90° en X primero
        res = bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=False, segments=segs,
            radius1=radius_bot, radius2=radius_top, depth=height,
        )
        verts = res["verts"]
        for v in verts:
            # Local Z -> Y (eje vertical en Three.js)
            x, y, z = v.co.x, v.co.y, v.co.z
            v.co = Vector((x, z, -y))
        self._transform_verts(verts, center_tx, rot_tx)

    def add_chevron(self, mat_key, center_tx, width=1.4, length=1.0, thick=0.014, yaw_y=0.0, pitch_x=0.0):
        """Flecha geométrica en V (sin letras) apoyada al ras de una superficie."""
        arm_len = width * 0.56
        arm_w = width * 0.22
        # Dos brazos en V apuntando hacia +Z (o rotados por yaw_y / pitch_x)
        rot_m = Euler((pitch_x, yaw_y, 0.0), "XYZ").to_matrix().to_4x4()
        for side in (-1, 1):
            local_pos = rot_m @ Vector((side * width * 0.24, 0.0, -length * 0.12))
            self.add_box(
                mat_key,
                (center_tx[0] + local_pos.x, center_tx[1] + local_pos.y, center_tx[2] + local_pos.z),
                (arm_len, thick, arm_w),
                rot_tx=(pitch_x, yaw_y + side * 0.72, 0.0),
            )

    def finalize_objects(self, collection):
        objs = []
        uv_scale = {
            "deck": 0.22,
            "wood": 0.38,
            "rust": 0.35,
            "hazard": 0.65,
            "strata": 0.16,
            "oil": 0.12,
            "teal": 0.4,
            "lantern": 0.5,
        }
        for key, bm in self.bms.items():
            if len(bm.verts) == 0:
                bm.free()
                continue
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            # Box-projection UV limpia por cara según normal dominante
            uv_layer = bm.loops.layers.uv.new("UVMap")
            sc = uv_scale.get(key, 0.3)
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
            mesh = bpy.data.meshes.new(f"L1_{key}")
            bm.to_mesh(mesh)
            bm.free()
            mesh.materials.append(self.mats[key])
            obj = bpy.data.objects.new(f"L1_{key}", mesh)
            collection.objects.link(obj)
            objs.append(obj)
        return objs


# ---------------------------------------------------------------------------
# Modelado arquitectónico completo — Nivel 1: El Puente del Abismo
# ---------------------------------------------------------------------------

def build_level1(b: BucketBuilder):
    # =========================================================================
    # 1. BAHÍA DE ARMADO (z = -1..13, x = -12..+12, tope EXACTO en y = 0)
    # =========================================================================
    # Plataforma principal con zócalo de hormigón y refuerzos inferiores
    b.add_box("deck", (0, -6.5, 6), (24.0, 13.0, 14.0))
    # Contrafuertes metálicos al borde del abismo (z = 12.8)
    for x in (-9.5, -4.8, 4.8, 9.5):
        b.add_box("rust", (x, -6.2, 13.1), (1.1, 12.2, 0.85), bevel=0.06)
    # Borde metálico frontal de la bahía (a ras de y = 0)
    b.add_box("rust", (-6.75, -0.18, 12.85), (10.5, 0.36, 0.34))
    b.add_box("rust", (6.75, -0.18, 12.85), (10.5, 0.36, 0.34))

    # Pista pintada 11 x 8 m centrada en (0, 0, 6) — altura 1.2 cm (< 3 cm regla!)
    b.add_box("hazard", (0, 0.006, 2.15), (11.0, 0.012, 0.34))
    b.add_box("hazard", (0, 0.006, 9.85), (11.0, 0.012, 0.34))
    b.add_box("hazard", (-5.33, 0.006, 6.0), (0.34, 0.012, 7.4))
    b.add_box("hazard", (5.33, 0.006, 6.0), (0.34, 0.012, 7.4))
    # Flechas pintadas de salida hacia el puente
    b.add_chevron("hazard", (0, 0.008, 11.2), width=1.9, length=1.1, thick=0.012)

    # Vallas / muretes perimetrales (alineados con colliders en x=±11.8 y z=-0.8)
    for side in (-1, 1):
        b.add_box("wood", (side * 11.8, 0.52, 6.0), (0.36, 1.04, 13.8), bevel=0.04)
        for z in (-0.5, 3.0, 6.5, 10.0, 12.7):
            b.add_box("rust", (side * 11.8, 0.62, z), (0.46, 1.24, 0.44), bevel=0.03)
    b.add_box("wood", (0, 0.52, -0.8), (23.8, 1.04, 0.36), bevel=0.04)
    for x in (-9, -4.5, 0, 4.5, 9):
        b.add_box("rust", (x, 0.62, -0.8), (0.44, 1.24, 0.46), bevel=0.03)

    # Banco de herramientas + tablero perforado (costado izquierdo, fuera de la pista)
    b.add_box("wood", (-9.4, 0.92, 4.2), (1.4, 0.14, 4.2), bevel=0.03)
    for dz in (-1.8, 0.0, 1.8):
        b.add_box("rust", (-9.9, 0.44, 4.2 + dz), (0.16, 0.88, 0.16))
        b.add_box("rust", (-8.9, 0.44, 4.2 + dz), (0.16, 0.88, 0.16))
    b.add_box("wood", (-10.1, 1.65, 4.2), (0.12, 1.3, 4.0), bevel=0.02)
    b.add_box("teal", (-9.4, 1.15, 3.0), (0.65, 0.34, 0.85), bevel=0.03)  # Caja de herramientas
    b.add_box("rust", (-9.3, 1.12, 5.1), (0.55, 0.28, 0.72), bevel=0.03)  # Yunque chico
    # Faroles cálidos del taller
    for lx, lz in ((-10.6, 1.5), (-10.6, 8.8), (10.6, 1.5), (10.6, 8.8)):
        b.add_cylinder("rust", (lx, 2.0, lz), 0.1, 0.14, 4.0, segs=8)
        b.add_box("rust", (lx + (-0.55 if lx > 0 else 0.55), 3.85, lz), (1.1, 0.14, 0.16))
        b.add_box("lantern", (lx + (-0.95 if lx > 0 else 0.95), 3.62, lz), (0.38, 0.28, 0.38), bevel=0.04)

    # Estantes con piezas (costado derecho, fuera de la pista de 11 m)
    b.add_box("rust", (9.6, 1.5, 4.6), (1.3, 0.1, 5.0))
    b.add_box("rust", (9.6, 2.6, 4.6), (1.3, 0.1, 5.0))
    b.add_box("wood", (9.6, 0.55, 4.6), (1.3, 0.1, 5.0))
    for dz in (-2.4, 0.0, 2.4):
        for dx in (-0.58, 0.58):
            b.add_box("rust", (9.6 + dx, 1.55, 4.6 + dz), (0.12, 3.1, 0.12))
    # Siluetas de cajas, bidones y ruedas en los estantes
    b.add_box("wood", (9.5, 0.96, 3.1), (0.72, 0.72, 0.72), bevel=0.04)
    b.add_box("wood", (9.5, 0.96, 4.1), (0.68, 0.68, 0.68), bevel=0.04)
    b.add_cylinder("teal", (9.5, 1.95, 3.3), 0.26, 0.26, 0.78, segs=10)
    b.add_cylinder("teal", (9.5, 1.95, 4.1), 0.26, 0.26, 0.78, segs=10)
    b.add_cylinder("rust", (9.5, 2.98, 5.6), 0.36, 0.36, 0.26, segs=12, rot_tx=(0, 0, math.pi / 2))
    b.add_cylinder("rust", (9.5, 2.98, 6.2), 0.36, 0.36, 0.26, segs=12, rot_tx=(0, 0, math.pi / 2))

    # Cartel de madera artesanal en la entrada del puente (sin letras: ícono geométrico de flecha)
    b.add_box("wood", (3.6, 1.1, 11.7), (0.2, 2.2, 0.2))
    b.add_box("wood", (5.4, 1.1, 11.7), (0.2, 2.2, 0.2))
    b.add_box("wood", (4.5, 2.05, 11.7), (2.3, 1.25, 0.18), bevel=0.04)
    b.add_box("rust", (4.5, 2.05, 11.68), (2.42, 1.36, 0.10), bevel=0.02)
    # Icono de puente + flecha en relieve (cara hacia la bahía, z = 11.58)
    b.add_box("hazard", (4.5, 1.72, 11.58), (1.6, 0.16, 0.06))
    b.add_box("hazard", (4.1, 2.15, 11.58), (0.6, 0.16, 0.06))
    b.add_box("hazard", (4.65, 2.15, 11.58), (0.42, 0.42, 0.06), rot_tx=(0, 0, math.pi / 4))

    # Pórtico de entrada al puente (z = 13.0, ancho libre 3.6 m -> enmarca el puente angosto de 3 m)
    for side in (-1, 1):
        b.add_box("rust", (side * 2.15, 2.4, 13.0), (0.55, 4.8, 0.55), bevel=0.04)
        b.add_box("hazard", (side * 1.92, 0.55, 12.85), (0.36, 1.1, 0.48), bevel=0.03)
    b.add_box("rust", (0, 4.75, 13.0), (5.2, 0.65, 0.65), bevel=0.04)
    b.add_box("hazard", (0, 4.75, 12.66), (4.5, 0.34, 0.08))
    b.add_box("lantern", (-1.8, 4.3, 12.75), (0.34, 0.26, 0.34), bevel=0.04)
    b.add_box("lantern", (1.8, 4.3, 12.75), (0.34, 0.26, 0.34), bevel=0.04)

    # =========================================================================
    # 2. EL PUENTE ANGOSTO (3 m ancho × 67 m largo, tope EXACTO y = 0, z = 13..80)
    # =========================================================================
    # Tablero principal de madera (tope exacto en y = 0, espesor 0.26 m)
    b.add_box("wood", (0, -0.13, 46.5), (2.76, 0.26, 67.0))
    # Bordes señalizados en amarillo/carbón (completan el ancho 3.0 m, a ras y = 0.008)
    for side in (-1, 1):
        b.add_box("hazard", (side * 1.44, -0.09, 46.5), (0.20, 0.20, 67.0))
        # Vigas metálicas longitudinales I-beam debajo del tablero
        b.add_box("rust", (side * 1.15, -0.52, 46.5), (0.28, 0.54, 67.0))
        b.add_box("rust", (side * 1.15, -0.82, 46.5), (0.44, 0.14, 67.0))

    # Travesaños, ménsulas y pequeños bolardos reflectivos por FUERA del carril de 3 m
    for i in range(15):
        z = 15.0 + i * 4.5
        b.add_box("rust", (0, -0.56, z), (3.1, 0.24, 0.24))
        for side in (-1, 1):
            # Ménsula lateral externa (x = ±1.68, debajo del nivel de rueda)
            b.add_box("rust", (side * 1.62, -0.26, z), (0.26, 0.22, 0.26))
            # Baliza lateral baja de peligro fuera del ancho conducido (x = ±1.68)
            if i % 2 == 0:
                b.add_box("hazard", (side * 1.68, 0.12, z), (0.14, 0.42, 0.14), bevel=0.02)
                if i in (2, 7, 12):
                    b.add_box("lantern", (side * 1.68, 0.42, z), (0.16, 0.16, 0.16), bevel=0.02)

    # 3 Pilares altos tipo caballete metálico hundidos hasta el barro (y = -12)
    for pz in (27.0, 46.5, 66.0):
        for side in (-1, 1):
            # Patas ligeramente abiertas hacia afuera para silueta dramática
            b.add_box("rust", (side * 1.85, -6.3, pz), (0.46, 11.6, 0.56), rot_tx=(0, 0, side * 0.08), bevel=0.03)
        # Travesaños horizontales y cruces en X del caballete
        for ty in (-3.2, -6.6, -10.0):
            b.add_box("rust", (0, ty, pz), (4.6, 0.32, 0.34))
        b.add_box("rust", (0, -4.9, pz), (4.4, 0.22, 0.22), rot_tx=(0, 0, 0.62))
        b.add_box("rust", (0, -4.9, pz), (4.4, 0.22, 0.22), rot_tx=(0, 0, -0.62))
        b.add_box("rust", (0, -8.3, pz), (4.8, 0.22, 0.22), rot_tx=(0, 0, 0.58))
        b.add_box("rust", (0, -8.3, pz), (4.8, 0.22, 0.22), rot_tx=(0, 0, -0.58))

    # =========================================================================
    # 3. ABISMO (z = 13..80, 48 m ancho, fondo en y = -12) Y CHATARRA HUNDIDA
    # =========================================================================
    # Fondo de barro aceitoso (tope en y = -12.0, exacto al collider)
    b.add_box("oil", (0, -12.48, 46.5), (48.0, 0.96, 70.0))

    # Paredes del abismo con estratos de chatarra compactada (x = ±24.5)
    for side in (-1, 1):
        b.add_box("strata", (side * 24.5, -5.5, 46.5), (1.4, 13.5, 70.0))
        # Contrafuertes y bloques de chatarra compactada sobresaliendo de las paredes
        for k in range(11):
            z = 16.0 + k * 6.0
            h_block = 3.2 + (k % 3) * 1.4
            w_block = 1.6 + (k % 2) * 0.8
            y_pos = -10.2 + (k % 4) * 2.3
            mat_k = ("strata", "rust", "teal")[k % 3]
            b.add_box(mat_k, (side * (23.4 - w_block * 0.35), y_pos, z), (w_block, h_block, 4.4),
                      rot_tx=(0.04 * (k % 3 - 1), 0.08 * side, 0.05 * side), bevel=0.06)
        # Borde superior irregular de chatarra (y = +0.5..+2.8)
        for k in range(8):
            z = 17.5 + k * 8.2
            b.add_box("strata", (side * 24.6, 1.4 + (k % 3) * 0.55, z), (2.4, 2.2 + (k % 2) * 0.9, 6.8),
                      rot_tx=(0, 0.05 * side, 0), bevel=0.08)

    # Carcasas, bidones, vigas y restos hundidos en el barro (fuera del trazado a pie)
    wrecks = [
        (-16.5, -11.4, 42.0, (3.6, 1.4, 2.2), (0.12, 0.4, -0.18), "teal"),
        (15.2, -11.3, 31.0, (3.8, 1.5, 2.1), (-0.15, -0.5, 0.2), "rust"),
        (-14.2, -11.5, 62.0, (3.2, 1.3, 2.0), (0.18, 0.7, 0.12), "rust"),
        (16.8, -11.4, 52.0, (3.5, 1.5, 2.2), (-0.1, 0.3, -0.22), "teal"),
        (-17.8, -11.2, 22.0, (2.8, 1.6, 1.8), (0.08, -0.6, 0.14), "wood"),
        (13.5, -11.5, 19.0, (2.6, 1.2, 4.2), (0.22, 0.25, -0.1), "rust"),
        (-5.5, -11.6, 68.0, (2.8, 1.1, 1.9), (-0.14, 0.8, 0.16), "teal"),
        (4.8, -11.6, 25.0, (2.4, 1.2, 1.8), (0.16, -0.4, -0.12), "rust"),
    ]
    for wx, wy, wz, wsz, wrot, wmat in wrecks:
        b.add_box(wmat, (wx, wy, wz), wsz, rot_tx=wrot, bevel=0.08)
    # Vigas rotas y bidones semi-hundidos
    for bx, bz in ((-13.0, 48.0), (12.0, 40.0), (-11.0, 56.0), (14.0, 66.0), (-3.5, 39.0), (4.2, 54.0)):
        b.add_cylinder("teal", (bx, -11.65, bz), 0.36, 0.36, 0.95, segs=10, rot_tx=(0.45, 0.3, 0.25))
    # Pedestal de chatarra hundida bajo el centro del puente (marco visual de la Tuerca Dorada en (0, -10.2, 46))
    b.add_cylinder("rust", (0, -11.78, 46.0), 1.65, 2.05, 0.44, segs=8)
    b.add_cylinder("hazard", (0, -11.52, 46.0), 1.25, 1.35, 0.10, segs=8)

    # =========================================================================
    # 4. RUTA A PIE (rampa izq x=-8, senda larga por el barro, rampa der x=+8)
    # =========================================================================
    # Rampa izquierda bajando (pos=[-8, -6.44, 22.76], size=[6, 1, 25.1], rotX=+RAMP_ANGLE)
    b.add_box("wood", (-8.0, -6.44, 22.76), (6.0, 1.0, 25.1), rot_tx=(RAMP_ANGLE, 0, 0))
    # Rampa derecha subiendo (pos=[+8, -6.44, 69.24], size=[6, 1, 25.1], rotX=-RAMP_ANGLE)
    b.add_box("wood", (8.0, -6.44, 69.24), (6.0, 1.0, 25.1), rot_tx=(-RAMP_ANGLE, 0, 0))

    # Barandas exteriores, pilotes, flechas y faroles en ambas rampas (usando la altura exacta de la cara superior física)
    cos_r = math.cos(RAMP_ANGLE)
    sin_r = math.sin(RAMP_ANGLE)
    for rx, r_cz, rail_side, pitch, sign_slope in (
        (-8.0, 22.76, -1, RAMP_ANGLE, -1.0),
        (8.0, 69.24, 1, -RAMP_ANGLE, 1.0),
    ):
        rail_x = rx + rail_side * 2.92
        # Cara superior de la rampa en función del parámetro local lz (-11.5..+11.5)
        def ramp_top(lz):
            ty = -6.44 + 0.5 * cos_r + sign_slope * lz * sin_r
            tz = r_cz - sign_slope * 0.5 * sin_r + lz * cos_r
            return ty, tz

        mid_y, mid_z = ramp_top(0.0)
        b.add_box("rust", (rail_x, mid_y + 0.95, mid_z), (0.14, 0.14, 24.4), rot_tx=(pitch, 0, 0))
        b.add_box("wood", (rail_x, mid_y + 0.50, mid_z), (0.12, 0.12, 24.4), rot_tx=(pitch, 0, 0))
        for s in range(6):
            lz = -11.0 + (22.0 * s / 5.0)
            py, pz = ramp_top(lz)
            b.add_box("wood", (rail_x, py + 0.52, pz), (0.20, 1.12, 0.20))
            if s % 2 == 1:
                b.add_box("rust", (rail_x, py + 1.52, pz), (0.12, 1.0, 0.12))
                b.add_box("lantern", (rail_x, py + 2.05, pz), (0.28, 0.28, 0.28), bevel=0.03)
            # Pilotes de soporte: terminan 0.75 m POR DEBAJO de la cara superior (nunca atraviesan la madera!)
            col_top = py - 0.78
            if col_top > -11.4:
                col_h = col_top - (-12.0)
                b.add_box("rust", (rx - 2.35, -12.0 + col_h * 0.5, pz), (0.36, col_h, 0.36))
                b.add_box("rust", (rx + 2.35, -12.0 + col_h * 0.5, pz), (0.36, col_h, 0.36))
        # Flechas pintadas pegadas al ras de la superficie superior de la rampa (desplazadas 2 cm en la normal)
        for lz in (-7.2, 0.0, 7.2):
            fy, fz = ramp_top(lz)
            ny = 0.024 * cos_r
            nz = -sign_slope * 0.024 * sin_r
            b.add_chevron("hazard", (rx, fy + ny, fz + nz), width=1.6, length=1.0, thick=0.014, pitch_x=pitch)

    # Senda a pie en el fondo del barro (pasarela baja + vallas + faroles de (-8, 34) a (+8, 58))
    trail_pts = [
        (-8.0, 35.5), (-8.5, 40.0), (-6.5, 45.0), (-2.0, 48.0),
        (3.5, 50.0), (7.5, 53.5), (8.0, 57.5),
    ]
    for i in range(len(trail_pts) - 1):
        x0, z0 = trail_pts[i]
        x1, z1 = trail_pts[i + 1]
        mx, mz = (x0 + x1) * 0.5, (z0 + z1) * 0.5
        dx, dz = x1 - x0, z1 - z0
        seg_len = math.hypot(dx, dz)
        yaw = math.atan2(dx, dz)
        # Tablones bajos a ras del barro (y = -11.985, sobresalen <= 1.5 cm)
        b.add_box("wood", (mx, -11.99, mz), (2.4, 0.03, seg_len + 0.35), rot_tx=(0, yaw, 0))
        b.add_chevron("hazard", (mx, -11.968, mz), width=1.1, length=0.7, thick=0.01, yaw_y=yaw)
        # Valla baja y farol cada dos tramos
        nx, nz = -dz / seg_len, dx / seg_len
        b.add_box("wood", (mx + nx * 1.45, -11.55, mz + nz * 1.45), (0.14, 0.9, 0.14))
        if i % 2 == 0:
            b.add_box("rust", (mx - nx * 1.55, -11.0, mz - nz * 1.55), (0.14, 2.0, 0.14))
            b.add_box("lantern", (mx - nx * 1.55, -9.95, mz - nz * 1.55), (0.28, 0.28, 0.28), bevel=0.03)

    # Cartel pequeño al inicio de la senda a pie en la bahía (x = -8, z = 11.8)
    b.add_box("wood", (-10.6, 0.9, 12.2), (0.18, 1.8, 0.18))
    b.add_box("wood", (-10.6, 1.55, 12.2), (1.1, 0.65, 0.14), bevel=0.03)
    b.add_chevron("hazard", (-8.0, 0.01, 11.4), width=1.6, length=0.9, thick=0.012)

    # =========================================================================
    # 5. PLATAFORMA FINAL (z = 80..98, x = -12..+12, tope y = 0) + FARO DE META
    # =========================================================================
    b.add_box("deck", (0, -6.5, 89.0), (24.0, 13.0, 18.0))
    for x in (-9.5, -4.8, 4.8, 9.5):
        b.add_box("rust", (x, -6.2, 79.9), (1.1, 12.2, 0.85), bevel=0.06)
    # Borde perimetral de seguridad (sin tapar la entrada del puente ni la rampa derecha)
    b.add_box("wood", (-11.8, 0.52, 89.0), (0.36, 1.04, 17.8), bevel=0.04)
    b.add_box("wood", (11.8, 0.52, 89.0), (0.36, 1.04, 17.8), bevel=0.04)
    b.add_box("wood", (0, 0.52, 97.8), (23.8, 1.04, 0.36), bevel=0.04)
    # Pista pintada de llegada alrededor del checkpoint 2 y meta
    b.add_box("hazard", (-3.8, 0.006, 89.5), (0.34, 0.012, 13.0))
    b.add_box("hazard", (3.8, 0.006, 89.5), (0.34, 0.012, 13.0))
    b.add_chevron("hazard", (0, 0.008, 88.5), width=2.2, length=1.2, thick=0.012)
    b.add_chevron("hazard", (0, 0.008, 92.2), width=2.2, length=1.2, thick=0.012)

    # Cajas y bidones de ambientación al costado izquierdo de la plataforma final
    b.add_box("wood", (-8.8, 0.6, 86.0), (1.2, 1.2, 1.2), bevel=0.05)
    b.add_box("wood", (-7.4, 0.5, 86.4), (1.0, 1.0, 1.0), rot_tx=(0, 0.25, 0), bevel=0.05)
    b.add_box("wood", (-8.3, 1.65, 86.2), (0.95, 0.95, 0.95), rot_tx=(0, -0.18, 0), bevel=0.05)
    b.add_cylinder("teal", (-9.4, 0.55, 88.4), 0.36, 0.36, 1.1, segs=10)
    b.add_cylinder("teal", (-8.5, 0.55, 89.0), 0.36, 0.36, 1.1, segs=10)

    # TORRE FARO DE META (x = +7.8, z = 92.5, altura 17.5 m — visible desde la bahía!)
    fx, fz = 7.8, 92.5
    # Base octagonal de piedra/acero
    b.add_cylinder("deck", (fx, 0.65, fz), 2.5, 2.9, 1.3, segs=8)
    # Fuste en franjas alternadas (óxido y amarillo taller)
    b.add_cylinder("rust", (fx, 3.0, fz), 2.05, 2.35, 3.4, segs=8)
    b.add_cylinder("hazard", (fx, 6.2, fz), 1.80, 2.05, 3.0, segs=8)
    b.add_cylinder("rust", (fx, 9.2, fz), 1.55, 1.80, 3.0, segs=8)
    b.add_cylinder("teal", (fx, 11.4, fz), 1.45, 1.55, 1.4, segs=8)
    # Balcón de madera y baranda metálica (y = 12.2)
    b.add_cylinder("wood", (fx, 12.25, fz), 2.35, 2.20, 0.34, segs=8)
    for k in range(8):
        ang = k * math.pi * 0.25
        px = fx + math.cos(ang) * 2.15
        pz = fz + math.sin(ang) * 2.15
        b.add_box("rust", (px, 12.95, pz), (0.14, 1.15, 0.14))
    # Sala de linterna emisiva cálida (y = 12.6..15.2) + pilares
    b.add_cylinder("lantern", (fx, 13.85, fz), 1.15, 1.15, 2.3, segs=8)
    for k in range(4):
        ang = k * math.pi * 0.5 + math.pi * 0.25
        px = fx + math.cos(ang) * 1.32
        pz = fz + math.sin(ang) * 1.32
        b.add_box("rust", (px, 13.85, pz), (0.18, 2.5, 0.18))
    # Cúpula cónica de metal + pararrayos
    b.add_cylinder("rust", (fx, 16.05, fz), 0.18, 1.85, 2.1, segs=8)
    b.add_cylinder("hazard", (fx, 17.55, fz), 0.05, 0.1, 1.2, segs=6)


def add_empties(collection):
    """Agrega los 6 Empties exactos requeridos por el contrato con el código."""
    specs = {
        "spawn": (0.0, 1.8, 4.0),
        "bay": (0.0, 0.0, 6.0),
        "checkpoint_1": (0.0, 1.8, 46.0),
        "checkpoint_2": (0.0, 1.8, 84.0),
        "goal": (0.0, 1.6, 96.0),
        "golden_nut": (0.0, -10.2, 46.0),
    }
    empties = []
    for name, pos_tx in specs.items():
        emp = bpy.data.objects.new(name, None)
        emp.empty_display_type = "PLAIN_AXES"
        emp.empty_display_size = 1.2
        emp.location = tx_to_bl(*pos_tx)
        collection.objects.link(emp)
        empties.append(emp)
    return empties


def export_glb(objects):
    os.makedirs(GLB_DIR, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    kwargs = dict(
        filepath=GLB_PATH,
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
    return GLB_PATH


def render_previews():
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    scene = bpy.context.scene
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

    # Cielo cálido de tarde (como el juego)
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
    sun.rotation_euler = (math.radians(52), math.radians(12), math.radians(32))

    cam_d = bpy.data.cameras.new("PreviewCam")
    cam_d.clip_end = 400.0
    cam = bpy.data.objects.new("PreviewCam", cam_d)
    scene.collection.objects.link(cam)
    scene.camera = cam

    def shoot(loc_tx, target_tx, lens, fname):
        loc_bl = tx_to_bl(*loc_tx)
        tgt_bl = tx_to_bl(*target_tx)
        cam.location = loc_bl
        cam.rotation_euler = (tgt_bl - loc_bl).to_track_quat("-Z", "Y").to_euler()
        cam_d.lens = lens
        scene.render.filepath = os.path.join(PREVIEW_DIR, fname)
        bpy.ops.render.render(write_still=True)

    # 1. Vista desde la bahía de armado hacia el puente angosto y el faro de meta
    shoot((0.0, 3.6, 0.2), (0.5, 1.6, 65.0), 28, "level1_01_from_bay.png")
    # 2. Panorámica aérea mostrando ambas rutas (puente central + rampas y senda en el barro)
    shoot((-30.0, 26.0, 10.0), (2.0, -3.5, 56.0), 25, "level1_02_aerial_routes.png")
    # 3. Detalle del abismo, pilares del puente, barro con chatarra y ruta a pie
    shoot((-15.0, -5.0, 30.0), (2.0, -8.5, 50.0), 28, "level1_03_abyss_footpath.png")
    # 4. Plataforma final y Torre Faro completa
    shoot((-12.0, 9.5, 68.0), (4.0, 7.2, 92.5), 26, "level1_04_goal_lighthouse.png")
    # 5. Bahía de armado (banco de herramientas, estantes con piezas y pista pintada 11x8 m)
    shoot((0.0, 9.5, 16.5), (0.0, 0.8, 4.5), 24, "level1_05_bay_workshop.png")

    # Limpiar objetos temporales antes de guardar el .blend
    for o in (sun, cam):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.worlds.remove(world)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    textures = generate_textures()
    mats = create_materials(textures)
    builder = BucketBuilder(mats)
    build_level1(builder)
    mesh_objs = builder.finalize_objects(scene.collection)
    empties = add_empties(scene.collection)

    all_objs = mesh_objs + empties
    glb_path = export_glb(all_objs)
    render_previews()

    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH, relative_remap=True, compress=True)

    total_tris = 0
    total_verts = 0
    for obj in mesh_objs:
        obj.data.calc_loop_triangles()
        total_tris += len(obj.data.loop_triangles)
        total_verts += len(obj.data.vertices)
    size_bytes = os.path.getsize(glb_path)
    print(
        f"[REPORT] level-1-puente: tris={total_tris} verts={total_verts} "
        f"materials={len(mats)} meshes={len(mesh_objs)} empties={len(empties)} "
        f"glb_bytes={size_bytes}"
    )


if __name__ == "__main__":
    main()
