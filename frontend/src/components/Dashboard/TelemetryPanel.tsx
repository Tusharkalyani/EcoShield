import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { GridCell, PipelineStatus } from '../../types'
import { Clock, Loader2, Sparkles } from 'lucide-react'

interface Props {
  pipeline: PipelineStatus
  cells: GridCell[]
  onTriggerScan?: () => Promise<void>
}

const BUCKETS = [
  { label: '0–25%', min: 0,    max: 0.25, color: '#10B981' },
  { label: '25–50%', min: 0.25, max: 0.50, color: '#34d399' },
  { label: '50–75%', min: 0.50, max: 0.75, color: '#F59E0B' },
  { label: '75–100%', min: 0.75, max: 1.01, color: '#EF4444' },
]

function statusColor(s: PipelineStatus['status']) {
  return s === 'completed' ? '#10B981' : s === 'running' ? '#38bdf8' : s === 'error' ? '#EF4444' : '#94A3B8'
}

export default function TelemetryPanel({ pipeline, cells, onTriggerScan }: Props) {
  const [scanning, setScanning] = useState(false)

  const chartData = BUCKETS.map((b) => ({
    name: b.label,
    count: cells.filter((c) => c.risk_score >= b.min && c.risk_score < b.max).length,
    color: b.color,
  }))

  const lastRun = pipeline.last_run ? new Date(pipeline.last_run).toLocaleTimeString() : 'Never'

  async function handleScan() {
    if (!onTriggerScan || scanning) return
    setScanning(true)
    try {
      await onTriggerScan()
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Manual Trigger Button */}
      {onTriggerScan && (
        <button
          type="button"
          onClick={handleScan}
          disabled={scanning}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-950/40 transition disabled:opacity-60"
        >
          {scanning ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Running Spatial ML Scan…
            </>
          ) : (
            <>
              <Sparkles size={14} />
              Run 500m Prediction Scan
            </>
          )}
        </button>
      )}

      {/* Pipeline status */}
      <div>
        <div className="text-[11px] uppercase tracking-widest font-semibold mb-2" style={{ color: '#64748b' }}>
          ML Pipeline Status
        </div>
        <div className="rounded-lg p-3 space-y-2 text-xs" style={{ background: '#0F172A', border: '1px solid #334155' }}>
          <div className="flex justify-between items-center">
            <span style={{ color: '#94A3B8' }}>Status</span>
            <span className="font-bold font-mono capitalize" style={{ color: statusColor(pipeline.status) }}>
              {pipeline.status}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span style={{ color: '#94A3B8' }}>Last Run</span>
            <span className="font-mono text-slate-300">{lastRun}</span>
          </div>
          <div className="flex justify-between items-center">
            <span style={{ color: '#94A3B8' }}>Cells Scored</span>
            <span className="font-mono" style={{ color: '#38bdf8' }}>{cells.length}</span>
          </div>
          <div className="flex justify-between items-center">
            <span style={{ color: '#94A3B8' }}>Alerts Sent</span>
            <span className="font-mono" style={{ color: '#10B981' }}>{pipeline.alerts_sent}</span>
          </div>
          <div className="flex justify-between items-center">
            <span style={{ color: '#94A3B8' }}>Alerts Failed</span>
            <span className="font-mono" style={{ color: '#EF4444' }}>{pipeline.alerts_failed}</span>
          </div>
        </div>
      </div>

      {/* Risk distribution histogram */}
      <div>
        <div className="text-[11px] uppercase tracking-widest font-semibold mb-2" style={{ color: '#64748b' }}>
          Risk Distribution
        </div>
        <div style={{ height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barSize={24} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 6, fontSize: 11 }}
                labelStyle={{ color: '#94A3B8' }}
                itemStyle={{ color: '#E2E8F0' }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Scheduled job pill */}
      <div>
        <div className="text-[11px] uppercase tracking-widest font-semibold mb-2" style={{ color: '#64748b' }}>
          Celery Beat Schedule
        </div>
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: '#0F172A', border: '1px solid #334155' }}>
          <Clock size={13} style={{ color: '#38bdf8' }} />
          <span style={{ color: '#94A3B8' }}>Batch alerts daily at</span>
          <span className="font-mono font-bold" style={{ color: '#38bdf8' }}>04:00 AM</span>
        </div>
      </div>
    </div>
  )
}
