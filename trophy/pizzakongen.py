"""Pizzakongen trophy: a Blobby blob wearing a crown of pizza slices.

Parametric model built with manifold3d. Run it to export STL files and
print the printability checks:

    python pizzakongen.py                    # all parts
    python pizzakongen.py --part plaque      # one part
    python pizzakongen.py --year 2027 --tolerance 0.4

Every value below can be changed here or from the command line.
"""

import argparse
import math
import os

import numpy as np
from manifold3d import CrossSection, FillRule, Manifold, OpType

# ---------------------------------------------------------------------------
# Parameters
# ---------------------------------------------------------------------------

YEAR = 2026                      # year on the plaque
TEXT = "Svettaste Blåbby"        # first line on the plaque
OVERALL_HEIGHT = 170.0           # mm, bottom of base to top of the crown (150 to 200)
TOLERANCE = 0.3                  # mm total clearance per fit. PLA 0.3, PETG 0.4
PART = "all"                     # all, blob, crown_band, slice, base, plaque, pin

NUM_SLICES = 5                   # pizza slices on the crown (5, 3 or 1)

# Base: a closed pizza box with a round pizza on top
BOX_W = 140.0                    # mm, square box
BOX_H = 42.0                     # mm, box height including the lid
BOX_CORNER_R = 6.0
LID_H = 8.0                      # mm, lid band at the top of the box
LID_LIP = 1.2                    # mm, how far the lid stands out
PIZZA_R = 62.0                   # mm, pizza radius on top of the box
PIZZA_CHEESE_Z = 4.5             # mm, cheese surface above the box top
PIZZA_CRUST_W = 8.0              # mm, width of the rounded crust rim
RELIEF = 1.2                     # mm, height of pepperoni and other relief
NUM_CUTS = 6                     # engraved slice cut lines in the cheese

# Plaque (separate part, pushed into a pocket in the box front)
PLAQUE_W = 122.0
PLAQUE_H = 28.0
PLAQUE_T = 3.0                   # plate thickness without the text
PLAQUE_POCKET = 1.6              # pocket depth in the box front
PLAQUE_Z = 3.0                   # bottom of the plaque above the bed
TEXT_RELIEF = 1.2                # raised text and frame height
STENCIL = True                   # True cuts the text through the plaque, so the base shows
                                 # through the letters. False gives raised text.
BRIDGE_W = 1.2                   # mm, stencil bridges that hold the inside of closed letters
FONT_FILE = None                 # None uses matplotlib's bundled DejaVu Sans Bold

# Blob (spun from the real sprite outline of data/gfx/blobbym1.bmp)
BLOB_CUT_ROW = 78                # sprite row where the blob is cut flat
BAND_TOP_ROW = 9                 # sprite row at the top of the crown band
BAND_BOTTOM_ROW = 20             # sprite row at the bottom of the crown band

# Crown band and slices
BAND_WALL = 3.0                  # mm, wall at the bottom of the band
BAND_BEAD = 1.2                  # mm, raised rings at the top and bottom of the band
SLICE_W = 26.0
SLICE_H = 30.0                   # height of a slice above the band
SLICE_T = 3.2                    # plate thickness
SLOT_DEPTH = 6.0
TAB_W = 12.0

# Pin between blob and base
PIN_D = 10.0                     # D-shaped pin diameter
PIN_FLAT = 2.5                   # distance from the centre to the flat side
PIN_DEPTH = 10.0                 # depth into each part

SEGMENTS = 160                   # facets on round parts
BED = (256.0, 256.0, 256.0)      # Bambu Lab P1S

# Width in pixels of every row of blobbym1.bmp, top to bottom (75 x 89 px).
# The sprite is symmetric around column 37. Re-measure with --from-sprite.
SPRITE_ROW_WIDTHS = [
    9, 17, 21, 25, 29, 31, 33, 35, 37, 39, 41, 41, 43, 45, 45, 45, 47, 47, 49,
    49, 49, 49, 49, 51, 51, 51, 51, 51, 51, 51, 53, 53, 53, 53, 53, 53, 55, 55,
    55, 55, 55, 57, 57, 59, 59, 61, 61, 61, 63, 63, 63, 63, 65, 65, 65, 65, 65,
    65, 65, 65, 65, 65, 65, 63, 63, 63, 63, 61, 61, 61, 59, 57, 57, 55, 55, 53,
    51, 51, 49, 47, 45, 41, 39, 37, 33, 29, 25, 21, 13,
]

