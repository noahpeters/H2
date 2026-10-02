# Cabinet fabrication export

FTOPS system administrators open a saved design in **Configuration → Cabinet Designer**, then choose **Generate SketchUp export** in its preview. The first pass downloads a self-contained Ruby script, a stock-parts CSV and a construction manifest for that exact saved revision. A changed revision returns 409 and requires reopening the design.

Open a new model in SketchUp Desktop 2022 or newer. Open **Extensions → Developer → Ruby Console** and load the downloaded file, for example:

```ruby
load '/Users/you/Downloads/From-Trees-aaaaaaaa-r4.rb'
```

The importer creates a root group, a component assembly for each cabinet and solid component instances for each physical stock part. It checks manifold solids and stock bounds before committing. A failed import rolls back; a successful import can be undone and offers a native `.skp` save dialog. Existing content is preserved, so start a new model if the saved file should contain only the exported design.

Part axes are red = grain/length, green = width, blue = thickness. Instances have unit scale; pocket geometry represents actual removed stock. Identical parts reuse definitions. When OpenCutList is installed, previously untyped generated materials receive sheet-good, solid-wood or hardware types and grain settings through its API. Supplier stock sizes, allowances and cutting strategy still need configuration. The same resolved parts drive CSV and SketchUp.

## Construction defaults

These defaults follow the cabinet-bottom-up-pricing skill with Noah's explicit updates: 3/4-inch carcasses; dados/rabbets, never butt joints; 5/8-inch maple drawer boxes using rabbets for this first pass, with dovetails deferred.

- Standard shells: two 3-inch top stretchers, two 3-inch back nailers, no full top; 1/4-inch back inside nailers and in side grooves. Separate clip-on toe-kick faces use the room's support-space dimensions (default 4-inch height, 3-inch setback).
- Carcass insertion defaults to 3/8 inch. Cut dimensions include insertion into receiving joints.
- Drawer bottom: 3/8-inch maple-veneer plywood, grooves 1/4 inch deep, bottom set 1/2 inch above box bottom. Side height is at most 6 inches, reduced to fit short fronts. Width deducts 1.25 inches from the clear opening; depth deducts 3 inches from cabinet depth.
- Shaker fronts: separate solid rails/stiles, 2.25-inch widths, 1/4-inch grooves/stub tenons and 1/4-inch panels. Small fronts that cannot fit those rails require a different front style or profile.
- Explicit custom rectangular board thicknesses and full tops are retained. Touching horizontal/back panels insert into vertical receivers. Custom arrays expand into individual drawer fronts and boxes.

All numeric settings are editable per export. These are first-pass stock and joinery dimensions, not CNC toolpaths: exact joinery fit, Movento drilling/notches, dovetails, edge treatments and finishing are deferred. Hardware including Hafele Axilo feet, clips, hinges and slides is excluded. Countertops, appliances, fixtures and room surfaces are excluded. Curved/profiled/tambour parts, legacy face-frame overlays, angled/floating shelves, corners and catalog appliance openings without explicit fabrication definitions fail the whole export with review issues rather than supplying approximate cut dimensions. Slat fronts are stock blanks without decorative routing.

## Access and maintenance

`GET /admin/export?slug=<32 hex characters>&revision=<integer>` uses the existing dedicated reporting token, which must differ from the write token. FTOPS enforces authenticated system-admin identity and forwards only fixed construction fields through its private service binding. The response contains no edit credential and does not mutate the source design.

Edit `from_trees_importer.rb`, then run `node scripts/package-sketchup-importer.mjs` and format the generated `importerSource.ts`. A regression test checks the embedded source is identical. Tests verify stock dimensions, joint intersections, drawer arrays, storage variants, transforms, profile validation, and service authorization/revision behavior.

Native validation in SketchUp 2026: a two-cabinet sample containing Shaker drawer fronts, rabbeted boxes and a tall cabinet produced 50 manifold parts; OpenCutList recognized all 50 with no ignored parts or errors. The actual H2 Worker was also checked in Cloudflare workerd with local D1, alongside FTOPS's committed service-binding runtime regression. No production deployment is implied by these checks.
