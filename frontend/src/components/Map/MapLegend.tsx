import { useMap } from 'react-leaflet'
import { useEffect, useRef } from 'react'
import L from 'leaflet'

export default function MapLegend() {
  const map = useMap()
  const ref = useRef<L.Control | null>(null)

  useEffect(() => {
    if (ref.current) return
    const legend = new L.Control({ position: 'bottomleft' })
    legend.onAdd = () => {
      const div = L.DomUtil.create('div')
      div.style.cssText = `
        background:#1E293B;border:1px solid #334155;border-radius:8px;
        padding:10px 14px;font-family:monospace;font-size:11px;color:#E2E8F0;
        min-width:140px;
      `
      div.innerHTML = `
        <div style="font-weight:600;margin-bottom:8px;color:#94A3B8;text-transform:uppercase;letter-spacing:.08em;">Risk Level</div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:#EF4444"></span> High ≥ 75%
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:#F59E0B"></span> Med 45–74%
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:#10B981"></span> Low &lt; 45%
        </div>
      `
      return div
    }
    legend.addTo(map)
    ref.current = legend
    return () => { legend.remove(); ref.current = null }
  }, [map])

  return null
}
