import type { GridCell } from '../types'
import type { Feature, Polygon } from 'geojson'

const STEP_LAT = 0.0045 // ~500 m latitude
const STEP_LON = 0.0045 // ~500 m longitude at -1.5° equator

function deterministicScore(lat: number, lon: number, offset: number): number {
  // Generates a stable, reproducible pseudo-random danger score between 0.15 and 0.95
  const val = Math.abs(Math.sin(lat * 1234.56 + lon * 789.01 + offset * 42.17))
  return parseFloat((val * 0.78 + 0.18).toFixed(3))
}

// ── Geo Context Filter (mirrors app/ml/geo_filters.py) ───────────────────────

/** Volcanoes National Park boundary — corrected polygon, 24 vertices [lat, lon] */
const PARK_BOUNDARY: [number, number][] = [
  [-1.3800, 29.5100], [-1.3900, 29.5350], [-1.4050, 29.5500],
  [-1.4200, 29.5600], [-1.4350, 29.5680], [-1.4500, 29.5720],
  [-1.4650, 29.5700], [-1.4780, 29.5660], [-1.4900, 29.5600],
  [-1.5050, 29.5500], [-1.5200, 29.5350], [-1.5350, 29.5150],
  [-1.5450, 29.4950], [-1.5500, 29.4700], [-1.5450, 29.4450],
  [-1.5300, 29.4250], [-1.5100, 29.4100], [-1.4850, 29.3950],
  [-1.4600, 29.3900], [-1.4350, 29.4000], [-1.4150, 29.4200],
  [-1.4000, 29.4450], [-1.3900, 29.4700], [-1.3800, 29.4950],
  [-1.3800, 29.5100],
]

const SETTLEMENTS: { lat: number; lon: number; radius: number }[] = [
  { lat: -1.4994, lon: 29.6342, radius: 2500 }, // Musanze / Ruhengeri
  { lat: -1.4860, lon: 29.5842, radius: 1200 }, // Kinigi town centre
  { lat: -1.5261, lon: 29.5953, radius: 1000 }, // Nyakinama
  { lat: -1.4820, lon: 29.6089, radius: 1000 }, // Mukamira
  { lat: -1.5531, lon: 29.5706, radius: 1000 }, // Busogo
  { lat: -1.5253, lon: 29.5444, radius:  900 }, // Cyuve
  { lat: -1.5103, lon: 29.5214, radius:  900 }, // Nkotsi
  { lat: -1.4703, lon: 29.6194, radius:  900 }, // Gataraga
  { lat: -1.4567, lon: 29.5950, radius:  800 }, // Kinoni
]

const SAFE_SCORE_CAP = 0.14
const PARK_THRESHOLD_M = 1500

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function pointInPolygon(lat: number, lon: number, poly: [number, number][]): boolean {
  let inside = false
  let j = poly.length - 1
  for (let i = 0; i < poly.length; i++) {
    const [yi, xi] = [poly[i][0], poly[i][1]]
    const [yj, xj] = [poly[j][0], poly[j][1]]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
      inside = !inside
    j = i
  }
  return inside
}

