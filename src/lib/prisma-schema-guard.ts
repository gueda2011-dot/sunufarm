type PrismaLikeError = {
  code?: string
  message?: string
  meta?: {
    modelName?: string
    column?: string
  }
}

export function isMissingSchemaFeatureError(
  error: unknown,
  featureNames?: string[],
): boolean {
  if (typeof error !== "object" || error === null) return false

  const prismaError = error as PrismaLikeError
  const hasKnownMissingSchemaCode =
    prismaError.code === "P2021" || prismaError.code === "P2022"

  const normalizedMessage = prismaError.message?.toLowerCase() ?? ""
  const mentionsMissingSchema =
    normalizedMessage.includes("does not exist in the current database") ||
    normalizedMessage.includes("table does not exist") ||
    normalizedMessage.includes("colonne") ||
    normalizedMessage.includes("column")

  if (!hasKnownMissingSchemaCode && !mentionsMissingSchema) return false

  if (!featureNames || featureNames.length === 0) return true

  const candidates = [
    prismaError.meta?.modelName,
    prismaError.meta?.column,
    prismaError.message,
  ].filter((value): value is string => Boolean(value))

  return candidates.some((candidate) => {
    const normalizedCandidate = candidate.toLowerCase()

    return featureNames.some((featureName) => {
      const normalizedFeatureName = featureName.toLowerCase()
      return (
        normalizedCandidate === normalizedFeatureName ||
        normalizedCandidate.endsWith(`.${normalizedFeatureName}`) ||
        normalizedCandidate.includes(normalizedFeatureName)
      )
    })
  })
}

export const isMissingTableError = isMissingSchemaFeatureError
