-- Dollar amounts are internal costs, not customer selling prices.
CREATE TABLE cabinet_pricing_rates (
  key TEXT PRIMARY KEY,
  value REAL CHECK (value IS NULL OR value >= 0),
  unit TEXT NOT NULL,
  description TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER cabinet_pricing_rates_updated AFTER UPDATE OF value ON cabinet_pricing_rates
BEGIN UPDATE cabinet_pricing_rates SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key=NEW.key; END;
INSERT INTO cabinet_pricing_rates (key,value,unit,description) VALUES
('box_sheet',150,'USD/sheet','3/4-inch prefinished maple/Baltic-birch, 4x8'),
('face_rift-white-oak',250,'USD/sheet','3/4-inch rift-white-oak veneer, 4x8'),
('face_walnut',250,'USD/sheet','User-approved: same as rift oak, 4x8 equivalent'),
('face_maple',200,'USD/sheet','User-approved: 20% below rift oak, 4x8 equivalent'),
('face_cherry',200,'USD/sheet','User-approved: 20% below rift oak, 4x8 equivalent'),
('face_paint-grade',187.5,'USD/sheet','User-approved: 25% below rift oak, 4x8 equivalent'),
('back_sheet',60,'USD/sheet','1/4-inch back plywood, 4x8'),
('drawer_bottom_sheet',85,'USD/sheet','3/8-inch maple drawer bottoms, 4x8'),
('drawer_stock',10,'USD/lf','5/8-inch maple dovetail drawer stock'),
('slide_pair',50,'USD/pair','Blum Movento slide pair'),
('hinge_pair',20,'USD/pair','Blum soft-close hinge pair'),
('axilo_foot',0,'USD/foot','Covered by project miscellaneous until separately configured'),
('misc',500,'USD/project','Project miscellaneous materials'),
('box_hours',2,'hours/box','Box cutting and assembly'),
('drawer_hours',1,'hours/drawer','Drawer-box cutting and assembly'),
('finish_hours',1,'hours/unit','Finishing labor'),
('weekly_cost',5500,'USD/week','Weekly wages and overhead'),
('weekly_hours',80,'hours/week','Productive shop hours'),
('labor_rate',NULL,'USD/hour','Optional direct burdened rate; null derives weekly cost / hours'),
('finish_consumables',0,'USD/unit','Default skill allowance; administrator may override'),
('overhead',0,'fraction','Additional overhead beyond burdened labor'),
('margin',0.478,'fraction','Target gross margin from skill calculator'),
('profit_cap',NULL,'USD/project','Optional gross-profit cap'),
('box_waste',0.15,'fraction','Box plywood waste'),
('face_waste',0.20,'fraction','Visible face material waste; skill rift default applied provisionally to other finishes'),
('back_waste',0.15,'fraction','Back plywood waste'),
('drawer_bottom_waste',0.15,'fraction','Drawer-bottom plywood waste'),
('drawer_stock_waste',0.15,'fraction','Drawer stock waste');
