"""Pizzakongen trophies: a set of three Blobby blobs with three hats.

1st place Pizzakongen wears a crown, 2nd place Prinsen a small prince's
crown and 3rd place Fanten a slouchy knit beanie. Parametric model built
with manifold3d. Run it to export STL files and print the printability checks:

    python pizzakongen.py                    # all three places, all parts
    python pizzakongen.py --place 2          # one place
    python pizzakongen.py --place 1 --part plaque
    python pizzakongen.py --year 2027 --tolerance 0.4
    python pizzakongen.py --plaque number    # big place number on the plaque

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
TEXT = "Svettaste Blåbbyen"       # plaque text, set per place from PLACES by set_place()
OVERALL_HEIGHT = 170.0           # mm, height of the 1st place trophy (150 to 200)
TOLERANCE = 0.3                  # mm total clearance per fit. PLA 0.3, PETG 0.4
PART = "all"                     # all, blob, hat, base, plaque, pin
BASE_STYLE = "tiers"             # pizza, plain, tiers, drum or court. See BASE_STYLES
PLACE = 1                        # 1, 2 or 3. Set with set_place()
PLAQUE_LAYOUT = "number"         # number: a big place number. lines: "1. plass" over the name
MIN_CAP = 3.0                    # mm, smallest cap height allowed on the plaque

# The three trophies. Scale applies to the blob, the base and the plaque. Walls,
# fits, the pin and the layer based heights keep their full size values.
PLACES = {
    1: dict(name="Pizzakongen", text="Svettaste Blåbbyen", scale=1.00, blob="dark blue", hat="crown", hat_colour="black",
            tiers=3, points=7, crown_h=30.0, ball_r=3.2),
    2: dict(name="Prinsen", text="Beste tabaren", scale=0.85, blob="white", hat="crown", hat_colour="black",
            tiers=2, points=5, crown_h=20.0, ball_r=2.8),
    3: dict(name="Fanten", text="Pallfanten", scale=0.70, blob="dark green", hat="beanie", hat_colour="white",
            tiers=1),
}
SCALE = 1.0
HAT = "crown"
TIERS = 3
HEAD_ROOM = 30.0                 # mm above the band at full size, used to scale the blob

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

# Base styles. The blob stands at the same height on every style, so the blob
# and the crown stay the same. Every style has the same plaque pocket and pin socket.
BASE_STYLES = {
    "pizza": "Pizza box with a pizza on top",
    "plain": "Plain box with a chamfered top",
    "tiers": "Stepped tiers, like a classic trophy plinth. 3, 2 or 1 by place",
    "drum": "Rounded pedestal with a flat front and a flared foot",
    "court": "Box with a raised white volleyball court on top",
}
COURT_LINE = 2.4                 # mm, width of the court lines
COURT_RELIEF = 1.2               # mm, height of the court lines

# Plaque (separate part, pushed into a pocket in the box front)
PLAQUE_W = 122.0
PLAQUE_H = 28.0
PLAQUE_T = 3.0                   # plate thickness without the text
PLAQUE_POCKET = 1.6              # pocket depth in the box front
PLAQUE_Z = 3.0                   # bottom of the plaque above the bed
TEXT_RELIEF = 1.2                # raised text and frame height
STENCIL = False                  # False gives raised text and frame, printed in a second
                                 # colour after one filament change. True cuts the text
                                 # through the plaque, so the base shows through the letters.
BRIDGE_W = 1.2                   # mm, stencil bridges that hold the inside of closed letters
FONT_FILE = None                 # None uses matplotlib's bundled DejaVu Sans Bold

# Blob (spun from the real sprite outline of data/gfx/blobbym1.bmp)
BLOB_CUT_ROW = 78                # sprite row where the blob is cut flat
BAND_TOP_ROW = 9                 # sprite row at the top of the crown band
BAND_BOTTOM_ROW = 20             # sprite row at the bottom of the crown band
BEANIE_BOTTOM_ROW = 25           # sprite row at the bottom edge of the beanie

# Crown: a band that seats on the head, with points standing on top of it
BAND_WALL = 3.0                  # mm, wall at the bottom of the band
BAND_BEAD = 1.2                  # mm, raised rings at the top and bottom of the band
CROWN_H = 30.0                   # mm, height of the points above the band, balls included
NUM_POINTS = 7                   # points round the crown, the first one at the front
POINT_WALL = 2.4                 # mm, wall of the points, flush with the top bead outside
POINT_FLARE = 10.0               # degrees, the points lean outward this much
POINT_RIM = 3.0                  # mm of plain wall above the band before the points start
BALL_R = 3.2                     # mm, ball on the tip of each point

# Beanie for 3rd place, sizes at full scale except the wall
BEANIE_WALL = 2.4                # mm, knit wall over the head
BEANIE_CUFF = 11.0               # mm, height of the turned up cuff
BEANIE_CUFF_T = 2.4              # mm, the cuff stands out this much from the knit
BEANIE_TIP = 1.0                 # mm of extra knit above the inside of the beanie
BEANIE_LEAN = 10.0               # degrees, the knit leans to one side
BEANIE_SLOUCH = 14.0             # mm, the top sits this far to the side
BEANIE_TILT = 8.0                # degrees, the cuff is pulled down on one side
BEANIE_RIB = 0.6                 # mm, height of the knitted ribs
POMPOM_R = 8.0                   # mm

# Pin between blob and base
PIN_D = 10.0                     # D-shaped pin diameter
PIN_FLAT = 2.5                   # distance from the centre to the flat side
PIN_DEPTH = 10.0                 # depth into each part

LAYER_H = 0.2                    # mm, layer height and first layer height in the slicer
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

PARTS = ["blob", "hat", "base", "plaque", "pin"]

# Filament per part, set by set_place(). The plaque is printed flat, so its
# raised letters take a second colour after one filament change at the height
# from relief_z().
COLOURS = {"blob": "dark blue", "base": "black", "hat": "black",
           "plaque": "black", "plaque_top": "white", "pin": "black"}
HERE = os.path.dirname(os.path.abspath(__file__))
ADD = OpType.Add


# ---------------------------------------------------------------------------
# Places
# ---------------------------------------------------------------------------

_FULL = {}


def set_place(place):
    """Set the size, colours, hat and tiers for 1st, 2nd or 3rd place."""
    global PLACE, SCALE, HAT, TIERS, NUM_POINTS, CROWN_H, BALL_R, COLOURS, TEXT
    global BOX_W, BOX_H, BOX_CORNER_R, PIZZA_CHEESE_Z, PLAQUE_W, PLAQUE_H
    names = ("BOX_W", "BOX_H", "BOX_CORNER_R", "PIZZA_CHEESE_Z", "PLAQUE_W", "PLAQUE_H",
             "NUM_POINTS", "CROWN_H", "BALL_R")
    g = globals()
    if not _FULL:
        _FULL.update({k: g[k] for k in names})
    cfg = PLACES[place]
    PLACE, SCALE, HAT, TIERS = place, cfg["scale"], cfg["hat"], cfg["tiers"]
    TEXT = cfg["text"]
    if place != 1 and BASE_STYLE != "tiers":
        raise SystemExit("2nd and 3rd place use the tiers base only")
    for k in ("BOX_W", "BOX_H", "BOX_CORNER_R", "PIZZA_CHEESE_Z", "PLAQUE_W", "PLAQUE_H"):
        g[k] = _FULL[k] * SCALE
    NUM_POINTS = cfg.get("points", _FULL["NUM_POINTS"])
    CROWN_H = cfg.get("crown_h", _FULL["CROWN_H"])
    BALL_R = cfg.get("ball_r", _FULL["BALL_R"])
    COLOURS = {"blob": cfg["blob"], "base": "black", "hat": cfg["hat_colour"],
               "plaque": "black", "plaque_top": "white", "pin": "black"}


def hat_name():
    return "crown" if HAT == "crown" else "beanie"


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
    scale = SCALE * (OVERALL_HEIGHT - base_top / SCALE - HEAD_ROOM) / (z_band_top_px - z_cut_px)
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
                hat_bot=(n - BEANIE_BOTTOM_ROW - z_cut_px) * scale,
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
    # middle of the point wall at the band top, 0.02 mm inside the bead so no sliver hangs over
    r_point = r_out + BAND_BEAD - POINT_WALL / 2 - 0.02
    return dict(r_hb=r_hb, r_ht=r_ht, r_out=r_out, r_point=r_point)


def point_angle(k):
    return -90 + k * 360.0 / NUM_POINTS


def make_crown(g):
    """The crown. The inside of the band is the head surface plus clearance, so
    it seats. A thin wall stands on the band top and rises into points with a
    ball on each tip. It leans outward by POINT_FLARE.
    """
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

    t = math.tan(math.radians(POINT_FLARE))
    r0, w = br["r_point"], POINT_WALL
    zc = CROWN_H - BALL_R                       # ball centres above the band top
    hr = POINT_RIM + 0.5
    rim = Manifold.revolve(CrossSection([np.array(
        [(r0 - w / 2, -0.3), (r0 + w / 2, -0.3), (r0 + w / 2, 0.0), (r0 + w / 2 + hr * t, hr),
         (r0 - w / 2 + hr * t, hr)])]), SEGMENTS)

    # one point, flat in (arc length, height, wall), then bent round the crown
    hw = math.pi * r0 / NUM_POINTS              # half the arc between two valleys
    grow = hw / (zc - POINT_RIM)                # extra half width per mm below the valley
    z0 = POINT_RIM - 1.0
    tri = CrossSection([np.array([(-hw - grow, z0), (hw + grow, z0), (0.0, zc)])])
    # a little thinner than the rim, so the foot of each point stays inside it
    wp = w - 0.06
    flat = tri.extrude(wp).translate([0, 0, -wp / 2]).refine_to_length(1.0)
    # ball with a cone under it, so its underside stays below 45 degrees
    ball = (Manifold.sphere(BALL_R, 48) +
            Manifold.sphere(0.05, 8).translate([0, 0, -1.5 * BALL_R])).hull()
    pieces = [rim]
    for k in range(NUM_POINTS):
        th = math.radians(point_angle(k))

        def bend(v, th=th):
            v = np.asarray(v)
            r = r0 + v[:, 2] + v[:, 1] * t
            phi = th + v[:, 0] / r0
            return np.column_stack([r * np.cos(phi), r * np.sin(phi), v[:, 1]])

        pieces.append(flat.warp_batch(bend))
        rc = r0 + zc * t
        pieces.append(ball.translate([rc * math.cos(th), rc * math.sin(th), zc]))
    crown = band + union(pieces).translate([0, 0, zt])
    return crown.translate([0, 0, -zb]), zb


def beanie_seat(g):
    """Where the head gets steeper than 45 degrees above the beanie edge.

    The inside of the beanie follows the head up to there. Above it the inside
    is a 45 degree cone. The dome of the head is flatter than that, so it fits
    under the cone, and the beanie prints upright without support.
    """
    prof = g["profile"]
    imax = int(np.argmax(prof[:, 0]))
    up = prof[imax:]
    zb = g["hat_bot"]
    for p, q in zip(up[:-1], up[1:]):
        if p[1] < zb:
            continue
        ang = math.degrees(math.atan2(p[0] - q[0], q[1] - p[1]))
        if ang > 45.0:
            return float(p[0]), float(p[1])
    raise SystemExit("no beanie seat found")


def make_beanie(g):
    """A slouchy knit beanie with a turned up cuff and a pompom on the floppy tip."""
    prof = g["profile"]
    zb = g["hat_bot"]
    r45, z45 = beanie_seat(g)
    c = TOLERANCE / 2
    rc = r45 + c * math.sqrt(2) + 0.02
    cone = CrossSection([np.array([(0.0, z45), (rc, z45), (0.0, z45 + rc)])])
    cavity2d = profile_section(prof).offset(c, circular_segments=16) + cone
    z_apex = z45 + rc

    big = CrossSection.square([400, 400]).translate([0, zb])
    knit_min = Manifold.revolve(cavity2d.offset(BEANIE_WALL, circular_segments=24) ^ big, SEGMENTS)
    # the knit body: a full, round dome from the cuff up over the head
    r_bot = radius_at(prof, zb) + c + BEANIE_WALL
    z1 = zb + BEANIE_CUFF * SCALE - 1.0
    z_tip = z_apex + BEANIE_WALL + BEANIE_TIP * SCALE
    us = np.linspace(0, 1, 64)
    pts = [(r_bot * max(0.0, 1 - u ** 3) ** (1 / 3), z1 + u * (z_tip - z1)) for u in us]
    pts = [q for i, q in enumerate(pts) if i == 0 or math.dist(q, pts[i - 1]) > 0.3]
    pts[-1] = (0.0, z_tip)
    knit2d = CrossSection([np.array([(0.0, zb), (r_bot, zb)] + pts)])
    knit = Manifold.revolve(knit2d, SEGMENTS)
    # knitted ribs: thin raised strips from the cuff up the dome, stopping short of the top
    n_ribs = int(round(2 * math.pi * r_bot / 4.0))
    shell = Manifold.revolve(knit2d.offset(BEANIE_RIB, circular_segments=16) ^ big, SEGMENTS)
    # the ribs start above the highest point of the cuff, so they never meet its slanted top
    zr = zb + BEANIE_CUFF * SCALE + math.tan(math.radians(BEANIE_TILT)) * (r_bot + BEANIE_CUFF_T) + 1.0
    # the lower ends of the ribs taper at 56 degrees from the horizontal, so they need no support
    r0, ztop = r_bot - 1.0, z_tip - 8.0 * SCALE
    zone = Manifold.revolve(CrossSection([np.array(
        [(0.0, zr), (r0, zr), (r0 + 10.0, zr + 15.0), (r0 + 10.0, ztop), (0.0, ztop)])]), SEGMENTS)
    shell = shell ^ zone
    strips = [Manifold.cube([200, BEANIE_RIB * 1.6, 400]).translate([0, -BEANIE_RIB * 0.8, -200])
              .rotate([0, 0, 360.0 * i / n_ribs]) for i in range(n_ribs)]
    knit = (knit + (shell ^ union(strips))).refine_to_length(1.5)

    # the knit leans and the top slouches to one side. The lean adds at most
    # BEANIE_LEAN plus the slouch curve to any wall, well under 45 degrees. The
    # unbent minimum wall round the inside is added back, so no wall gets thin.
    h = z_tip - z1
    lean = math.tan(math.radians(BEANIE_LEAN))
    k = max(0.0, BEANIE_SLOUCH * SCALE - lean * h) / h ** 2
    assert lean + 2 * k * h <= 0.8, "beanie slouch too strong"

    def shift(z):
        d = np.clip(z - z1, 0, None)
        return lean * d + k * d * d

    knit = knit.warp_batch(lambda v: np.column_stack(
        [np.asarray(v)[:, 0] + shift(np.asarray(v)[:, 2]), np.asarray(v)[:, 1], np.asarray(v)[:, 2]]))
    knit = knit + knit_min

    # turned up cuff with vertical ribs. Its top is cut at BEANIE_TILT, so the
    # beanie looks pulled down on one side while the bottom stays flat
    rcuf = r_bot + BEANIE_CUFF_T
    zt = zb + BEANIE_CUFF * SCALE
    a = math.tan(math.radians(BEANIE_TILT))
    zt_max = zt + a * rcuf + 1.0
    cuff = Manifold.revolve(CrossSection([np.array(
        [(0.0, zb), (rcuf - 0.4, zb), (rcuf, zb + 0.4), (rcuf, zt_max), (0.0, zt_max)])]), SEGMENTS)
    L = math.hypot(a, 1.0)
    cuff = cuff.trim_by_plane([-a / L, 0.0, -1.0 / L], -zt / L)
    n_rib = int(round(2 * math.pi * rcuf / 3.2))
    groove = CrossSection([np.array([(0.0, -0.7), (0.9, 0.0), (0.0, 0.7)])])
    grooves = []
    for i in range(n_rib):
        ang = 360.0 * i / n_rib
        grooves.append(groove.translate([rcuf - 0.8, 0]).extrude(zt_max - zb + 2)
                       .translate([0, 0, zb - 1]).rotate([0, 0, ang]))
    cuff = cuff - union(grooves)

    # pompom with a cone under it, on the tip
    pr = POMPOM_R * SCALE
    pom = (Manifold.sphere(pr, 48) + Manifold.sphere(0.05, 8).translate([0, 0, -1.5 * pr])).hull()
    pom = pom.translate([float(shift(np.array([z_tip]))[0]), 0, z_tip + 0.25 * pr])

    cavity = Manifold.revolve(cavity2d, SEGMENTS)
    beanie = (knit + cuff + pom) - cavity
    return beanie.translate([0, 0, -zb]), zb


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


def base_top():
    """Height of the blob seat. The court lines need a layer boundary for the
    filament switch, so that style seats the blob on the layer below."""
    top = BOX_H + PIZZA_CHEESE_Z
    if BASE_STYLE == "court":
        top = math.floor(top / LAYER_H + 1e-6) * LAYER_H
    return top


def prism(cs, z0, z1, top=0.0, foot=0.4):
    """Convex section cs from z0 to z1, with a 45 degree chamfer of foot at the
    bottom and of top at the top edge. Both chamfers only narrow the part."""
    pieces = [slab(cs.offset(-foot), z0), slab(cs, z0 + foot)] if foot else [slab(cs, z0)]
    if top:
        pieces += [slab(cs, z1 - top), slab(cs.offset(-top), z1 - 0.01)]
    else:
        pieces.append(slab(cs, z1 - 0.01))
    return union(pieces).hull()


def plaque_pocket(y_front, plaque_z):
    """Pocket for the plaque in a flat front at y_front, its roof sloped at 45 degrees."""
    pw, ph = PLAQUE_W + TOLERANCE, PLAQUE_H + TOLERANCE
    z_p0 = plaque_z - TOLERANCE / 2
    pocket = Manifold.cube([pw, PLAQUE_POCKET + 5, ph]).translate([-pw / 2, y_front - 5, z_p0])
    roof = (slab_x(pw, y_front - 5, y_front + PLAQUE_POCKET, z_p0 + ph - 0.01) +
            slab_x(pw, y_front - 5, y_front - 0.01, z_p0 + ph + PLAQUE_POCKET)).hull()
    return pocket + roof


def base_pizza(g, top):
    sq = rounded_rect(BOX_W, BOX_W, BOX_CORNER_R)
    lid = sq.offset(LID_LIP, circular_segments=48)
    zl = BOX_H - LID_H
    body = (slab(sq.offset(-0.4), 0) + slab(sq, 0.4) + slab(sq, zl)).hull()
    lid_m = (slab(sq, zl - LID_LIP - 0.01) + slab(lid, zl) + slab(lid, BOX_H - 0.8) +
             slab(lid.offset(-0.8), BOX_H - 0.01)).hull()
    box = body + lid_m

    z0 = BOX_H
    # the pizza
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

    return box + pizza, -BOX_W / 2, PLAQUE_Z, None


def base_plain(g, top):
    sq = rounded_rect(BOX_W, BOX_W, BOX_CORNER_R)
    return prism(sq, 0, top, top=2.0), -BOX_W / 2, (top - PLAQUE_H) / 2, None


def tier_tops(top):
    """Top height of each tier, bottom tier first. TIERS is 3, 2 or 1."""
    s = SCALE
    if TIERS == 3:
        return [34.0 * s, top - 4.5 * s, top]
    if TIERS == 2:
        return [top - 8.5 * s, top]
    return [top]


def base_tiers(g, top):
    s, z0, pieces = SCALE, 0.0, []
    tops = tier_tops(top)
    for k, z1 in enumerate(tops):
        w = BOX_W - 22.0 * s * k
        cs = rounded_rect(w, w, BOX_CORNER_R - 1.0 * s * k)
        pieces.append(prism(cs, z0 - (0.01 if k else 0.0), z1, top=0.8, foot=0.0 if k else 0.4))
        z0 = z1
    plaque_z = PLAQUE_Z if len(tops) > 1 else (top - PLAQUE_H) / 2
    # the plaque and its pocket roof must stay below the chamfer of the bottom tier
    assert plaque_z + PLAQUE_H + TOLERANCE / 2 + PLAQUE_POCKET <= tops[0] - 1.2, \
        "plaque does not fit the bottom tier"
    return union(pieces), -BOX_W / 2, plaque_z, None


def base_drum(g, top):
    r = BOX_W / 2 - 2.0
    fw, cr = PLAQUE_W + 10.0, 4.0                 # flat front for the plaque
    plan = (CrossSection.circle(r, 128) +
            CrossSection.circle(cr, 24).translate([-fw / 2 + cr, -r + cr]) +
            CrossSection.circle(cr, 24).translate([fw / 2 - cr, -r + cr])).hull()
    foot = (slab(plan.offset(2.6, circular_segments=48), 0) +
            slab(plan.offset(3.0, circular_segments=48), 0.4) +
            slab(plan.offset(3.0, circular_segments=48), 1.5) + slab(plan, 4.5)).hull()
    body = prism(plan, 4.4, top, top=2.0, foot=0)
    return foot + body, -r, 8.0, None


def court_lines(g):
    """The court seen from above. The net is the line from front to back."""
    inset, w = 7.0, COURT_LINE
    outer = rounded_rect(BOX_W - 2 * inset, BOX_W - 2 * inset, 3.0)
    lines = outer - outer.offset(-w, circular_segments=24)
    net = CrossSection.square([w, BOX_W - 2 * inset], True)
    # a volleyball: a ring with two curved seams across it
    rb, cx, cy = 13.0, -BOX_W / 2 + 30.0, -BOX_W / 2 + 30.0
    disk = CrossSection.circle(rb, 96)
    ball = disk - disk.offset(-1.8, circular_segments=64)
    for r in (2.4 * rb, 1.75 * rb):
        c = CrossSection.circle(r, 192).translate([2.0 * rb, 0])
        ball = ball + (disk ^ (c - c.offset(-1.4, circular_segments=192)))
    ball = ball.rotate(35)
    lines = lines + net + ball.translate([cx, cy])
    r_foot = float(g["profile"][0, 0])
    return lines - CrossSection.circle(r_foot + 2.0, 96)


def base_court(g, top):
    body, y_front, pz, _ = base_plain(g, top)
    rel = court_lines(g).extrude(COURT_RELIEF).translate([0, 0, top - 0.01])
    return body + rel, y_front, pz, top


BASE_BUILDERS = {"pizza": base_pizza, "plain": base_plain, "tiers": base_tiers,
                 "drum": base_drum, "court": base_court}


def make_base(g):
    top = base_top()
    body, y_front, plaque_z, relief = BASE_BUILDERS[BASE_STYLE](g, top)
    base = body - plaque_pocket(y_front, plaque_z)
    base = base - pin_socket(PIN_DEPTH + 1.5).translate([0, 0, top - PIN_DEPTH - 0.5])
    return base, dict(cheese_z=top, front_y=y_front, plaque_z=plaque_z, relief_z=relief)


def slab_x(w, y0, y1, z):
    return Manifold.cube([w, y1 - y0, 0.01]).translate([-w / 2, y0, z])


def fit_lines(lines, w, h, gap):
    """One font size for a block of centred lines that fits w x h."""
    bs = [text_section(t, 10.0).bounds() for t in lines]
    ws = [b[2] - b[0] for b in bs]
    hs = [b[3] - b[1] for b in bs]
    size = min(min(w / x for x in ws), (h - gap * (len(lines) - 1)) / sum(hs)) * 10.0
    return size


def stack(lines, size, gap):
    """Lines of text at one size, centred on x = 0 and y = 0 as a block."""
    secs = [text_section(t, size) for t in lines]
    bs = [c.bounds() for c in secs]
    hs = [b[3] - b[1] for b in bs]
    y = (sum(hs) + gap * (len(lines) - 1)) / 2
    out = []
    for c, b, hh in zip(secs, bs, hs):
        out.append(c.translate([-(b[0] + b[2]) / 2, y - b[3]]))
        y -= hh + gap
    return out


def cap_height(size):
    b = text_section("H", size).bounds()
    return b[3] - b[1]


def plaque_texts():
    """The text pieces on the plaque, centred on the plaque, and their font sizes.

    lines: "1. plass" over "Svettaste Blåbbyen 2026".
    number: a big "1." on the left, the name over the year on the right.
    """
    check_glyphs(TEXT + str(YEAR) + f"{PLACE}. plass")
    inner_w = PLAQUE_W - 2 * 5.0
    inner_h = PLAQUE_H - 2 * 4.0
    gap = 1.8 * SCALE
    if PLAQUE_LAYOUT == "lines":
        lines = [f"{PLACE}. plass", f"{TEXT} {YEAR}"]
        size = fit_lines(lines, inner_w, inner_h, gap)
        return stack(lines, size, gap), [size]
    num = f"{PLACE}."
    nb = text_section(num, 10.0).bounds()
    n_size = inner_h / (nb[3] - nb[1]) * 10.0
    big = text_section(num, n_size)
    bb = big.bounds()
    space = 3.0
    # keep the big number clear of the frame
    rest_w = inner_w - 4.0 - (bb[2] - bb[0]) - space
    lines = [TEXT, str(YEAR)]
    size = fit_lines(lines, rest_w, inner_h, gap)
    block = stack(lines, size, gap)
    bw = max(c.bounds()[2] - c.bounds()[0] for c in block)
    total = (bb[2] - bb[0]) + space + bw
    x0 = -total / 2
    big = big.translate([x0 - bb[0], -(bb[1] + bb[3]) / 2])
    block = [c.translate([x0 + (bb[2] - bb[0]) + space + bw / 2, 0]) for c in block]
    return [big] + block, [n_size, size]


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
    texts, sizes = plaque_texts()
    outline = rounded_rect(PLAQUE_W, PLAQUE_H, 3.0)
    plate = (slab(outline.offset(-0.4), 0) + slab(outline, 0.4) +
             slab(outline, PLAQUE_T - 0.6) + slab(outline.offset(-0.6), PLAQUE_T - 0.01)).hull()
    frame = outline.offset(-1.6) - outline.offset(-3.4)
    text = texts[0]
    for t in texts[1:]:
        text = text + t
    info = dict(sizes=sizes, caps=[cap_height(x) for x in sizes], text=texts, stencil=STENCIL)
    if not STENCIL:
        rel = (frame + text).extrude(TEXT_RELIEF).translate([0, 0, PLAQUE_T - 0.01])
        return plate + rel, info
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
    hat, hat_z = make_crown(g) if HAT == "crown" else make_beanie(g)
    base, base_info = make_base(g)
    plaque, pinfo = make_plaque()

    zc = base_info["cheese_z"]
    asm = {"base": base, "blob": blob.translate([0, 0, zc]),
           "hat": hat.translate([0, 0, zc + hat_z])}
    asm["plaque"] = place_plaque(plaque, base_info)
    asm["pin"] = make_pin_vertical().translate([0, 0, zc - PIN_DEPTH])

    parts = {"blob": to_bed(blob), "hat": to_bed(hat),
             "base": to_bed(base), "plaque": to_bed(plaque), "pin": to_bed(make_pin())}
    return parts, asm, dict(g=g, band=band_radii(g), base=base_info, plaque=pinfo)


def place_plaque(plaque, base_info):
    """Stand the flat plaque up in its pocket on the front of the base."""
    pl = plaque.rotate([90, 0, 0])        # the text side (+z) turns to face the front (-y)
    pb = pl.bounding_box()
    return pl.translate([0, base_info["front_y"] + PLAQUE_POCKET - pb[4],
                         base_info["plaque_z"] - pb[2]])


def relief_z(name):
    """Height in the print orientation where the raised relief of a flat part
    starts, or None if the part has no relief that can take a second colour."""
    if name == "plaque" and not STENCIL:
        return PLAQUE_T
    if name == "base" and BASE_STYLE == "court":
        return base_top()
    return None


def switch_layer(z):
    """Layer number, start Z and slider height for a filament change at height z.

    Every layer, the first one included, is LAYER_H thick. Layer n is printed
    from (n - 1) * LAYER_H to n * LAYER_H, so pause before layer n starts.
    Bambu Studio shows each layer by its top height.
    """
    n = int(round(z / LAYER_H)) + 1
    return n, (n - 1) * LAYER_H, n * LAYER_H


def split_relief(m, z):
    """Split a flat part at height z into (plate, relief)."""
    top, low = m.split_by_plane([0, 0, 1], z)
    return low, top


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


def filament_by_colour(parts):
    """Filament per colour in grams for one trophy, split at the filament switches."""
    out = {}

    def add(m, col):
        r = check_part("x", m)
        out[col] = out.get(col, 0.0) + filament_grams(r["volume_cm3"], r["area_cm2"])

    for name, m in parts.items():
        z = relief_z(name)
        if z is None:
            add(m, COLOURS[name])
        else:
            low, top = split_relief(m, z)
            add(low, COLOURS[name])
            add(top, "white")
    return out


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
    cfg = PLACES[PLACE]
    print(f"== place {PLACE}: {cfg['name']}, scale {SCALE:.2f}, {cfg['blob']} blob, "
          f"{cfg['hat_colour']} {hat_name()}, {TIERS} tier base")
    br = info["band"]
    if HAT == "crown":
        # the point wall must stand on the band top, clear of the head inside it
        ledge = br["r_point"] - POINT_WALL / 2 - br["r_ht"] - TOLERANCE / 2
        assert POINT_WALL >= 0.8 and ledge >= 0.8, "crown point wall too thin or off the band"
    else:
        r45, z45 = beanie_seat(g)
        worst_beanie = 0.0
        for p, q in zip(prof[:-1], prof[1:]):
            if g["hat_bot"] - 1 <= p[1] < z45 and q[1] > p[1] and q[0] < p[0]:
                worst_beanie = max(worst_beanie, math.degrees(math.atan2(p[0] - q[0], q[1] - p[1])))
        assert worst_beanie <= 45.0, f"beanie seat overhang {worst_beanie:.1f} deg"
    print(f"blob: scale {g['scale']:.3f} mm/px, height {g['height']:.1f} mm, max width "
          f"{2 * prof[:, 0].max():.1f} mm, flat foot {2 * prof[0, 0]:.1f} mm")
    print(f"blob belly steepest {worst:.1f} deg, band seat steepest {worst_band:.1f} deg from vertical")
    if HAT == "crown":
        print(f"crown: {NUM_POINTS} points, {CROWN_H:.0f} mm tall, wall {POINT_WALL:.1f} mm, flare "
              f"{POINT_FLARE:.0f} deg, balls {2 * BALL_R:.1f} mm, band top under the point wall "
              f"{ledge:.2f} mm wide")
    else:
        print(f"beanie: seat follows the head up to {z45:.1f} mm, then a 45 deg cone. Steepest seat "
              f"{worst_beanie:.1f} deg, wall {BEANIE_WALL:.1f} mm")
    pq = info["plaque"]
    print(f"plaque {PLAQUE_LAYOUT}: font sizes " + ", ".join(f"{x:.2f}" for x in pq["sizes"]) +
          " mm, cap heights " + ", ".join(f"{x:.2f}" for x in pq["caps"]) + " mm")
    assert min(pq["caps"]) >= MIN_CAP, f"plaque text below {MIN_CAP} mm cap height"
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
    for label, t in zip(("text 1", "text 2", "text 3"), info["plaque"]["text"]):
        bb = t.bounds()
        thin = 1 - t.offset(-0.4).offset(0.4).area() / t.area()
        gaps = t.offset(0.4).offset(-0.4).area() / t.area() - 1
        print(f"  {label}: {bb[2] - bb[0]:.1f} x {bb[3] - bb[1]:.1f} mm. Area lost by a 0.8 mm "
              f"opening {thin * 100:.2f}%, area filled by a 0.8 mm closing {gaps * 100:.2f}%")
    print(f"base style: {BASE_STYLE}, {BASE_STYLES[BASE_STYLE]}")
    for name in ("plaque", "base"):
        z = relief_z(name)
        if z is not None:
            n, start, top = switch_layer(z)
            print(f"{name} colour switch: pause at layer {n} (Z {start:.1f} mm), "
                  f"Bambu Studio slider shows {top:.2f}")
    total = union(asm.values())
    bb = total.bounding_box()
    info["overall"] = (bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2])
    print(f"assembled: {bb[3] - bb[0]:.1f} x {bb[4] - bb[1]:.1f} mm, overall height {bb[5] - bb[2]:.1f} mm")
    grams = filament_by_colour(parts)
    info["grams"] = grams
    print("filament: " + ", ".join(f"{c} {x:.0f} g" for c, x in grams.items()) +
          f", total {sum(grams.values()):.0f} g")
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
    global YEAR, OVERALL_HEIGHT, TOLERANCE, PART, BASE_STYLE, PLAQUE_LAYOUT
    ap = argparse.ArgumentParser(description="Pizzakongen trophy generator")
    ap.add_argument("--year", type=int, default=YEAR)
    ap.add_argument("--text", help="plaque text for every place, in place of the text in PLACES")
    ap.add_argument("--height", type=float, default=OVERALL_HEIGHT)
    ap.add_argument("--tolerance", type=float, default=TOLERANCE)
    ap.add_argument("--part", default=PART, choices=["all"] + PARTS)
    ap.add_argument("--place", default="all", choices=["1", "2", "3", "all"],
                    help="which trophy of the set")
    ap.add_argument("--plaque", default=PLAQUE_LAYOUT, choices=["lines", "number"],
                    help="plaque text layout")
    ap.add_argument("--base", default=BASE_STYLE, choices=list(BASE_STYLES),
                    help="style of the 1st place base")
    ap.add_argument("--stencil", action="store_true",
                    help="stencil text cut through the plaque instead of raised text")
    ap.add_argument("--out", default=os.path.join(HERE, "stl", "pizzakongen"),
                    help="STL folder. Each place goes in its own placeN folder")
    ap.add_argument("--from-sprite", help="print the row widths of a blobbym*.bmp and exit")
    a = ap.parse_args(argv)
    if a.from_sprite:
        print(widths_from_sprite(a.from_sprite))
        return None
    YEAR, OVERALL_HEIGHT, TOLERANCE, PART = a.year, a.height, a.tolerance, a.part
    if a.text:
        for cfg in PLACES.values():
            cfg["text"] = a.text
    global STENCIL
    STENCIL = a.stencil
    BASE_STYLE = a.base
    PLAQUE_LAYOUT = a.plaque
    if not 150 <= OVERALL_HEIGHT <= 200:
        raise SystemExit("OVERALL_HEIGHT must be between 150 and 200 mm")

    import trimesh
    places = [1, 2, 3] if a.place == "all" else [int(a.place)]
    result = None
    for place in places:
        set_place(place)
        parts, asm, info = build()
        run_checks(parts, asm, info)
        out = os.path.join(a.out, f"place{place}")
        os.makedirs(out, exist_ok=True)
        for name, m in parts.items():
            if PART not in ("all", name):
                continue
            v, f = mesh_arrays(m)
            path = os.path.join(out, f"{hat_name() if name == 'hat' else name}.stl")
            trimesh.Trimesh(v, f).export(path)
            print("wrote", path)
        result = parts, asm, info
    return result


if __name__ == "__main__":
    main()
