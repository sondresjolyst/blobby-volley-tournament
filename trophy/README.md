# Pizzakongen trophy

A first concept model of the tournament trophy. An upright Blobby blob wears a classic crown with seven points and a ball on each tip. It stands on a round pizza that sits on a closed pizza box. The front of the box holds a plaque with "Svettaste Blåbby" and the year.

The blob is spun from the real outline of `data/gfx/blobbym1.bmp` in the game. Like the game art, it has no face.

![Assembled, front left](renders/assembled_angle.png)

Overall height: 170.0 mm. Footprint: 142 x 144 mm.

## Colours

The filaments on hand are black, white, dark blue and dark green. Pizzakongen uses three of them:

- The blob is dark blue. The game draws the left blob in pure blue (RGB 0, 0, 255 in `data/config.xml`). Dark blue is the only blue filament on hand, so it is the closest match.
- The box with the pizza, the crown and the pin are black.
- The plaque is black with raised white letters and frame. White is the only light colour on hand, so it is the one that reads on black.

Every part is one colour, except the plaque. The plaque gets its second colour from one filament switch. No part has more than one switch.

## Parts

Print one of each part. The weights assume PLA with 4 walls and 15 percent infill. They are rough figures from the model volume.

| Part | File | Colour | Print orientation | Approx. filament |
|---|---|---|---|---|
| Base (box and pizza) | `stl/pizzakongen_base.stl` | Black | Upright, box bottom on the bed | 276 g |
| Blob | `stl/pizzakongen_blob.stl` | Dark blue | Upright, flat foot on the bed | 131 g |
| Crown | `stl/pizzakongen_crown.stl` | Black | Upright, band on the bed | 34 g |
| Plaque | `stl/pizzakongen_plaque.stl` | Black, letters white (one switch) | Flat, front facing up | 13 g black, 1 g white |
| Pin | `stl/pizzakongen_pin.stl` | Black | Lying on its flat side | 1 g |

The STL files are already in print orientation.

Filament per colour, about 456 g in total:

| Colour | Parts | Approx. filament |
|---|---|---|
| Black | Base, crown, plaque plate, pin | 324 g |
| Dark blue | Blob | 131 g |
| White | Plaque letters and frame | 1 g |

![Front](renders/assembled_front.png)

### Crown

The crown is one part. Its band is the same as before. The inside follows the shape of the head with the fit tolerance, so it seats by itself. On top of the band stands a 2.4 mm wall that rises into seven points. One point faces the front. Each tip carries a 6.4 mm ball. The points lean 10 degrees outward and reach 30 mm above the band, balls included.

![Crown](renders/crown_closeup.png)

![Crown on the bed](renders/print_crown.png)

`NUM_POINTS`, `POINT_WALL`, `POINT_FLARE`, `BALL_R` and `CROWN_H` at the top of the script set the shape. Keep the number of points odd, so the front view shows a single ball at the front instead of two balls in a line.

### Print notes

The printer has no AMS, so the plaque gets its second colour from one filament switch. Layers are 0.2 mm, the first layer included. Layer N is printed from Z = (N - 1) x 0.2 mm to N x 0.2 mm, so pause before layer N starts. Bambu Studio shows each layer by its top height, so layer 16 shows as 3.20 mm in the layer slider.

- Plaque: start in black. Pause at layer 16 (Z 3.0 mm), change to white. The plate is 3.0 mm, the letters and frame stand 1.2 mm above it.

In Bambu Studio, open the layer slider in the preview, go to the layer at 3.20 mm, right click the plus sign and pick "Add pause". The printer stops there. Change the filament by hand and resume. The script prints the pause layer for every run, so check it after you change `PLAQUE_T` or `TEXT_RELIEF`.

![Plaque on the bed](renders/print_plaque.png)

### Plaque text

The plaque has the text and the frame raised 1.2 mm on a black plate. After the pause they print in white, so the text reads as white on black. The letters sit on the plate, so they need no bridges, and the ring of the å is held by the plate as well.

