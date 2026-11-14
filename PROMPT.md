# PROMPT

## How this was built

- Models: planned with Claude Opus 5.5, built with Claude Fable 5.2, both in Claude Code (desktop app),
  on 2026-11-14 in one session.
- Input: a link to an X post by @TokenGremlin (2026-11-14) showing an ~8 second real-time clip of a
  container port (teal quay cranes, a loaded container ship, a tug, reflective water, buoys, a
  breakwater) and a still of a weathered electrical substation, captioned as made entirely by one
  model: "The ships, the cranes, the textures, everything. Every asset."
- No image, video or 3D generation tools were used. Everything is code: three.js r169, canvas-painted
  textures, hand-written GLSL for the water and sky.
- All names are invented and none are taken from the reference clip.

## The original prompts (the user's words)

> let's create a reliatic sea port like the one post: https://x.com/TokenGremlin/status/2121556020208025822

Then, after the plan was written:

> btw i want to use fable 5 for this build, so let me know when your'e done with the planning, and
> approach and i'd switch to fable 5.2 fpr the build

## A prompt that recreates this project

Build a realistic container sea port as a static, no-build-step three.js (r169) page. Generate every
asset in code: no downloaded models and no image files. Paint all textures on 2D canvases at load.
Work in metres at real-world scale, y up, water at y = 0, quay edge along the x axis at z = 0 with its
top at y = 3.5, land toward -z and open sea toward +z. Invent every name.

**Ship.** A 262 m by 40 m container ship moored alongside, stern at -x. Loft the hull from about 110
stations (flat bottom, bilge arc, vertical side), with the bow tapering from 76% of the length using a
height-dependent exponent so it flares at deck level, plus bow rake and a rising forecastle. Paint each
hull side on a 4096 x 512 canvas: dark slate topsides, red antifouling, black boot-top, plate seams,
rust weeping from the scuppers, draft marks, the line name large amidships and the ship name at the
bow; mirror the layout for the far side and letter the transom with name and home port. Add a nine-deck
white accommodation block with window bands, a bridge with wings, mast with rotating radar scanners,
funnel in line colours, free-fall lifeboat, windlasses, anchors, deck rails, hatch covers, lashing
bridges, a gangway and eight sagging mooring lines.

**Containers.** One 40 ft box geometry (12.19 x 2.59 x 2.44 m) with a texture atlas: corrugated side
on the left 75%, door end with locking bars on the right. Keep the texture greyscale with grime, rust
streaks and scrapes, and tint each instance, varying hue, fade and lightness so every box is a
different age. Put line logos in a separate mask texture and mix them in after the colour step in the
shader, white on dark boxes and navy on light ones. Stack 4 to 8 tiers on the ship in bays with stepped
outer rows, colour-grouped by line, and fill yard blocks six rows wide up to five high. About 7,500
instances in total.

**Cranes.** Four ship-to-shore gantries on rails 30.5 m apart: bogies with hazard-striped wheel boxes,
box legs, portal beams, diagonals, an A-frame to 79 m, twin box-girder boom reaching 62 m over the
water, backreach with a white machinery house and name board, tie-rod stays, a service walkway with
handrails, a lift shaft and stair landings. Park one with the boom raised 78 degrees. Animate two on a
38 second loop: lower the spreader onto a ship stack, hoist, run the trolley inshore with a little
pendulum sway, land the box on a terminal truck that then drives off while an empty one arrives. Add
red rubber-tyred gantries over the yard and tractor-trailers running the back lanes.

**Port.** Concrete apron with slab joints, cracks, oil stains and tyre marks; a sea wall with a wet,
weeded waterline band; a cope beam; a yellow diagonal hazard band; crane rails; lane markings; cone
fenders with face pads; yellow bollards; ladders and life-ring posts; high-mast lights; gabled sheds
with roller doors; a terminal office with a control room; flagpoles with waving flags. At ground level
build a weathered concrete-block 11 kV substation: red door, two teal feeder cabinets with conduits, a
red warning sign, downpipe, louvre, yellow-railed steps, and a chain-link compound with a transformer.
Further out: a west shore with a tank farm, hazy inland industry, a ridge of hills, a rubble
breakwater with rock armour and a red-and-white flashing lighthouse, and four islands on the horizon.

**Boats.** A 31 m harbour tug on the same hull lofter with a rounded stern: tyre fenders, rub rail,
deckhouse with portholes, glazed wheelhouse, mast with rotating radar, twin orange stacks, yellow
towing winch, bitts and a house flag. An orange pilot boat running faster further out. Red and green
lateral buoys that bob, tilt and flash. Two distant ships at anchor. A dozen gulls that glide and flap
in bursts.

**Water.** One large plane with a custom shader. Sum about 18 travelling waves from 38 m down to
ripples, each bent by low-frequency noise so crests never line up, modulated by slow gust patches, and
faded out as they approach pixel size. Render a planar mirror of the scene each frame (reflected
camera with an oblique near plane) at half resolution and sample it with the surface normal pushing
the lookup around. Schlick fresnel, a deep teal body colour with sunlit scatter, a tight sun glint
plus a broad lobe broken into pixel-scale sparkles, V-shaped wakes with foam behind each boat, and
distance fog matched to the horizon.

**Sky and light.** A dome shader: zenith-to-horizon gradient, forward scattering and a sun disc,
domain-warped fbm clouds lit from the sun side with darker cores and a silver lining, thin cirrus and
a haze band. Drive sun colour, sky colours and intensity from one sun-elevation value so a slider can
go from golden hour to midday. Bake the sky into a PMREM environment for image-based light, add one
shadow-casting sun whose 4096 shadow frustum follows the view and snaps to shadow texels, and share
the horizon colour with the fog and the water.

**Rendering.** ACES tone mapping, soft shadows, an HDR composer target with 4x MSAA, a touch of bloom.
Merge static geometry per material and instance everything repeated so the frame stays above 60 fps.

**Camera and interface.** Seven shots that play in a loop with a short dip between them: harbour
approach beside the tug, eye level on the quay, high on a crane looking down at the spreader, an
aerial over the terminal looking out to sea, open water toward the sun, the substation, and a long
lens under the booms. Add a free orbit camera, number keys for shots, a key to hide the interface, and
a minimal HUD: port name, a clock tied to the sun, shot chips and the sun slider.

**Tools.** A script that captures a 1080p still of each shot, and a recorder that renders an edit list
frame by frame at exact scene times and pipes the frames to ffmpeg for a silent 60 fps clip.
