"""Foza-tårnet trophy: a Blobby blob on a wobbly stack of Foza coins.

The coins are the fake betting points from the tournament site. Every coin
is the same part. A D-shaped pin on top of each coin sits off centre and is
turned against the hole underneath, so the stack steps round in a fixed,
wobbly spiral. The base is a big coin. Its rim is a separate ring with the
text cut through it, so the black core shows through the letters.

    python foza_taarnet.py                   # all parts and the checks
    python foza_taarnet.py --year 2027 --part ring
    python foza_taarnet.py --render          # also write the PNG previews
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
TEXT = "Svettaste Blåbby"
OVERALL_HEIGHT = 175.0           # mm, bed to top of the blob (150 to 200)
TOLERANCE = 0.3                  # mm total clearance per fit. PLA 0.3, PETG 0.4
PART = "all"

# Base coin: black core plus a rim ring with the text cut through it
BASE_R = 70.0
BASE_H = 30.0                    # core height, the coin stack stands on its top
FLANGE_H = 3.0                   # core flange under the ring
RING_T = 3.2                     # ring wall
RING_LIP = 1.2                   # ring stands this far above the core, like a coin rim
TEXT_ARC_DEG = 120.0             # widest arc the text may use on the front
BRIDGE_W = 1.2
GROOVE_IN = 17.0                 # engraved circle on the top of the core, this far inside the ring
NUM_TOP_SLICES = 12              # pizza slices engraved round the top of the core

# Coins
NUM_COINS = 5
COIN_D = 70.0
COIN_H = 12.0
COIN_CHAMFER = 0.8
COIN_OFFSET = 6.0                # mm from coin centre to the pin on top
COIN_TWIST = 140.0               # degrees each coin turns against the one below
BASE_TWIST = -100.0              # direction of the first step
ENGRAVE = 1.0                    # depth of the edge lettering and emblems
EDGE_WORD = "FOZA"
EDGE_CAP = 6.0                   # cap height of the edge lettering

# Pins, part of the coins and the core
PIN_D = 8.0
PIN_FLAT = 2.0
PIN_H = 4.6
SOCKET_DEPTH = 5.0

# Blob (spun from data/gfx/blobbym1.bmp)
BLOB_CUT_ROW = 78

SEGMENTS = 160
PARTS = ["core", "ring", "coin", "blob"]
HERE = C.HERE

# Colour schemes. Dark blue and white only. coin_even is the bottom coin and
# every second one above it. The ring letters show the core colour.
SCHEMES = {
    "navy_white": dict(core=C.BLUE, ring=C.WHITE, blob=C.BLUE, coin_even=C.WHITE, coin_odd=C.BLUE),
    "navy_white_coins": dict(core=C.BLUE, ring=C.WHITE, blob=C.BLUE, coin_even=C.WHITE,
                             coin_odd=C.WHITE),
    "old_black_green": dict(core=C.BLACK, ring=C.GREEN, blob=C.BLUE, coin_even=C.BLACK,
                            coin_odd=C.GREEN),
}
SCHEME_LABELS = {
    "navy_white": "White and dark blue coins",
    "navy_white_coins": "All white coins",
    "old_black_green": "Old: black, dark green, dark blue",
}
PALETTE = "navy_white_coins"
SCHEME = SCHEMES[PALETTE]


def coin_colour(k, scheme=None):
    scheme = scheme or SCHEME
    return scheme["coin_even"] if k % 2 == 0 else scheme["coin_odd"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def bend(m, radius, z0=0.0):
    """Bend a flat cutter around the z axis.

    Input frame: x is arc length on the surface at `radius`, y is height and
    z points outward (z = 0 on the surface). x = 0 lands on the front (-y
    side). The map keeps handedness, so text reads the right way round.
    """
    def f(p):
        p = np.asarray(p, float)
        ang = p[:, 0] / radius
        r = radius + p[:, 2]
        return np.column_stack([r * np.sin(ang), -r * np.cos(ang), p[:, 1] + z0])
    return m.refine_to_length(0.8).warp_batch(f)


def sum_cs(items):
    out = items[0]
    for c in items[1:]:
        out = out + c
    return out


def pin(rot_deg):
    """Integrated D-pin standing on z = 0, its flat side facing 90 + rot_deg degrees."""
    return C.make_pin_vertical(PIN_D, PIN_FLAT, PIN_H + 0.01, c=0.5).rotate([0, 0, rot_deg])


def socket():
    return C.pin_socket(PIN_D, PIN_FLAT, SOCKET_DEPTH, TOLERANCE, roof=True)


def stack_layout():
    """Centre and turn of every coin, and where the blob ends up."""
    centres, turns = [], []
    c = np.zeros(2)
    th = BASE_TWIST
    for _ in range(NUM_COINS):
        centres.append(c.copy())
        turns.append(th)
        c = c + COIN_OFFSET * np.array([math.cos(math.radians(th)), math.sin(math.radians(th))])
        th += COIN_TWIST
    return centres, turns, c


# ---------------------------------------------------------------------------
# Parts
# ---------------------------------------------------------------------------

def core_radius():
    return BASE_R - RING_T - TOLERANCE / 2


def make_core():
    rc = core_radius()
    pts = [(0, 0), (BASE_R - 0.4, 0), (BASE_R, 0.4), (BASE_R, FLANGE_H - 0.6),
           (BASE_R - 0.6, FLANGE_H), (rc, FLANGE_H), (rc, BASE_H - 0.6), (rc - 0.6, BASE_H),
           (0, BASE_H)]
    core = C.revolve_pts(pts, 256)
    gr = rc - GROOVE_IN
    groove = C.revolve_pts([(gr - 0.6, BASE_H + 1), (gr, BASE_H - 0.8),
                            (gr + 0.6, BASE_H + 1)], 256)
    # a ring of engraved pizza slices between the groove and the rim, tips inward
    emb = slice_emblem(13.0, 11.0)
    r_emb = (gr + rc) / 2
    slices = [emb.translate([0, r_emb]).rotate(360.0 / NUM_TOP_SLICES * (k + 0.5))
              for k in range(NUM_TOP_SLICES)]
    cut = sum_cs(slices).extrude(ENGRAVE + 1.0).translate([0, 0, BASE_H - ENGRAVE])
    core = core - groove - cut
    core = core + pin(BASE_TWIST).translate([0, 0, BASE_H - 0.01])
    return core


def ring_text():
    """Unrolled text for the ring in (arc length, height) on the outer surface."""
    ring_h = BASE_H - FLANGE_H + RING_LIP
    width = BASE_R * math.radians(TEXT_ARC_DEG)
    lay = C.fit_text_block(TEXT, YEAR, width, ring_h - 2 * 3.0, gap=2.2, year_scale=0.85)
    yc = ring_h / 2
    lines = [t.translate([0, yc]) for t in lay["lines"]]
    return lines, lay, ring_h


def make_ring():
    """Rim ring, printed upright. The text is cut through it as a stencil."""
    ri = core_radius() + TOLERANCE / 2
    lines, lay, ring_h = ring_text()
    pts = [(ri + 0.4, 0), (BASE_R - 0.4, 0), (BASE_R, 0.4), (BASE_R, ring_h - 0.6),
           (BASE_R - 0.6, ring_h), (ri + 0.6, ring_h), (ri, ring_h - 0.6), (ri, 0.4)]
    ring = C.revolve_pts(pts, 256)
    text = sum_cs(lines)
    circ = 2 * math.pi * BASE_R
    band = CrossSection.square([circ * 0.9, ring_h]).translate([-circ * 0.45, 0])
    material, bridges = C.stencil_bridges(band - text, text, BRIDGE_W)
    holes = band.offset(-0.3) - material
    cutter = bend(holes.extrude(RING_T + 2.0).translate([0, 0, -RING_T - 1.0]), BASE_R)
    ring = (ring - cutter).simplify(0.002)      # drop sliver edges left by the bent cut
    info = dict(layout=lay, bridges=len(bridges), material=material, holes=holes, ring_h=ring_h)
    return ring, info


def slice_emblem(w=13.0, h=8.6):
    """Pizza slice, tip down, as the area to engrave. Crust and pepperoni stay proud."""
    tri = CrossSection([np.array([(-w / 2, h / 2), (0, -h / 2), (w / 2, h / 2)])])
    crust = CrossSection.square([w + 2, 2.0]).translate([-w / 2 - 1, h / 2 - 2.0]) ^ tri
    peps = CrossSection.circle(1.2, 24).translate([-1.6, 0.8]) + \
        CrossSection.circle(1.0, 24).translate([1.4, -0.4])
    groove = CrossSection.square([w + 2, 0.9]).translate([-w / 2 - 1, h / 2 - 2.9]) ^ tri
    return (tri - crust - peps) + groove


def make_coin():
    """One Foza coin, printed flat as exported. Hole underneath, pin on top."""
    R = COIN_D / 2
    c = COIN_CHAMFER
    pts = [(0, 0), (R - c, 0), (R, c), (R, COIN_H - c), (R - c, COIN_H), (0, COIN_H)]
    coin = C.revolve_pts(pts, SEGMENTS)
    # edge: the word and a pizza slice, three times round
    word = C.text_section(EDGE_WORD, 10.0)
    cap = C.text_section("H", 10.0).bounds()
    word = word.scale([EDGE_CAP / (cap[3] - cap[1])] * 2)
    wb = word.bounds()
    word = word.translate([-(wb[0] + wb[2]) / 2, COIN_H / 2 - (wb[1] + wb[3]) / 2])
    emb = slice_emblem().translate([0, COIN_H / 2])
    cuts = []
    for k in range(6):
        sec = word if k % 2 == 0 else emb
        m = bend(sec.extrude(ENGRAVE + 1.0).translate([0, 0, -ENGRAVE]), R)
        cuts.append(m.rotate([0, 0, k * 60.0 + 30.0]))
    coin = coin - C.union(cuts)
    coin = coin - socket().translate([0, 0, -0.01])
    coin = coin + pin(COIN_TWIST).translate([COIN_OFFSET, 0, COIN_H - 0.01])
    return coin.simplify(0.002)                 # drop sliver edges left by the bent cuts


def blob_height():
    return OVERALL_HEIGHT - BASE_H - NUM_COINS * COIN_H


def make_blob():
    prof = C.blob_profile_mm(blob_height(), BLOB_CUT_ROW)
    blob = C.revolve_pts([(0.0, 0.0)] + [tuple(q) for q in prof] +
                         ([(0.0, prof[-1, 1])] if prof[-1, 0] > 1e-6 else []), SEGMENTS)
    r0 = prof[0, 0]
    cutter = C.revolve_pts([(r0 - 0.4, -1), (r0 + 5, -1), (r0 + 5, 5.4), (r0 - 0.4, 0)], SEGMENTS)
    blob = blob - cutter
    blob = blob - socket().translate([0, 0, -0.01])
    return blob, prof


# ---------------------------------------------------------------------------
# Build, check, export
# ---------------------------------------------------------------------------

def build():
    core = make_core()
    ring, rinfo = make_ring()
    coin = make_coin()
    blob, prof = make_blob()
    centres, turns, top = stack_layout()
    asm = {"core": core, "ring": ring.translate([0, 0, FLANGE_H])}
    for k, (c, th) in enumerate(zip(centres, turns)):
        asm[f"coin{k}"] = coin.rotate([0, 0, th]).translate([c[0], c[1], BASE_H + k * COIN_H])
    asm["blob"] = blob.translate([top[0], top[1], BASE_H + NUM_COINS * COIN_H])
    parts = {"core": C.to_bed(core), "ring": C.to_bed(ring).simplify(0.002),
             "coin": C.to_bed(coin).simplify(0.002), "blob": C.to_bed(blob)}
    return parts, asm, dict(ring=rinfo, profile=prof, centres=centres, top=top)


def run_checks(parts, asm, info):
    prof = info["profile"]
    worst = C.steepest_outward(prof)
    print(f"blob: height {prof[:, 1].max():.1f} mm, max width {2 * prof[:, 0].max():.1f} mm, "
          f"flat foot {2 * prof[0, 0]:.1f} mm, belly steepest {worst:.1f} deg from vertical")
    assert worst <= 45.0
    assert 2 * prof[0, 0] < COIN_D - 2 * COIN_OFFSET, "blob foot wider than the top coin"
    lay = info["ring"]["layout"]
    print(f"ring text lines {lay['text_lines']} + year, font {lay['size']:.2f} mm "
          f"(cap height {lay['cap']:.1f} mm), year {lay['year_size']:.2f} mm, "
          f"{info['ring']['bridges']} stencil bridges")
    for t in lay["lines"]:
        b = t.bounds()
        print(f"  line {b[2] - b[0]:.1f} mm long ({math.degrees((b[2] - b[0]) / BASE_R):.0f} deg of arc), "
              f"area lost by a 0.8 mm opening {C.text_quality(t) * 100:.2f}%")
    assert len(info["ring"]["material"].decompose()) == 1
    # centre of mass of the assembled trophy over the base, solid parts as a rough guide
    tot, mom = 0.0, np.zeros(2)
    for name, m in asm.items():
        v, f = C.mesh_arrays(m)
        tri = v[f]
        vol = np.einsum("ij,ij->i", tri[:, 0], np.cross(tri[:, 1], tri[:, 2])) / 6
        cen = tri.sum(axis=1) / 4
        tot += vol.sum()
        mom += (vol[:, None] * cen[:, :2]).sum(axis=0)
    com = mom / tot
    print(f"stack: blob centre {np.linalg.norm(info['top']):.1f} mm off the base centre, "
          f"centre of mass {np.linalg.norm(com):.1f} mm off centre (base radius {BASE_R:.0f} mm)")
    assert np.linalg.norm(com) < COIN_D / 4
    total = C.union(asm.values())
    bb = total.bounding_box()
    info["overall"] = (bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2])
    print(f"assembled: {info['overall'][0]:.1f} x {info['overall'][1]:.1f} mm, "
          f"overall height {info['overall'][2]:.1f} mm")
    return C.report_parts(parts, {"coin": NUM_COINS})


def grams_by_colour(results, scheme=None):
    scheme = scheme or SCHEME
    out = {}
    for r in results:
        if r["name"] == "coin":
            for k in range(r["count"]):
                col = C.COLOUR_NAMES[coin_colour(k, scheme)]
                out[col] = out.get(col, 0) + r["grams"]
        else:
            col = C.COLOUR_NAMES[scheme[r["name"]]]
            out[col] = out.get(col, 0) + r["grams"]
    return out


# ---------------------------------------------------------------------------
# Renders
# ---------------------------------------------------------------------------

def colour_of(name, scheme):
    if name.startswith("coin"):
        return coin_colour(int(name[4:]), scheme)
    return scheme[name]


def render_all(parts, asm, out_dir, scheme=None):
    scheme = scheme or SCHEME
    os.makedirs(out_dir, exist_ok=True)
    items = [C.prep(m, colour_of(n, scheme)) for n, m in asm.items()]
    C.render(items, os.path.join(out_dir, "front.png"), az=0, el=6,
             title=f"Foza-tårnet, front. {SCHEME_LABELS[PALETTE]}, dark blue blob and base")
    C.render(items, os.path.join(out_dir, "angle.png"), az=35, el=24, title="Foza-tårnet, front left")
    rake = [((-0.6, -0.5, 0.6), 1.0), ((0.4, -0.8, 0.2), 0.25)]
    v = C.mesh_arrays(asm["ring"])[0]
    front = v[(v[:, 1] < -BASE_R * math.cos(math.radians(TEXT_ARC_DEG / 2)))]
    C.render([C.prep(asm["core"], scheme["core"]), C.prep(asm["ring"], scheme["ring"])],
             os.path.join(out_dir, "plaque_closeup.png"), az=0, el=10, size=(1400, 420),
             crop=(front, 4.0), lights=rake)
    v = C.mesh_arrays(asm["coin1"])[0]
    C.render([C.prep(asm[n], colour_of(n, scheme)) for n in ("coin0", "coin1", "coin2")],
             os.path.join(out_dir, "coin_closeup.png"), az=20, el=12, size=(1000, 560),
             crop=(v, 6.0), lights=rake)
    labels = {"core": "Base core, upright", "ring": "Rim ring, upright",
              "coin": f"Coin (print {NUM_COINS}), flat, pin up", "blob": "Blob, upright"}
    cols = {"core": scheme["core"], "ring": scheme["ring"], "coin": scheme["coin_even"],
            "blob": scheme["blob"]}
    for n, m in parts.items():
        C.render([C.prep(m, cols[n]), C.prep(C.bed_under(m), C.BED_GREY, 0.0)],
                 os.path.join(out_dir, f"print_{n}.png"), az=30, el=32, size=(700, 700),
                 title=labels[n])


def render_compare(asm, results, out_dir):
    """compare.png: every colour scheme side by side with filament per colour."""
    import tempfile
    tmp = tempfile.mkdtemp()
    panels = []
    for name, sc in SCHEMES.items():
        png = os.path.join(tmp, f"{name}.png")
        C.render([C.prep(m, colour_of(n, sc)) for n, m in asm.items()], png, az=35, el=20,
                 size=(700, 800))
        grams = grams_by_colour(results, sc)
        cap = [SCHEME_LABELS[name] + (" (default)" if name == PALETTE else "")]
        cap += [f"{col}: {g:.0f} g" for col, g in sorted(grams.items(), key=lambda x: -x[1])]
        panels.append((png, cap))
    C.compare_sheet(panels, os.path.join(out_dir, "compare.png"), "Foza-tårnet colour schemes")


def main(argv=None):
    global YEAR, TEXT, OVERALL_HEIGHT, TOLERANCE, PART, PALETTE, SCHEME
    ap = argparse.ArgumentParser(description="Foza-tårnet trophy generator")
    ap.add_argument("--year", type=int, default=YEAR)
    ap.add_argument("--text", default=TEXT)
    ap.add_argument("--height", type=float, default=OVERALL_HEIGHT)
    ap.add_argument("--tolerance", type=float, default=TOLERANCE)
    ap.add_argument("--part", default=PART, choices=["all"] + PARTS)
    ap.add_argument("--out", default=os.path.join(HERE, "stl", "foza_taarnet"))
    ap.add_argument("--render", action="store_true", help="also write PNG previews")
    ap.add_argument("--palette", default=PALETTE, choices=list(SCHEMES))
    a = ap.parse_args(argv)
    YEAR, TEXT, OVERALL_HEIGHT, TOLERANCE, PART = a.year, a.text, a.height, a.tolerance, a.part
    PALETTE, SCHEME = a.palette, SCHEMES[a.palette]
    if not 150 <= OVERALL_HEIGHT <= 200:
        raise SystemExit("OVERALL_HEIGHT must be between 150 and 200 mm")
    parts, asm, info = build()
    results = run_checks(parts, asm, info)
    for col, g in grams_by_colour(results).items():
        print(f"filament {col}: about {g:.0f} g")
    C.export_parts(parts, a.out, "foza_taarnet", PART)
    if a.render:
        out = os.path.join(HERE, "renders", "foza_taarnet")
        render_all(parts, asm, out)
        render_compare(asm, results, out)
    return parts, asm, info


if __name__ == "__main__":
    main()
