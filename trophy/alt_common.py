"""Shared helpers for the alternative trophy concepts (pokalen.py, foza_taarnet.py).

Most of this is copied from pizzakongen.py and render_previews.py, so the
alternatives use the same blob outline, text handling, checks and renderer
without importing the Pizzakongen script.
"""

import math
import os

import numpy as np
from manifold3d import CrossSection, FillRule, Manifold, OpType

HERE = os.path.dirname(os.path.abspath(__file__))
ADD = OpType.Add
BED = (256.0, 256.0, 256.0)      # Bambu Lab P1S
FONT_FILE = None                 # None uses matplotlib's bundled DejaVu Sans Bold

# The filament colours on hand, as render colours
BLACK = (0.13, 0.13, 0.14)
BLUE = (0.07, 0.13, 0.42)
GREEN = (0.06, 0.30, 0.15)
WHITE = (0.90, 0.90, 0.88)
BED_GREY = (0.75, 0.76, 0.78)
GLOSS = {BLACK: 0.5, BLUE: 0.55, GREEN: 0.5, WHITE: 0.15}
COLOUR_NAMES = {BLACK: "black", BLUE: "dark blue", GREEN: "dark green", WHITE: "white"}

# Width in pixels of every row of blobbym1.bmp, top to bottom (75 x 89 px).
SPRITE_ROW_WIDTHS = [
    9, 17, 21, 25, 29, 31, 33, 35, 37, 39, 41, 41, 43, 45, 45, 45, 47, 47, 49,
    49, 49, 49, 49, 51, 51, 51, 51, 51, 51, 51, 53, 53, 53, 53, 53, 53, 55, 55,
    55, 55, 55, 57, 57, 59, 59, 61, 61, 61, 63, 63, 63, 63, 65, 65, 65, 65, 65,
    65, 65, 65, 65, 65, 65, 63, 63, 63, 63, 61, 61, 61, 59, 57, 57, 55, 55, 53,
    51, 51, 49, 47, 45, 41, 39, 37, 33, 29, 25, 21, 13,
]


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def rounded_rect(w, h, r, segs=48):
    return CrossSection.square([w - 2 * r, h - 2 * r], True).offset(r, circular_segments=segs)


def slab(cs, z, dz=0.01):
    return cs.extrude(dz).translate([0, 0, z])


def union(items):
    return Manifold.batch_boolean(list(items), ADD)


def d_shape(d, flat):
    """A circle of diameter d with one flat side at y = +flat."""
    return CrossSection.circle(d / 2, 64) ^ CrossSection.square([2 * d, 2 * d]).translate(
        [-d, flat - 2 * d])


def to_bed(m):
    b = m.bounding_box()
    return m.translate([-(b[0] + b[3]) / 2, -(b[1] + b[4]) / 2, -b[2]])


def mesh_arrays(m):
    mesh = m.to_mesh()
    v = np.asarray(mesh.vert_properties)[:, :3].astype(float)
    f = np.asarray(mesh.tri_verts).astype(np.int64)
    return v, f


def revolve_pts(pts, segs=160):
    return Manifold.revolve(CrossSection([np.array(pts, float)], FillRule.Positive), segs)


# ---------------------------------------------------------------------------
# Text
# ---------------------------------------------------------------------------

def font_path():
    if FONT_FILE:
        return FONT_FILE
    import matplotlib
    return os.path.join(os.path.dirname(matplotlib.__file__), "mpl-data", "fonts",
                        "ttf", "DejaVuSans-Bold.ttf")


def check_glyphs(text):
    from matplotlib import ft2font
    cmap = ft2font.FT2Font(font_path()).get_charmap()
    missing = [c for c in text if c != " " and ord(c) not in cmap]
    if missing:
        raise SystemExit(f"Font {font_path()} has no glyph for {missing}")


