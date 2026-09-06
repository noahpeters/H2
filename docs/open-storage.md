# Open storage

Add to room → **Add open storage** provides adjustable shelving, single-hang wardrobe, double-hang wardrobe, drawer tower, shelf-and-hang combination, shoe storage and overhead storage.

These are saved as existing tall or wall-cabinet elements with a validated `storage` configuration; legacy cabinets are unchanged. Width, depth, height, material/color, optional doors and finished back are editable. Interior controls include shelf count/spacing, drawer count, rod heights, combination divider percentage and angled shoe shelves with lips. Zero shelf spacing means even spacing. Short cabinets reduce interior counts/spacing to fit; the inspector displays the actual fitted counts. Overhead units expose the existing mounting-height control. Changing type resets its interior defaults and height/mounting height, retaining material and width/depth.

3D and pricing share a physical layout helper. Open units show visible carcasses and interiors without door fronts; optional doors use the existing slab/shaker/inset styles and width-based one/two-door rule. Drawer fronts retain the selected face style. Floor units have a four-inch toe zone; overhead units do not. Existing wall/floor placement, rotation, island grouping, Undo, autosave and sharing continue to apply. Plan labels identify each configuration.

Pricing includes visible-material shelves, divider, full top, optional finished back, drawer boxes/slides and optional doors/hinges. Conservative finished-end and box-assembly assumptions remain; no installation, delivery or tax. The skill calculator's `open-storage-reference.json` fixture validates an open shelving takeoff. Hanging rods/fittings use the existing miscellaneous allowance by default; migration 0006 adds the admin-editable `hanging_rod_lf` rate (zero = allowance, positive = separate per-foot charge). No vendor rate was invented. Shelf-support and specialist interior labor details still require shop review.

The existing main-merge workflow applies migration 0006 and deploys the Worker. Verify both storefront and API deployments complete before testing production estimates. No new admin screen or local production deployment is included.