![Plaque, raised two colour text](renders/plaque_closeup.png)

Run with `--stencil`, or set `STENCIL = True`, to get the one colour stencil plaque instead. The text is cut all the way through the plaque and the floor of the pocket shows through the letters. Closed letters such as e, a, å, B, b, 0 and 6 then need 1.2 mm bridges, which the script adds by itself. It stops if the plaque is not one piece. With the black box behind it, a stencil plaque does not read, so use the raised text.

The pizza on the box has 1.2 mm pepperoni and olives. The cheese cuts and crust notches are 1 mm deep. They are all black, like the rest of the base. The plaque text is DejaVu Sans Bold, about 7 mm cap height. The plaque is 122 x 28 mm and its pocket is 0.3 mm larger each way with the default tolerance.

No part needs supports. The steepest surfaces are 45 degrees, on purpose. These are the bottom chamfers against elephant's foot, the underside of the box lid, the roof of the plaque pocket, the undersides of the crown band rings and the pointed roof of the pin socket in the blob. The blob belly is at most 37 degrees from vertical. The inside of the crown band follows the head at up to 44 degrees. The crown points lean out 10 degrees. The ball on each tip has a cone under it at 42 degrees, so its underside prints without support.

## Assembly

1. Test fit the pin in the socket on the top of the base and in the socket under the blob. The flat side of the pin matches the flat side of each socket. If it is too tight, sand the pin or reprint with a larger tolerance.
2. Glue the pin into the base, then glue the blob onto the pin. Use CA glue for PLA and two-part epoxy for PETG.
3. Lower the crown over the head with a point at the front. The inside of the band follows the shape of the head, so it seats by itself. Glue it.
4. Glue the plaque into the pocket on the front of the box, with the year at the bottom.

## Change the year or the text

Install the packages once, then run the script:

```
pip install -r requirements.txt
python pizzakongen.py --year 2027
python render_previews.py
```

The first command writes all STL files to `stl/` and prints the checks. Only the plaque changes with the year, so you can export just that part with `--part plaque`. You can also edit `YEAR` and `TEXT` at the top of `pizzakongen.py`. The text size adjusts to fit the plaque. The script stops with an error if the font has no glyph for a letter.

Other options:

- `--text "..."` changes the first line.
- `--height 150` to `--height 200` sets the overall height. The blob scales to match.
- `--tolerance 0.3` is the total clearance for every fit. Use 0.3 for PLA and 0.4 for PETG.
- `--stencil` makes the one colour stencil plaque instead of raised text.
- `--part blob` exports a single part. The choices are `all`, `blob`, `crown`, `base`, `plaque` and `pin`.

## Checks

Each run checks every part. It must be one closed, valid mesh with a flat bottom at z = 0, and it must fit the 256 x 256 x 256 mm bed of the Bambu Lab P1S. Faces steeper than 45 degrees are also checked. The script stops if the blob belly or the band seat break those limits, or if the crown wall does not stand on the band top.

## Files

- `pizzakongen.py` builds the parts with manifold3d, runs the checks and writes the STL files.
- `render_previews.py` writes the PNG previews to `renders/`.
- `requirements.txt` lists the Python packages.

# Alternative concepts

Two other trophies that look clearly different from Pizzakongen. They use the same plaque text options, the same 0.3 mm tolerance and the same checks. Shared code is in `alt_common.py`, copied from `pizzakongen.py` and `render_previews.py`. Each script writes its STL files to `stl/<name>/` and, with `--render`, its previews to `renders/<name>/`.

```
python pokalen.py --render
python foza_taarnet.py --render
```

Both scripts take `--year`, `--text`, `--height`, `--tolerance` and `--part`, like `pizzakongen.py`. `--palette` picks a colour scheme for the renders and the filament totals.

Dark blue, dark green and black are all very dark, so they look muddy next to each other. Contrast comes from white against one dark colour, and the stencil letters show the dark colour behind them. Each concept has a `compare.png` with every scheme side by side and its filament per colour.

## Pokalen

