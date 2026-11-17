#!/usr/bin/env python3
"""Genera una VARIANTE de un prop estilizado con Blender y la deja lista para el juego.

    python make_prop.py --recipe barrel [--variant v002] [--seed 11] [--res 1024]
                        [--dims 0.46,0.77,0.46] [--pivot center|bottom]
                        [--palette paleta.json] [--blender RUTA] [--dry-run]
    python make_prop.py --find-blender
    python make_prop.py --report public/models/props/barrel.glb

Nunca sobrescribe: cada ejecución crea art/props/<receta>/<variante>/ y
public/models/props/variants/<receta>-<variante>.glb; si existen, aborta.
No toca src/ ni los GLB aprobados en public/models/props/.
"""
import argparse
import glob
import json
import os
import shutil
import struct
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
CONFIG = os.path.join(SKILL, "config.local.json")


def find_project_root():
    d = os.getcwd()
    while d != os.path.dirname(d):
        if os.path.exists(os.path.join(d, "package.json")):
            return d
        d = os.path.dirname(d)
    return os.getcwd()


# ---------------------------------------------------------------- Blender

def load_config():
    if os.path.exists(CONFIG):
        with open(CONFIG, encoding="utf-8") as f:
            return json.load(f)
    return {}


def candidate_blenders(cli_path=None):
    cfg = load_config()
    if cli_path:
        yield cli_path
    if os.environ.get("BLENDER_PATH"):
        yield os.environ["BLENDER_PATH"]
    if cfg.get("blender"):
        yield cfg["blender"]
    w = shutil.which("blender")
    if w:
        yield w
    pats = [
        r"C:\Program Files\Blender Foundation\Blender*\blender.exe",
        r"C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Blender Foundation\Blender*\blender.exe"),
        "/Applications/Blender.app/Contents/MacOS/Blender",
        "/usr/bin/blender", "/usr/local/bin/blender", "/snap/bin/blender",
    ]
    # Carpetas extra donde buscar instalaciones portables (config.local.json: "search_roots")
    for root in cfg.get("search_roots", []):
        pats += [os.path.join(root, "blender*", "blender.exe"), os.path.join(root, "blender*", "blender"),
                 os.path.join(root, "*", "blender*", "blender.exe")]
    for pat in pats:
        for p in sorted(glob.glob(pat), reverse=True):
            yield p


def find_blender(cli_path=None):
    for p in candidate_blenders(cli_path):
        if p and os.path.isfile(p):
            try:
                out = subprocess.run([p, "--version"], capture_output=True, text=True, timeout=60).stdout
            except Exception:
                continue
            if out.startswith("Blender"):
                return p, out.splitlines()[0]
    return None, None


# ---------------------------------------------------------------- GLB report

def glb_report(path):
    """Lee el chunk JSON del GLB (sin dependencias) y resume lo relevante."""
    with open(path, "rb") as f:
        data = f.read()
    magic, _, _ = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF", "no es GLB"
    jlen, _ = struct.unpack_from("<I4s", data, 12)
    gl = json.loads(data[20:20 + jlen])
    tris = 0
    for m in gl.get("meshes", []):
        for p in m["primitives"]:
            acc = gl["accessors"][p["indices"]] if "indices" in p else gl["accessors"][p["attributes"]["POSITION"]]
            tris += acc["count"] // 3
    images = []
    for i, img in enumerate(gl.get("images", [])):
        bv = gl["bufferViews"][img["bufferView"]] if "bufferView" in img else None
        images.append({"name": img.get("name", f"image{i}"), "mime": img.get("mimeType"),
                       "bytes": bv["byteLength"] if bv else None})
    return {
        "file": os.path.relpath(path).replace("\\", "/"),
        "bytes": len(data),
        "triangles": tris,
        "materials": [m.get("name") for m in gl.get("materials", [])],
        "double_sided": [bool(m.get("doubleSided")) for m in gl.get("materials", [])],
        "textures": len(gl.get("textures", [])),
        "images": images,
        "extensions_used": gl.get("extensionsUsed", []),
        "extensions_required": gl.get("extensionsRequired", []),
    }


