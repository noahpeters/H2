-- Design proposal only: not a production migration and never applied by the export tools.
-- Spreadsheet values are a versioned input. Pricing formulas remain in the spreadsheet.
PRAGMA foreign_keys = ON;

CREATE TABLE product_types (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL
);

-- One row per sellable variation. Shopify product/variant hierarchy is not required.
-- Choose IDs from the reviewed spreadsheet identities; never assign from row position.
CREATE TABLE catalog_variations (
  id TEXT PRIMARY KEY,
  product_type_id TEXT NOT NULL REFERENCES product_types(id),
  sku TEXT UNIQUE,
  title TEXT NOT NULL,
  group_key TEXT,
  price_minor INTEGER CHECK (price_minor IS NULL OR price_minor >= 0),
  currency TEXT CHECK (currency IS NULL OR length(currency) = 3),
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  price_source TEXT,
  source_revision TEXT
);

-- Product types get their own configuration columns and validation at implementation.
-- This example uses real table spreadsheet concepts, without recreating its calculations.
CREATE TABLE table_variation_details (
  variation_id TEXT PRIMARY KEY REFERENCES catalog_variations(id),
  style_code TEXT,
  seating TEXT,
  extension TEXT,
  top_style TEXT,
  species TEXT,
  seat_source_id TEXT,
  extension_source_id TEXT,
  top_style_source_id TEXT,
  species_source_id TEXT
);

-- Add cutting_board_variation_details or other type tables when their real fields
-- are confirmed. Shared order/payment/feed references use catalog_variations.id.
CREATE TABLE option_presentations (
  product_type_id TEXT NOT NULL REFERENCES product_types(id),
  option_key TEXT NOT NULL,
  option_value TEXT NOT NULL,
  label TEXT NOT NULL,
  image_key TEXT,
  color TEXT,
  PRIMARY KEY (product_type_id, option_key, option_value)
);

-- External identities stay separate from our product shape. Empty scope strings
-- mean not applicable, never unknown. Unverified mappings stay in export reports.
CREATE TABLE external_product_identities (
  variation_id TEXT NOT NULL REFERENCES catalog_variations(id),
  provider TEXT NOT NULL,
  account_id TEXT NOT NULL,
  feed_label TEXT NOT NULL DEFAULT '',
  content_language TEXT NOT NULL DEFAULT '',
  source_channel TEXT NOT NULL DEFAULT '',
  external_id TEXT NOT NULL,
  external_group_id TEXT,
  evidence_source TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  PRIMARY KEY (provider, account_id, feed_label, content_language, source_channel, external_id)
);
