"""Pokalen trophy: the winner's cup from the game, made real.

The cup is spun from the outline of data/gfx/pokal.bmp, the trophy shown on
the game's winner screen. It stands on a plinth with a nameplate. The
lid carries pepperoni and the medallion on top is a small pizza with three
blobs on a podium. The plaque and the medallion change filament once, at
the height printed in the print guide.

    python pokalen.py                       # all parts and the checks
    python pokalen.py --year 2027 --part plaque
    python pokalen.py --render              # also write the PNG previews
"""

import argparse
import math
import os

import numpy as np
from manifold3d import CrossSection, FillRule, Manifold

import alt_common as C

# ---------------------------------------------------------------------------
# Parameters
# ---------------------------------------------------------------------------

YEAR = 2026
TEXT = "Svettaste Blåbbyen"
OVERALL_HEIGHT = 195.0           # mm, bed to top of the medallion (150 to 200)
TOLERANCE = 0.3                  # mm total clearance per fit. PLA 0.3, PETG 0.4
PART = "all"

# Plinth with the plaque pocket in the front
PLINTH_W = 78.0
PLINTH_H = 46.0
PLINTH_CHAMFER = 2.0
PLINTH_STEP = 1.5                # low step on top that the foot stands on
PLAQUE_W = 70.0
PLAQUE_H = 36.0
PLAQUE_T = 1.6                   # 8 layers. Thin, so a stencil shows the plinth from the side too
PLAQUE_POCKET = 1.6
PLAQUE_Z = 4.0                   # bottom of the plaque above the bed
TEXT_RELIEF = 1.0                # raised letters and frame, 5 layers
STENCIL = False                  # False: white plate, raised letters in a second colour.
                                 # True: letters cut through, the plinth shows through them.
BRIDGE_W = 1.2

# Cup
NECK_R = 7.5                     # mm, the sprite's stem is too thin to print, so it is widened
KNOT_R = 10.0                    # mm, the ring on the stem just under the bowl
MEDALLION_D = 30.0
MEDALLION_T = 4.4                # 22 layers, the relief on top can switch colour
MEDALLION_GAP = 1.5              # visible tab between the knob and the medallion
RELIEF = 1.2
BLOB_RELIEF = 1.6
NUM_PEPPERONI = 7
SMOOTH_ROWS = 3.0                # sprite rows of smoothing on the cup outline

# Rows of pokal.bmp (130 x 360 px) where the parts start and end
ROW_KNOB_TOP = 44
ROW_LID_BOTTOM = 97
ROW_SPLIT = 214                  # stem, between bowl and foot
ROW_FOOT_BOTTOM = 305
ROW_KNOT = 221

# D-pins at every stacked joint (plinth to foot, foot to bowl, bowl to lid)
PIN_D = 7.0
PIN_FLAT = 1.8
PIN_DEPTH = 7.0

SEGMENTS = 160
LAYER = 0.2                      # layer height, first layer included

# Width in pixels of every row of pokal.bmp, top to bottom. Re-measure with --from-sprite.
POKAL_ROW_WIDTHS = [
    8, 14, 20, 24, 27, 30, 32, 34, 35, 37, 38, 39, 40, 41, 42, 42, 43, 44, 44, 44, 45, 45, 45,
    46, 45, 45, 44, 44, 44, 43, 43, 42, 41, 40, 39, 38, 37, 35, 34, 32, 30, 27, 24, 22, 24, 30,
    31, 32, 32, 32, 32, 32, 32, 32, 34, 36, 38, 39, 40, 42, 43, 44, 46, 47, 48, 50, 51, 53, 54,
    56, 57, 58, 60, 62, 63, 65, 66, 68, 70, 72, 75, 78, 80, 84, 88, 92, 96, 100, 104, 110, 114,
    118, 122, 126, 129, 130, 129, 127, 125, 126, 127, 127, 127, 127, 127, 127, 127, 127, 127,
    127, 126, 126, 126, 126, 125, 125, 125, 125, 125, 125, 125, 125, 125, 124, 124, 124, 123,
    123, 123, 123, 123, 122, 122, 121, 121, 121, 121, 121, 121, 120, 120, 119, 119, 119, 119,
    118, 117, 117, 117, 116, 115, 115, 115, 115, 113, 113, 113, 112, 111, 111, 109, 109, 108,
    107, 107, 105, 105, 103, 103, 101, 100, 99, 97, 97, 95, 94, 93, 91, 90, 89, 87, 85, 84, 83,
    81, 79, 77, 76, 75, 73, 75, 77, 77, 77, 75, 73, 71, 69, 67, 65, 63, 61, 59, 56, 53, 51, 47,
    43, 39, 34, 29, 25, 20, 16, 13, 11, 11, 11, 12, 14, 17, 19, 30, 31, 27, 25, 23, 23, 25, 31,
    33, 35, 36, 37, 37, 37, 37, 38, 38, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 40,
    41, 41, 41, 41, 41, 41, 41, 41, 41, 41, 43, 43, 43, 43, 43, 43, 45, 45, 45, 46, 47, 47, 48,
    49, 49, 51, 51, 53, 53, 55, 55, 57, 57, 58, 59, 59, 59, 57, 58, 61, 61, 63, 63, 63, 63, 65,
    92, 94, 94, 96, 96, 97, 98, 98, 100, 100, 101, 101, 101, 101, 101, 101, 101, 101, 101, 101,
    101, 101, 101, 101, 101, 101, 101, 101, 101, 101, 101, 101, 101, 101, 101, 101, 101, 101,
    101, 101, 101, 101, 101, 101, 101, 101, 101, 101, 101, 101, 101, 101, 101, 101, 101, 101,
    101, 101, 101, 101, 101,
]

