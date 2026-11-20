import type { GridCell } from '../types'
import type { Feature, Polygon } from 'geojson'

const STEP_LAT = 0.0045 // ~500 m latitude
const STEP_LON = 0.0045 // ~500 m longitude at -1.5° equator

function deterministicScore(lat: number, lon: number, offset: number): number {
  // Generates a stable, reproducible pseudo-random danger score between 0.15 and 0.95
  const val = Math.abs(Math.sin(lat * 1234.56 + lon * 789.01 + offset * 42.17))
  return parseFloat((val * 0.78 + 0.18).toFixed(3))
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
      const risk_score = parseFloat(
        Math.min(0.96, Math.max(0.18, baseRisk + proximityModifier)).toFixed(3)
      )

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
