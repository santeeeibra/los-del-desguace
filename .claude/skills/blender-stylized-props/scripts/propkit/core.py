"""propkit.core — escena, mallas, constructor de nodos y paleta.
Extraído sin cambios de técnica de art/blender/build_props.py (bidón y caja aprobados)."""
import bpy
import bmesh
import math
import random

from mathutils import Vector

def hex_rgba(h, a=1.0):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]

    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (lin(srgb[0]), lin(srgb[1]), lin(srgb[2]), a)


# Paleta (alineada con src/config/visualConfig.ts PALETTE)
DEFAULT_PALETTE = {
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


# Paleta activa: se modifica en sitio con set_palette() para que los materiales la vean.
COL = dict(DEFAULT_PALETTE)


def set_palette(overrides):
    """overrides: {clave: "#rrggbb"} o tuplas RGBA lineales."""
    COL.clear()
    COL.update(DEFAULT_PALETTE)
    for k, v in (overrides or {}).items():
        COL[k] = hex_rgba(v) if isinstance(v, str) else tuple(v)


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


