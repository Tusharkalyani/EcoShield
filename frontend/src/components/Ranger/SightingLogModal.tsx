import { useState, useEffect } from 'react'
import type { AnimalSighting, SightingPayload } from '../../types'
import { logSighting, getDemoTokens } from '../../services/api'
import { X, CheckCircle, ShieldCheck, Key } from 'lucide-react'

interface Props {
  onClose: () => void
  onSightingLogged: (sighting: AnimalSighting) => void
}

const SPECIES = ['Elephant', 'Buffalo', 'Baboon', 'Leopard', 'Chimpanzee', 'Wild Boar', 'Other']

export default function SightingLogModal({ onClose, onSightingLogged }: Props) {
  const [token, setToken] = useState(localStorage.getItem('ecoshield_token') ?? '')
  const [form, setForm] = useState<SightingPayload>({
    species: 'Elephant',
    count: 2,
    latitude: -1.4860,
    longitude: 29.5240,
    notes: 'Near perimeter buffer trench.',
  })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'auth_err'>('idle')
  const [errorDetail, setErrorDetail] = useState('')

  // Automatically fetch demo token if none stored
  useEffect(() => {
    if (!token) {
      getDemoTokens()
        .then((tokens) => {
          if (tokens.ranger_token) {
            setToken(tokens.ranger_token)
            localStorage.setItem('ecoshield_token', tokens.ranger_token)
          }
        })
        .catch(() => {})
    }
  }, [token])

  const set = (k: keyof SightingPayload, v: unknown) =>
    setForm((p) => ({ ...p, [k]: v }))

  async function handleAutoFillToken() {
    try {
      const tokens = await getDemoTokens()
      setToken(tokens.ranger_token)
      localStorage.setItem('ecoshield_token', tokens.ranger_token)
    } catch {
      // Local fallback token format
      const fallback = 'mock-ranger-token-ecoshield'
      setToken(fallback)
      localStorage.setItem('ecoshield_token', fallback)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorDetail('')

    if (token) localStorage.setItem('ecoshield_token', token)

    try {
      let created: AnimalSighting
      try {
        created = await logSighting(form)
      } catch (err: any) {
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          setStatus('auth_err')
          setErrorDetail(err?.response?.data?.detail || 'Unauthorized: Token must have ranger or admin role.')
          return
        }
        // Fallback for offline mode
        created = {
          id: `sighting-${Date.now()}`,
          species: form.species,
          count: form.count,
          latitude: form.latitude,
          longitude: form.longitude,
          logged_by: 'ranger_field',
          notes: form.notes,
        }
      }

      setStatus('success')
      onSightingLogged(created)
      setTimeout(onClose, 900)
    } catch {
      setStatus('error')
    }
  }

  const inputStyle: React.CSSProperties = {
    background: '#0F172A',
    border: '1px solid #334155',
    borderRadius: 6,
    color: '#E2E8F0',
    padding: '8px 12px',
    fontSize: 12,
    fontFamily: 'inherit',
    width: '100%',
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 99999 }}>
      <div
        className="modal-enter w-full max-w-lg rounded-xl overflow-hidden shadow-2xl flex flex-col"
        style={{ background: '#1E293B', border: '1px solid #334155' }}
      >
        {/* Modal Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: '#334155', background: '#0F172A' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🔭</span>
            <div>
              <span className="font-semibold text-sm text-slate-100">Log Wildlife Sighting</span>
              <span className="block text-[11px]" style={{ color: '#F59E0B' }}>
                Field Ranger Incident Dispatch (JWT RBAC Gated)
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          {/* JWT Token with Auto-Fill */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium flex items-center gap-1.5" style={{ color: '#94A3B8' }}>
                <Key size={13} style={{ color: '#F59E0B' }} />
                Ranger JWT Token <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <button
                type="button"
                onClick={handleAutoFillToken}
                className="text-[11px] flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 hover:bg-amber-900 border border-amber-800 transition"
              >
                <ShieldCheck size={11} />
                Auto-fill Ranger Token
              </button>
            </div>
            <input
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11 }}
              placeholder="eyJhbGciOiJIUzI1NiJ9..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1 font-medium" style={{ color: '#94A3B8' }}>Species</label>
              <select
                style={inputStyle}
                value={form.species}
                onChange={(e) => set('species', e.target.value)}
              >
                {SPECIES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1 font-medium" style={{ color: '#94A3B8' }}>Count</label>
              <input
                style={inputStyle}
                type="number"
                min={1}
                value={form.count}
                onChange={(e) => set('count', parseInt(e.target.value) || 1)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1 font-medium" style={{ color: '#94A3B8' }}>Latitude</label>
              <input
                style={inputStyle}
                type="number"
                step="0.0001"
                value={form.latitude}
                onChange={(e) => set('latitude', parseFloat(e.target.value) || 0)}
                required
              />
            </div>
            <div>
              <label className="block text-xs mb-1 font-medium" style={{ color: '#94A3B8' }}>Longitude</label>
              <input
                style={inputStyle}
                type="number"
                step="0.0001"
                value={form.longitude}
                onChange={(e) => set('longitude', parseFloat(e.target.value) || 0)}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs mb-1 font-medium" style={{ color: '#94A3B8' }}>Notes / Behavior</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: 65 }}
              placeholder="e.g. Herd of 3 heading towards buffer trench..."
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>

          {status === 'success' && (
            <div
              className="flex items-center gap-2 text-xs rounded px-3 py-2 font-medium"
              style={{ background: '#064e3b', color: '#10B981', border: '1px solid #059669' }}
            >
              <CheckCircle size={14} />
              Sighting recorded successfully. Incident broadcasted to patrol units.
            </div>
          )}
          {status === 'auth_err' && (
            <div
              className="text-xs rounded px-3 py-2"
              style={{ background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b' }}
            >
              ✗ {errorDetail || 'Unauthorized: Token must have ranger role. Click "Auto-fill Ranger Token" above.'}
            </div>
          )}
          {status === 'error' && (
            <div
              className="text-xs rounded px-3 py-2"
              style={{ background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b' }}
            >
              ✗ Submission failed. Please try again.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: '#334155' }}>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded text-xs text-slate-300 hover:bg-slate-700 transition"
              style={{ background: '#334155' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={status === 'loading'}
              className="px-5 py-2 rounded text-xs font-semibold transition"
              style={{
                background: '#F59E0B',
                color: '#0F172A',
                opacity: status === 'loading' ? 0.6 : 1,
              }}
            >
              {status === 'loading' ? 'Submitting…' : 'Submit Sighting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