The winner's cup from the game, made real. The cup is spun from the outline of `data/gfx/pokal.bmp`, the trophy on the game's winner screen. The lid carries seven pepperoni discs. The medallion on top is a small pizza with a notched crust rim and three blobs on a podium, like the medallion in the game. The plinth holds a white nameplate with raised black letters, the text on two lines and the year on a third.

![Pokalen, front left](renders/pokalen/angle.png)

Overall height: 195 mm. Plinth: 78 x 78 mm. Cup: 56 mm across at the lid.

Each part takes the colour of what it would be on a real trophy. The plinth is black, like wood or marble. The foot and stem, bowl, lid and plaque are white, as one metal. The medallion is a dark blue enamel badge with its crust, podium and blobs in white, which also ties in with Blåbby.

| Part | File | Colour | Print orientation | Approx. filament |
|---|---|---|---|---|
| Plinth | `stl/pokalen/pokalen_plinth.stl` | Black | Upright | 97 g |
| Plaque | `stl/pokalen/pokalen_plaque.stl` | White plate, black letters (one filament change) | Flat, front facing up | 6 g |
| Foot and stem | `stl/pokalen/pokalen_foot.stl` | White | Upright | 12 g |
| Bowl | `stl/pokalen/pokalen_bowl.stl` | White | Upside down, lid face on the bed | 35 g |
| Lid | `stl/pokalen/pokalen_lid.stl` | White | Upright | 15 g |
| Medallion | `stl/pokalen/pokalen_medallion.stl` | Dark blue disc, white relief (one filament change) | Flat, front facing up | 5 g |
| Pin, print 3 | `stl/pokalen/pokalen_pin.stl` | Black, or any colour | Lying on its flat side | 1 g each |

Filament per colour, about 170 g in total: black 100 g, white 66 g, dark blue 4 g.

Print guide for the two parts that change filament. Layers are 0.2 mm, the first layer included. Layer N is printed from Z = (N - 1) x 0.2 mm to N x 0.2 mm, so pause before layer N starts. Bambu Studio shows each layer by its top height, so layer 9 shows as 1.80 mm in the layer slider.

- Plaque: start in white. Pause at layer 9 (Z 1.6 mm), change to black. The plate is 1.6 mm, the letters and frame stand 1.0 mm above it.
- Medallion: start in dark blue. Pause at layer 23 (Z 4.4 mm), change to white. The disc and tab are 4.4 mm, the crust and podium stand 1.2 mm and the blobs 1.6 mm above it.

The script prints the same guide for the chosen scheme. The renders `renders/pokalen/print_plaque.png` and `renders/pokalen/print_medallion.png` show both colours on the bed.

Other schemes, all in `renders/pokalen/compare.png`:

- `navy_white`: dark blue plinth and bowl, the rest white, dark blue letters. Dark blue 134 g, white 36 g.
- `navy_white_bowl`: dark blue plinth, the whole cup white, dark blue letters. Dark blue 100 g, white 71 g.
- `black_white`: like the default, but with an all white medallion and no change on it. Black 100 g, white 71 g.
- `old_blue_green`: the first try with black, dark blue and dark green. Kept for reference.

The pepperoni on the lid are part of the white lid. A blue pepperoni variant would need seven small separate discs glued onto a curved surface, so there is none.

![Pokalen colour schemes](renders/pokalen/compare.png)

![Plaque](renders/pokalen/plaque_closeup.png)

![Medallion](renders/pokalen/medallion_closeup.png)

Print notes:

- No part needs supports. Every outline only narrows going up in its print orientation, or grows at 45 degrees at most. The script checks this.
- The sprite's stem is about 5 mm thick at this size, which is too weak. The model widens it to 15 mm and adds a clear ring under the bowl.
- The parts stack on 7 mm D-shaped pins: plinth to foot, foot to bowl and bowl to lid. Sockets that open onto the bed have a pointed 45 degree roof.
- The medallion has a tab that pushes into a slot in the top of the lid. Glue it.
- The plaque plate is 1.6 mm thick and sits flush in a 1.6 mm pocket, so only the black letters and frame stand out. There are no stencil bridges any more. `--stencil` brings back the stencil plaque with the letters cut through, printed in one colour, with the black pocket floor showing through.
- The trophy is light, about 175 g. If it feels tippy, print the plinth with more infill or glue a steel washer under it.

