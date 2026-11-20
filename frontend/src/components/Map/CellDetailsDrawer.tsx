import type { GridCell, Farmer } from '../../types'
import { X, Layers, Mountain, Users, PlusCircle } from 'lucide-react'

interface Props {
  cell: GridCell
  farmers: Farmer[]
  onClose: () => void
  onRegisterInCell?: (lat: number, lon: number) => void
}

function Gauge({ value, label, color }: { value: number; label: string; color: string }) {
  const pct = Math.min(100, Math.max(0, value * 100))
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1" style={{ color: '#94A3B8' }}>
        <span>{label}</span>
        <span style={{ color }}>{value.toFixed(3)}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: '#334155' }}>
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}

export default function CellDetailsDrawer({
  cell,
  farmers,
  onClose,
  onRegisterInCell,
}: Props) {
  const riskColor = cell.risk_score >= 0.75 ? '#EF4444' : cell.risk_score >= 0.45 ? '#F59E0B' : '#10B981'
  const riskLabel = cell.risk_score >= 0.75 ? 'HIGH' : cell.risk_score >= 0.45 ? 'MEDIUM' : 'LOW'

  // Extract cell approximate center coordinates from polygon coordinates
  const polyCoords = (cell.geom?.geometry as any)?.coordinates?.[0] || []
  let centerLat = -1.4850
  let centerLon = 29.5200
  if (polyCoords.length > 0) {
    const lons = polyCoords.map((pt: number[]) => pt[0])
    const lats = polyCoords.map((pt: number[]) => pt[1])
    centerLon = (Math.min(...lons) + Math.max(...lons)) / 2
    centerLat = (Math.min(...lats) + Math.max(...lats)) / 2
  }

  // Filter farmers located near this cell (~500m bounding radius)
  const nearbyFarmers = farmers.filter((f) => {
    return Math.abs(f.latitude - centerLat) < 0.004 && Math.abs(f.longitude - centerLon) < 0.004
  })

  return (
    <div
      className="drawer-enter absolute right-0 top-0 bottom-0 w-84 overflow-y-auto shadow-2xl flex flex-col"
      style={{
        background: '#1E293B',
        borderLeft: '1px solid #334155',
        zIndex: 1200,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 border-b flex-shrink-0"
        style={{ borderColor: '#334155', background: '#0F172A' }}
      >
        <div>
          <div className="text-[11px] uppercase tracking-wider" style={{ color: '#94A3B8' }}>
            Zone Details
          </div>
          <div className="font-bold font-mono text-sm" style={{ color: '#10B981' }}>
            {cell.cell_id}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Risk Badge */}
        <div className="p-4 border-b" style={{ borderColor: '#334155' }}>
          <div className="flex items-center gap-3">
            <div
              className="flex-1 rounded-lg p-3 text-center"
              style={{ background: `${riskColor}22`, border: `1px solid ${riskColor}44` }}
            >
              <div className="text-3xl font-bold font-mono" style={{ color: riskColor }}>
                {(cell.risk_score * 100).toFixed(0)}%
              </div>
              <div className="text-xs font-semibold mt-0.5 tracking-wider" style={{ color: riskColor }}>
                {riskLabel} RAID RISK
              </div>
            </div>
          </div>
          <div className="text-[11px] mt-2.5 flex items-center justify-between" style={{ color: '#64748b' }}>
            <span>Prediction Date:</span>
            <span className="font-mono" style={{ color: '#94A3B8' }}>{cell.prediction_date}</span>
          </div>
        </div>

        {/* Satellite Indices */}
        <div className="p-4 border-b" style={{ borderColor: '#334155' }}>
          <div className="flex items-center gap-2 mb-3 text-xs font-medium uppercase tracking-wider" style={{ color: '#94A3B8' }}>
            <Layers size={13} style={{ color: '#10B981' }} />
            Satellite Indices (Sentinel-2)
          </div>
          <Gauge value={cell.ndvi} label="NDVI (Canopy Biomass)" color="#10B981" />
          <Gauge value={cell.ndwi} label="NDWI (Water / Moisture Index)" color="#38bdf8" />
        </div>

        {/* Terrain & Proximity */}
        <div className="p-4 border-b" style={{ borderColor: '#334155' }}>
          <div className="flex items-center gap-2 mb-3 text-xs font-medium uppercase tracking-wider" style={{ color: '#94A3B8' }}>
            <Mountain size={13} style={{ color: '#F59E0B' }} />
            Terrain (NASA SRTM DEM)
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-lg p-2.5" style={{ background: '#0F172A' }}>
              <div className="text-[11px]" style={{ color: '#64748b' }}>Terrain Slope</div>
              <div className="text-base font-bold font-mono" style={{ color: '#F59E0B' }}>
                {cell.slope.toFixed(1)}°
              </div>
            </div>
            <div className="rounded-lg p-2.5" style={{ background: '#0F172A' }}>
              <div className="text-[11px]" style={{ color: '#64748b' }}>Park Boundary</div>
              <div className="text-base font-bold font-mono" style={{ color: '#10B981' }}>
                {cell.dist_forest_m.toFixed(0)}m
              </div>
            </div>
          </div>
        </div>

        {/* Nearby / Enrolled Farmers */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider" style={{ color: '#94A3B8' }}>
              <Users size={13} style={{ color: '#38bdf8' }} />
              Farmers in Zone ({nearbyFarmers.length})
            </div>
          </div>

          {nearbyFarmers.length === 0 ? (
            <div className="text-xs p-3 rounded-lg text-slate-400 bg-slate-900/60 border border-slate-800 text-center">
              No registered farmer plots located inside this 500m cell.
            </div>
          ) : (
            <div className="space-y-1.5">
              {nearbyFarmers.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-xs"
                  style={{ background: '#0F172A', border: '1px solid #334155' }}
                >
                  <div>
                    <span className="font-medium text-slate-200">🌾 {f.village_sector}</span>
                    <span className="block text-[10px] text-slate-500 font-mono">
                      {f.phone_masked || 'Encrypted'}
                    </span>
                  </div>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                    style={{
                      background: f.is_active ? '#064e3b' : '#374151',
                      color: f.is_active ? '#10B981' : '#9ca3af',
                    }}
                  >
                    {f.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Quick Action Button to Register a plot right at this cell */}
          {onRegisterInCell && (
            <button
              type="button"
              onClick={() => onRegisterInCell(centerLat, centerLon)}
              className="mt-3.5 w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 hover:bg-emerald-900 transition"
            >
              <PlusCircle size={13} />
              Register Farmer at this Plot
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