PARTS = ["plinth", "plaque", "foot", "bowl", "lid", "medallion", "pin"]
PIN_COUNT = 3
HERE = C.HERE

# Colour schemes. Each part takes the colour of what it would be on a real
# trophy: a black plinth, one white metal for the cup and the plate, and a
# dark blue enamel medallion. `<part>_relief` is the colour after the one
# filament change in a flat printed part (see switch_heights).
SCHEMES = {
    "material": dict(plinth=C.BLACK, plaque=C.WHITE, plaque_relief=C.BLACK, foot=C.WHITE,
                     bowl=C.WHITE, lid=C.WHITE, medallion=C.BLUE, medallion_relief=C.WHITE,
                     pin=C.BLACK),
    "navy_white": dict(plinth=C.BLUE, plaque=C.WHITE, plaque_relief=C.BLUE, foot=C.WHITE,
                       bowl=C.BLUE, lid=C.WHITE, medallion=C.WHITE, medallion_relief=C.WHITE,
                       pin=C.BLUE),
    "navy_white_bowl": dict(plinth=C.BLUE, plaque=C.WHITE, plaque_relief=C.BLUE, foot=C.WHITE,
                            bowl=C.WHITE, lid=C.WHITE, medallion=C.WHITE,
                            medallion_relief=C.WHITE, pin=C.BLUE),
    "black_white": dict(plinth=C.BLACK, plaque=C.WHITE, plaque_relief=C.BLACK, foot=C.WHITE,
                        bowl=C.WHITE, lid=C.WHITE, medallion=C.WHITE, medallion_relief=C.WHITE,
                        pin=C.BLACK),
    "old_blue_green": dict(plinth=C.BLACK, plaque=C.BLUE, plaque_relief=C.BLUE, foot=C.BLUE,
                           bowl=C.GREEN, lid=C.BLUE, medallion=C.BLUE, medallion_relief=C.BLUE,
                           pin=C.BLACK),
}
SCHEME_LABELS = {
    "material": "Black plinth, white metal, blue medallion",
    "navy_white": "Dark blue plinth and bowl, white metal",
    "navy_white_bowl": "Dark blue plinth, white cup",
    "black_white": "Black plinth, white cup",
    "old_blue_green": "Old: black, dark blue, dark green",
}
PALETTE = "material"
SCHEME = SCHEMES[PALETTE]


# ---------------------------------------------------------------------------
# Cup profile
# ---------------------------------------------------------------------------

def scale():
    """mm per sprite pixel, solved for OVERALL_HEIGHT."""
    cup_px = ROW_FOOT_BOTTOM - ROW_KNOB_TOP
    return (OVERALL_HEIGHT - PLINTH_H - PLINTH_STEP - MEDALLION_GAP - MEDALLION_D) / cup_px


