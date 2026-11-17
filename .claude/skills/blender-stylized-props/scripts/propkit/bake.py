"""propkit.bake — UV, horneado glTF (baseColor/ORM/normal), material final, exportación, previews y métricas."""
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Vector

from .core import hex_rgba, link_obj, set_active

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


def bake_all(obj, key, res, tex_dir):
    os.makedirs(tex_dir, exist_ok=True)
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

    save_png(base, os.path.join(tex_dir, f"{key}_baseColor.png"))
    save_png(orm, os.path.join(tex_dir, f"{key}_orm.png"))
    save_png(normal, os.path.join(tex_dir, f"{key}_normal.png"))
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


def export_glb(obj, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
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


def render_previews(obj, key, preview_dir):
    os.makedirs(preview_dir, exist_ok=True)
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
        scene.render.filepath = os.path.join(preview_dir, fname)
        bpy.ops.render.render(write_still=True)

    shoot((1.25, -1.55, 0.85), (0, 0, -0.02), 50, f"{key}_full.png")
    shoot((0.40, -0.46, 0.66), (0.03, -0.03, 0.24), 38, f"{key}_closeup.png")

    for o in (sun, floor, cam):
        bpy.data.objects.remove(o, do_unlink=True)


def bbox(obj):
    xs = [(obj.matrix_world @ Vector(c)) for c in obj.bound_box]
    mn = Vector((min(v.x for v in xs), min(v.y for v in xs), min(v.z for v in xs)))
    mx = Vector((max(v.x for v in xs), max(v.y for v in xs), max(v.z for v in xs)))
    return mn, mx


def mesh_stats(obj):
    """Métricas de la malla en espacio Blender (Z arriba). bbox en metros."""
    me = obj.data
    me.calc_loop_triangles()
    mn, mx = bbox(obj)
    return {
        "triangles": len(me.loop_triangles),
        "vertices": len(me.vertices),
        "blender_materials": len(me.materials),
        "bbox_min_zup": [round(c, 4) for c in mn],
        "bbox_max_zup": [round(c, 4) for c in mx],
    }


def fit_dims(obj, nominal_game, target_game=None):
    """Escala a dimensiones de juego (ancho X, alto Y, fondo Z; Y arriba). Llamar ANTES de
    hornear. nominal_game: medidas de diseño de la receta. Escalas >±25% deforman biseles
    y desplazan umbrales de suciedad por altura."""
    if target_game:
        sx = target_game[0] / nominal_game[0]
        sy = target_game[2] / nominal_game[2]   # fondo de juego = Y de Blender
        sz = target_game[1] / nominal_game[1]   # alto de juego = Z de Blender
        obj.scale = (sx, sy, sz)
        set_active(obj)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def set_pivot(obj, pivot="center"):
    """center = centro geométrico (como los colliders actuales); bottom = base en y=0.
    Llamar DESPUÉS de hornear (los materiales usan coordenadas de objeto)."""
    if pivot == "bottom":
        mn, _ = bbox(obj)
        for v in obj.data.vertices:
            v.co.z -= mn.z
    elif pivot != "center":
        raise ValueError(f"pivot no soportado: {pivot}")


