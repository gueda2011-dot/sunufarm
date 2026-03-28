import { NextResponse } from "next/server"
import type { ActionResult } from "@/src/lib/action-result"

export function apiSuccess<T>(
  data: T,
  init?: ResponseInit,
) {
  return NextResponse.json(
    { success: true, data },
    init,
  )
}

export function apiError(
  error: string,
  init?: ResponseInit & { code?: string },
) {
  return NextResponse.json(
    {
      success: false,
      error,
      code: init?.code ?? "API_ERROR",
    },
    init,
  )
}

export function apiFromActionResult<T>(
  result: ActionResult<T>,
  init?: ResponseInit,
) {
  if (result.success) {
    return apiSuccess(result.data, init)
  }

  return apiError(result.error, {
    ...init,
    status: result.status ?? 400,
    code: result.code ?? "ACTION_ERROR",
  })
}

export function parseBoundedIntegerParam(input: {
  value: string | null
  fallback: number
  minimum: number
  maximum: number
}): number | null {
  if (input.value === null || input.value === "") {
    return input.fallback
  }

  const parsed = Number(input.value)
  if (!Number.isInteger(parsed)) return null
  if (parsed < input.minimum || parsed > input.maximum) return null
  return parsed
}