function distToSegmentM(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  if (dx === 0 && dy === 0) return haversineM(px, py, ax, ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return haversineM(px, py, ax + t * dx, ay + t * dy)
}

function distToParkBoundaryM(lat: number, lon: number): number {
  let min = Infinity
  for (let i = 0; i < PARK_BOUNDARY.length - 1; i++) {
    const d = distToSegmentM(
      lat, lon,
      PARK_BOUNDARY[i][0], PARK_BOUNDARY[i][1],
      PARK_BOUNDARY[i + 1][0], PARK_BOUNDARY[i + 1][1],
    )
    if (d < min) min = d
  }
  return min
}

/**
 * Apply park-proximity and settlement geo filter.
 * Mirrors the Python logic in app/ml/geo_filters.py:
 *  1. Settlement proximity → cap at SAFE_SCORE_CAP
 *  2. Inside park polygon  → keep raw score
 *  3. Within 1 500 m of boundary corridor → keep raw score
 *  4. Otherwise → cap at SAFE_SCORE_CAP (100 % green)
 */
function applyGeoFilter(lat: number, lon: number, rawScore: number): number {
  // 1. Settlement exclusion (highest priority)
  for (const s of SETTLEMENTS) {
    if (haversineM(lat, lon, s.lat, s.lon) < s.radius) {
      return Math.min(rawScore, SAFE_SCORE_CAP)
    }
  }
  // 2. Inside park polygon
  if (pointInPolygon(lat, lon, PARK_BOUNDARY)) return rawScore
  // 3. Park corridor buffer
  if (distToParkBoundaryM(lat, lon) <= PARK_THRESHOLD_M) return rawScore
  // 4. Outside corridor — green zone
  return Math.min(rawScore, SAFE_SCORE_CAP)
}

/**
 * Generates a dynamic 3x3 grid (9 danger-level boxes, 500m each) centered on a registered plot.
 * Covers approximately 1.5 km x 1.5 km surrounding the agricultural perimeter.
 */
export function generateDynamicGridAroundPlot(
  centerLat: number,
  centerLon: number,
  plotId?: string,
  sectorName: string = 'Kinigi'
): GridCell[] {
  const cells: GridCell[] = []
  const today = new Date().toISOString().slice(0, 10)
  const idPrefix = plotId ? plotId.slice(0, 6) : `${Math.round(Math.abs(centerLat * 100))}`

  // 3x3 grid: offsets -1, 0, 1 from center
  const rows = [-1, 0, 1]
  const cols = [-1, 0, 1]

  let idx = 0
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const r = rows[rIdx]
    for (let cIdx = 0; cIdx < cols.length; cIdx++) {
      const c = cols[cIdx]
      idx++

      const minLat = centerLat + (r - 0.5) * STEP_LAT
      const maxLat = centerLat + (r + 0.5) * STEP_LAT
      const minLon = centerLon + (c - 0.5) * STEP_LON
      const maxLon = centerLon + (c + 0.5) * STEP_LON

      const cellCenterLat = (minLat + maxLat) / 2
      const cellCenterLon = (minLon + maxLon) / 2

      // Dist from plot center in meters
      const distFromPlot = Math.sqrt(
        Math.pow((cellCenterLat - centerLat) * 111000, 2) +
        Math.pow((cellCenterLon - centerLon) * 111000, 2)
      )

      // Dynamic danger scoring based on coordinates & proximity
      // The center plot has rich crops (high NDVI), so danger score is elevated
      const baseRisk = deterministicScore(cellCenterLat, cellCenterLon, idx)
      const proximityModifier = distFromPlot < 350 ? 0.15 : -0.05
      const rawRisk = parseFloat(
        Math.min(0.96, Math.max(0.18, baseRisk + proximityModifier)).toFixed(3)
      )
      // Apply park-proximity / settlement geo filter (mirrors Python geo_filters.py)
      const risk_score = parseFloat(applyGeoFilter(cellCenterLat, cellCenterLon, rawRisk).toFixed(3))

      const ndvi = parseFloat((0.45 + (deterministicScore(cellCenterLat, cellCenterLon, idx + 10) % 0.40)).toFixed(3))
      const ndwi = parseFloat((0.20 + (deterministicScore(cellCenterLat, cellCenterLon, idx + 20) % 0.35)).toFixed(3))
      const slope = parseFloat((4.0 + (deterministicScore(cellCenterLat, cellCenterLon, idx + 30) * 22)).toFixed(1))
      const dist_forest_m = Math.round(180 + (deterministicScore(cellCenterLat, cellCenterLon, idx + 40) * 1800))

      const polygonFeature: Feature<Polygon> = {
        type: 'Feature',
        properties: {
          cell_id: `PLT_${idPrefix}_R${rIdx + 1}C${cIdx + 1}`,
          sector: sectorName,
          risk_score,
          ndvi,
          ndwi,
          slope,
          dist_forest_m,
          prediction_date: today,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [Number(minLon.toFixed(5)), Number(minLat.toFixed(5))],
            [Number(maxLon.toFixed(5)), Number(minLat.toFixed(5))],
            [Number(maxLon.toFixed(5)), Number(maxLat.toFixed(5))],
            [Number(minLon.toFixed(5)), Number(maxLat.toFixed(5))],
            [Number(minLon.toFixed(5)), Number(minLat.toFixed(5))],
          ]],
        },
      }

      cells.push({
        cell_id: `PLT_${idPrefix}_R${rIdx + 1}C${cIdx + 1}`,
        ndvi,
        ndwi,
        slope,
        dist_forest_m,
        risk_score,
        prediction_date: today,
        geom: polygonFeature,
      })
    }
  }

  return cells
}