def write_report(out_dir, glb, blender_stats, spec, blender_version):
    rep = {"spec": spec, "blender": blender_version, "mesh": blender_stats, "glb": glb_report(glb)}
    with open(os.path.join(out_dir, "report.json"), "w", encoding="utf-8") as f:
        json.dump(rep, f, indent=2, ensure_ascii=False)
    g = rep["glb"]
    lines = [
        f"# {spec['recipe']} / {spec['variant']}", "",
        f"- GLB: `{g['file']}` — {g['bytes'] / 1024:.0f} KB",
        f"- Triángulos: {g['triangles']}",
        f"- Materiales: {', '.join(g['materials'])} (doubleSided: {g['double_sided']})",
        f"- Texturas: {g['textures']} — " + ", ".join(f"{i['name']} {i['mime']} {i['bytes'] / 1024:.0f} KB" for i in g["images"]),
        f"- Extensiones: {', '.join(g['extensions_used'])}",
        f"- bbox (Blender Z arriba): {blender_stats.get('bbox_min_zup')} → {blender_stats.get('bbox_max_zup')}",
        f"- Collider de referencia (no se modifica): {blender_stats.get('collider_hint')}",
        f"- seed {spec['seed']}, res {spec['res']}, dims {spec['dims']}, pivote {spec['pivot']}, {blender_version}",
    ]
    with open(os.path.join(out_dir, "report.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


# ---------------------------------------------------------------- main

def next_variant(base_dir):
    n = 1
    while os.path.exists(os.path.join(base_dir, f"v{n:03d}")):
        n += 1
    return f"v{n:03d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--recipe", choices=[os.path.splitext(f)[0] for f in os.listdir(os.path.join(HERE, "recipes"))
                                         if f.endswith(".py") and not f.startswith("_")])
    ap.add_argument("--variant")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--res", type=int, default=1024, choices=[256, 512, 1024, 2048])
    ap.add_argument("--dims", help="ancho,alto,fondo en metros (Y arriba); omitir = medidas aprobadas")
    ap.add_argument("--pivot", default="center", choices=["center", "bottom"])
    ap.add_argument("--palette", help="JSON {clave: '#rrggbb'} que sobrescribe la paleta")
    ap.add_argument("--blender")
    ap.add_argument("--no-quantize", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="solo construye la malla e informa; no guarda nada")
    ap.add_argument("--find-blender", action="store_true")
    ap.add_argument("--report", help="resume un GLB existente (solo lectura)")
    a = ap.parse_args()

    if a.report:
        print(json.dumps(glb_report(a.report), indent=2, ensure_ascii=False))
        return
    blender, version = find_blender(a.blender)
    if a.find_blender:
        print(f"{blender} ({version})" if blender else "Blender no encontrado")
        sys.exit(0 if blender else 1)
    if not blender:
        sys.exit("Blender no encontrado. Usá --blender RUTA, BLENDER_PATH o config.local.json "
                 "({\"blender\": \"...\"} o {\"search_roots\": [...]}). No sustituir por primitivas.")
    if not a.recipe:
        ap.error("--recipe es obligatorio")

    root = find_project_root()
    base_dir = os.path.join(root, "art", "props", a.recipe)
    variant = a.variant or next_variant(base_dir)
    out_dir = os.path.join(base_dir, variant)
    glb = os.path.join(root, "public", "models", "props", "variants", f"{a.recipe}-{variant}.glb")
    if not a.dry_run and (os.path.exists(out_dir) or os.path.exists(glb)):
        sys.exit(f"Ya existe {out_dir} o {glb}: elegí otra --variant (no se sobrescriben recursos).")

    spec = {
        "recipe": a.recipe, "key": a.recipe, "variant": variant, "seed": a.seed, "res": a.res,
        "dims": [float(x) for x in a.dims.split(",")] if a.dims else None, "pivot": a.pivot,
        "palette": json.load(open(a.palette, encoding="utf-8")) if a.palette else {},
        "out_dir": out_dir, "glb": glb, "dry_run": a.dry_run,
    }
    os.makedirs(out_dir if not a.dry_run else os.path.join(root, "art", "props"), exist_ok=True)
    spec_path = os.path.join(out_dir if not a.dry_run else os.path.join(root, "art", "props"),
                             "spec.json" if not a.dry_run else f".dryrun-{a.recipe}.json")
    with open(spec_path, "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=2)

    proc = subprocess.run([blender, "-b", "--factory-startup", "-P", os.path.join(HERE, "blender_entry.py"),
                           "--", "--spec", spec_path], capture_output=True, text=True)
    stats_line = [l for l in proc.stdout.splitlines() if l.startswith("[PROPKIT] ")]
    if proc.returncode != 0 or not stats_line:
        print(proc.stdout[-4000:], proc.stderr[-4000:])
        sys.exit("Falló Blender")
    stats = json.loads(stats_line[-1][len("[PROPKIT] "):])
    if a.dry_run:
        os.remove(spec_path)
        print(json.dumps(stats, indent=2))
        return

    if not a.no_quantize:  # glTF-Transform vía npx (sin instalar en el proyecto)
        npx = shutil.which("npx") or shutil.which("npx.cmd")
        if npx:
            subprocess.run([npx, "-y", "@gltf-transform/cli@4", "quantize", glb, glb], check=True)
        else:
            print("Aviso: npx no disponible; GLB sin cuantizar.")
    write_report(out_dir, glb, stats, spec, version)


if __name__ == "__main__":
    main()
