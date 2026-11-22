"""
Los del Desguace — Kit Modular 3D de Escenarios de Desguace (Blender 5.2.3 LTS + bake Cycles).

Piezas reutilizables para armar niveles actuales y futuros (public/models/environment/):
  1. container_rust.glb   — Contenedor marítimo corrugado oxidado (6.0 x 2.6 x 2.5 m)
  2. scrap_ramp.glb       — Rampa modular metálica con estructura reticulada y franjas (4.0 x 1.6 x 6.0 m)
  3. tire_barrier.glb     — Barrera de neumáticos con postes y cadena (2.4 x 1.1 x 1.0 m)
  4. floodlight_tower.glb — Torre de reflector nocturno de taller (altura 4.8 m)
  5. metal_catwalk.glb    — Pasarela metálica elevada con barandas (4.0 x 1.2 x 2.2 m)
  6. goal_arch.glb        — Pórtico de meta con tuerca gigante dorada (8.0 x 6.5 x 1.4 m)

Uso:
    blender -b --factory-startup -P art/blender/build_env_kit.py -- all 512
"""

import bpy
import bmesh
import math
import os
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

C = bep.C


def build_container_rust():
    """Contenedor marítimo corrugado (6.0 largo Y, 2.5 ancho X, 2.6 alto Z, apoyado en Z=0)."""
    m_teal = bp.mat_painted_metal("A_ContTeal", C["teal"], C["teal_dark"], wear_amt=1.1, rust_amt=0.75)
    m_dark = bp.mat_painted_metal("A_ContFrame", C["dark_steel"], C["dark_steel2"], wear_amt=1.0, rust_amt=0.65)
    m_steel = bp.mat_bare_metal("A_ContSteel", C["steel"], rough=0.35)

    objs = [
        # Caja central
        bp.make_box("ContCore", (2.36, 5.86, 2.44), (0, 0, 1.30), m_teal, bevel=0.02),
        # Marco estructural superior e inferior
        bp.make_box("FrameBot", (2.50, 6.00, 0.14), (0, 0, 0.07), m_dark, bevel=0.015),
        bp.make_box("FrameTop", (2.50, 6.00, 0.14), (0, 0, 2.53), m_dark, bevel=0.015),
    ]
    # 4 pilares de esquina
    for sx in (-1.18, 1.18):
        for sy in (-2.93, 2.93):
            objs.append(bp.make_box(f"Post_{sx}_{sy}", (0.16, 0.16, 2.60), (sx, sy, 1.30), m_dark, bevel=0.015))
    # Corrugado lateral (14 costillas por lado)
    for i in range(14):
        y = -2.60 + i * 0.40
        for sx in (-1.21, 1.21):
            objs.append(bp.make_box(f"Rib_{sx}_{i}", (0.08, 0.16, 2.26), (sx, y, 1.30), m_teal, bevel=0.01))
    # Barras verticales de cierre en el portón delantero (-Y)
    for sx in (-0.55, -0.22, 0.22, 0.55):
        objs.append(bp.make_cylinder(f"LockBar_{sx}", 0.022, 2.25, 10, (sx, -2.97, 1.30), m_steel, bevel=0.004))
    return bp.join(objs, "ContainerRust")


def build_scrap_ramp():
    """Rampa modular metálica (4.0 ancho X, 6.0 largo Y, sube 1.6 m hacia -Y, apoyada en Z=0)."""
    m_dark = bp.mat_painted_metal("A_RampDark", C["dark_steel"], C["dark_steel2"], wear_amt=1.0, rust_amt=0.6)
    m_yellow = bp.mat_painted_metal("A_RampYellow", C["mustard"], C["mustard_dark"], wear_amt=0.9, band=True, rust_amt=0.3)
    m_steel = bp.mat_bare_metal("A_RampSteel", C["steel"], rough=0.35)

    length = math.hypot(6.0, 1.6)
    ang = math.atan2(1.6, 6.0)
    objs = [
        # Plataforma inclinada principal (sube hacia -Y)
        bp.make_box("Deck", (4.0, length, 0.18), (0, 0, 0.80), m_dark, bevel=0.015, rot=(-ang, 0, 0)),
        # Cordones laterales amarillos
        bp.make_box("CurbL", (0.24, length, 0.26), (-1.88, 0, 0.92), m_yellow, bevel=0.012, rot=(-ang, 0, 0)),
        bp.make_box("CurbR", (0.24, length, 0.26), (1.88, 0, 0.92), m_yellow, bevel=0.012, rot=(-ang, 0, 0)),
        # Patas traseras (lado alto -Y) e intermedias
        bp.make_box("LegBL", (0.24, 0.24, 1.52), (-1.75, -2.75, 0.76), m_dark, bevel=0.012),
        bp.make_box("LegBR", (0.24, 0.24, 1.52), (1.75, -2.75, 0.76), m_dark, bevel=0.012),
        bp.make_box("LegML", (0.20, 0.20, 0.78), (-1.75, -0.1, 0.39), m_dark, bevel=0.01),
        bp.make_box("LegMR", (0.20, 0.20, 0.78), (1.75, -0.1, 0.39), m_dark, bevel=0.01),
        bp.make_box("CrossBack", (3.6, 0.18, 0.18), (0, -2.75, 0.85), m_steel, bevel=0.01),
    ]
    # Nervaduras antideslizantes apoyadas sobre la cara superior de la rampa
    for i in range(6):
        t = (i + 0.5) / 6.0
        y = 2.6 - t * 5.2
        z = 0.20 + t * 1.38
        objs.append(bp.make_box(f"Tread_{i}", (3.4, 0.09, 0.04), (0, y, z), m_steel, bevel=0.005, rot=(-ang, 0, 0)))
    return bp.join(objs, "ScrapRamp")


