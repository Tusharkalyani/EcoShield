// ─── Core domain types ───────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high';

export interface GridCell {
  cell_id: string;
  ndvi: number;
  ndwi: number;
  slope: number;
  dist_forest_m: number;
  risk_score: number;
  prediction_date: string;
  geom: GeoJSON.Feature<GeoJSON.Polygon>;
}

export interface Farmer {
  id: string;
  village_sector: string;
  is_active: boolean;
  latitude: number;
  longitude: number;
  phone_masked?: string; // last-4 only, masked by backend
}

export interface AlertLog {
  id: string;
  cell_id: string;
  farmer_id: string;
  risk_score: number;
  dispatched_at: string;
  delivery_status: 'pending' | 'sent' | 'delivered' | 'failed';
}

export interface AnimalSighting {
  id: string;
  species: string;
  count: number;
  latitude: number;
  longitude: number;
  logged_by: string;
  notes?: string;
}

export interface SystemHealth {
  api: boolean;
  postgis: boolean;
  redis: boolean;
  celery: boolean;
  gee: boolean;
}

export interface PipelineStatus {
  last_run: string | null;
  cells_scored: number;
  alerts_sent: number;
  alerts_failed: number;
  status: 'idle' | 'running' | 'completed' | 'error';
}

export interface RegisterFarmerPayload {
  phone_number: string;
  village_sector: string;
  latitude: number;
  longitude: number;
  is_active: boolean;
}

export interface PredictZonePayload {
  min_lon: number;
  min_lat: number;
  max_lon: number;
  max_lat: number;
  cell_size_m: number;
  trigger_alerts: boolean;
}

export interface SightingPayload {
  species: string;
  count: number;
  latitude: number;
  longitude: number;
  notes?: string;
}
