# Cabinet fabrication export

The installable extension, Ruby source and tracked `.rbz` live in [noahpeters/from-trees-sketchup](https://github.com/noahpeters/from-trees-sketchup). H2 only resolves saved cabinet designs into construction data.

FTOPS system administrators open a saved design preview and download the extension installer once. Install it through SketchUp's Extension Manager, then open **Extensions → From Trees → Cabinet Designer**. Sign into the hosted FTOPS page, open a saved design, review construction settings and import directly into SketchUp. Save normally as `.skp`. Each physical stock part is a machined solid component nested in a cabinet assembly; the import is undoable.

Part axes are red = grain/length, green = width, blue = thickness. Instances have unit scale; dimensions include insertion into receiving joints. The same resolved parts drive the construction manifest and CSV. Extension 0.2.0 or newer reads the shaped-stock protocol. The importer validates solids before committing and configures OpenCutList material types when installed. Supplier stock sizes, allowances and cutting strategy remain configurable.

## Construction defaults

These defaults follow the cabinet-bottom-up-pricing skill with Noah's explicit updates: 3/4-inch carcasses; dados/rabbets, never butt joints; 5/8-inch maple drawer boxes using rabbets for this first pass, with dovetails deferred.

- Standard shells: two 3-inch top stretchers, two 3-inch back nailers, no full top; 1/4-inch back inside nailers and in side grooves. Separate clip-on toe-kick faces use the room's support-space dimensions (default 4-inch height, 3-inch setback).
- Carcass insertion defaults to 3/8 inch. Cut dimensions include insertion into receiving joints.
- Drawer bottom: 3/8-inch maple-veneer plywood, grooves 1/4 inch deep, bottom set 1/2 inch above box bottom. Side height is at most 6 inches, reduced to fit short fronts. Width deducts 1.25 inches from the clear opening; depth deducts 3 inches from cabinet depth.
- Shaker fronts: separate solid rails/stiles, 2.25-inch widths, 1/4-inch grooves/stub tenons and 1/4-inch panels. Rail widths scale down for small fronts.
- Explicit custom rectangular board thicknesses and full tops are retained. Touching horizontal/back panels insert into vertical receivers. Custom arrays expand into individual drawer fronts and boxes.

All numeric settings are editable per export. These are first-pass stock and joinery dimensions, not CNC toolpaths: exact joinery fit, Movento drilling/notches, dovetails, edge treatments and finishing are deferred. Hardware including Hafele Axilo feet, clips, hinges and slides is excluded. Countertops, appliances, fixtures and room surfaces are excluded. Every supported Cabinet Designer construction is exported. Curved and profiled stock uses the same shaping functions as the designer, sampled into closed surfaces after joinery. Corner cabinets retain their two-arm layout; angled shelves retain their orientation and receive machined side housings. Floating shelves include separate grooved cleats. Inset/partial-overlay cabinets include joined face-frame stock. Appliance cabinets include their supporting shelves and fronts. Slat fronts are stock blanks without decorative routing.

## Access and maintenance

`GET /admin/export?slug=<32 hex characters>&revision=<integer>` uses the existing dedicated reporting token, which must differ from the write token. FTOPS enforces authenticated system-admin identity and forwards only fixed construction fields through its private service binding. The response contains no edit credential and does not mutate the source design.

The H2 endpoint returns only JSON construction data and CSV, never Ruby code. Extension packaging and runtime validation are maintained in its separate repository. H2 tests verify stock dimensions, joint intersections, drawer arrays, storage variants, transforms, profile validation, and service authorization/revision behavior.

Native validation in SketchUp 2026: a two-cabinet sample containing Shaker drawer fronts, rabbeted boxes and a tall cabinet produced 50 manifold parts; OpenCutList recognized all 50 with no ignored parts or errors. The actual H2 Worker was also checked in Cloudflare workerd with local D1, alongside FTOPS's committed service-binding runtime regression. No production deployment is implied by these checks.
