export type BatchVaccinationPlanLink = {
  planId: string | null
}

export type VaccinationPlanningStatus = "A_FAIRE" | "EN_RETARD" | "FAIT"

export type VaccinationPlanItemLike = {
  id: string
  dayOfAge: number
  vaccineName: string
  route: string | null
  dose: string | null
  notes: string | null
}

export type VaccinationPlanLike = {
  id: string
  name: string
  items: VaccinationPlanItemLike[]
}

export type VaccinationRecordLike = {
  id: string
  batchId: string
  date: Date
  vaccineName: string
}

export type PlannedVaccinationOccurrence = {
  planId: string
  planItemId: string
  batchId: string
  vaccineName: string
  route: string | null
  dose: string | null
  targetDayOfAge: number
  plannedDate: Date
  status: VaccinationPlanningStatus
  matchedVaccinationId: string | null
  matchedVaccinationDate: Date | null
  isEarly: boolean
  isLate: boolean
  notes: string | null
}

const BATCH_VACCINATION_PLAN_TAG_PATTERN =
  /^\[BATCH_VACCINATION_PLAN:(OFF|[^\]\r\n]+)\]\s*/i

const EARLY_WINDOW_DAYS = 2
const LATE_WINDOW_DAYS = 3

export function buildBatchNotesWithVaccinationPlan(
  link: BatchVaccinationPlanLink,
  notes?: string | null,
) {
  const trimmed = stripBatchVaccinationPlanFromNotes(notes)?.trim()
  const tag = link.planId
    ? `[BATCH_VACCINATION_PLAN:${link.planId}]`
    : "[BATCH_VACCINATION_PLAN:OFF]"

  return trimmed ? `${tag}\n${trimmed}` : tag
}

export function parseBatchVaccinationPlanLink(
  notes: string | null | undefined,
): BatchVaccinationPlanLink {
  if (!notes) {
    return { planId: null }
  }

  const match = notes.match(BATCH_VACCINATION_PLAN_TAG_PATTERN)
  const raw = match?.[1]

  if (!raw || raw.toUpperCase() === "OFF") {
    return { planId: null }
  }

  return { planId: raw }
}

export function stripBatchVaccinationPlanFromNotes(
  notes: string | null | undefined,
) {
  if (!notes) return null
  const cleaned = notes.replace(BATCH_VACCINATION_PLAN_TAG_PATTERN, "").trim()
  return cleaned.length > 0 ? cleaned : null
}

export function normalizeVaccineName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function diffDateOnlyInDays(a: Date, b: Date) {
  const utcA = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())
  const utcB = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())
  return Math.round((utcA - utcB) / 86_400_000)
}

function isWithinWindow(actualDate: Date, plannedDate: Date) {
  const diff = diffDateOnlyInDays(actualDate, plannedDate)
  return diff >= -EARLY_WINDOW_DAYS && diff <= LATE_WINDOW_DAYS
}

export function buildPlannedVaccinationOccurrences(args: {
  batchId: string
  entryDate: Date
  entryAgeDay: number
  now: Date
  plan: VaccinationPlanLike
  vaccinations: VaccinationRecordLike[]
}) {
  const { batchId, entryDate, entryAgeDay, now, plan, vaccinations } = args
  const usedVaccinationIds = new Set<string>()
  const sortedVaccinations = [...vaccinations].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  )

  return [...plan.items]
    .sort((a, b) => a.dayOfAge - b.dayOfAge)
    .map<PlannedVaccinationOccurrence>((item) => {
      const plannedDate = addDays(entryDate, item.dayOfAge - entryAgeDay)
      const normalizedExpected = normalizeVaccineName(item.vaccineName)

      const candidates = sortedVaccinations
        .filter((vaccination) => !usedVaccinationIds.has(vaccination.id))
        .filter(
          (vaccination) =>
            normalizeVaccineName(vaccination.vaccineName) === normalizedExpected,
        )
        .filter((vaccination) => isWithinWindow(vaccination.date, plannedDate))
        .sort((left, right) => {
          const leftDelta = Math.abs(diffDateOnlyInDays(left.date, plannedDate))
          const rightDelta = Math.abs(diffDateOnlyInDays(right.date, plannedDate))
          if (leftDelta !== rightDelta) return leftDelta - rightDelta
          return left.date.getTime() - right.date.getTime()
        })

      const matched = candidates[0] ?? null

      if (matched) {
        usedVaccinationIds.add(matched.id)
      }

      const matchedDiff = matched
        ? diffDateOnlyInDays(matched.date, plannedDate)
        : null
      const overdueThreshold = addDays(plannedDate, LATE_WINDOW_DAYS)
      const status: VaccinationPlanningStatus = matched
        ? "FAIT"
        : now.getTime() > overdueThreshold.getTime()
          ? "EN_RETARD"
          : "A_FAIRE"

      return {
        planId: plan.id,
        planItemId: item.id,
        batchId,
        vaccineName: item.vaccineName,
        route: item.route,
        dose: item.dose,
        targetDayOfAge: item.dayOfAge,
        plannedDate,
        status,
        matchedVaccinationId: matched?.id ?? null,
        matchedVaccinationDate: matched?.date ?? null,
        isEarly: matchedDiff !== null ? matchedDiff < 0 : false,
        isLate: matchedDiff !== null ? matchedDiff > 0 : false,
        notes: item.notes,
      }
    })
}
