import { parseFarmPermissions, type FarmRight } from "@/src/lib/permissions"

export function getAccessibleFarmIds(
  role: string,
  farmPermissions: unknown,
  right: FarmRight = "canRead",
): string[] | null {
  if (role === "SUPER_ADMIN" || role === "OWNER") return null
  if (role === "MANAGER" && right === "canRead") return null

  const permissions = parseFarmPermissions(farmPermissions)
  return permissions
    .filter((permission) => permission[right] === true)
    .map((permission) => permission.farmId)
}

export function getNextBatchNumber(
  year: number,
  lastBatchNumber: string | null | undefined,
): string {
  const prefix = `SF-${year}-`

  const nextSequence = lastBatchNumber?.startsWith(prefix)
    ? parseInt(lastBatchNumber.slice(prefix.length), 10) + 1
    : 1

  return `${prefix}${String(nextSequence).padStart(3, "0")}`
}
