/**
 * Regles pures autour des saisies journalieres.
 * Extraites des Server Actions pour pouvoir etre testees sans Prisma ni auth.
 */

export function isDailyRecordLocked(
  recordDate: Date,
  lockedAt: Date | null,
  now = new Date(),
): boolean {
  if (lockedAt) return true

  const lockThreshold = new Date(
    Date.UTC(
      recordDate.getUTCFullYear(),
      recordDate.getUTCMonth(),
      recordDate.getUTCDate() + 2,
    ),
  )

  return now.getTime() >= lockThreshold.getTime()
}

export function toUtcDate(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
}
