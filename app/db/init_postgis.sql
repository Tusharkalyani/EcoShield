-- =============================================================
-- EcoShield – PostGIS bootstrap
-- Run once against a fresh database, e.g.:
--   psql -U postgres -d ecoshield_db -f init_postgis.sql
-- =============================================================

-- 1. Enable the PostGIS extension (idempotent)
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Spatial indexes (GiST) for geometry columns
--    These are created separately from the ORM so they exist even
--    when tables are created outside of Alembic migrations.
CREATE INDEX IF NOT EXISTS idx_farmers_location_geom
    ON farmers USING GIST (location_geom);

CREATE INDEX IF NOT EXISTS idx_risk_grid_cells_geom
    ON risk_grid_cells USING GIST (geom);
