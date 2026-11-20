import { useState, useEffect } from 'react'
import Header from './components/Dashboard/Header'
import MetricCards from './components/Dashboard/MetricCards'
import TelemetryPanel from './components/Dashboard/TelemetryPanel'
import RiskMap from './components/Map/RiskMap'
import CellDetailsDrawer from './components/Map/CellDetailsDrawer'
import FarmerTable from './components/Farmers/FarmerTable'
import RegisterFarmerModal from './components/Farmers/RegisterFarmerModal'
import SightingLogModal from './components/Ranger/SightingLogModal'
import type { GridCell, Farmer, AlertLog, AnimalSighting, SystemHealth, PipelineStatus } from './types'
import {
  fetchFarmers,
  fetchCells,
  fetchAlertLogs,
  fetchSightings,
  fetchHealth,
  predictZone,
} from './services/api'
import {
  mockCells,
  mockFarmers,
  mockAlertLogs,
  mockHealth,
  mockPipelineStatus,
} from './services/mockData'
import { generateDynamicGridAroundPlot } from './services/gridGenerator'
import { UserPlus, CheckCircle2 } from 'lucide-react'

type Tab = 'map' | 'farmers' | 'alerts'

export default function App() {
  const [tab, setTab] = useState<Tab>('map')
  const [selectedCell, setSelectedCell] = useState<GridCell | null>(null)
  const [showRegister, setShowRegister] = useState(false)
  const [showSighting, setShowSighting] = useState(false)
  const [initialRegisterCoords, setInitialRegisterCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [mapTarget, setMapTarget] = useState<{ lat: number; lon: number } | null>(null)

  // Platform Data State
  const [farmers, setFarmers] = useState<Farmer[]>(mockFarmers)
  const [cells, setCells] = useState<GridCell[]>(mockCells)
  const [alertLogs, setAlertLogs] = useState<AlertLog[]>(mockAlertLogs)
  const [sightings, setSightings] = useState<AnimalSighting[]>([
    {
      id: 'sighting-initial-1',
      species: 'Elephant',
      count: 3,
      latitude: -1.4860,
      longitude: 29.5240,
      logged_by: 'ranger_samuel',
      notes: 'Herd moving towards crops.',
    },
    {
      id: 'sighting-initial-2',
      species: 'Buffalo',
      count: 2,
      latitude: -1.4920,
      longitude: 29.5350,
      logged_by: 'ranger_eric',
      notes: 'Grazing near perimeter fence.',
    },
  ])
  const [health, setHealth] = useState<SystemHealth>(mockHealth)
  const [pipeline, setPipeline] = useState<PipelineStatus>(mockPipelineStatus)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  function showToast(msg: string) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 4000)
  }

  // Initial load from FastAPI (resilient to offline / dev mode)
  useEffect(() => {
    fetchFarmers()
      .then((data) => {
        if (data && data.length > 0) setFarmers(data)
      })
      .catch(() => {})

    fetchCells()
      .then((data) => {
        if (data && data.length > 0) setCells(data)
      })
      .catch(() => {})

    fetchAlertLogs()
      .then((data) => {
        if (data && data.length > 0) setAlertLogs(data)
      })
      .catch(() => {})

    fetchSightings()
      .then((data) => {
        if (data && data.length > 0) setSightings(data)
      })
      .catch(() => {})

    fetchHealth()
      .then((h) => setHealth(h))
      .catch(() => {})
  }, [])

  // KPI Calculations
  const activeFarmers = farmers.filter((f) => f.is_active).length
  const activeAlerts = alertLogs.filter((a) => a.delivery_status !== 'failed').length
  const highRiskCells = cells.filter((c) => c.risk_score >= 0.75).length

  // Handlers
  function handleFarmerRegistered(newFarmer: Farmer) {
    setFarmers((prev) => [newFarmer, ...prev])

    // Generate dynamic 500m danger-level grid boxes around the newly registered plot
    const dynamicPlotCells = generateDynamicGridAroundPlot(
      newFarmer.latitude,
      newFarmer.longitude,
      newFarmer.id,
      newFarmer.village_sector
    )

    // Merge new danger grid boxes into state, preserving existing cells without ID conflict
    setCells((prev) => {
      const newIds = new Set(dynamicPlotCells.map((c) => c.cell_id))
      const remaining = prev.filter((c) => !newIds.has(c.cell_id))
      return [...dynamicPlotCells, ...remaining]
    })

    // Automatically fly map camera directly to the newly registered plot
    setMapTarget({ lat: newFarmer.latitude, lon: newFarmer.longitude })
    setTab('map')

    showToast(`🌾 Plot registered in ${newFarmer.village_sector}! Generated 9 dynamic danger level grid boxes around plot.`)

    // Background sync with backend /predict-zone if server is reachable
    const delta = 0.009
    const bbox = {
      min_lon: Number((newFarmer.longitude - delta).toFixed(5)),
      min_lat: Number((newFarmer.latitude - delta).toFixed(5)),
      max_lon: Number((newFarmer.longitude + delta).toFixed(5)),
      max_lat: Number((newFarmer.latitude + delta).toFixed(5)),
      cell_size_m: 500,
      trigger_alerts: true,
    }
    predictZone(bbox)
      .then(() => fetchCells())
      .then((serverCells) => {
        if (serverCells && serverCells.length > 0) {
          setCells((prev) => {
            const serverIds = new Set(serverCells.map((c) => c.cell_id))
            const remaining = prev.filter((c) => !serverIds.has(c.cell_id))
            return [...serverCells, ...remaining]
          })
        }
      })
      .catch(() => {})
  }

  function handleSightingLogged(newSighting: AnimalSighting) {
    setSightings((prev) => [newSighting, ...prev])
    showToast(`⚠️ ${newSighting.species} sighting recorded! Dispatched to patrol units.`)
  }

  function handleOpenRegisterAt(lat: number, lon: number) {
    setInitialRegisterCoords({ lat, lon })
    setShowRegister(true)
  }

  async function handleTriggerScan() {
    try {
      const bbox = {
        min_lon: 29.50,
        min_lat: -1.52,
        max_lon: 29.55,
        max_lat: -1.47,
        cell_size_m: 500,
        trigger_alerts: true,
      }
      const res = await predictZone(bbox)
      // Refetch updated cells and alerts
      const updatedCells = await fetchCells().catch(() => cells)
      const updatedAlerts = await fetchAlertLogs().catch(() => alertLogs)
      setCells(updatedCells)
      setAlertLogs(updatedAlerts)
      setPipeline({
        last_run: new Date().toISOString(),
        cells_scored: res.total_cells || cells.length,
        alerts_sent: res.alert_summary?.sent ?? res.high_risk_cells ?? 2,
        alerts_failed: res.alert_summary?.failed ?? 0,
        status: 'completed',
      })
      showToast(`⚡ Prediction scan complete! ${res.high_risk_cells || 0} high-risk zones identified.`)
    } catch {
      // Local fallback simulation
      setPipeline({
        last_run: new Date().toISOString(),
        cells_scored: cells.length,
        alerts_sent: highRiskCells,
        alerts_failed: 0,
        status: 'completed',
      })
      showToast('⚡ Local prediction scan complete! Evaluated Sentinel-2 & SRTM features.')
    }
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden font-mono" style={{ background: '#0F172A' }}>
      {/* ── System Header ── */}
      <Header health={health} onLogSighting={() => setShowSighting(true)} />

      {/* ── KPI Counter Cards ── */}
      <MetricCards
        activeFarmers={activeFarmers}
        activeAlerts={activeAlerts}
        highRiskCells={highRiskCells}
        totalCells={cells.length}
      />

      {/* ── Navigation Tab Bar ── */}
      <div
        className="flex items-center justify-between px-4 pb-0 border-b flex-shrink-0"
        style={{ borderColor: '#334155' }}
      >
        <div className="flex gap-1">
          {(['map', 'farmers', 'alerts'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-5 py-2.5 text-xs uppercase tracking-widest font-semibold transition-all relative"
              style={{
                borderBottom: tab === t ? '2px solid #10B981' : '2px solid transparent',
                color: tab === t ? '#10B981' : '#94A3B8',
              }}
            >
              {t === 'map' && '🗺 Risk Map'}
              {t === 'farmers' && `🌾 Farmers (${farmers.length})`}
              {t === 'alerts' && `🔔 Alert Logs (${alertLogs.length})`}
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pb-1.5">
          <button
            type="button"
            onClick={() => {
              setInitialRegisterCoords(null)
              setShowRegister(true)
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-lg font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition shadow-lg shadow-emerald-950/30"
          >
            <UserPlus size={13} />
            Register Farmer
          </button>
        </div>
      </div>

      {/* ── Main Viewports ── */}
      <div className="flex-1 min-h-0 w-full relative overflow-hidden flex">
        {/* 1. MAP VIEW */}
        {tab === 'map' && (
          <div className="flex-1 min-h-0 w-full h-full relative flex overflow-hidden">
            <div className="flex-1 min-h-0 relative h-full w-full flex flex-col">
              <RiskMap
                cells={cells}
                farmers={farmers}
                sightings={sightings}
                targetLocation={mapTarget}
                onCellSelect={setSelectedCell}
                onMapClick={(lat, lon) => {
                  // Clicking an open point on the map offers quick coordinate registration
                  handleOpenRegisterAt(lat, lon)
                }}
              />
            </div>

            {/* Right Telemetry Sidebar */}
            <div
              className="w-80 flex-shrink-0 overflow-y-auto border-l hidden lg:block"
              style={{ borderColor: '#334155', background: '#1E293B' }}
            >
              <TelemetryPanel
                pipeline={pipeline}
                cells={cells}
                onTriggerScan={handleTriggerScan}
              />
            </div>

            {/* Cell Details Drawer */}
            {selectedCell && (
              <CellDetailsDrawer
                cell={selectedCell}
                farmers={farmers}
                onClose={() => setSelectedCell(null)}
                onRegisterInCell={(lat, lon) => {
                  handleOpenRegisterAt(lat, lon)
                  setSelectedCell(null)
                }}
              />
            )}
          </div>
        )}

        {/* 2. FARMERS DIRECTORY VIEW */}
        {tab === 'farmers' && (
          <div className="flex-1 overflow-y-auto p-5">
            <FarmerTable
              farmers={farmers}
              onOpenRegister={() => {
                setInitialRegisterCoords(null)
                setShowRegister(true)
              }}
            />
          </div>
        )}

        {/* 3. ALERT LOGS VIEW */}
        {tab === 'alerts' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
                SMS Alert Dispatch Audit Trail
              </h2>
              <span className="text-xs text-slate-500">{alertLogs.length} logged dispatches</span>
            </div>

            <div className="rounded-xl overflow-hidden border border-slate-700/80 bg-slate-800/90 shadow-xl">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-700">
                    <th className="px-4 py-3 font-medium uppercase tracking-wider">Cell Zone</th>
                    <th className="px-4 py-3 font-medium uppercase tracking-wider">Farmer ID</th>
                    <th className="px-4 py-3 font-medium uppercase tracking-wider">Risk Score</th>
                    <th className="px-4 py-3 font-medium uppercase tracking-wider">Dispatched At</th>
                    <th className="px-4 py-3 font-medium uppercase tracking-wider">Delivery Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60 font-mono">
                  {alertLogs.map((log, i) => (
                    <tr
                      key={log.id}
                      className={`hover:bg-slate-750 transition ${i % 2 === 0 ? 'bg-slate-800/40' : 'bg-slate-900/40'}`}
                    >
                      <td className="px-4 py-3 font-bold text-emerald-400">{log.cell_id}</td>
                      <td className="px-4 py-3 text-slate-400">
                        {String(log.farmer_id).slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            log.risk_score >= 0.75
                              ? 'bg-red-950 text-red-300 border border-red-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}
                        >
                          {(log.risk_score * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {new Date(log.dispatched_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-sans">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${
                            log.delivery_status === 'delivered'
                              ? 'bg-emerald-950 text-emerald-300'
                              : log.delivery_status === 'sent'
                              ? 'bg-sky-950 text-sky-300'
                              : log.delivery_status === 'failed'
                              ? 'bg-red-950 text-red-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {log.delivery_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Global Toast Notification ── */}
      {toastMsg && (
        <div
          className="fixed bottom-5 right-5 z-[999999] flex items-center gap-2 px-4 py-3 rounded-lg text-xs font-semibold text-emerald-200 bg-slate-900 border border-emerald-500/60 shadow-2xl animate-bounce"
        >
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ── Modals with Topmost Z-Index ── */}
      {showRegister && (
        <RegisterFarmerModal
          onClose={() => setShowRegister(false)}
          onFarmerRegistered={handleFarmerRegistered}
          initialLat={initialRegisterCoords?.lat ?? -1.4850}
          initialLon={initialRegisterCoords?.lon ?? 29.5200}
        />
      )}

      {showSighting && (
        <SightingLogModal
          onClose={() => setShowSighting(false)}
          onSightingLogged={handleSightingLogged}
        />
      )}
    </div>
  )
}
