import { Bell, Users, AlertTriangle, Grid } from 'lucide-react'

interface Props {
  activeFarmers: number
  activeAlerts: number
  highRiskCells: number
  totalCells: number
}

interface CardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  accent: string
}

function Card({ icon, label, value, sub, accent }: CardProps) {
  return (
    <div
      className="flex items-center gap-4 rounded-lg px-5 py-3 flex-1"
      style={{ background: '#1E293B', border: '1px solid #334155' }}
    >
      <div className="rounded-lg p-2" style={{ background: `${accent}22` }}>
        <div style={{ color: accent }}>{icon}</div>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider" style={{ color: '#475569' }}>{label}</div>
        <div className="text-2xl font-bold font-mono" style={{ color: accent }}>{value}</div>
        {sub && <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>{sub}</div>}
      </div>
    </div>
  )
}

export default function MetricCards({ activeFarmers, activeAlerts, highRiskCells, totalCells }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
      <Card icon={<Users size={18} />}         label="Active Farmers"   value={activeFarmers}  accent="#10B981" />
      <Card icon={<Bell size={18} />}           label="Active Alerts"    value={activeAlerts}   accent="#F59E0B" />
      <Card icon={<AlertTriangle size={18} />}  label="High-Risk Cells"  value={highRiskCells}  accent="#EF4444" sub={`of ${totalCells} total`} />
      <Card icon={<Grid size={18} />}           label="Grid Cells"       value={totalCells}     accent="#38bdf8" sub="500m × 500m" />
    </div>
  )
}
