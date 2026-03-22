/**
 * SunuFarm — Section santé du détail d'un lot
 *
 * Affiche les 10 dernières vaccinations et les 10 derniers traitements.
 * Composant de présentation pur — pas de fetch, données passées en props.
 *
 * Vaccinations : Date | Jour âge | Vaccin | Voie | Sujets vaccinés
 * Traitements  : Date | Médicament | Indication | Durée | Sujets traités
 */

import { formatDate } from "@/src/lib/formatters"
import type {
  VaccinationSummary,
  TreatmentSummary,
} from "@/src/actions/health"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HealthSectionProps {
  vaccinations: VaccinationSummary[]
  treatments:   TreatmentSummary[]
  batchId:      string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HealthSection({
  vaccinations,
  treatments,
}: HealthSectionProps) {
  const hasHealth = vaccinations.length > 0 || treatments.length > 0

  if (!hasHealth) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Santé
        </h2>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">
          Aucune vaccination ni traitement enregistré.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* ── Titre section ────────────────────────────────────────────── */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Santé
      </h2>

      {/* ── Vaccinations ─────────────────────────────────────────────── */}
      {vaccinations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-gray-500">
            Vaccinations ({vaccinations.length})
          </h3>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Vaccin</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400">J. âge</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400">Sujets</th>
                  </tr>
                </thead>
                <tbody>
                  {vaccinations.map((v, i) => (
                    <tr
                      key={v.id}
                      className={i < vaccinations.length - 1 ? "border-b border-gray-50" : ""}
                    >
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                        {formatDate(v.date)}
                      </td>
                      <td className="px-4 py-2.5 text-gray-800">
                        <div className="font-medium">{v.vaccineName}</div>
                        {v.route && (
                          <div className="text-xs text-gray-400">{v.route}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums whitespace-nowrap">
                        J. {v.batchAgeDay}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums whitespace-nowrap">
                        {v.countVaccinated.toLocaleString("fr-SN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Traitements ──────────────────────────────────────────────── */}
      {treatments.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-gray-500">
            Traitements ({treatments.length})
          </h3>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Début</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Médicament</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400">Durée</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400">Fin</th>
                  </tr>
                </thead>
                <tbody>
                  {treatments.map((t, i) => (
                    <tr
                      key={t.id}
                      className={i < treatments.length - 1 ? "border-b border-gray-50" : ""}
                    >
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                        {formatDate(t.startDate)}
                      </td>
                      <td className="px-4 py-2.5 text-gray-800">
                        <div className="font-medium">{t.medicineName}</div>
                        {t.indication && (
                          <div className="text-xs text-gray-400 truncate max-w-[160px]">
                            {t.indication}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums whitespace-nowrap">
                        {t.durationDays != null ? `${t.durationDays} j.` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 whitespace-nowrap">
                        {t.endDate ? formatDate(t.endDate) : (
                          <span className="text-orange-500 font-medium">En cours</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
