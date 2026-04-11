import { NextResponse } from "next/server"
import { createDailyRecord } from "@/src/actions/daily-records"
import {
  createDailyRecordSchema,
  flattenZodFieldErrors,
} from "@/src/lib/daily-record-validation"

export async function POST(request: Request) {
  const body = await request.json()
  const parsed = createDailyRecordSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({
      success: false,
      error: "Donnees invalides",
      code: "INVALID_INPUT",
      status: 400,
      fieldErrors: flattenZodFieldErrors(parsed.error),
    }, { status: 400 })
  }

  const result = await createDailyRecord(parsed.data)
  return NextResponse.json(
    result,
    { status: result.success ? 200 : result.status ?? 400 },
  )
}
