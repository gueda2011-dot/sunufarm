import type { BatchType } from "@/src/generated/prisma/client"
import { getVaccinationSuggestions } from "@/src/lib/health-guidance"

export interface BatchMortalityFeatureInput {
  batchId: string
  batchType: BatchType
  entryCount: number
  entryDate: Date
  entryAgeDay: number
  dailyRecords: Array<{ date: Date; mortality: number }>
  vaccinationRecords: Array<{ vaccineName: string }>
  treatmentRecords: Array<{ startDate: Date; endDate: Date | null }>
  now?: Date
  recentWindowDays?: number
}

export interface BatchMortalityFeatures {
  batchId: string
  batchType: BatchType
  ageDay: number
  recentWindowDays: number
  previousWindowDays: number
  recentMortality: number
  previousMortality: number
  recentMortalityRate: number
  previousMortalityRate: number
  recentAverageDailyMortalityRate: number
  mortalityAcceleration: number
  activeTreatments: number
  overdueVaccines: number
  dueVaccines: number
  missingDailyRecords: number
  missingSinceDays: number | null
  lastRecordDate: Date | null
  observedRecentDays: number
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function diffDaysUtc(from: Date, to: Date): number {
  return Math.floor((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / 86_400_000)
}

function clamp0(value: number): number {
  return Math.max(0, value)
}

export function computeBatchMortalityFeatures(
  input: BatchMortalityFeatureInput,
): BatchMortalityFeatures {
  const now = input.now ?? new Date()
  const recentWindowDays = input.recentWindowDays ?? 7
  const previousWindowDays = recentWindowDays
  const today = startOfUtcDay(now)
  const recentStart = new Date(today)
  recentStart.setUTCDate(recentStart.getUTCDate() - (recentWindowDays - 1))
  const previousStart = new Date(recentStart)
  previousStart.setUTCDate(previousStart.getUTCDate() - previousWindowDays)

  const ageDay = input.entryAgeDay + Math.max(0, diffDaysUtc(input.entryDate, now))
  const recentRecords = input.dailyRecords.filter((record) => (
    startOfUtcDay(record.date) >= recentStart && startOfUtcDay(record.date) <= today
  ))
  const previousRecords = input.dailyRecords.filter((record) => {
    const day = startOfUtcDay(record.date)
    return day >= previousStart && day < recentStart
  })

  const recentMortality = recentRecords.reduce((sum, record) => sum + clamp0(record.mortality), 0)
  const previousMortality = previousRecords.reduce((sum, record) => sum + clamp0(record.mortality), 0)

  const recentObservedDays = new Set(recentRecords.map((record) => startOfUtcDay(record.date).toISOString())).size
  const daysSinceEntry = Math.max(0, diffDaysUtc(input.entryDate, now) + 1)
  const expectedRecentDays = Math.min(recentWindowDays, daysSinceEntry)
  const missingDailyRecords = Math.max(0, expectedRecentDays - recentObservedDays)

  const lastRecordDate = input.dailyRecords
    .map((record) => record.date)
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null

  const missingSinceDays = lastRecordDate
    ? Math.max(0, diffDaysUtc(lastRecordDate, now))
    : expectedRecentDays > 0 ? daysSinceEntry : null

  const recentMortalityRate = input.entryCount > 0 ? recentMortality / input.entryCount : 0
  const previousMortalityRate = input.entryCount > 0 ? previousMortality / input.entryCount : 0
  const recentAverageDailyMortalityRate = recentWindowDays > 0 ? recentMortalityRate / recentWindowDays : 0
  const mortalityAcceleration = recentMortalityRate - previousMortalityRate

  const activeTreatments = input.treatmentRecords.filter((record) => {
    if (record.startDate > now) return false
    return !record.endDate || startOfUtcDay(record.endDate) >= today
  }).length

  const vaccineSuggestions = getVaccinationSuggestions({
    batchType: input.batchType,
    ageDay,
    recordedVaccines: input.vaccinationRecords.map((record) => record.vaccineName),
  })

  const overdueVaccines = vaccineSuggestions.filter((item) => item.status === "overdue").length
  const dueVaccines = vaccineSuggestions.filter((item) => item.status === "due").length

  return {
    batchId: input.batchId,
    batchType: input.batchType,
    ageDay,
    recentWindowDays,
    previousWindowDays,
    recentMortality,
    previousMortality,
    recentMortalityRate,
    previousMortalityRate,
    recentAverageDailyMortalityRate,
    mortalityAcceleration,
    activeTreatments,
    overdueVaccines,
    dueVaccines,
    missingDailyRecords,
    missingSinceDays,
    lastRecordDate,
    observedRecentDays: recentObservedDays,
  }
}