def build_tire_barrier():
    """Barrera de neumáticos apilados con postes de acero (2.4 m ancho X, apoyada en Z=0)."""
    m_rubber = bep.mat_rubber("A_TireRubber")
    m_yellow = bp.mat_painted_metal("A_TirePost", C["mustard"], C["mustard_dark"], wear_amt=0.9, rust_amt=0.3)
    m_steel = bp.mat_bare_metal("A_TireSteel", C["steel"], rough=0.35)

    objs = []
    # 3 pilas de 3 neumáticos cada una
    for i, x in enumerate((-0.82, 0.0, 0.82)):
        for k in range(3):
            ox = (0.04 if k == 1 else -0.02) * (1 if i % 2 == 0 else -1)
            oy = 0.05 if k == 1 else -0.02
            objs.append(bep.make_torus(f"Tire_{i}_{k}", 0.29, 0.135, 24, 12, m_rubber, (x + ox, oy, 0.14 + k * 0.27)))
        objs.append(bp.make_cylinder(f"Post_{i}", 0.055, 1.05, 12, (x, 0, 0.525), m_yellow, bevel=0.008))
    # Barra superior enlazando los 3 postes
    objs.append(bp.make_box("TopBar", (2.10, 0.06, 0.06), (0, 0, 0.96), m_steel, bevel=0.008))
    return bp.join(objs, "TireBarrier")


def build_floodlight_tower():
    """Torre de reflector nocturno de taller (altura 4.8 m, apoyada en Z=0)."""
    m_dark = bp.mat_painted_metal("A_TowerDark", C["dark_steel"], C["dark_steel2"], wear_amt=1.0, rust_amt=0.6)
    m_yellow = bp.mat_painted_metal("A_TowerYellow", C["mustard"], C["mustard_dark"], wear_amt=0.9, rust_amt=0.3)
    m_steel = bp.mat_bare_metal("A_TowerSteel", C["steel"], rough=0.32)
    m_glow = bp.mat_flat("A_TowerLight", bp.hex_rgba("#fff0c4"), rough=0.15)

    objs = [
        # Base pesada con estabilizadores
        bp.make_box("Base", (1.2, 1.2, 0.24), (0, 0, 0.12), m_dark, bevel=0.02),
        bp.make_box("GenBox", (0.72, 0.72, 0.55), (0, 0, 0.50), m_yellow, bevel=0.02),
        # Mástil telescópico de 2 tramos
        bp.make_cylinder("MastBot", 0.10, 2.3, 14, (0, 0, 1.85), m_dark, bevel=0.008),
        bp.make_cylinder("MastTop", 0.065, 2.1, 14, (0, 0, 3.65), m_steel, bevel=0.006),
        bp.make_box("CrossArm", (1.35, 0.10, 0.10), (0, 0, 4.62), m_dark, bevel=0.01),
    ]
    # 2 reflectores orientados al frente (-Y) e inclinados hacia abajo
    for sx in (-0.42, 0.42):
        objs.append(bp.make_box(f"LampHousing_{sx}", (0.42, 0.24, 0.30), (sx, -0.06, 4.52), m_dark, bevel=0.015, rot=(-0.38, 0, 0)))
        objs.append(bp.make_box(f"LampLens_{sx}", (0.34, 0.06, 0.22), (sx, -0.17, 4.48), m_glow, bevel=0.005, rot=(-0.38, 0, 0)))
    return bp.join(objs, "FloodlightTower")


