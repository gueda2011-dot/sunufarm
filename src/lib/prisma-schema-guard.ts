type PrismaLikeError = {
  code?: string
  meta?: {
    modelName?: string
  }
}

export function isMissingTableError(
  error: unknown,
  modelNames?: string[],
): boolean {
  if (typeof error !== "object" || error === null) return false

  const prismaError = error as PrismaLikeError
  if (prismaError.code !== "P2021") return false

  if (!modelNames || modelNames.length === 0) return true
  return modelNames.includes(prismaError.meta?.modelName ?? "")
}
