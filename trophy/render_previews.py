"""Render PNG previews of the Pizzakongen trophy.

Uses a small z-buffer rasteriser written with numpy, so the previews show
correct hidden surfaces. Run after changing parameters in pizzakongen.py:

    python render_previews.py
    python render_previews.py --bases     # every base style, to renders/bases/
"""

import argparse
import math
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import trimesh

import pizzakongen as P

OUT = os.path.join(P.HERE, "renders")

# The filament colours on hand
BLACK = (0.13, 0.13, 0.14)
BLUE = (0.07, 0.13, 0.42)
WHITE = (0.90, 0.90, 0.88)
BED = (0.75, 0.76, 0.78)

GLOSS = {BLACK: 0.5, BLUE: 0.55, WHITE: 0.15}
NAMES = {BLACK: "black", BLUE: "dark blue", WHITE: "white"}

# Colour per assembled piece. "plaque_top" is the raised text and frame on the
# plaque and "base_top" the court lines on the court base. Both are printed
# after one filament change.
SCHEME = dict(base=BLACK, blob=BLUE, crown=BLACK, plaque=BLACK, plaque_top=WHITE, pin=BLACK,
              base_top=WHITE)
TITLE = "Dark blue blob, black crown and base, white letters"


def prep(m, color, gloss=0.6):
    v, f = P.mesh_arrays(m)
    tm = trimesh.Trimesh(v, f, process=False)
    sm = trimesh.graph.smooth_shade(tm, angle=math.radians(28))
    return np.asarray(sm.vertices), np.asarray(sm.faces), np.asarray(sm.vertex_normals), color, gloss


def camera(az, el):
    a, e = math.radians(az), math.radians(el)
    c = np.array([math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)])
    right = np.cross([0, 0, 1.0], c)
    right /= np.linalg.norm(right)
    up = np.cross(c, right)
    return c, right, up


