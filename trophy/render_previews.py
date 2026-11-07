"""Render PNG previews of the Pizzakongen trophy.

Uses a small z-buffer rasteriser written with numpy, so the previews show
correct hidden surfaces. Run after changing parameters in pizzakongen.py:

    python render_previews.py                      # default palette navy_white
    python render_previews.py --palette black_blob
    python render_previews.py --palettes           # every alternate, to renders/palettes2/
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
GREEN = (0.06, 0.30, 0.15)
WHITE = (0.90, 0.90, 0.88)
BED = (0.75, 0.76, 0.78)

GLOSS = {BLACK: 0.5, BLUE: 0.55, GREEN: 0.5, WHITE: 0.15}
NAMES = {BLACK: "black", BLUE: "dark blue", GREEN: "dark green", WHITE: "white"}

# Colour per part. "letters" is the raised text and frame on the plaque and
# "toppings" the raised crust and pepperoni on the slices. Both are printed
# after one filament change. Leave them out to print the part in one colour.
PALETTES = {
    "navy_white": dict(title="Navy blob and base, white crown, white plaque with navy letters",
                       base=BLUE, blob=BLUE, crown_band=WHITE, slices=WHITE, plaque=WHITE,
                       letters=BLUE, pin=WHITE),
    "navy_mono": dict(title="All navy, white letters",
                      base=BLUE, blob=BLUE, crown_band=BLUE, slices=BLUE, plaque=BLUE,
                      letters=WHITE, pin=BLUE),
    "black_blob": dict(title="Navy blob, black base, crown and plaque, white letters",
                       base=BLACK, blob=BLUE, crown_band=BLACK, slices=BLACK, plaque=BLACK,
                       letters=WHITE, pin=BLACK),
    "white_base": dict(title="White base, navy blob, crown and plaque, white letters",
                       base=WHITE, blob=BLUE, crown_band=BLUE, slices=BLUE, plaque=BLUE,
                       letters=WHITE, pin=BLUE),
    "green_white": dict(title="Green blob and base, white crown, white plaque with green letters",
                        base=GREEN, blob=GREEN, crown_band=WHITE, slices=WHITE, plaque=WHITE,
                        letters=GREEN, pin=WHITE),
}
DEFAULT_PALETTE = "navy_white"
ALTERNATES = ["navy_white", "navy_mono", "black_blob", "white_base", "green_white"]


def scheme_of(pal):
    """Colour for every assembled piece, including the relief pieces."""
    sc = {k: v for k, v in pal.items() if k != "title"}
    sc.setdefault("letters", sc["plaque"])
    sc.setdefault("toppings", sc["slices"])
    sc["plaque_top"] = sc["letters"]
    sc["slice_tops"] = sc["toppings"]
    return sc


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
    """Split the plaque and the slices into plate and relief for the renders.

    The cut runs SPLIT_GAP above the plate top, so the relief mesh never
    shares a face with the plate mesh. The STL parts are not touched.
    """
    asm = dict(asm)
    if not P.STENCIL:
        front = -P.BOX_W / 2 + P.PLAQUE_POCKET - P.PLAQUE_T
        asm["plaque_top"], asm["plaque"] = asm["plaque"].split_by_plane(
            [0, -1, 0], -front + SPLIT_GAP)
    low, top = P.split_relief(P.make_slice(), P.relief_z("slice") + SPLIT_GAP)
    zc = info["base"]["cheese_z"]
    place = [P.slice_world_transform(info["g"], k).tolist() for k in range(P.NUM_SLICES)]
    asm["slices"] = P.union(low.transform(t).translate([0, 0, zc]) for t in place)
    asm["slice_tops"] = P.union(top.transform(t).translate([0, 0, zc]) for t in place)
    return asm


def scene(asm, scheme):
    return [prep(m, scheme[name], GLOSS[scheme[name]])
            for name, m in asm.items() if name != "pin"]


PLAQUE_LIGHTS = [((-0.6, -0.5, 0.6), 1.0), ((0.4, -0.8, 0.2), 0.25)]


def render_plaque(asm, scheme, path):
    """Straight on close up of the plaque with a raking light from the upper left."""
    crop = (P.mesh_arrays(asm["plaque"])[0], 5.0)
    names = [n for n in ("base", "plaque", "plaque_top") if n in asm]
    items = [prep(asm[n], scheme[n], GLOSS[scheme[n]]) for n in names]
    render(items, path, az=0, el=12, size=(1400, 380), crop=crop, lights=PLAQUE_LIGHTS,
           title=None)


def palette_grams(parts, sc):
    """Filament per colour in grams for one scheme, with every slice counted."""
    count = {"slice": P.NUM_SLICES}
    key = {"slice": ("slices", "toppings"), "plaque": ("plaque", "letters")}
    grams = {}

    def add(m, col, n):
        r = P.check_part("x", m)
        grams[NAMES[col]] = grams.get(NAMES[col], 0.0) + n * P.filament_grams(
            r["volume_cm3"], r["area_cm2"])

    for name, m in parts.items():
        n = count.get(name, 1)
        z = P.relief_z(name)
        if z is not None and sc[key[name][0]] != sc[key[name][1]]:
            low, top = P.split_relief(m, z)
            add(low, sc[key[name][0]], n)
            add(top, sc[key[name][1]], n)
        else:
            add(m, sc[key.get(name, (name,))[0]], n)
    return grams


def render_palettes():
    """Angle view and plaque close up per palette, plus a labelled comparison."""
    from PIL import Image, ImageDraw, ImageFont
    out = os.path.join(OUT, "palettes2")
    os.makedirs(out, exist_ok=True)
    parts, asm, info = P.build()
    asm = split_scene(asm, info)
    font = os.path.join(os.path.dirname(matplotlib.__file__), "mpl-data", "fonts", "ttf")
    big = ImageFont.truetype(os.path.join(font, "DejaVuSans-Bold.ttf"), 30)
    small = ImageFont.truetype(os.path.join(font, "DejaVuSans.ttf"), 22)
    tiles = []
    for name in ALTERNATES:
        pal = PALETTES[name]
        sc = scheme_of(pal)
        angle = os.path.join(out, f"{name}_angle.png")
        plaque = os.path.join(out, f"{name}_plaque.png")
        render(scene(asm, sc), angle, az=35, el=24, size=(1000, 1000), title=pal["title"])
        render_plaque(asm, sc, plaque)
        grams = palette_grams(parts, sc)
        print(name, ", ".join(f"{c} {g:.0f} g" for c, g in grams.items()))
        tiles.append((name, pal, angle, plaque, grams))

    tw = 700
    th_img, th_pl = tw, int(tw * 380 / 1400)
    th_txt = 260
    sheet = Image.new("RGB", (tw * len(tiles), th_img + th_pl + th_txt), (246, 247, 249))
    draw = ImageDraw.Draw(sheet)
    for i, (name, pal, angle, plaque, grams) in enumerate(tiles):
        x = i * tw
        a = Image.open(angle).convert("RGB")
        # paint over the title of the single render, the label goes below
        ImageDraw.Draw(a).rectangle((0, 0, a.width, 48), fill=a.getpixel((4, 50)))
        a = a.resize((tw, tw), Image.LANCZOS)
        sheet.paste(a, (x, 0))
        sheet.paste(Image.open(plaque).convert("RGB").resize((tw, th_pl), Image.LANCZOS),
                    (x, th_img))
        y = th_img + th_pl + 16
        draw.text((x + 22, y), f"{i + 1}. {name}", font=big, fill=(25, 25, 30))
        y += 44
        lines = [f"Blob: {NAMES[pal['blob']]}", f"Base: {NAMES[pal['base']]}",
                 f"Crown band: {NAMES[pal['crown_band']]}, slices: {NAMES[pal['slices']]}"]
        lines.append(f"Plaque: {NAMES[pal['plaque']]}, raised letters: {NAMES[pal['letters']]}")
        fil = [f"{c} {g:.0f} g" for c, g in grams.items()]
        lines.append("Filament: " + ", ".join(fil[:2]))
        if fil[2:]:
            lines.append("    " + ", ".join(fil[2:]))
        for line in lines:
            draw.text((x + 22, y), line, font=small, fill=(55, 55, 62))
            y += 31
        if i:
            draw.line([(x, 0), (x, sheet.height)], fill=(200, 202, 208), width=2)
    path = os.path.join(out, "compare.png")
    sheet.save(path)
    print("wrote", path)


def crown_crop(asm):
    v = np.vstack([P.mesh_arrays(asm[n])[0] for n in ("crown_band", "slices", "slice_tops")])
    return v, 4.0


def render_slice_options(asm, sc, path):
    """Crown close ups side by side: plain slices, and toppings in the letter colour."""
    from PIL import Image, ImageDraw
    opts = [("Plain white slices, one colour", sc),
            (f"Toppings and crust in {NAMES[sc['letters']]}, one switch",
             dict(sc, slice_tops=sc["letters"]))]
    tiles = []
    for k, (label, s2) in enumerate(opts):
        tmp = path.replace(".png", f"_{k}.png")
        render(scene(asm, s2), tmp, az=20, el=14, size=(900, 700), crop=crown_crop(asm),
               title=label)
        tiles.append(Image.open(tmp).convert("RGB"))
        os.remove(tmp)
    sheet = Image.new("RGB", (sum(t.width for t in tiles), tiles[0].height), (255, 255, 255))
    x = 0
    for t in tiles:
        sheet.paste(t, (x, 0))
        x += t.width
    ImageDraw.Draw(sheet).line([(tiles[0].width, 0), (tiles[0].width, sheet.height)],
                               fill=(200, 202, 208), width=2)
    sheet.save(path)
    print("wrote", path)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Render Pizzakongen previews")
    ap.add_argument("--palette", default=DEFAULT_PALETTE, choices=list(PALETTES),
                    help="colours for the assembled renders")
    ap.add_argument("--palettes", action="store_true",
                    help="render every alternate palette to renders/palettes2/ and stop")
    a = ap.parse_args(argv)
    if a.palettes:
        render_palettes()
        return
    os.makedirs(OUT, exist_ok=True)
    pal = PALETTES[a.palette]
    parts, asm, info = P.build()
    asm = split_scene(asm, info)
    scheme = scheme_of(pal)

    items = scene(asm, scheme)
    render(items, os.path.join(OUT, "assembled_front.png"), az=0, el=6,
           title="Pizzakongen, front. " + pal["title"])
    render(items, os.path.join(OUT, "assembled_angle.png"), az=35, el=24,
           title="Pizzakongen, front left")
    render_slice_options(asm, scheme, os.path.join(OUT, "slice_options.png"))

    render_plaque(asm, scheme, os.path.join(OUT, "plaque_closeup.png"))
    stencil = P.STENCIL
    P.STENCIL = True
    _, asm_st, info_st = P.build()
    asm_st = split_scene(asm_st, info_st)
    P.STENCIL = stencil
    render_plaque(asm_st, scheme, os.path.join(OUT, "plaque_closeup_stencil.png"))

    labels = {"blob": "Blob, upright, flat foot on the bed",
              "crown_band": "Crown band, upright",
              "slice": "Pizza slice (print 5), flat, back on the bed",
              "base": "Base, upright",
              "plaque": "Plaque, flat, front facing up. Letters after the switch",
              "pin": "Pin, lying on its flat side"}
    tops = {"plaque": "letters", "slice": "toppings"}
    for name, m in parts.items():
        col = scheme["slices" if name == "slice" else name]
        z = P.relief_z(name)
        if z is not None and scheme[tops[name]] != col:
            low, top = P.split_relief(m, z + SPLIT_GAP)
            pieces = [prep(low, col, GLOSS[col]),
                      prep(top, scheme[tops[name]], GLOSS[scheme[tops[name]]])]
        else:
            pieces = [prep(m, col, GLOSS[col])]
        render(pieces + [prep(bed_under(m), BED, 0.0)],
               os.path.join(OUT, f"print_{name}.png"), az=30, el=32, size=(900, 900),
               title=labels[name])


if __name__ == "__main__":
    main()
