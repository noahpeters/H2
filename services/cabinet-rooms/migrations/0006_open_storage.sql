-- No vendor rate supplied: rods and fittings remain in the existing project
-- miscellaneous allowance until an administrator enters a separate rate.
INSERT INTO cabinet_pricing_rates (key,value,unit,description)
VALUES ('hanging_rod_lf',0,'USD/linear foot','Hanging rod and fittings; zero means covered by project miscellaneous allowance');
