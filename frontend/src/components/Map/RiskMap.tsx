import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMapEvents, useMap } from 'react-leaflet'
import type { Layer, LeafletMouseEvent } from 'leaflet'
import L from 'leaflet'
import type { Feature } from 'geojson'
import type { GridCell, Farmer, AnimalSighting } from '../../types'
import MapLegend from './MapLegend'
import { Users, Eye, EyeOff, Layers, Map as MapIcon } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

interface Props {
  cells: GridCell[]
  farmers?: Farmer[]
  sightings?: AnimalSighting[]
  targetLocation?: { lat: number; lon: number } | null
  onCellSelect: (cell: GridCell) => void
  onMapClick?: (lat: number, lon: number) => void
}

function riskColor(score: number): string {
  if (score >= 0.75) return '#EF4444'   // crimson – high
  if (score >= 0.45) return '#F59E0B'   // amber   – medium
  return '#10B981'                       // forest  – low
}

// Custom DivIcon for Farmers (Emerald Pin)
const farmerIcon = L.divIcon({
  className: 'custom-farmer-marker',
  html: `
    <div style="
      background: #10B981;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 2px solid #FFFFFF;
      box-shadow: 0 2px 6px rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
    ">
      🌾
    </div>
  `,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

// Custom DivIcon for Wildlife Sightings (Amber/Crimson Pin)
const sightingIcon = L.divIcon({
  className: 'custom-sighting-marker',
  html: `
    <div style="
      background: #EF4444;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 2px solid #FCD34D;
      box-shadow: 0 0 10px rgba(239, 68, 68, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
    ">
      🐘
    </div>
  `,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
})

// Ensures Leaflet calculates accurate pixel bounds on flex layout render
function MapResizeHandler() {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
    const timer = setTimeout(() => {
      map.invalidateSize()
    }, 250)
    return () => clearTimeout(timer)
  }, [map])
  return null
}

function MapFlyTo({ target }: { target?: { lat: number; lon: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lon], 14, { duration: 1.2 })
    }
  }, [target, map])
  return null
}

function MapClickHandler({ onMapClick }: { onMapClick?: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      if (onMapClick) {
        onMapClick(Number(e.latlng.lat.toFixed(5)), Number(e.latlng.lng.toFixed(5)))
      }
    },
  })
  return null
}

function RiskLayer({ cells, onCellSelect }: { cells: GridCell[]; onCellSelect: (cell: GridCell) => void }) {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: cells.map((c) => ({
      ...c.geom,
      properties: { cell_id: c.cell_id, risk_score: c.risk_score, cell: c },
    })),
  }

  const layerKey = `grid-layer-${cells.length}-${cells[0]?.cell_id || ''}-${cells[cells.length - 1]?.cell_id || ''}`

  return (
    <GeoJSON
      key={layerKey}
      data={geojson}
      style={(feature) => {
        const score = feature?.properties?.risk_score ?? 0
        return {
          color: '#0F172A',
          weight: 1.5,
          fillColor: riskColor(score),
          fillOpacity: 0.58,
        }
      }}
      onEachFeature={(feature: Feature, layer: Layer) => {
        const { cell_id, risk_score, cell } = feature.properties ?? {}
        const levelLabel = risk_score >= 0.75 ? 'HIGH DANGER' : risk_score >= 0.45 ? 'MEDIUM DANGER' : 'LOW DANGER'
        layer.bindTooltip(
          `<div style="font-family:monospace;font-size:11px;padding:4px 6px;background:#0F172A;border:1px solid #334155;border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,0.5);">
            <div style="font-weight:bold;color:#10B981;margin-bottom:2px;">${cell_id}</div>
            <div>Danger: <b style="color:${riskColor(risk_score)}">${levelLabel} (${(risk_score * 100).toFixed(0)}%)</b></div>
            <div style="color:#94A3B8;font-size:10px;margin-top:2px;">NDVI: ${cell?.ndvi?.toFixed(2) ?? '0.50'} • Slope: ${cell?.slope?.toFixed(1) ?? '5.0'}°</div>
            <div style="color:#64748B;font-size:9px;margin-top:2px;">Click to view telemetry</div>
          </div>`,
          { sticky: true, opacity: 0.95 }
        )
        layer.on('click', (_e: LeafletMouseEvent) => {
          if (cell) onCellSelect(cell)
        })
        layer.on('mouseover', () => {
          ;(layer as any).setStyle({ fillOpacity: 0.85, weight: 2.5, color: '#F8FAFC' })
        })
        layer.on('mouseout', () => {
          ;(layer as any).setStyle({ fillOpacity: 0.58, weight: 1.5, color: '#0F172A' })
        })
      }}
    />
  )
}

const BASEMAPS = {
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    subdomains: ['a', 'b', 'c', 'd'],
    attribution: '&copy; Esri World Imagery',
  },
  dark: {
    label: 'Dark Canvas',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    subdomains: ['a', 'b', 'c', 'd'],
    attribution: '&copy; Esri Dark Canvas',
  },
  topo: {
    label: 'Topographic',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    subdomains: ['a', 'b', 'c', 'd'],
    attribution: '&copy; Esri Topo',
  },
}