def text_section(text, size):
    """Text outline as a CrossSection, origin at the left baseline."""
    from matplotlib.font_manager import FontProperties
    from matplotlib.textpath import TextPath
    tp = TextPath((0, 0), text, size=size, prop=FontProperties(fname=font_path()))
    polys = [p for p in tp.to_polygons(closed_only=True) if len(p) >= 3]
    return CrossSection(polys, FillRule.EvenOdd)


def fit_text_block(text, year, width, height, gap=1.8, year_scale=1.15):
    """Lay out `text` and `year` inside width x height, as large as possible.

    Tries the text on one line and split into two lines at every space. The
    year always gets its own last line. Returns the centred CrossSections of
    the lines, the font sizes and the cap height of the main text.
    """
    check_glyphs(text + str(year))
    words = text.split(" ")
    options = [[text]] + [[" ".join(words[:i]), " ".join(words[i:])] for i in range(1, len(words))]
    best = None
    for lines in options:
        secs = [text_section(t, 10.0) for t in lines]
        ys = text_section(str(year), 10.0)
        wmax = max(s.bounds()[2] - s.bounds()[0] for s in secs)
        hsum = sum(s.bounds()[3] - s.bounds()[1] for s in secs)
        yw = ys.bounds()[2] - ys.bounds()[0]
        yh = ys.bounds()[3] - ys.bounds()[1]
        ngap = len(lines) * gap
        # main size s, year size min(s * year_scale, what fits its width)
        s = 10.0 * min(width / wmax, (height - ngap) / (hsum + yh * year_scale))
        sy = min(s * year_scale, 10.0 * width / yw)
        if best is None or s > best[0] + 0.05:
            best = (s, sy, lines)
    s, sy, lines = best
    secs = [text_section(t, s) for t in lines] + [text_section(str(year), sy)]
    hs = [c.bounds()[3] - c.bounds()[1] for c in secs]
    total = sum(hs) + gap * (len(secs) - 1)
    y = total / 2
    out = []
    for c, h in zip(secs, hs):
        b = c.bounds()
        out.append(c.translate([-(b[0] + b[2]) / 2, y - b[3]]))
        y -= h + gap
    cap = text_section("H", s).bounds()
    return dict(lines=out, size=s, year_size=sy, cap=cap[3] - cap[1], text_lines=lines)


def stencil_bridges(material, text, bw):
    """Bridges that tie every loose island (the inside of o, e, a, 0 and so on)
    to the rest of the plate. Copied from pizzakongen.py.
    """
    bridges = []
    for _ in range(80):
        comps = sorted(material.decompose(), key=lambda c: -c.area())
        if len(comps) == 1:
            return material, bridges
        island = comps[1]
        b = island.bounds()
        cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        cands = []
        for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            if dx == 0:
                ray = CrossSection.square([bw, 300]).translate([cx - bw / 2, cy if dy > 0 else cy - 300])
            else:
                ray = CrossSection.square([300, bw]).translate([cx if dx > 0 else cx - 300, cy - bw / 2])
            hits = (ray ^ text).decompose()
            if not hits:
                continue

            def dist(h):
                hb = h.bounds()
                return {(0, 1): hb[1] - cy, (0, -1): cy - hb[3],
                        (1, 0): hb[0] - cx, (-1, 0): cx - hb[2]}[(dx, dy)]
            first = min(hits, key=dist)
            hb = first.bounds()
            if dx == 0:
                rect = CrossSection.square([bw, hb[3] - hb[1] + 0.4]).translate([cx - bw / 2, hb[1] - 0.2])
                length = hb[3] - hb[1]
            else:
                rect = CrossSection.square([hb[2] - hb[0] + 0.4, bw]).translate([hb[0] - 0.2, cy - bw / 2])
                length = (hb[2] - hb[0]) + 100      # prefer vertical bridges
            cands.append((length, rect))
        n_before = len(comps)
        for length, rect in sorted(cands, key=lambda c: c[0]):
            trial = material + rect
            if len(trial.decompose()) < n_before:
                material = trial
                bridges.append(rect)
                break
        else:
            raise SystemExit("could not bridge a stencil island")
    raise SystemExit("too many stencil islands")