PARTS = ["blob", "crown_band", "slice", "base", "plaque", "pin"]
HERE = os.path.dirname(os.path.abspath(__file__))
ADD = OpType.Add


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def widths_from_sprite(path):
    """Measure the row widths of a blob sprite. Black is transparent."""
    from PIL import Image
    im = np.asarray(Image.open(path).convert("RGB")).astype(int)
    mask = im.sum(axis=2) > 0
    return [int(row.sum()) for row in mask]


def rounded_rect(w, h, r, segs=48):
    return CrossSection.square([w - 2 * r, h - 2 * r], True).offset(
        r, circular_segments=segs)


def slab(cs, z, dz=0.01):
    return cs.extrude(dz).translate([0, 0, z])


def union(items):
    return Manifold.batch_boolean(list(items), ADD)


def d_shape(d, flat):
    """A circle of diameter d with one flat side at y = +flat."""
    return CrossSection.circle(d / 2, 64) ^ CrossSection.square([2 * d, 2 * d]).translate(
        [-d, flat - 2 * d])


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


# ---------------------------------------------------------------------------
# Blob profile
# ---------------------------------------------------------------------------

def blob_profile_px():
    """Smoothed right half outline of the sprite as (r, z) in pixels.

    z = 0 is the bottom of the sprite and z = 89 the top. Each run of rows
    with the same width becomes one point at the middle of the run. That
    turns the pixel staircase into a clean curve. A light smoothing along
    the outline then rounds the corners without changing the silhouette.
    """
    w = SPRITE_ROW_WIDTHS
    n = len(w)
    right = [(0.0, 0.0)]
    row = n - 1
    while row >= 0:                            # bottom to top
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


def blob_geometry():
    """Scale, band heights and blob profile in mm, solved for OVERALL_HEIGHT."""
    prof_px = blob_profile_px()
    n = len(SPRITE_ROW_WIDTHS)
    z_cut_px = n - BLOB_CUT_ROW
    z_band_top_px = n - BAND_TOP_ROW
    z_band_bot_px = n - BAND_BOTTOM_ROW
    base_top = BOX_H + PIZZA_CHEESE_Z
    scale = (OVERALL_HEIGHT - base_top - SLICE_H) / (z_band_top_px - z_cut_px)
    imax = int(np.argmax(prof_px[:, 0]))
    low = prof_px[:imax + 1]
    r_cut = float(np.interp(z_cut_px, low[:, 1], low[:, 0]))
    p = prof_px[prof_px[:, 1] > z_cut_px + 0.05]
    p = np.vstack([[r_cut, z_cut_px], p])
    p[:, 1] -= z_cut_px
    p = p * scale
    out = [p[0]]
    for q in p[1:-1]:
        if np.linalg.norm(q - out[-1]) >= 0.6:
            out.append(q)
    out.append(p[-1])
    p = np.array(out)
    return dict(scale=scale, profile=p,
                band_top=(z_band_top_px - z_cut_px) * scale,
                band_bot=(z_band_bot_px - z_cut_px) * scale,
                height=float(p[:, 1].max()))


def radius_at(profile, z):
    """Outer radius of the blob at height z on the head side."""
    imax = int(np.argmax(profile[:, 0]))
    up = profile[imax:]
    return float(np.interp(z, up[:, 1], up[:, 0]))


def profile_section(profile):
    pts = [(0.0, 0.0)] + [tuple(q) for q in profile]
    if pts[-1][0] > 1e-6:
        pts.append((0.0, pts[-1][1]))
    return CrossSection([np.array(pts)], FillRule.Positive)


# ---------------------------------------------------------------------------
# Parts
# ---------------------------------------------------------------------------

def pin_socket(depth, roof=False):
    """D-shaped socket with clearance, from z = 0 upward."""
    cs = d_shape(PIN_D + TOLERANCE, PIN_FLAT + TOLERANCE / 2)
    body = cs.extrude(depth)
    if roof:
        # pointed 45 degree roof, so the socket prints upside down without support
        r = (PIN_D + TOLERANCE) / 2
        body = body + (slab(cs, depth - 0.01) +
                       Manifold.sphere(0.05, 8).translate([0, 0, depth + r + 0.2])).hull()
    return body