export default function RiskMap({
  cells,
  farmers = [],
  sightings = [],
  targetLocation = null,
  onCellSelect,
  onMapClick,
}: Props) {
  const center: [number, number] = [-1.4890, 29.5350]

  const [basemapKey, setBasemapKey] = useState<'satellite' | 'dark' | 'topo'>('satellite')
  const [showGrid, setShowGrid] = useState(true)
  const [showFarmers, setShowFarmers] = useState(true)
  const [showSightings, setShowSightings] = useState(true)

  const activeBasemap = BASEMAPS[basemapKey]

  return (
    <div className="w-full h-full min-h-[450px] relative flex-1 flex flex-col">
      <MapContainer
        center={center}
        zoom={13}
        style={{ width: '100%', height: '100%', flex: 1, minHeight: '450px' }}
        zoomControl={false}
      >
        <MapResizeHandler />
        <MapFlyTo target={targetLocation} />
        <MapClickHandler onMapClick={onMapClick} />

        {/* Dynamic Basemap Layer */}
        <TileLayer
          key={basemapKey}
          url={activeBasemap.url}
          subdomains={activeBasemap.subdomains}
          attribution={activeBasemap.attribution}
          maxZoom={19}
        />

        {/* 1. Risk Grid Cells */}
        {showGrid && <RiskLayer cells={cells} onCellSelect={onCellSelect} />}

        {/* 2. Registered Farmers Markers */}
        {showFarmers &&
          farmers.map((f) => (
            <Marker key={f.id} position={[f.latitude, f.longitude]} icon={farmerIcon}>
              <Popup>
                <div style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.4' }}>
                  <div style={{ fontWeight: 'bold', color: '#10B981', marginBottom: '4px' }}>
                    🌾 {f.village_sector} Plot
                  </div>
                  <div style={{ color: '#94A3B8' }}>ID: {f.id.slice(0, 8)}…</div>
                  <div style={{ color: '#94A3B8' }}>Phone: {f.phone_masked ?? 'Protected'}</div>
                  <div style={{ color: '#94A3B8' }}>
                    GPS: {f.latitude.toFixed(4)}, {f.longitude.toFixed(4)}
                  </div>
                  <div style={{ marginTop: '4px' }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: f.is_active ? '#064e3b' : '#374151',
                        color: f.is_active ? '#34d399' : '#9ca3af',
                        fontSize: '10px',
                      }}
                    >
                      {f.is_active ? 'Active Enrolled' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

        {/* 3. Wildlife Sightings Markers */}
        {showSightings &&
          sightings.map((s) => (
            <Marker key={s.id} position={[s.latitude, s.longitude]} icon={sightingIcon}>
              <Popup>
                <div style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.4' }}>
                  <div style={{ fontWeight: 'bold', color: '#EF4444', marginBottom: '4px' }}>
                    ⚠️ {s.species} Sighting (Count: {s.count})
                  </div>
                  <div style={{ color: '#94A3B8' }}>Logged by: {s.logged_by}</div>
                  <div style={{ color: '#E2E8F0', marginTop: '4px', fontStyle: 'italic' }}>
                    "{s.notes || 'No patrol notes recorded'}"
                  </div>
                  <div style={{ color: '#64748b', fontSize: '10px', marginTop: '4px' }}>
                    GPS: {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

        <MapLegend />
      </MapContainer>

      {/* Floating Layer Controls (Top-Right) */}
      <div
        className="absolute top-3 right-3 rounded-lg p-2.5 space-y-2 shadow-2xl border backdrop-blur-md"
        style={{
          background: 'rgba(30, 41, 59, 0.90)',
          borderColor: '#334155',
          zIndex: 850,
          fontSize: '11px',
        }}
      >
        {/* Basemap Switcher */}
        <div>
          <div className="flex items-center gap-1.5 font-semibold text-slate-300 pb-1 border-b border-slate-700">
            <MapIcon size={12} style={{ color: '#38bdf8' }} />
            <span>Basemap</span>
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            {(['satellite', 'dark', 'topo'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setBasemapKey(key)}
                className={`px-2 py-0.5 rounded text-[10px] capitalize transition ${
                  basemapKey === key
                    ? 'bg-sky-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        {/* Feature Overlays */}
        <div className="pt-1 border-t border-slate-700/80">
          <div className="flex items-center gap-1.5 font-semibold text-slate-300 pb-1">
            <Layers size={12} style={{ color: '#10B981' }} />
            <span>Overlays</span>
          </div>

          <button
            type="button"
            onClick={() => setShowGrid((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-1.5 py-1 rounded hover:bg-slate-800 transition"
            style={{ color: showGrid ? '#10B981' : '#64748b' }}
          >
            <span>500m Grid ({cells.length})</span>
            {showGrid ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>

          <button
            type="button"
            onClick={() => setShowFarmers((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-1.5 py-1 rounded hover:bg-slate-800 transition"
            style={{ color: showFarmers ? '#10B981' : '#64748b' }}
          >
            <span className="flex items-center gap-1">
              <Users size={11} /> Farmers ({farmers.length})
            </span>
            {showFarmers ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>

          <button
            type="button"
            onClick={() => setShowSightings((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-1.5 py-1 rounded hover:bg-slate-800 transition"
            style={{ color: showSightings ? '#EF4444' : '#64748b' }}
          >
            <span>Sightings ({sightings.length})</span>
            {showSightings ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
        </div>
      </div>
    </div>
  )
}
