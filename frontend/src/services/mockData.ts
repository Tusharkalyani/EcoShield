import type { GridCell, Farmer, AlertLog, SystemHealth, PipelineStatus } from '../types';
import type { Feature, FeatureCollection, Polygon } from 'geojson';

// ── Synthetic bounding box: near Volcanoes NP, Rwanda ───────────────────────
const ORIGIN_LAT = -1.4850;
const ORIGIN_LON = 29.5200;
const STEP = 0.0045; // ~500 m at this latitude
const COLS = 6;
const ROWS = 5;

function cellPolygon(col: number, row: number): Feature<Polygon> {
  const minLon = ORIGIN_LON + col * STEP;
  const minLat = ORIGIN_LAT + row * STEP;
  const maxLon = minLon + STEP;
  const maxLat = minLat + STEP;
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [minLon, maxLat],
        [minLon, minLat],
      ]],
    },
  };
}

function seededRng(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 4294967296; };
}

export const mockCells: GridCell[] = Array.from({ length: ROWS * COLS }, (_, i) => {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const rng = seededRng(i * 31 + 7);
  const riskScore = parseFloat((rng() * 0.95 + 0.05).toFixed(3));
  return {
    cell_id: `R${String(row).padStart(2, '0')}_C${String(col).padStart(2, '0')}`,
    ndvi: parseFloat((rng() * 0.4 + 0.3).toFixed(3)),
    ndwi: parseFloat((rng() * 0.3 + 0.1).toFixed(3)),
    slope: parseFloat((rng() * 20 + 1).toFixed(1)),
    dist_forest_m: parseFloat((rng() * 2000 + 100).toFixed(0)),
    risk_score: riskScore,
    prediction_date: new Date().toISOString().slice(0, 10),
    geom: cellPolygon(col, row),
  };
});

export const mockGeoJSON: FeatureCollection<Polygon> = {
  type: 'FeatureCollection',
  features: mockCells.map((c) => ({
    ...c.geom,
    properties: { cell_id: c.cell_id, risk_score: c.risk_score },
  })),
};

export const mockFarmers: Farmer[] = [
  { id: 'f1', village_sector: 'Kinigi', is_active: true, latitude: -1.489, longitude: 29.527, phone_masked: '****1234' },
  { id: 'f2', village_sector: 'Mukamira', is_active: true, latitude: -1.481, longitude: 29.531, phone_masked: '****5678' },
  { id: 'f3', village_sector: 'Nyabihu', is_active: false, latitude: -1.495, longitude: 29.522, phone_masked: '****9012' },
  { id: 'f4', village_sector: 'Kinigi', is_active: true, latitude: -1.476, longitude: 29.538, phone_masked: '****3456' },
  { id: 'f5', village_sector: 'Rubafu', is_active: true, latitude: -1.502, longitude: 29.515, phone_masked: '****7890' },
];

export const mockAlertLogs: AlertLog[] = [
  { id: 'a1', cell_id: 'R01_C03', farmer_id: 'f1', risk_score: 0.87, dispatched_at: new Date().toISOString(), delivery_status: 'delivered' },
  { id: 'a2', cell_id: 'R02_C01', farmer_id: 'f2', risk_score: 0.81, dispatched_at: new Date().toISOString(), delivery_status: 'sent' },
  { id: 'a3', cell_id: 'R00_C05', farmer_id: 'f4', risk_score: 0.76, dispatched_at: new Date().toISOString(), delivery_status: 'failed' },
];

export const mockHealth: SystemHealth = {
  api: true, postgis: true, redis: true, celery: true, gee: false,
};

export const mockPipelineStatus: PipelineStatus = {
  last_run: new Date(Date.now() - 3_600_000).toISOString(),
  cells_scored: 30,
  alerts_sent: 12,
  alerts_failed: 1,
  status: 'completed',
};