def make_blob(g):
    prof = g["profile"]
    blob = Manifold.revolve(profile_section(prof), SEGMENTS)
    # 45 degree chamfer at the bed against elephant's foot
    r0 = prof[0, 0]
    cutter = Manifold.revolve(CrossSection([np.array(
        [(r0 - 0.4, -1), (r0 + 5, -1), (r0 + 5, 5.4), (r0 - 0.4, 0)])]), SEGMENTS)
    blob = blob - cutter
    return blob - pin_socket(PIN_DEPTH + 0.5, roof=True).translate([0, 0, -0.01])


def band_radii(g):
    prof = g["profile"]
    r_hb = radius_at(prof, g["band_bot"])
    r_ht = radius_at(prof, g["band_top"])
    r_out = r_hb + BAND_WALL
    r_slot = (r_ht + r_out + BAND_BEAD) / 2
    return dict(r_hb=r_hb, r_ht=r_ht, r_out=r_out, r_slot=r_slot)


def slice_angle(k):
    return -90 + k * 360.0 / NUM_SLICES


def make_band(g):
    """Crown band. Its inside is the head surface plus clearance, so it seats."""
    prof = g["profile"]
    zb, zt = g["band_bot"], g["band_top"]
    br = band_radii(g)
    ro, b = br["r_out"], BAND_BEAD
    pts = [(0, zb), (ro - 0.4, zb), (ro, zb + 0.4), (ro + b, zb + 0.4 + b), (ro + b, zb + 2.8),
           (ro, zb + 2.8), (ro, zt - 2.8), (ro + b, zt - 2.8 + b), (ro + b, zt), (0, zt)]
    ring = Manifold.revolve(CrossSection([np.array(pts)]), SEGMENTS)
    head = Manifold.revolve(profile_section(prof).offset(TOLERANCE / 2, circular_segments=16),
                            SEGMENTS)
    band = ring - head
    slot = Manifold.cube([TAB_W + TOLERANCE, SLICE_T + TOLERANCE, SLOT_DEPTH + 0.01], True)
    slot = slot.translate([0, 0, zt - SLOT_DEPTH / 2 + 0.005])
    slots = []
    for k in range(NUM_SLICES):
        th = slice_angle(k)
        slots.append(slot.rotate([0, 0, th + 90]).translate(
            [br["r_slot"] * math.cos(math.radians(th)), br["r_slot"] * math.sin(math.radians(th)), 0]))
    band = band - union(slots)
    return band.translate([0, 0, -zb])


def make_slice():
    """One pizza slice lying flat, back on the bed and relief facing up.

    Local frame: x across the slice, y from the crust (y = 0) to the tip,
    z through the thickness. The tab hangs below y = 0 into the band slot.
    """
    hw = SLICE_W / 2
    outline = (CrossSection.circle(1.5, 24).translate([-hw + 1.5, 1.5]) +
               CrossSection.circle(1.5, 24).translate([hw - 1.5, 1.5]) +
               CrossSection.circle(2.0, 24).translate([0, SLICE_H - 2.0])).hull()
    tab_h = SLOT_DEPTH - 0.4
    tab = CrossSection.square([TAB_W, tab_h + 0.5]).translate([-TAB_W / 2, -tab_h])
    plate = (outline + tab).extrude(SLICE_T)
    # crust ridge along the wide end, notched like a baked rim
    crust = outline.offset(-0.5) ^ CrossSection.square([SLICE_W + 2, 5.0]).translate([-hw - 1, 0])
    for x in np.linspace(-hw + 4.5, hw - 4.5, 4):
        crust = crust - CrossSection.square([1.0, 3.0]).translate([x - 0.5, 1.5])
    rel = [crust.extrude(RELIEF)]
    for (x, y, r) in [(-4.6, 9.5, 2.8), (4.4, 12.0, 2.8), (-0.4, 19.0, 2.3)]:
        rel.append(CrossSection.circle(r, 40).translate([x, y]).extrude(RELIEF))
    return plate + union(rel).translate([0, 0, SLICE_T - 0.01])


def slice_world_transform(g, k):
    """3 x 4 matrix that stands a flat slice up in its slot on the crown."""
    th = math.radians(slice_angle(k))
    n = np.array([math.cos(th), math.sin(th), 0.0])
    t = np.array([-math.sin(th), math.cos(th), 0.0])
    up = np.array([0.0, 0.0, 1.0])
    origin = n * (band_radii(g)["r_slot"] - SLICE_T / 2) + up * g["band_top"]
    return np.column_stack([t, up, n, origin])


