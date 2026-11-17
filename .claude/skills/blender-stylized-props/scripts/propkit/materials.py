"""propkit.materials — familias de materiales procedurales de autoría (se hornean luego)."""
from .core import *  # noqa: F401,F403
from .core import COL, NB, hex_rgba, new_mat

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


