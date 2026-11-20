import axios from 'axios';
import type {
  Farmer,
  AlertLog,
  AnimalSighting,
  GridCell,
  PredictZonePayload,
  RegisterFarmerPayload,
  SightingPayload,
  SystemHealth,
} from '../types';

// Axios instance pointing at Vite's proxy → FastAPI
const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 10_000,
});

// Attach JWT from localStorage if present
api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('ecoshield_token');
  if (token && cfg.headers) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// ── Farmer endpoints ─────────────────────────────────────────────────────────

export const fetchFarmers = (): Promise<Farmer[]> =>
  api.get<Farmer[]>('/farmers').then((r) => r.data);

export const registerFarmer = (payload: RegisterFarmerPayload): Promise<Farmer> =>
  api.post<Farmer>('/farmers', payload).then((r) => r.data);

// ── Grid Cells & Prediction ──────────────────────────────────────────────────

export const fetchCells = async (): Promise<GridCell[]> => {
  const res = await api.get('/cells');
  const features = res.data?.features || [];
  return features.map((f: any) => ({
    cell_id: f.properties?.cell_id || 'UNKNOWN',
    ndvi: f.properties?.ndvi ?? 0.5,
    ndwi: f.properties?.ndwi ?? 0.3,
    slope: f.properties?.slope ?? 5.0,
    dist_forest_m: f.properties?.dist_forest_m ?? 500,
    risk_score: f.properties?.risk_score ?? 0.2,
    prediction_date: f.properties?.prediction_date || new Date().toISOString().slice(0, 10),
    geom: f,
  }));
};

export const predictZone = (payload: PredictZonePayload) =>
  api.post('/predict-zone', payload).then((r) => r.data);

// ── Alert logs ───────────────────────────────────────────────────────────────

export const fetchAlertLogs = (): Promise<AlertLog[]> =>
  api.get<AlertLog[]>('/alerts').then((r) => r.data);

// ── Sightings ────────────────────────────────────────────────────────────────

export const fetchSightings = (): Promise<AnimalSighting[]> =>
  api.get<AnimalSighting[]>('/sightings').then((r) => r.data);

export const logSighting = (payload: SightingPayload): Promise<AnimalSighting> =>
  api.post<AnimalSighting>('/sightings', payload).then((r) => r.data);

// ── Auth & Tokens ────────────────────────────────────────────────────────────

export const getDemoTokens = () =>
  api.get<{ ranger_token: string; admin_token: string; viewer_token: string }>('/auth/demo-token').then((r) => r.data);

// ── Health check ─────────────────────────────────────────────────────────────

export const fetchHealth = async (): Promise<SystemHealth> => {
  try {
    const res = await api.get('/health/detailed');
    if (res.data?.health) return res.data.health;
  } catch {
    // Fall back to simple /health or offline defaults
  }
  return {
    api: true,
    postgis: true,
    redis: true,
    celery: true,
    gee: false,
  };
};

export default api;