def pizza_profile():
    """(r, z) outline of the pizza: flat bottom, rounded crust, cheese inside."""
    rc = PIZZA_CRUST_W / 2
    cx = PIZZA_R - rc
    zc = PIZZA_CHEESE_Z - 1.5
    a_in = 180 - math.degrees(math.asin(1.5 / rc))
    arc = [(cx + rc * math.cos(math.radians(a)), zc + rc * math.sin(math.radians(a)))
           for a in np.linspace(0, a_in, 48)]
    pts = [(0.0, 0.0), (PIZZA_R, 0.0)] + arc[1:] + [(0.0, PIZZA_CHEESE_Z)]
    return pts, dict(cx=cx, rc=rc, zc=zc, r_inner=arc[-1][0])


def make_base(g):
    sq = rounded_rect(BOX_W, BOX_W, BOX_CORNER_R)
    lid = sq.offset(LID_LIP, circular_segments=48)
    zl = BOX_H - LID_H
    body = (slab(sq.offset(-0.4), 0) + slab(sq, 0.4) + slab(sq, zl)).hull()
    lid_m = (slab(sq, zl - LID_LIP - 0.01) + slab(lid, zl) + slab(lid, BOX_H - 0.8) +
             slab(lid.offset(-0.8), BOX_H - 0.01)).hull()
    box = body + lid_m

    # plaque pocket on the front (-y), its roof sloped at 45 degrees
    pw, ph = PLAQUE_W + TOLERANCE, PLAQUE_H + TOLERANCE
    y_front = -BOX_W / 2
    z_p0 = PLAQUE_Z - TOLERANCE / 2
    pocket = Manifold.cube([pw, PLAQUE_POCKET + 5, ph]).translate([-pw / 2, y_front - 5, z_p0])
    roof = (slab_x(pw, y_front - 5, y_front + PLAQUE_POCKET, z_p0 + ph - 0.01) +
            slab_x(pw, y_front - 5, y_front - 0.01, z_p0 + ph + PLAQUE_POCKET)).hull()
    box = box - pocket - roof

    # the pizza
    z0 = BOX_H
    pts, pz = pizza_profile()
    pizza = Manifold.revolve(CrossSection([np.array(pts)]), 256).translate([0, 0, z0 - 0.01])
    cx, rc, zc = pz["cx"], pz["rc"], pz["zc"]

    # V notches across the top of the crust
    notches = []
    rng = np.random.default_rng(7)
    for k in range(28):
        ang = k * 360 / 28 + rng.uniform(-3, 3)
        tris = []
        for a in np.linspace(35, 145, 12):
            ar = math.radians(a)
            nx, nz = math.cos(ar), math.sin(ar)
            ax = cx + (rc - 1.0) * nx
            az = z0 + zc + (rc - 1.0) * nz
            tris.append([(ax, 0.0, az), (ax + 3 * nx, -3.0, az + 3 * nz),
                         (ax + 3 * nx, 3.0, az + 3 * nz)])
        segs = [Manifold.hull_points(np.array(tris[i] + tris[i + 1])) for i in range(len(tris) - 1)]
        notches.append(union(segs).rotate([0, 0, ang]))
    pizza = pizza - union(notches)

    # engraved slice cuts in the cheese, from the blob foot to the crust
    cheese_z = z0 + PIZZA_CHEESE_Z
    r_foot = float(g["profile"][0, 0])
    cuts = []
    for k in range(NUM_CUTS):
        ang = 90 + 30 + k * 360 / NUM_CUTS
        tri = np.array([[0, 0, cheese_z - 1.0], [0, -1.0, cheese_z], [0, 1.0, cheese_z]])
        p1 = tri + [r_foot + 1.5, 0, 0]
        p2 = tri + [pz["r_inner"] + 0.5, 0, 0]
        cuts.append(Manifold.hull_points(np.vstack([p1, p2, p1 + [0, 0, 1], p2 + [0, 0, 1]]))
                    .rotate([0, 0, ang]))
    pizza = pizza - union(cuts)

    # pepperoni discs and olive rings, one of each per piece of pizza
    rel = []
    r_mid = (r_foot + pz["r_inner"]) / 2
    for k in range(NUM_CUTS):
        mid = 90 + 30 + (k + 0.5) * 360 / NUM_CUTS
        side = 1 if k % 2 == 0 else -1
        a = math.radians(mid - side * 10)
        rp, rr = 5.2, r_mid + 1.5
        rel.append(Manifold.cylinder(RELIEF, rp, rp - 0.4, 48).translate(
            [rr * math.cos(a), rr * math.sin(a), cheese_z - 0.01]))
        a = math.radians(mid + side * 15)
        rr = r_mid - 2.5 if k % 2 == 0 else r_mid + 3.5
        olive = (Manifold.cylinder(RELIEF, 2.6, 2.6, 32) - Manifold.cylinder(
            3 * RELIEF, 1.2, 1.2, 24).translate([0, 0, -RELIEF]))
        rel.append(olive.translate([rr * math.cos(a), rr * math.sin(a), cheese_z - 0.01]))
    pizza = pizza + union(rel)

    base = box + pizza
    base = base - pin_socket(PIN_DEPTH + 1.5).translate([0, 0, cheese_z - PIN_DEPTH - 0.5])
    return base, dict(cheese_z=cheese_z, crust_top=z0 + zc + rc)