def cup_radius_mm():
    """Radius in mm for every sprite row of the cup, smoothed and made printable."""
    s = scale()
    w = np.array(POKAL_ROW_WIDTHS, float)
    r = w / 2 * s
    rows = np.arange(len(w))
    # widen the stem and give the knot under the bowl a clear ring
    stem = (rows > 195) & (rows < 235)
    r[stem] = np.maximum(r[stem], NECK_R)
    bump = np.clip(1 - np.abs(rows - ROW_KNOT) / 3.5, 0, 1)
    r = np.maximum(r, NECK_R + (KNOT_R - NECK_R) * np.sin(bump * math.pi / 2))
    r[rows < ROW_KNOB_TOP] = 0
    # light smoothing, kept apart for each part so the split faces stay flat
    out = r.copy()
    for a, b in ((ROW_KNOB_TOP, ROW_LID_BOTTOM), (ROW_LID_BOTTOM, ROW_SPLIT),
                 (ROW_SPLIT, ROW_FOOT_BOTTOM)):
        out[a:b + 1] = gauss(r[a:b + 1], SMOOTH_ROWS)
    return out


def gauss(a, sigma):
    """Gaussian smoothing with the ends held, so the pixel steps of the sprite vanish."""
    k = np.arange(-int(3 * sigma), int(3 * sigma) + 1)
    ker = np.exp(-0.5 * (k / sigma) ** 2)
    ker /= ker.sum()
    m = len(k) // 2
    ext = np.concatenate([np.full(m, a[0]), a, np.full(m, a[-1])])
    return np.convolve(ext, ker, mode="valid")


def limit_overhang(r, dz, up_is_increasing_index):
    """Make sure the radius never grows faster than 45 degrees going up in print."""
    r = r.copy()
    idx = range(1, len(r)) if up_is_increasing_index else range(len(r) - 2, -1, -1)
    for i in idx:
        prev = i - 1 if up_is_increasing_index else i + 1
        r[i] = min(r[i], r[prev] + dz)
    return r


def part_profile(row_a, row_b, flip):
    """(r, z) outline from sprite row_a (top) to row_b (bottom), in print orientation.

    flip=False: row_b is on the bed (upright). flip=True: row_a is on the bed.
    A 0.4 mm chamfer is added at the bed against elephant's foot.
    """
    s = scale()
    r = cup_radius_mm()[row_a:row_b + 1]
    if not flip:
        r = r[::-1]                           # index 0 on the bed
    r = limit_overhang(r, s, True)
    z = np.arange(len(r)) * s
    pts = [(0.0, 0.0), (r[0] - 0.4, 0.0), (r[0], 0.4)]
    for ri, zi in zip(r[1:], z[1:]):
        if zi > 0.4 + 1e-6:
            pr, pz = pts[-1]
            pts.append((min(ri, pr + (zi - pz)), zi))
    pts.append((0.0, z[-1]))
    return np.array(pts)


def revolve(prof):
    return C.revolve_pts(prof, SEGMENTS)


# ---------------------------------------------------------------------------
# Parts
# ---------------------------------------------------------------------------

def socket(roof):
    return C.pin_socket(PIN_D, PIN_FLAT, PIN_DEPTH + 0.5, TOLERANCE, roof=roof)


def make_foot():
    prof = part_profile(ROW_SPLIT, ROW_FOOT_BOTTOM, flip=False)
    foot = revolve(prof)
    h = prof[:, 1].max()
    foot = foot - socket(True).translate([0, 0, -0.01])
    foot = foot - socket(False).translate([0, 0, h - PIN_DEPTH - 0.5 + 0.01])
    return foot, prof


def make_bowl():
    """Bowl printed upside down: the top face (under the lid) is on the bed."""
    prof = part_profile(ROW_LID_BOTTOM, ROW_SPLIT, flip=True)
    bowl = revolve(prof)
    h = prof[:, 1].max()
    bowl = bowl - socket(True).translate([0, 0, -0.01])
    bowl = bowl - socket(False).translate([0, 0, h - PIN_DEPTH - 0.5 + 0.01])
    return bowl, prof