def text_quality(t):
    """Share of the text area lost by a 0.8 mm opening (thin strokes)."""
    return 1 - t.offset(-0.4).offset(0.4).area() / t.area()


# ---------------------------------------------------------------------------
# Blob profile (same method as pizzakongen.py)
# ---------------------------------------------------------------------------

def blob_profile_px(widths=SPRITE_ROW_WIDTHS):
    """Smoothed right half outline of the sprite as (r, z) in pixels."""
    w = widths
    n = len(w)
    right = [(0.0, 0.0)]
    row = n - 1
    while row >= 0:
        first = row
        while row - 1 >= 0 and w[row - 1] == w[first]:
            row -= 1
        z_mid = n - (first + row + 1) / 2
        right.append((w[first] / 2, z_mid))
        row -= 1
    right.append((0.0, float(n)))
    left = [(-x, z) for x, z in reversed(right[1:-1])]
    pts = np.array(right + left)
    closed = np.vstack([pts, pts[:1]])
    seg = np.linalg.norm(np.diff(closed, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    step = 0.25
    ss = np.arange(0, s[-1], step)
    xs = np.interp(ss, s, closed[:, 0])
    zs = np.interp(ss, s, closed[:, 1])
    sigma = 1.2 / step
    k = np.arange(-int(4 * sigma), int(4 * sigma) + 1)
    ker = np.exp(-0.5 * (k / sigma) ** 2)
    ker /= ker.sum()

    def smooth(a):
        m = len(k)
        ext = np.concatenate([a[-m:], a, a[:m]])
        return np.convolve(ext, ker, mode="same")[m:-m]

    xs, zs = smooth(xs), smooth(zs)
    top_i = int(np.argmax(zs))
    xr, zr = xs[:top_i + 1], zs[:top_i + 1]
    keep = xr > 0
    prof = np.column_stack([xr[keep], zr[keep]])
    return np.vstack([prof, [0.0, zs[top_i]]])


def blob_profile_mm(height, cut_row=78):
    """Blob profile cut flat at sprite row `cut_row`, scaled to `height` mm."""
    prof_px = blob_profile_px()
    n = len(SPRITE_ROW_WIDTHS)
    z_cut = n - cut_row
    imax = int(np.argmax(prof_px[:, 0]))
    low = prof_px[:imax + 1]
    r_cut = float(np.interp(z_cut, low[:, 1], low[:, 0]))
    p = prof_px[prof_px[:, 1] > z_cut + 0.05]
    p = np.vstack([[r_cut, z_cut], p])
    p[:, 1] -= z_cut
    p = p * (height / p[:, 1].max())
    out = [p[0]]
    for q in p[1:-1]:
        if np.linalg.norm(q - out[-1]) >= 0.6:
            out.append(q)
    out.append(p[-1])
    return np.array(out)


def blob_outline_2d(height):
    """Flat silhouette of the blob (whole sprite, uncut), height in mm, base at y = 0."""
    p = blob_profile_px()
    p = p * (height / p[:, 1].max())
    right = [tuple(q) for q in p]
    left = [(-x, z) for x, z in reversed(right[1:-1])]
    return CrossSection([np.array([(0.0, 0.0)] + right + left)], FillRule.Positive)


def profile_section(profile):
    pts = [(0.0, 0.0)] + [tuple(q) for q in profile]
    if pts[-1][0] > 1e-6:
        pts.append((0.0, pts[-1][1]))
    return CrossSection([np.array(pts)], FillRule.Positive)


def steepest_outward(profile):
    """Steepest angle from vertical where the radius grows going up."""
    worst = 0.0
    for p, q in zip(profile[:-1], profile[1:]):
        dr, dz = q[0] - p[0], q[1] - p[1]
        if dr > 0 and dz > 0:
            worst = max(worst, math.degrees(math.atan2(dr, dz)))
    return worst


def pin_socket(d, flat, depth, tol, roof=False):
    """D-shaped socket with clearance, from z = 0 upward."""
    cs = d_shape(d + tol, flat + tol / 2)
    body = cs.extrude(depth)
    if roof:
        r = (d + tol) / 2
        body = body + (slab(cs, depth - 0.01) +
                       Manifold.sphere(0.05, 8).translate([0, 0, depth + r + 0.2])).hull()
    return body


def make_pin_vertical(d, flat, length, c=0.6):
    cs = d_shape(d, flat)
    return (slab(cs.offset(-c), 0) + slab(cs, c) + slab(cs, length - c) +
            slab(cs.offset(-c), length - 0.01)).hull()


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------

def check_part(name, m, overhang_deg=45.5):
    import trimesh
    v, f = mesh_arrays(m)
    tm = trimesh.Trimesh(v, f, process=True)
    b = m.bounding_box()
    size = (b[3] - b[0], b[4] - b[1], b[5] - b[2])
    n = tm.face_normals
    cz = tm.triangles_center[:, 2]
    areas = tm.area_faces
    bottom = areas[(n[:, 2] < -0.999) & (cz < 1e-3)].sum()
    oh = (n[:, 2] < -math.sin(math.radians(overhang_deg))) & (cz > 0.05)
    return dict(
        name=name, status=str(m.status()).split(".")[-1], watertight=bool(tm.is_watertight),
        winding=bool(tm.is_winding_consistent), is_volume=bool(tm.is_volume),
        bodies=len(m.decompose()), size=size,
        fits=all(s <= lim + 1e-6 for s, lim in zip(size, BED)),
        min_z=b[2], bottom_area=bottom, overhang_area=float(areas[oh].sum()),
        overhang_z=(round(float(cz[oh].min()), 1), round(float(cz[oh].max()), 1)) if oh.any() else None,
        volume_cm3=m.volume() / 1000.0, area_cm2=m.surface_area() / 100.0,
    )


def filament_grams(volume_cm3, area_cm2, density=1.24, wall_mm=1.6, infill=0.15):
    """Rough print weight: 4 walls and top/bottom shells, 15 percent infill."""
    shell = min(volume_cm3, area_cm2 * wall_mm / 10.0)
    return (shell + infill * (volume_cm3 - shell)) * density


def report_parts(parts, counts=None):
    counts = counts or {}
    results = []
    for name, m in parts.items():
        r = check_part(name, m)
        r["grams"] = filament_grams(r["volume_cm3"], r["area_cm2"])
        r["count"] = counts.get(name, 1)
        results.append(r)
        print(f"  {name:12s} {r['status']} watertight={r['watertight']} winding={r['winding']} "
              f"volume={r['is_volume']} bodies={r['bodies']} size={r['size'][0]:.1f} x "
              f"{r['size'][1]:.1f} x {r['size'][2]:.1f} fits={r['fits']} min_z={r['min_z']:.3f} "
              f"bottom={r['bottom_area']:.0f} mm2 overhang>45={r['overhang_area']:.1f} mm2 "
              f"z={r['overhang_z']} approx {r['grams']:.0f} g x{r['count']}")
        assert r["watertight"] and r["is_volume"] and r["bodies"] == 1 and r["fits"], name
        assert abs(r["min_z"]) < 1e-6 and r["bottom_area"] > 20, name
    return results


def export_parts(parts, out_dir, prefix, which="all"):
    import trimesh
    os.makedirs(out_dir, exist_ok=True)
    for name, m in parts.items():
        if which not in ("all", name):
            continue
        v, f = mesh_arrays(m)
        path = os.path.join(out_dir, f"{prefix}_{name}.stl")
        trimesh.Trimesh(v, f).export(path)
        print("wrote", path)


# ---------------------------------------------------------------------------
# Renderer (copied from render_previews.py)
# ---------------------------------------------------------------------------

def prep(m, color, gloss=None):
    import trimesh
    gloss = GLOSS.get(color, 0.5) if gloss is None else gloss
    v, f = mesh_arrays(m)
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


ZFIGHT = {}                      # render file name -> pixels where two colours tie in depth
ZFIGHT_EPS = 0.01                # mm
ZFIGHT_MASKS = {}
ZTIE_BIAS = 0.02                 # mm


def render(items, path, az=0, el=10, size=(1200, 1200), ss=2, crop=None,
           lights=None, title=None, edge=True, bg=(0.93, 0.94, 0.96)):
    """items: list of prepared meshes. crop: (vertices to frame, padding in mm)."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    c, right, up = camera(az, el)
    W, H = size[0] * ss, size[1] * ss
    allv = np.vstack([it[0] for it in items])
    sx_all, sy_all = allv @ right, allv @ up
    if crop is None:
        x0, x1, y0, y1 = sx_all.min(), sx_all.max(), sy_all.min(), sy_all.max()
        pad = 0.06 * max(x1 - x0, y1 - y0)
        x0, x1, y0, y1 = x0 - pad, x1 + pad, y0 - pad, y1 + pad
    else:
        cv, pad = crop
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
    zf = np.zeros((H, W), bool)          # pixels where two colours meet at the same depth

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
            ib = ibuf[ymin:ymax + 1, xmin:xmax + 1]
            near = inside & (ib >= 0) & (ib != idx) & (np.abs(z - zb) < ZFIGHT_EPS)
            if near.any():
                other = cbuf[ymin:ymax + 1, xmin:xmax + 1][near]
                zf[ymin:ymax + 1, xmin:xmax + 1][near] |= np.any(other != np.array(col), axis=1)
            # depth bias: on a tie within ZTIE_BIAS mm the later item wins, so
            # coplanar faces of two parts never flicker (render only, not the STL)
            upd = inside & (z > zb - ZTIE_BIAS)
            if not upd.any():
                continue
            zb[upd] = z[upd]
            n = (w0[..., None] * vn[t[0]] + w1[..., None] * vn[t[1]] + w2[..., None] * vn[t[2]])
            nbuf[ymin:ymax + 1, xmin:xmax + 1][upd] = n[upd]
            cbuf[ymin:ymax + 1, xmin:xmax + 1][upd] = col
            gbuf[ymin:ymax + 1, xmin:xmax + 1][upd] = gloss
            ibuf[ymin:ymax + 1, xmin:xmax + 1][upd] = idx

    hit = ibuf >= 0
    ZFIGHT[os.path.basename(path)] = int(zf.sum())
    ZFIGHT_MASKS[os.path.basename(path)] = (zf, ibuf.copy())
    n = nbuf / np.maximum(np.linalg.norm(nbuf, axis=2, keepdims=True), 1e-9)
    if lights is None:
        lights = [((-0.5, -0.8, 0.9), 0.85), ((0.9, -0.3, 0.4), 0.35), ((0.2, 0.9, 0.6), 0.25)]
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
    w, d = b[3] - b[0] + 2 * margin, b[4] - b[1] + 2 * margin
    return Manifold.cube([w, d, 0.8]).translate([b[0] - margin, b[1] - margin, -0.8])


def compare_sheet(panels, path, title):
    """Put rendered variants side by side. panels: list of (png path, caption lines)."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from PIL import Image
    n = len(panels)
    fig = plt.figure(figsize=(4.2 * n, 6.0), dpi=110)
    fig.suptitle(title, fontsize=15, color=(0.15, 0.15, 0.18), family="DejaVu Sans", y=0.985)
    for i, (png, caption) in enumerate(panels):
        ax = fig.add_axes([i / n + 0.005, 0.2, 1 / n - 0.01, 0.73])
        ax.imshow(Image.open(png))
        ax.axis("off")
        fig.text((i + 0.5) / n, 0.17, "\n".join(caption), ha="center", va="top", fontsize=10.5,
                 color=(0.15, 0.15, 0.18), family="DejaVu Sans", linespacing=1.5)
    fig.savefig(path, dpi=110, facecolor=(0.96, 0.96, 0.97))
    plt.close(fig)
    print("wrote", path)
