import { useState } from 'react'
import type { Farmer } from '../../types'
import { CheckCircle, XCircle, Search, UserPlus, MapPin } from 'lucide-react'

interface Props {
  farmers: Farmer[]
  onOpenRegister?: () => void
}

export default function FarmerTable({ farmers, onOpenRegister }: Props) {
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')

  const filtered = farmers.filter((f) => {
    const matchesSearch =
      f.village_sector.toLowerCase().includes(search.toLowerCase()) ||
      (f.phone_masked && f.phone_masked.includes(search)) ||
      f.id.toLowerCase().includes(search.toLowerCase())

    if (filterActive === 'active') return matchesSearch && f.is_active
    if (filterActive === 'inactive') return matchesSearch && !f.is_active
    return matchesSearch
  })

  return (
    <div className="space-y-3">
      {/* Table Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Search Input */}
          <div className="relative flex-1 sm:w-64">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search sector, phone, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="text-xs text-slate-500 font-mono">
            Showing {filtered.length} of {farmers.length} farmers
          </span>
          {onOpenRegister && (
            <button
              type="button"
              onClick={onOpenRegister}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition"
            >
              <UserPlus size={13} />
              Register Farmer Plot
            </button>
          )}
        </div>
      </div>

      {/* Directory Table */}
      <div className="rounded-xl overflow-hidden border border-slate-700/80 bg-slate-800/90 shadow-xl">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-700">
              <th className="px-4 py-3 font-medium uppercase tracking-wider">Farmer ID</th>
              <th className="px-4 py-3 font-medium uppercase tracking-wider">Village / Sector</th>
              <th className="px-4 py-3 font-medium uppercase tracking-wider">GPS Coordinates</th>
              <th className="px-4 py-3 font-medium uppercase tracking-wider">Phone (Encrypted)</th>
              <th className="px-4 py-3 font-medium uppercase tracking-wider">Alert Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60 font-mono">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No registered farmers match your filter criteria.
                </td>
              </tr>
            ) : (
              filtered.map((f, i) => (
                <tr
                  key={f.id}
                  className={`hover:bg-slate-750 transition ${i % 2 === 0 ? 'bg-slate-800/40' : 'bg-slate-900/40'}`}
                >
                  <td className="px-4 py-3 text-slate-400">
                    {f.id.startsWith('local-') ? f.id : `${f.id.slice(0, 8)}…`}
                  </td>
                  <td className="px-4 py-3 font-sans font-medium text-slate-200">
                    🌾 {f.village_sector}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    <span className="flex items-center gap-1">
                      <MapPin size={11} className="text-emerald-500" />
                      {f.latitude.toFixed(4)}, {f.longitude.toFixed(4)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {f.phone_masked || '••••••••'}
                  </td>
                  <td className="px-4 py-3 font-sans">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                        f.is_active
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {f.is_active ? (
                        <>
                          <CheckCircle size={11} className="text-emerald-400" />
                          Enrolled
                        </>
                      ) : (
                        <>
                          <XCircle size={11} className="text-slate-500" />
                          Inactive
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
