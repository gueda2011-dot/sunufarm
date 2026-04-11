import { Lock } from "lucide-react"
import type { BatchType } from "@/src/generated/prisma/client"
import type { CommercialPlan } from "@/src/lib/offer-catalog"
import type { GateAccess } from "@/src/lib/gate-resolver"
import { formatMoneyFCFACompact, formatPercent } from "@/src/lib/formatters"
import { livingCount, mortalityRate } from "@/src/lib/kpi"

interface ProfitabilityPreviewCardProps {
  commercialPlan: CommercialPlan
  batchType: BatchType
  breakEvenAccess: GateAccess
  entryCount: number
  purchaseCostFcfa: number
  operationalCostFcfa: number
  totalMortality: number
  totalEggsProduced: number
  totalSellableEggs: number
  recordsCount: number
  expensesCount: number
  saleItemsCount: number
}

type PreviewStatus = "rentable" | "risque" | "incertain"

interface PreviewModel {
  status: PreviewStatus
  statusLabel: string
  statusClassName: string
  headline: string
  explanation: string
  pressureRangeLabel: string
  pressureCaption: string
  breakEvenPreviewLabel: string
  breakEvenPreviewCaption: string
  proBreakEvenCaption: string
  driverOne: string
  driverTwo: string
  driverThree: string
}

function roundDown(value: number, step: number): number {
  return Math.floor(value / step) * step
}

function roundUp(value: number, step: number): number {
  return Math.ceil(value / step) * step
}

function buildPreviewModel(props: ProfitabilityPreviewCardProps): PreviewModel {
  const liveCount = livingCount(props.entryCount, props.totalMortality)
  const mortalityRatePct = mortalityRate(props.totalMortality, props.entryCount)
  const totalObservedCostFcfa = props.purchaseCostFcfa + props.operationalCostFcfa
  const unitPressureFcfa = liveCount > 0 ? totalObservedCostFcfa / liveCount : null
  const hasSalesSignal = props.saleItemsCount > 0
  const hasExpenseSignal = props.expensesCount > 0
  const isLayerBatch = props.batchType === "PONDEUSE"

  let status: PreviewStatus = "incertain"
  if (liveCount === 0 || (mortalityRatePct != null && mortalityRatePct >= 8)) {
    status = "risque"
  } else if (hasSalesSignal && hasExpenseSignal && (mortalityRatePct == null || mortalityRatePct < 5)) {
    status = "rentable"
  }

  const rangeStep = props.batchType === "PONDEUSE" ? 25 : 100
  const rangeLow = unitPressureFcfa != null ? roundDown(unitPressureFcfa * 0.9, rangeStep) : null
  const rangeHigh = unitPressureFcfa != null ? roundUp(unitPressureFcfa * 1.1, rangeStep) : null

  const statusCopy: Record<PreviewStatus, { label: string; className: string; headline: string; explanation: string }> = {
    rentable: {
      label: "Signal rentable",
      className: "bg-green-100 text-green-800",
      headline: "Le lot commence a montrer un signal economique favorable.",
      explanation: "Les premieres donnees indiquent une base saine pour decider, mais la vraie marge reste reservee au plan Pro.",
    },
    risque: {
      label: "Signal de risque",
      className: "bg-red-100 text-red-700",
      headline: "Le lot montre deja une pression economique a surveiller.",
      explanation: "La mortalite ou la pression de cout peut peser sur la marge. Pro debloque la lecture exacte pour agir plus vite.",
    },
    incertain: {
      label: "Signal incertain",
      className: "bg-slate-100 text-slate-700",
      headline: "Le lot commence a accumuler assez de donnees pour une lecture decisionnelle.",
      explanation: "Vous voyez la tendance, mais pas encore la rentabilite exacte. Pro affiche la vraie marge et le vrai prix minimum.",
    },
  }

  const pressureRangeLabel =
    props.commercialPlan === "STARTER" && rangeLow != null && rangeHigh != null
      ? `${formatMoneyFCFACompact(rangeLow)} - ${formatMoneyFCFACompact(rangeHigh)}`
      : "Visible en Starter"

  const pressureCaption =
    props.commercialPlan === "STARTER"
      ? props.batchType === "PONDEUSE"
        ? "Zone estimative de pression de cout par poule vivante."
        : "Zone estimative de pression de cout par sujet vivant."
      : "Passez a Starter pour voir une fourchette estimative avant le calcul exact Pro."

  const starterBreakEvenValue = (() => {
    if (props.commercialPlan !== "STARTER") return "Visible en Starter"

    if (props.breakEvenAccess === "blocked") {
      return isLayerBatch ? "Apres saisies d oeufs" : "Apres plus de donnees"
    }

    if (isLayerBatch) {
      if (props.totalSellableEggs <= 0) return "Apres saisies d oeufs"

      const eggFloor = totalObservedCostFcfa / props.totalSellableEggs
      const low = roundDown(eggFloor * 0.9, 5)
      const high = roundUp(eggFloor * 1.1, 5)
      return `${formatMoneyFCFACompact(low)} - ${formatMoneyFCFACompact(high)} / oeuf`
    }

    if (liveCount <= 0) return "A confirmer"
    const liveFloor = totalObservedCostFcfa / liveCount
    const low = roundDown(liveFloor * 0.9, 100)
    const high = roundUp(liveFloor * 1.1, 100)
    return `${formatMoneyFCFACompact(low)} - ${formatMoneyFCFACompact(high)} / sujet`
  })()

  const breakEvenPreviewCaption =
    props.commercialPlan === "STARTER"
      ? props.breakEvenAccess === "blocked"
        ? isLayerBatch
          ? props.totalEggsProduced > 0
            ? "Ajoutez plus de saisies d oeufs vendables pour estimer un vrai prix minimum de vente."
            : "Ajoutez des saisies d oeufs pour estimer un vrai prix minimum de vente."
          : "Continuez la saisie pour fiabiliser le prix minimum."
        : isLayerBatch
          ? `Fourchette estimative du prix minimum par oeuf vendable, sur ${props.totalSellableEggs} oeuf${props.totalSellableEggs > 1 ? "s" : ""} vendable${props.totalSellableEggs > 1 ? "s" : ""}.`
          : "Fourchette estimative du prix minimum par sujet vivant."
      : "Passez a Starter pour voir une fourchette estimative avant la valeur exacte Pro."

  const proBreakEvenCaption =
    isLayerBatch
      ? "Prix minimum exact par oeuf et par plateau, sans approximation."
      : "Prix minimum exact par poulet vivant, sans approximation."

  return {
    status,
    statusLabel: statusCopy[status].label,
    statusClassName: statusCopy[status].className,
    headline: statusCopy[status].headline,
    explanation: statusCopy[status].explanation,
    pressureRangeLabel,
    pressureCaption,
    breakEvenPreviewLabel: starterBreakEvenValue,
    breakEvenPreviewCaption,
    proBreakEvenCaption,
    driverOne: `${formatMoneyFCFACompact(totalObservedCostFcfa)} de charges observees`,
    driverTwo:
      mortalityRatePct != null
        ? `${formatPercent(mortalityRatePct)} de mortalite cumulee`
        : "Mortalite encore peu lisible",
    driverThree:
      hasSalesSignal
        ? `${props.saleItemsCount} ligne${props.saleItemsCount > 1 ? "s" : ""} de vente deja saisie${props.saleItemsCount > 1 ? "s" : ""}`
        : `${props.recordsCount} jour${props.recordsCount > 1 ? "s" : ""} de saisie pour preparer la lecture economique`,
  }
}

