import type { SystemHealth } from '../../types'
import { Shield, Wifi, WifiOff, AlertTriangle } from 'lucide-react'

interface Props {
  health: SystemHealth
  onLogSighting: () => void
}

function Pill({ label, up, title }: { label: string; up: boolean; title?: string }) {
  return (
    <div
      title={title}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer"
      style={{
        background: up ? '#064e3b' : '#7f1d1d',
        color: up ? '#10B981' : '#fca5a5',
        border: `1px solid ${up ? '#065f46' : '#991b1b'}`,
      }}
    >
      {up ? <Wifi size={10} /> : <WifiOff size={10} />}
      {label}
    </div>
  )
}

export default function Header({ health, onLogSighting }: Props) {
  return (
    <header
      className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0"
      style={{ background: '#1E293B', borderColor: '#334155' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg p-1.5" style={{ background: '#064e3b' }}>
          <Shield size={18} style={{ color: '#10B981' }} />
        </div>
        <div>
          <div className="font-bold text-sm tracking-widest uppercase" style={{ color: '#10B981' }}>
            EcoShield
          </div>
          <div className="text-xs" style={{ color: '#475569' }}>
            Predictive Wildlife Defense Platform
          </div>
        </div>
      </div>

      {/* Health pills */}
      <div className="hidden md:flex items-center gap-2">
        <Pill label="API"      up={health.api} title={health.api ? "API Online" : "API Offline"} />
        <Pill label="PostGIS"  up={health.postgis} title={health.postgis ? "PostGIS Connected" : "PostGIS Offline (Using in-memory cache)"} />
        <Pill label="Celery"   up={health.celery} title={health.celery ? "Celery Worker Active" : "Celery Offline"} />
        <Pill label="Redis"    up={health.redis} title={health.redis ? "Redis Cache Online" : "Redis Offline"} />
        <Pill
          label="GEE"
          up={health.gee}
          title={health.gee ? "Google Earth Engine: Authenticated & Live" : (health.gee_message || "GEE Project Registration Needed")}
        />
      </div>

      {/* Action */}
      <button
        onClick={onLogSighting}
        className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold transition"
        style={{ background: '#78350f', color: '#fcd34d', border: '1px solid #92400e' }}
      >
        <AlertTriangle size={12} />
        Log Sighting
      </button>
    </header>
  )
}