def make_lid():
    prof = part_profile(ROW_KNOB_TOP, ROW_LID_BOTTOM, flip=False)
    lid = revolve(prof)
    h = prof[:, 1].max()
    # pepperoni: vertical walled discs that follow the lid surface, RELIEF higher
    shell = lid.translate([0, 0, RELIEF])
    r_mid = (part_r_at(prof, h * 0.12) + part_r_at(prof, h * 0.30)) / 2
    peps = []
    rng = np.random.default_rng(3)
    for k in range(NUM_PEPPERONI):
        a = math.radians(-90 + 360 / NUM_PEPPERONI * (k + 0.5) + rng.uniform(-6, 6))
        rr = r_mid + rng.uniform(-2.0, 2.0)
        peps.append(Manifold.cylinder(h, 3.6, 3.6, 40).translate(
            [rr * math.cos(a), rr * math.sin(a), 0]))
    toppings = shell ^ C.union(peps)
    lid = lid + toppings
    # slot for the medallion tab in the top of the knob
    slot = Manifold.cube([10.0 + TOLERANCE, MEDALLION_T + TOLERANCE, 6.01], True)
    lid = lid - slot.translate([0, 0, h - 3.0 + 0.005])
    lid = lid - socket(True).translate([0, 0, -0.01])
    return lid, prof


def part_r_at(prof, z):
    p = prof[1:-1]
    return float(np.interp(z, p[:, 1], p[:, 0]))


def make_medallion():
    """A small pizza with three blobs on a podium, printed flat, relief up.

    Local frame: x across, y up when standing, z through the thickness.
    The tab at the bottom goes into the slot in the lid knob.
    """
    R = MEDALLION_D / 2
    t = MEDALLION_T
    disc = C.slab(CrossSection.circle(R - 0.4, 96), 0) + C.slab(CrossSection.circle(R, 96), 0.4)
    disc = (disc + C.slab(CrossSection.circle(R, 96), t - 0.01)).hull()
    tab = Manifold.cube([10.0, 6.0 + MEDALLION_GAP + 2.0, t]).translate(
        [-5.0, -R - MEDALLION_GAP - 6.0, 0])
    body = disc + tab
    # crust rim, notched like a baked edge
    crust = CrossSection.circle(R - 0.6, 96) - CrossSection.circle(R - 3.0, 96)
    for k in range(16):
        a = 360 / 16 * k
        crust = crust - CrossSection.square([1.0, 4.0]).translate([-0.5, R - 4.0]).rotate(a)
    rel = [crust.extrude(RELIEF)]
    # podium: three steps, the middle one highest
    step_w, gap = 6.6, 0.6
    heights = {-1: 2.2, 0: 3.8, 1: 1.4}
    y0 = -R + 6.4
    for i, hh in heights.items():
        x = i * (step_w + gap)
        rel.append(C.rounded_rect(step_w, hh, 0.4, 12).translate([x, y0 + hh / 2]).extrude(RELIEF))
    for i, hh in heights.items():
        x = i * (step_w + gap)
        bh = 8.6 if i == 0 else 7.4
        blob = C.blob_outline_2d(bh).translate([x, y0 + hh + 0.6])
        rel.append(blob.extrude(BLOB_RELIEF))
    return body + C.union(rel).translate([0, 0, t - 0.01])


def make_plinth():
    W, H, c = PLINTH_W, PLINTH_H, PLINTH_CHAMFER
    sq = C.rounded_rect(W, W, 2.0)
    body = (C.slab(sq.offset(-0.4), 0) + C.slab(sq, 0.4) + C.slab(sq, H - c) +
            C.slab(sq.offset(-c), H - 0.01)).hull()
    # a low step on top for the foot to stand on, like the marble block in the game
    step = C.rounded_rect(W - 2 * c - 6, W - 2 * c - 6, 2.0)
    body = body + (C.slab(step, H - 0.02) + C.slab(step.offset(-PLINTH_STEP), H + PLINTH_STEP)).hull()
    pw, ph = PLAQUE_W + TOLERANCE, PLAQUE_H + TOLERANCE
    y_front = -W / 2
    z_p0 = PLAQUE_Z - TOLERANCE / 2
    pocket = Manifold.cube([pw, PLAQUE_POCKET + 5, ph]).translate([-pw / 2, y_front - 5, z_p0])
    roof = (slab_x(pw, y_front - 5, y_front + PLAQUE_POCKET, z_p0 + ph - 0.01) +
            slab_x(pw, y_front - 5, y_front - 0.01, z_p0 + ph + PLAQUE_POCKET)).hull()
    body = body - pocket - roof
    top = H + PLINTH_STEP
    body = body - socket(False).translate([0, 0, top - PIN_DEPTH - 0.5 + 0.01])
    return body, top