def slab_x(w, y0, y1, z):
    return Manifold.cube([w, y1 - y0, 0.01]).translate([-w / 2, y0, z])


def plaque_layout():
    """Font sizes of the two text lines, fitted to the plaque."""
    check_glyphs(TEXT + str(YEAR))
    inner_w = PLAQUE_W - 2 * 5.0
    inner_h = PLAQUE_H - 2 * 4.0
    gap = 1.8
    b1 = text_section(TEXT, 10.0).bounds()
    b2 = text_section(str(YEAR), 10.0).bounds()
    w1, h1 = b1[2] - b1[0], b1[3] - b1[1]
    w2, h2 = b2[2] - b2[0], b2[3] - b2[1]
    s1 = min(inner_w / w1, (inner_h - gap) / (h1 + h2)) * 10.0
    s2 = min(s1 * 1.15, (inner_h - gap - h1 * s1 / 10.0) / h2 * 10.0, inner_w / w2 * 10.0)
    return s1, s2, gap


def stencil_bridges(material, text, bw):
    """Bridges that tie every loose island (the inside of o, e, a, 0 and so on)
    to the rest of the plaque. Each bridge crosses one letter stroke, straight
    up or down from the island, whichever stroke is thinner. Sideways is the
    fallback.
    """
    bridges = []
    for _ in range(50):
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


def make_plaque():
    s1, s2, gap = plaque_layout()
    outline = rounded_rect(PLAQUE_W, PLAQUE_H, 3.0)
    plate = (slab(outline.offset(-0.4), 0) + slab(outline, 0.4) +
             slab(outline, PLAQUE_T - 0.6) + slab(outline.offset(-0.6), PLAQUE_T - 0.01)).hull()
    frame = outline.offset(-1.6) - outline.offset(-3.4)
    t1 = text_section(TEXT, s1)
    t2 = text_section(str(YEAR), s2)
    b1, b2 = t1.bounds(), t2.bounds()
    h1, h2 = b1[3] - b1[1], b2[3] - b2[1]
    y_top = (h1 + gap + h2) / 2
    t1 = t1.translate([-(b1[0] + b1[2]) / 2, y_top - b1[3]])
    t2 = t2.translate([-(b2[0] + b2[2]) / 2, y_top - h1 - gap - b2[3]])
    info = dict(size1=s1, size2=s2, text=(t1, t2), stencil=STENCIL)
    if not STENCIL:
        rel = (frame + t1 + t2).extrude(TEXT_RELIEF).translate([0, 0, PLAQUE_T - 0.01])
        return plate + rel, info
    text = t1 + t2
    material, bridges = stencil_bridges(outline - text, text, BRIDGE_W)
    holes = outline.offset(-0.5) - material
    cut = holes.extrude(PLAQUE_T + 2).translate([0, 0, -1])
    rel = frame.extrude(TEXT_RELIEF).translate([0, 0, PLAQUE_T - 0.01])
    info.update(material=material, bridges=len(bridges), holes=holes)
    return plate - cut + rel, info


