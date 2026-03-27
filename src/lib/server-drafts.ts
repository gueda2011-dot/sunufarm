export const MAX_FORM_DRAFT_BYTES = 50_000

export function sanitizeDraftPayload<T extends Record<string, unknown>>(payload: T): T {
  return JSON.parse(JSON.stringify(payload)) as T
}

export function getDraftPayloadSize(payload: unknown): number {
  return Buffer.byteLength(JSON.stringify(payload), "utf8")
}

export function isDraftPayloadTooLarge(payload: unknown): boolean {
  return getDraftPayloadSize(payload) > MAX_FORM_DRAFT_BYTES
}