def slab_x(w, y0, y1, z):
    return Manifold.cube([w, y1 - y0, 0.01]).translate([-w / 2, y0, z])


def make_plaque(stencil=None):
    stencil = STENCIL if stencil is None else stencil
    lay = C.fit_text_block(TEXT, YEAR, PLAQUE_W - 2 * 5.0, PLAQUE_H - 2 * 4.0, gap=1.8)
    outline = C.rounded_rect(PLAQUE_W, PLAQUE_H, 3.0)
    plate = (C.slab(outline.offset(-0.4), 0) + C.slab(outline, 0.4) +
             C.slab(outline, PLAQUE_T - 0.6) + C.slab(outline.offset(-0.6), PLAQUE_T - 0.01)).hull()
    frame = outline.offset(-1.6) - outline.offset(-3.4)
    text = sum_cs(lay["lines"])
    info = dict(layout=lay, stencil=stencil)
    if not stencil:
        rel = (frame + text).extrude(TEXT_RELIEF).translate([0, 0, PLAQUE_T - 0.01])
        return plate + rel, info
    material, bridges = C.stencil_bridges(outline - text, text, BRIDGE_W)
    holes = outline.offset(-0.5) - material
    cut = holes.extrude(PLAQUE_T + 2).translate([0, 0, -1])
    rel = frame.extrude(TEXT_RELIEF).translate([0, 0, PLAQUE_T - 0.01])
    info.update(material=material, bridges=len(bridges), holes=holes)
    return plate - cut + rel, info


def sum_cs(items):
    out = items[0]
    for c in items[1:]:
        out = out + c
    return out


def place_plaque(plaque, pieces=()):
    """Stand the plaque up in its pocket. Pieces of it get the same move."""
    pb = plaque.rotate([90, 0, 0]).bounding_box()
    move = [0, -PLINTH_W / 2 + PLAQUE_POCKET - pb[4], PLAQUE_Z - pb[2]]
    return [m.rotate([90, 0, 0]).translate(move) for m in (plaque,) + tuple(pieces)]


def switch_heights():
    """Z in print orientation where each flat part changes to its second colour."""
    sw = {"medallion": MEDALLION_T}
    if not STENCIL:
        sw["plaque"] = PLAQUE_T
    return sw


def layer_of(z):
    """Number of the first layer at or above z, with LAYER mm layers from z = 0."""
    return int(round(z / LAYER)) + 1


def split_colours(m, z):
    """(base, relief): the part below and above the filament change."""
    above, below = m.split_by_plane([0, 0, 1], z + 0.002)   # just above the top face
    return below, above


def make_pin():
    return C.make_pin_vertical(PIN_D, PIN_FLAT, 2 * PIN_DEPTH).rotate([-90, 0, 0])


# ---------------------------------------------------------------------------
# Build, check, export
# ---------------------------------------------------------------------------

def build():
    s = scale()
    plinth, z = make_plinth()
    plaque, pinfo = make_plaque()
    foot, fprof = make_foot()
    bowl, bprof = make_bowl()
    lid, lprof = make_lid()
    med = make_medallion()

    fh, bh, lh = fprof[:, 1].max(), bprof[:, 1].max(), lprof[:, 1].max()
    sw = switch_heights()
    asm = {"plinth": plinth}
    if "plaque" in sw:
        lo, hi = split_colours(plaque, sw["plaque"])
        _, asm["plaque"], asm["plaque_relief"] = place_plaque(plaque, (lo, hi))
    else:
        asm["plaque"] = place_plaque(plaque)[0]
    asm["foot"] = foot.translate([0, 0, z])
    z += fh
    asm["bowl"] = bowl.mirror([0, 0, 1]).translate([0, 0, z + bh])
    z += bh
    asm["lid"] = lid.translate([0, 0, z])
    z += lh
    # medallion stands up, its tab in the knob slot, front facing -y
    mb = med.rotate([90, 0, 0]).bounding_box()
    move = [0, -(mb[1] + mb[4]) / 2, z - 6.0 + 0.3 - mb[2]]
    lo, hi = split_colours(med, sw["medallion"])
    asm["medallion"] = lo.rotate([90, 0, 0]).translate(move)
    asm["medallion_relief"] = hi.rotate([90, 0, 0]).translate(move)
    parts = {"plinth": C.to_bed(plinth), "plaque": C.to_bed(plaque), "foot": C.to_bed(foot),
             "bowl": C.to_bed(bowl), "lid": C.to_bed(lid), "medallion": C.to_bed(med),
             "pin": C.to_bed(make_pin())}
    relief = {}
    for name, zs in sw.items():
        lo, hi = split_colours(parts[name], zs)
        v, a = hi.volume() / 1000.0, hi.surface_area() / 100.0
        relief[name] = dict(z=zs, layer=layer_of(zs), base=lo, relief=hi,
                            grams=C.filament_grams(v, a))
    return parts, asm, dict(scale=s, profiles=dict(foot=fprof, bowl=bprof, lid=lprof),
                            plaque=pinfo, relief=relief)