def make_pin_vertical():
    cs = d_shape(PIN_D, PIN_FLAT)
    L, c = 2 * PIN_DEPTH, 0.6
    return (slab(cs.offset(-c), 0) + slab(cs, c) + slab(cs, L - c) +
            slab(cs.offset(-c), L - 0.01)).hull()


def make_pin():
    """The pin lying on its flat side, so the layers run along its length."""
    return make_pin_vertical().rotate([-90, 0, 0])


# ---------------------------------------------------------------------------
# Build, place, check, export
# ---------------------------------------------------------------------------

def to_bed(m):
    b = m.bounding_box()
    return m.translate([-(b[0] + b[3]) / 2, -(b[1] + b[4]) / 2, -b[2]])


def build():
    """Return the print-oriented parts, the assembled scene and some numbers."""
    g = blob_geometry()
    blob = make_blob(g)
    band = make_band(g)
    slice_ = make_slice()
    base, base_info = make_base(g)
    plaque, pinfo = make_plaque()

    zc = base_info["cheese_z"]
    asm = {"base": base, "blob": blob.translate([0, 0, zc]),
           "crown_band": band.translate([0, 0, zc + g["band_bot"]])}
    asm["slices"] = union(slice_.transform(slice_world_transform(g, k).tolist())
                          .translate([0, 0, zc]) for k in range(NUM_SLICES))
    asm["plaque"] = place_plaque(plaque)
    asm["pin"] = make_pin_vertical().translate([0, 0, zc - PIN_DEPTH])

    parts = {"blob": to_bed(blob), "crown_band": to_bed(band), "slice": to_bed(slice_),
             "base": to_bed(base), "plaque": to_bed(plaque), "pin": to_bed(make_pin())}
    return parts, asm, dict(g=g, band=band_radii(g), base=base_info, plaque=pinfo)


def place_plaque(plaque):
    """Stand the flat plaque up in its pocket on the box front."""
    pl = plaque.rotate([90, 0, 0])        # the text side (+z) turns to face the front (-y)
    pb = pl.bounding_box()
    return pl.translate([0, -BOX_W / 2 + PLAQUE_POCKET - pb[4], PLAQUE_Z - pb[2]])


def mesh_arrays(m):
    mesh = m.to_mesh()
    v = np.asarray(mesh.vert_properties)[:, :3].astype(float)
    f = np.asarray(mesh.tri_verts).astype(np.int64)
    return v, f


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