export function ProfitabilityPreviewCard(props: ProfitabilityPreviewCardProps) {
  const preview = buildPreviewModel(props)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Rentabilite
        </h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${preview.statusClassName}`}>
          {preview.statusLabel}
        </span>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-base font-semibold text-gray-900">{preview.headline}</p>
        <p className="mt-2 text-sm text-gray-700">{preview.explanation}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Apercu gratuit
            </div>
            <div className="mt-2 text-lg font-semibold text-slate-900">
              {preview.statusLabel}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Lecture simple pour sentir si le lot est plutot favorable, a risque ou encore incertain.
            </p>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Apercu Starter
            </div>
            <div className="mt-2 text-lg font-semibold text-blue-900">
              {preview.pressureRangeLabel}
            </div>
            <p className="mt-1 text-xs text-blue-800">
              {preview.pressureCaption}
            </p>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Lecture Pro
            </div>
            <div className="mt-2 select-none text-lg font-semibold text-amber-950 blur-sm">
              +450 000 FCFA
            </div>
            <p className="mt-1 select-none text-xs text-amber-800 blur-sm">
              Marge nette reelle, cout unitaire exact et prix minimum de vente.
            </p>
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-amber-50/60">
              <Lock className="h-5 w-5 text-amber-600" aria-hidden="true" />
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Prix minimum de vente
              </p>
              <p className="mt-1 text-sm text-amber-900">
                Cette lecture devient premium des que l utilisateur veut un vrai repere terrain pour vendre sans perdre.
              </p>
            </div>
            <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-amber-800">
              {props.breakEvenAccess === "blocked" ? "Preparation" : "Decision preview"}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Apercu gratuit
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-900">
                {props.breakEvenAccess === "blocked" ? "A preparer" : "A confirmer"}
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Signal simple pour savoir si le prix minimum commence a devenir lisible.
              </p>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Apercu Starter
              </div>
              <div className="mt-2 text-lg font-semibold text-blue-900">
                {preview.breakEvenPreviewLabel}
              </div>
              <p className="mt-1 text-xs text-blue-800">
                {preview.breakEvenPreviewCaption}
              </p>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-amber-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Lecture Pro
              </div>
              <div className="mt-2 select-none text-lg font-semibold text-amber-950 blur-sm">
                1 250 FCFA
              </div>
              <p className="mt-1 select-none text-xs text-amber-800 blur-sm">
                {preview.proBreakEvenCaption}
              </p>
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/60">
                <Lock className="h-5 w-5 text-amber-600" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700">
            {preview.driverOne}
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700">
            {preview.driverTwo}
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700">
            {preview.driverThree}
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Cette zone montre une decision preview. Pro sert a transformer le signal en decision de vente precise.
        </p>
      </div>
    </div>
  )
}