def run_checks(parts, asm, info):
    s = info["scale"]
    print(f"scale {s:.3f} mm per sprite px")
    for name, prof in info["profiles"].items():
        p = prof[2:-1]
        worst = C.steepest_outward(p)
        print(f"  {name}: height {prof[:, 1].max():.1f} mm, max diameter {2 * prof[:, 0].max():.1f} mm, "
              f"steepest outward {worst:.1f} deg from vertical")
        assert worst <= 45.01, name
    lay = info["plaque"]["layout"]
    print(f"plaque text lines {lay['text_lines']} + year, font {lay['size']:.2f} mm "
          f"(cap height {lay['cap']:.1f} mm), year {lay['year_size']:.2f} mm")
    for t in lay["lines"]:
        print(f"  line area lost by a 0.8 mm opening {C.text_quality(t) * 100:.2f}%")
    if info["plaque"]["stencil"]:
        print(f"stencil: {info['plaque']['bridges']} bridges, plaque in one piece: "
              f"{len(info['plaque']['material'].decompose()) == 1}")
    total = C.union(asm.values())
    bb = total.bounding_box()
    info["overall"] = (bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2])
    print(f"assembled: {info['overall'][0]:.1f} x {info['overall'][1]:.1f} mm, "
          f"overall height {info['overall'][2]:.1f} mm")
    return C.report_parts(parts, {"pin": PIN_COUNT})


def grams_by_colour(results, scheme, relief=None):
    """Filament per colour. Relief above a filament change counts in its own colour."""
    out = {}
    for r in results:
        g = r["grams"] * r["count"]
        rel = (relief or {}).get(r["name"])
        if rel:
            col = C.COLOUR_NAMES[scheme[r["name"] + "_relief"]]
            out[col] = out.get(col, 0) + rel["grams"]
            g -= rel["grams"]
        col = C.COLOUR_NAMES[scheme[r["name"]]]
        out[col] = out.get(col, 0) + g
    return out


def print_guide(info, scheme):
    lines = []
    for name, rel in info["relief"].items():
        a, b = scheme[name], scheme[name + "_relief"]
        if a == b:
            lines.append(f"{name}: one colour, {C.COLOUR_NAMES[a]}, no pause")
        else:
            lines.append(f"{name}: start in {C.COLOUR_NAMES[a]}. Pause at layer {rel['layer']} "
                         f"(Z {rel['z']:.1f} mm), change to {C.COLOUR_NAMES[b]}")
    return lines


# ---------------------------------------------------------------------------
# Renders
# ---------------------------------------------------------------------------