def run_checks(parts, asm, info):
    g = info["g"]
    prof = g["profile"]
    worst = 0.0
    for p, q in zip(prof[:-1], prof[1:]):
        dr, dz = q[0] - p[0], q[1] - p[1]
        if dr > 0 and dz > 0:
            worst = max(worst, math.degrees(math.atan2(dr, dz)))
    assert worst <= 45.0, f"blob belly overhang {worst:.1f} deg"
    worst_band = 0.0
    for p, q in zip(prof[:-1], prof[1:]):
        if g["band_bot"] - 1 <= p[1] <= g["band_top"] + 1 and q[1] > p[1] and q[0] < p[0]:
            worst_band = max(worst_band, math.degrees(math.atan2(p[0] - q[0], q[1] - p[1])))
    assert worst_band <= 45.0, f"band seat overhang {worst_band:.1f} deg"
    br = info["band"]
    half = (SLICE_T + TOLERANCE) / 2
    chord = (TAB_W + TOLERANCE) / 2
    inner_wall = br["r_slot"] - half - br["r_ht"] - TOLERANCE / 2
    outer_wall = br["r_out"] + BAND_BEAD - math.hypot(br["r_slot"] + half, chord)
    assert inner_wall >= 0.8 and outer_wall >= 0.8, "band slot walls too thin"
    print(f"blob: scale {g['scale']:.3f} mm/px, height {g['height']:.1f} mm, max width "
          f"{2 * prof[:, 0].max():.1f} mm, flat foot {2 * prof[0, 0]:.1f} mm")
    print(f"blob belly steepest {worst:.1f} deg, band seat steepest {worst_band:.1f} deg from vertical")
    print(f"band slot walls: inner {inner_wall:.2f} mm, outer at slot ends {outer_wall:.2f} mm")
    print(f"plaque font size: line 1 {info['plaque']['size1']:.2f} mm, line 2 {info['plaque']['size2']:.2f} mm")
    pq = info["plaque"]
    if pq["stencil"]:
        mat, holes = pq["material"], pq["holes"]
        thin = 1 - mat.offset(-0.4).offset(0.4).area() / mat.area()
        print(f"stencil: {pq['bridges']} bridges of {BRIDGE_W} mm, plaque material in one piece: "
              f"{len(mat.decompose()) == 1}, letter openings {len(holes.decompose())}, "
              f"material lost by a 0.8 mm opening {thin * 100:.2f}%")
        assert len(mat.decompose()) == 1
    pb = parts["plaque"].bounding_box()
    print(f"plaque {pb[3] - pb[0]:.2f} x {pb[4] - pb[1]:.2f} mm in a pocket of "
          f"{PLAQUE_W + TOLERANCE:.2f} x {PLAQUE_H + TOLERANCE:.2f} mm, clearance {TOLERANCE / 2:.2f} mm per side")
    assert pb[3] - pb[0] <= PLAQUE_W + 1e-6 and pb[4] - pb[1] <= PLAQUE_H + 1e-6
    for label, t in zip(("line 1", "line 2"), info["plaque"]["text"]):
        bb = t.bounds()
        thin = 1 - t.offset(-0.4).offset(0.4).area() / t.area()
        gaps = t.offset(0.4).offset(-0.4).area() / t.area() - 1
        print(f"  {label}: {bb[2] - bb[0]:.1f} x {bb[3] - bb[1]:.1f} mm. Area lost by a 0.8 mm "
              f"opening {thin * 100:.2f}%, area filled by a 0.8 mm closing {gaps * 100:.2f}%")
    total = union(asm.values())
    bb = total.bounding_box()
    info["overall"] = (bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2])
    print(f"assembled: {bb[3] - bb[0]:.1f} x {bb[4] - bb[1]:.1f} mm, overall height {bb[5] - bb[2]:.1f} mm")
    results = []
    for name, m in parts.items():
        r = check_part(name, m)
        r["grams"] = filament_grams(r["volume_cm3"], r["area_cm2"])
        results.append(r)
        print(f"  {name:10s} {r['status']} watertight={r['watertight']} winding={r['winding']} "
              f"volume={r['is_volume']} bodies={r['bodies']} size={r['size'][0]:.1f} x "
              f"{r['size'][1]:.1f} x {r['size'][2]:.1f} fits={r['fits']} min_z={r['min_z']:.3f} "
              f"bottom={r['bottom_area']:.0f} mm2 overhang>45={r['overhang_area']:.1f} mm2 "
              f"z={r['overhang_z']} solid={r['volume_cm3']:.1f} cm3 approx {r['grams']:.0f} g")
    return results


def main(argv=None):
    global YEAR, TEXT, OVERALL_HEIGHT, TOLERANCE, PART
    ap = argparse.ArgumentParser(description="Pizzakongen trophy generator")
    ap.add_argument("--year", type=int, default=YEAR)
    ap.add_argument("--text", default=TEXT)
    ap.add_argument("--height", type=float, default=OVERALL_HEIGHT)
    ap.add_argument("--tolerance", type=float, default=TOLERANCE)
    ap.add_argument("--part", default=PART, choices=["all"] + PARTS)
    ap.add_argument("--raised-text", action="store_true",
                    help="raised text on the plaque instead of stencil text cut through it")
    ap.add_argument("--out", default=os.path.join(HERE, "stl"))
    ap.add_argument("--from-sprite", help="print the row widths of a blobbym*.bmp and exit")
    a = ap.parse_args(argv)
    if a.from_sprite:
        print(widths_from_sprite(a.from_sprite))
        return None
    YEAR, TEXT, OVERALL_HEIGHT, TOLERANCE, PART = a.year, a.text, a.height, a.tolerance, a.part
    global STENCIL
    STENCIL = not a.raised_text
    if not 150 <= OVERALL_HEIGHT <= 200:
        raise SystemExit("OVERALL_HEIGHT must be between 150 and 200 mm")

    parts, asm, info = build()
    run_checks(parts, asm, info)
    os.makedirs(a.out, exist_ok=True)
    import trimesh
    for name, m in parts.items():
        if PART not in ("all", name):
            continue
        v, f = mesh_arrays(m)
        path = os.path.join(a.out, f"pizzakongen_{name}.stl")
        trimesh.Trimesh(v, f).export(path)
        print("wrote", path)
    return parts, asm, info


if __name__ == "__main__":
    main()