def build_metal_catwalk():
    """Pasarela metálica modular con barandas (4.0 largo Y, 2.2 ancho X, apoyada en Z=0)."""
    m_dark = bp.mat_painted_metal("A_CatDark", C["dark_steel"], C["dark_steel2"], wear_amt=1.0, rust_amt=0.6)
    m_yellow = bp.mat_painted_metal("A_CatRail", C["mustard"], C["mustard_dark"], wear_amt=0.85, rust_amt=0.25)
    m_steel = bp.mat_bare_metal("A_CatSteel", C["steel"], rough=0.35)

    objs = [
        bp.make_box("WalkDeck", (2.20, 4.00, 0.14), (0, 0, 0.07), m_dark, bevel=0.012),
        bp.make_box("KickL", (0.06, 4.00, 0.16), (-1.07, 0, 0.20), m_yellow, bevel=0.008),
        bp.make_box("KickR", (0.06, 4.00, 0.16), (1.07, 0, 0.20), m_yellow, bevel=0.008),
        # Pasamanos superior e intermedio
        bp.make_box("RailTopL", (0.06, 4.00, 0.06), (-1.07, 0, 1.12), m_yellow, bevel=0.008),
        bp.make_box("RailMidL", (0.05, 4.00, 0.05), (-1.07, 0, 0.64), m_steel, bevel=0.006),
        bp.make_box("RailTopR", (0.06, 4.00, 0.06), (1.07, 0, 1.12), m_yellow, bevel=0.008),
        bp.make_box("RailMidR", (0.05, 4.00, 0.05), (1.07, 0, 0.64), m_steel, bevel=0.006),
    ]
    for y in (-1.85, -0.62, 0.62, 1.85):
        for sx in (-1.07, 1.07):
            objs.append(bp.make_box(f"RailPost_{sx}_{y}", (0.07, 0.07, 1.08), (sx, y, 0.60), m_dark, bevel=0.008))
    return bp.join(objs, "MetalCatwalk")


def build_goal_arch():
    """Pórtico de meta con tuerca hexagonal gigante luminosa (8.0 ancho X, 6.5 alto Z, apoyado en Z=0)."""
    m_dark = bp.mat_painted_metal("A_ArchDark", C["dark_steel"], C["dark_steel2"], wear_amt=1.0, rust_amt=0.55)
    m_red = bp.mat_painted_metal("A_ArchRed", C["red"], C["red_dark"], wear_amt=0.9, band=True, rust_amt=0.35)
    m_brass = bp.mat_bare_metal("A_ArchBrass", C["brass"], rough=0.25)
    m_glow = bp.mat_flat("A_ArchGlow", bp.hex_rgba("#ffdf5a"), rough=0.18)

    # Tuerca hexagonal gigante hueca arriba del pórtico
    nut_bm = bmesh.new()
    r_out, r_in, d = 0.95, 0.45, 0.42
    rings = []
    for y in (-d / 2, d / 2):
        for r in (r_out, r_in):
            ring = [nut_bm.verts.new((r * math.cos(a), y, 5.75 + r * math.sin(a)))
                    for a in [math.pi / 6 + k * math.pi / 3 for k in range(6)]]
            rings.append(ring)
    for k in range(6):
        nk = (k + 1) % 6
        nut_bm.faces.new((rings[0][k], rings[0][nk], rings[2][nk], rings[2][k]))
        nut_bm.faces.new((rings[3][k], rings[3][nk], rings[1][nk], rings[1][k]))
        nut_bm.faces.new((rings[1][k], rings[1][nk], rings[0][nk], rings[0][k]))
        nut_bm.faces.new((rings[2][k], rings[2][nk], rings[3][nk], rings[3][k]))
    nut = bep.add_bm("GiantNut", nut_bm, m_brass)

    objs = [
        nut,
        # Pilares laterales con bases pesadas
        bp.make_box("BaseL", (1.3, 1.4, 0.45), (-3.85, 0, 0.225), m_dark, bevel=0.03),
        bp.make_box("BaseR", (1.3, 1.4, 0.45), (3.85, 0, 0.225), m_dark, bevel=0.03),
        bp.make_box("PillarL", (0.68, 0.72, 4.7), (-3.85, 0, 2.75), m_red, bevel=0.025),
        bp.make_box("PillarR", (0.68, 0.72, 4.7), (3.85, 0, 2.75), m_red, bevel=0.025),
        # Travesaño superior + barra luminosa
        bp.make_box("Beam", (8.6, 0.85, 0.75), (0, 0, 4.85), m_dark, bevel=0.03),
        bp.make_box("GlowSign", (6.2, 0.90, 0.24), (0, 0, 4.85), m_glow, bevel=0.01),
    ]
    return bp.join(objs, "GoalArch")


RECIPES = {
    "container_rust": build_container_rust,
    "scrap_ramp": build_scrap_ramp,
    "tire_barrier": build_tire_barrier,
    "floodlight_tower": build_floodlight_tower,
    "metal_catwalk": build_metal_catwalk,
    "goal_arch": build_goal_arch,
}


def run_one(key):
    bp.reset_scene()
    obj = RECIPES[key]()
    bp.unwrap(obj)

    art_dir = os.path.join(ENV_ART_DIR, key)
    tex_dir = os.path.join(art_dir, "textures")
    preview_path = os.path.join(ENV_ART_DIR, "previews", f"{key}_full.png")
    blend_path = os.path.join(art_dir, f"{key}.blend")
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
        export_image_format="WEBP", export_image_quality=84, export_cameras=False, export_lights=False,
        export_extras=False, export_animations=False,
    )
    try:
        bpy.ops.export_scene.gltf(export_vertex_color="NONE", **kwargs)
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs)

    bep.render_studio_preview(obj, preview_path)
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, relative_remap=True, compress=True)
    bp.report(obj, key, glb_path)


if __name__ == "__main__":
    targets = list(RECIPES.keys()) if WHICH == "all" else [WHICH]
    for k in targets:
        run_one(k)
