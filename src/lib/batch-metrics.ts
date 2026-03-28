import { livingCount, mortalityRate } from "@/src/lib/kpi"

interface BatchOperationalSnapshotInput {
  entryDate: Date | string
  entryAgeDay: number
  entryCount: number
  status: string
  closedAt?: Date | string | null
  totalMortality: number
  now?: Date
}

interface BatchMissingSaisieInput {
  status: string
  entryDate: Date | string
  lastRecordDate?: Date | string | null
  now?: Date
}

export interface BatchOperationalSnapshot {
  ageDay: number
  liveCount: number
  totalMortality: number
  mortalityRatePct: number
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  return value instanceof Date ? value : new Date(value)
}

export function getBatchOperationalSnapshot(
  input: BatchOperationalSnapshotInput,
): BatchOperationalSnapshot {
  const now = input.now ?? new Date()
  const entryDate = toDate(input.entryDate) ?? now
  const closedAt = toDate(input.closedAt)

  const endDate = input.status === "ACTIVE"
    ? now
    : (closedAt ?? now)

  const ageDay = input.entryAgeDay + Math.max(
    0,
    Math.floor((endDate.getTime() - entryDate.getTime()) / 86_400_000),
  )

  return {
    ageDay,
    liveCount: livingCount(input.entryCount, input.totalMortality),
    totalMortality: input.totalMortality,
    mortalityRatePct: mortalityRate(input.totalMortality, input.entryCount) ?? 0,
  }
}

export function hasMissingBatchSaisie(
  input: BatchMissingSaisieInput,
): boolean {
  if (input.status !== "ACTIVE") return false

  const now = input.now ?? new Date()
  const entryDate = toDate(input.entryDate) ?? now
  const lastRecordDate = toDate(input.lastRecordDate)

  const daysSinceEntry = Math.floor(
    (now.getTime() - entryDate.getTime()) / 86_400_000,
  )

  if (daysSinceEntry <= 1) return false
  if (!lastRecordDate) return true

  const daysSinceLast = Math.floor(
    (now.getTime() - lastRecordDate.getTime()) / 86_400_000,
  )

  return daysSinceLast > 1
}