def render_all(parts, asm, out_dir, scheme=None, relief=None):
    scheme = scheme or SCHEME
    os.makedirs(out_dir, exist_ok=True)
    items = [C.prep(m, scheme[n]) for n, m in asm.items()]
    C.render(items, os.path.join(out_dir, "front.png"), az=0, el=6,
             title=f"Pokalen, front. {SCHEME_LABELS[PALETTE]}")
    C.render(items, os.path.join(out_dir, "angle.png"), az=35, el=24, title="Pokalen, front left")
    crop = (C.mesh_arrays(asm["plaque"])[0], 5.0)
    rake = [((-0.6, -0.5, 0.6), 1.0), ((0.4, -0.8, 0.2), 0.25)]
    C.render([C.prep(asm[n], scheme[n]) for n in ("plinth", "plaque", "plaque_relief") if n in asm],
             os.path.join(out_dir, "plaque_closeup.png"), az=0, el=12, size=(1000, 560),
             crop=crop, lights=rake)
    crop = (C.mesh_arrays(asm["medallion"])[0], 4.0)
    C.render([C.prep(asm[n], scheme[n]) for n in ("lid", "medallion", "medallion_relief")],
             os.path.join(out_dir, "medallion_closeup.png"), az=0, el=8, size=(800, 800),
             crop=crop, lights=rake)
    labels = {"plinth": "Plinth, upright", "plaque": "Plaque, flat, front facing up",
              "foot": "Foot, upright", "bowl": "Bowl, upside down, lid face on the bed",
              "lid": "Lid, upright", "medallion": "Medallion, flat, front facing up",
              "pin": "Pin (print 3), lying on its flat side"}
    relief = relief or {}
    for n, m in parts.items():
        col = scheme[n]
        if n in relief and scheme[n + "_relief"] != col:
            body = [C.prep(relief[n]["base"], col), C.prep(relief[n]["relief"], scheme[n + "_relief"])]
        else:
            body = [C.prep(m, col)]
        C.render(body + [C.prep(C.bed_under(m), C.BED_GREY, 0.0)],
                 os.path.join(out_dir, f"print_{n}.png"), az=30, el=32, size=(700, 700),
                 title=labels[n])


def render_compare(asm, results, out_dir, relief=None):
    """compare.png: every colour scheme side by side with filament per colour."""
    import tempfile
    tmp = tempfile.mkdtemp()
    panels = []
    for name, sc in SCHEMES.items():
        png = os.path.join(tmp, f"{name}.png")
        C.render([C.prep(m, sc[n]) for n, m in asm.items()], png, az=35, el=20, size=(600, 800))
        grams = grams_by_colour(results, sc, relief)
        cap = [SCHEME_LABELS[name] + (" (default)" if name == PALETTE else "")]
        cap += [f"{col}: {g:.0f} g" for col, g in sorted(grams.items(), key=lambda x: -x[1])]
        panels.append((png, cap))
    C.compare_sheet(panels, os.path.join(out_dir, "compare.png"), "Pokalen colour schemes")


def main(argv=None):
    global YEAR, TEXT, OVERALL_HEIGHT, TOLERANCE, PART, STENCIL, PALETTE, SCHEME
    ap = argparse.ArgumentParser(description="Pokalen trophy generator")
    ap.add_argument("--year", type=int, default=YEAR)
    ap.add_argument("--text", default=TEXT)
    ap.add_argument("--height", type=float, default=OVERALL_HEIGHT)
    ap.add_argument("--tolerance", type=float, default=TOLERANCE)
    ap.add_argument("--part", default=PART, choices=["all"] + PARTS)
    ap.add_argument("--stencil", action="store_true",
                    help="cut the letters through the plaque instead of raised letters")
    ap.add_argument("--out", default=os.path.join(HERE, "stl", "pokalen"))
    ap.add_argument("--render", action="store_true", help="also write PNG previews")
    ap.add_argument("--palette", default=PALETTE, choices=list(SCHEMES))
    ap.add_argument("--from-sprite", help="print the row widths of pokal.bmp and exit")
    a = ap.parse_args(argv)
    if a.from_sprite:
        from PIL import Image
        im = np.asarray(Image.open(a.from_sprite).convert("RGB")).astype(int).sum(axis=2) > 0
        print([int(np.ptp(np.where(r)[0]) + 1) if r.any() else 0 for r in im])
        return None
    YEAR, TEXT, OVERALL_HEIGHT, TOLERANCE, PART = a.year, a.text, a.height, a.tolerance, a.part
    STENCIL = a.stencil
    PALETTE, SCHEME = a.palette, SCHEMES[a.palette]
    if not 150 <= OVERALL_HEIGHT <= 200:
        raise SystemExit("OVERALL_HEIGHT must be between 150 and 200 mm")
    parts, asm, info = build()
    results = run_checks(parts, asm, info)
    for col, g in grams_by_colour(results, SCHEME, info["relief"]).items():
        print(f"filament {col}: about {g:.0f} g")
    for line in print_guide(info, SCHEME):
        print("print guide:", line)
    C.export_parts(parts, a.out, "pokalen", PART)
    if a.render:
        out = os.path.join(HERE, "renders", "pokalen")
        render_all(parts, asm, out, relief=info["relief"])
        render_compare(asm, results, out, info["relief"])
    return parts, asm, info


if __name__ == "__main__":
    main()