Assembly: glue a pin into the plinth, the foot onto it, a pin into the top of the foot, the bowl onto it, a pin into the bowl, then the lid and the medallion. Glue the plaque into the pocket with the glue on the frame only.

## Foza-tårnet

A blob on a wobbly stack of Foza coins, the betting points from the tournament site. Every coin is the same part, printed five times. The pin on top of each coin sits 6 mm off centre and is turned 140 degrees against the hole underneath. So each coin can only go on one way, and the stack steps round in a fixed spiral that stays centred over the base. The edge of each coin reads "FOZA" three times, with an engraved pizza slice between the words.

The base is a big coin. Its rim is a separate white ring with "Svettaste Blåbby" and the year cut through it. The dark blue core shows through the letters, so the text reads like the stencil plaque. Twelve pizza slices are engraved round the top of the core.

![Foza-tårnet, front left](renders/foza_taarnet/angle.png)

Overall height: 175 mm. Base: 140 mm across. Coins: 70 mm across and 12 mm thick. Blob: 85 mm tall.

| Part | File | Colour | Print orientation | Approx. filament |
|---|---|---|---|---|
| Base core | `stl/foza_taarnet/foza_taarnet_core.stl` | Dark blue | Upright | 153 g |
| Rim ring | `stl/foza_taarnet/foza_taarnet_ring.stl` | White | Upright | 46 g |
| Coin, print 5 | `stl/foza_taarnet/foza_taarnet_coin.stl` | White | Flat, pin up | 27 g each |
| Blob | `stl/foza_taarnet/foza_taarnet_blob.stl` | Dark blue | Upright | 75 g |

Filament per colour, about 405 g in total: dark blue 227 g, white 180 g.

The trophy reads as three bands: a dark blue blob, a white stack of coins and a dark blue base with a white rim. All coins are the same colour, so there is no stacking order to get wrong.

Other schemes, all in `renders/foza_taarnet/compare.png`:

- `navy_white`: coins alternate white and dark blue from the bottom, like a stack of chips. The top coin is white. Dark blue 281 g, white 126 g. It looks busier.
- `old_black_green`: the first try with black, dark green and dark blue. Kept for reference.

![Foza-tårnet colour schemes](renders/foza_taarnet/compare.png)

![Rim text](renders/foza_taarnet/plaque_closeup.png)

![Coins](renders/foza_taarnet/coin_closeup.png)

Print notes:

- The letters in the rim ring are cut through a vertical wall, so the top edge of each letter prints as a bridge. The flat part of any letter top is at most 3 mm wide. Curved tops such as S, a and 0 close in a little each layer. The P1S handles this without supports, but the tops of the letters can droop slightly. Closed letters have 1.2 mm stencil bridges, as on the Pizzakongen plaque.
- The coin edge lettering is engraved 1 mm deep. Its top edges are 1 mm overhangs and print fine.
- No part here changes filament. A raised mark on the coin tops would stop the coins from sitting flat on each other, and only the top coin shows any of its face. The rim text is on a vertical wall, so it stays a stencil.
- The pins are part of the coins and the core, 8 mm across and 4.6 mm tall. The holes under the coins and the blob have a pointed 45 degree roof.
- The ring slides over the core with 0.15 mm clearance on each side and sits on the core's flange. It stands 1.2 mm above the core like a coin rim.
- The centre of mass is within 1 mm of the base centre. The script checks it.

Assembly: glue the ring onto the core with the text at the front. Then glue the coins one by one. Each pin only fits its hole one way. Glue the blob on the top pin last.

## Files for the alternatives

- `alt_common.py` holds the shared helpers and the renderer.
- `pokalen.py` builds Pokalen.
- `foza_taarnet.py` builds Foza-tårnet.