def render(items, path, az=0, el=10, size=(1200, 1200), ss=2, crop=None,
           lights=None, title=None, edge=True, bg=(0.93, 0.94, 0.96)):
    """items: list of prepared meshes. crop: (vertices to frame, padding in mm)."""
    c, right, up = camera(az, el)
    W, H = size[0] * ss, size[1] * ss
    allv = np.vstack([it[0] for it in items])
    sx_all, sy_all = allv @ right, allv @ up
    if crop is None:
        x0, x1, y0, y1 = sx_all.min(), sx_all.max(), sy_all.min(), sy_all.max()
        pad = 0.06 * max(x1 - x0, y1 - y0)
        x0, x1, y0, y1 = x0 - pad, x1 + pad, y0 - pad, y1 + pad
    else:
        cv = crop[0]
        pad = crop[1]
        sx, sy = cv @ right, cv @ up
        x0, x1, y0, y1 = sx.min() - pad, sx.max() + pad, sy.min() - pad, sy.max() + pad
    k = min(W / (x1 - x0), H / (y1 - y0))
    ox = (W - (x1 - x0) * k) / 2
    oy = (H - (y1 - y0) * k) / 2

    zbuf = np.full((H, W), -np.inf)
    nbuf = np.zeros((H, W, 3))
    cbuf = np.zeros((H, W, 3))
    gbuf = np.zeros((H, W))
    ibuf = np.full((H, W), -1, dtype=np.int32)

    for idx, (v, f, vn, col, gloss) in enumerate(items):
        px = (v @ right - x0) * k + ox
        py = H - ((v @ up - y0) * k + oy)
        pz = v @ c
        tri = f
        fn = np.cross(v[tri[:, 1]] - v[tri[:, 0]], v[tri[:, 2]] - v[tri[:, 0]])
        vis = fn @ c > 0
        for t in tri[vis]:
            xa, ya = px[t], py[t]
            xmin = max(int(math.floor(xa.min())), 0)
            xmax = min(int(math.ceil(xa.max())), W - 1)
            ymin = max(int(math.floor(ya.min())), 0)
            ymax = min(int(math.ceil(ya.max())), H - 1)
            if xmax < xmin or ymax < ymin:
                continue
            gx, gy = np.meshgrid(np.arange(xmin, xmax + 1) + 0.5, np.arange(ymin, ymax + 1) + 0.5)
            d = (ya[1] - ya[2]) * (xa[0] - xa[2]) + (xa[2] - xa[1]) * (ya[0] - ya[2])
            if abs(d) < 1e-12:
                continue
            w0 = ((ya[1] - ya[2]) * (gx - xa[2]) + (xa[2] - xa[1]) * (gy - ya[2])) / d
            w1 = ((ya[2] - ya[0]) * (gx - xa[2]) + (xa[0] - xa[2]) * (gy - ya[2])) / d
            w2 = 1 - w0 - w1
            inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
            if not inside.any():
                continue
            z = w0 * pz[t[0]] + w1 * pz[t[1]] + w2 * pz[t[2]]
            zb = zbuf[ymin:ymax + 1, xmin:xmax + 1]
            upd = inside & (z > zb)
            if not upd.any():
                continue
            zb[upd] = z[upd]
            n = (w0[..., None] * vn[t[0]] + w1[..., None] * vn[t[1]] + w2[..., None] * vn[t[2]])
            nbuf[ymin:ymax + 1, xmin:xmax + 1][upd] = n[upd]
            cbuf[ymin:ymax + 1, xmin:xmax + 1][upd] = col
            gbuf[ymin:ymax + 1, xmin:xmax + 1][upd] = gloss
            ibuf[ymin:ymax + 1, xmin:xmax + 1][upd] = idx

    hit = ibuf >= 0
    n = nbuf / np.maximum(np.linalg.norm(nbuf, axis=2, keepdims=True), 1e-9)
    if lights is None:
        lights = [((-0.5, -0.8, 0.9), 0.85), ((0.9, -0.3, 0.4), 0.35), ((0.2, 0.9, 0.6), 0.25)]
    img = np.zeros((H, W, 3))
    amb = 0.22
    shade = np.full((H, W), amb)
    spec = np.zeros((H, W))
    for ldir, inten in lights:
        l = np.array(ldir, float)
        l /= np.linalg.norm(l)
        shade += inten * np.clip(n @ l, 0, None)
        h = l + c
        h /= np.linalg.norm(h)
        spec += inten * np.clip(n @ h, 0, None) ** 40
    img = cbuf * shade[..., None] + (gbuf * spec)[..., None] * 0.9
    img = np.clip(img, 0, 1)
    if edge:
        zz = np.where(hit, zbuf, zbuf[hit].min() - 50 if hit.any() else 0)
        gz = np.zeros((H, W))
        gz[:, 1:] = np.maximum(gz[:, 1:], np.abs(np.diff(zz, axis=1)))
        gz[1:, :] = np.maximum(gz[1:, :], np.abs(np.diff(zz, axis=0)))
        gi = np.zeros((H, W), bool)
        gi[:, 1:] |= ibuf[:, 1:] != ibuf[:, :-1]
        gi[1:, :] |= ibuf[1:, :] != ibuf[:-1, :]
        e = (gz > 1.5 / k * 4) | gi
        img[e] = img[e] * 0.35
    bgimg = np.ones((H, W, 3)) * np.array(bg)
    grad = np.linspace(1.0, 0.92, H)[:, None, None]
    bgimg = bgimg * grad
    img = np.where(hit[..., None], img, bgimg)
    img = img.reshape(size[1], ss, size[0], ss, 3).mean(axis=(1, 3))

    fig = plt.figure(figsize=(size[0] / 100, size[1] / 100), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.imshow(img)
    ax.axis("off")
    if title:
        ax.text(0.02, 0.975, title, transform=ax.transAxes, fontsize=15, va="top",
                color=(0.15, 0.15, 0.18), family="DejaVu Sans")
    fig.savefig(path, dpi=100)
    plt.close(fig)
    print("wrote", path)


def bed_under(m, margin=8.0):
    b = m.bounding_box()
    from manifold3d import Manifold
    w, d = b[3] - b[0] + 2 * margin, b[4] - b[1] + 2 * margin
    return Manifold.cube([w, d, 0.8]).translate([b[0] - margin, b[1] - margin, -0.8])


SPLIT_GAP = 0.02   # mm, render only. Keeps the two colours of a part off one plane


def split_scene(asm, info):
    """Split the plaque, and the court base, into their two colours for the renders.

    The cut runs SPLIT_GAP above the switch height, so the two meshes never
    share a face. The STL parts are not touched.
    """
    asm = dict(asm)
    if not P.STENCIL:
        front = info["base"]["front_y"] + P.PLAQUE_POCKET - P.PLAQUE_T
        asm["plaque_top"], asm["plaque"] = asm["plaque"].split_by_plane(
            [0, -1, 0], -front + SPLIT_GAP)
    rz = info["base"]["relief_z"]
    if rz is not None:
        asm["base_top"], asm["base"] = asm["base"].split_by_plane([0, 0, 1], rz + SPLIT_GAP)
    return asm


def scene(asm, scheme):
    return [prep(m, scheme[name], GLOSS[scheme[name]])
            for name, m in asm.items() if name != "pin"]


PLAQUE_LIGHTS = [((-0.6, -0.5, 0.6), 1.0), ((0.4, -0.8, 0.2), 0.25)]


def render_plaque(asm, scheme, path):
    """Straight on close up of the plaque with a raking light from the upper left."""
    crop = (P.mesh_arrays(asm["plaque"])[0], 5.0)
    names = [n for n in ("base", "base_top", "plaque", "plaque_top") if n in asm]
    items = [prep(asm[n], scheme[n], GLOSS[scheme[n]]) for n in names]
    render(items, path, az=0, el=12, size=(1400, 380), crop=crop, lights=PLAQUE_LIGHTS,
           title=None)


def render_crown(asm, path):
    """Close up of the crown on the head, from the front left and a little above."""
    v = P.mesh_arrays(asm["crown"])[0]
    render(scene(asm, SCHEME), path, az=25, el=18, size=(900, 700), crop=(v, 6.0),
           title=f"Crown, {P.NUM_POINTS} points with a ball on each tip")


def print_pieces(name, m):
    """A print part in its colours, split at the filament switch if it has one."""
    col = SCHEME[name]
    z = P.relief_z(name)
    if z is None:
        return [prep(m, col, GLOSS[col])]
    top_col = SCHEME[name + "_top"]
    low, top = P.split_relief(m, z + SPLIT_GAP)
    return [prep(low, col, GLOSS[col]), prep(top, top_col, GLOSS[top_col])]


def render_print(name, m, path, title):
    render(print_pieces(name, m) + [prep(bed_under(m), BED, 0.0)], path, az=30, el=32,
           size=(900, 900), title=title)


def base_grams(m):
    """Filament per colour for a base part, in grams."""
    z = P.relief_z("base")
    pieces = [(m, "black")]
    if z is not None:
        low, top = P.split_relief(m, z)
        pieces = [(low, "black"), (top, "white")]
    out = {}
    for piece, col in pieces:
        r = P.check_part("x", piece)
        out[col] = out.get(col, 0.0) + P.filament_grams(r["volume_cm3"], r["area_cm2"])
    return out


def render_bases():
    """Every base style: assembled from the front left, on the bed, and a comparison sheet."""
    from PIL import Image, ImageDraw, ImageFont
    out = os.path.join(OUT, "bases")
    os.makedirs(out, exist_ok=True)
    keep = P.BASE_STYLE
    tiles = []
    for style, label in P.BASE_STYLES.items():
        P.BASE_STYLE = style
        parts, asm, info = P.build()
        asm = split_scene(asm, info)
        angle = os.path.join(out, f"{style}_angle.png")
        render(scene(asm, SCHEME), angle, az=35, el=24, size=(1000, 1000),
               title=f"Base: {style}. {label}")
        render_print("base", parts["base"], os.path.join(out, f"{style}_print_base.png"),
                     f"Base {style}, upright")
        tiles.append((style, label, angle, base_grams(parts["base"])))
    P.BASE_STYLE = keep

    font = os.path.join(os.path.dirname(matplotlib.__file__), "mpl-data", "fonts", "ttf")
    big = ImageFont.truetype(os.path.join(font, "DejaVuSans-Bold.ttf"), 30)
    small = ImageFont.truetype(os.path.join(font, "DejaVuSans.ttf"), 21)
    tw, th_txt = 640, 150
    sheet = Image.new("RGB", (tw * len(tiles), tw + th_txt), (246, 247, 249))
    draw = ImageDraw.Draw(sheet)
    for i, (style, label, angle, grams) in enumerate(tiles):
        x = i * tw
        a = Image.open(angle).convert("RGB")
        # paint over the title of the single render, the label goes below
        ImageDraw.Draw(a).rectangle((0, 0, a.width, 48), fill=a.getpixel((4, 50)))
        sheet.paste(a.resize((tw, tw), Image.LANCZOS), (x, 0))
        y = tw + 14
        default = " (default)" if style == keep else ""
        draw.text((x + 20, y), f"{i + 1}. {style}{default}", font=big, fill=(25, 25, 30))
        y += 42
        words, line, lines = label.split(), "", []
        for w in words:
            if len(line) + len(w) > 46:
                lines.append(line)
                line = ""
            line = f"{line} {w}".strip()
        lines.append(line)
        lines.append("Base filament: " + ", ".join(f"{c} {g:.0f} g" for c, g in grams.items()))
        for t in lines:
            draw.text((x + 20, y), t, font=small, fill=(55, 55, 62))
            y += 28
        if i:
            draw.line([(x, 0), (x, sheet.height)], fill=(200, 202, 208), width=2)
    path = os.path.join(out, "compare.png")
    sheet.save(path)
    print("wrote", path)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Render Pizzakongen previews")
    ap.add_argument("--bases", action="store_true",
                    help="render every base style to renders/bases/ and stop")
    a = ap.parse_args(argv)
    os.makedirs(OUT, exist_ok=True)
    if a.bases:
        render_bases()
        return
    parts, asm, info = P.build()
    asm = split_scene(asm, info)

    items = scene(asm, SCHEME)
    render(items, os.path.join(OUT, "assembled_front.png"), az=0, el=6,
           title="Pizzakongen, front. " + TITLE)
    render(items, os.path.join(OUT, "assembled_angle.png"), az=35, el=24,
           title="Pizzakongen, front left")
    render_crown(asm, os.path.join(OUT, "crown_closeup.png"))
    render_plaque(asm, SCHEME, os.path.join(OUT, "plaque_closeup.png"))

    labels = {"blob": "Blob, upright, flat foot on the bed",
              "crown": "Crown, upright, band on the bed",
              "base": "Base, upright",
              "plaque": "Plaque, flat, front facing up. Letters after the switch",
              "pin": "Pin, lying on its flat side"}
    for name, m in parts.items():
        render_print(name, m, os.path.join(OUT, f"print_{name}.png"), labels[name])


if __name__ == "__main__":
    main()
