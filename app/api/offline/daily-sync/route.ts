import { NextResponse } from "next/server"
import { auth } from "@/src/auth"
import { createDailyRecord } from "@/src/actions/daily-records"
import {
  createDailyRecordSchema,
  flattenZodFieldErrors,
} from "@/src/lib/daily-record-validation"
import prisma from "@/src/lib/prisma"

export async function POST(request: Request) {
  // Auth en premier — avant toute requête DB
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }

  const body = await request.json()

  // Idempotence early-return : si clientMutationId déjà présent en base, on ne revalide pas
  const rawClientMutationId = typeof body?.clientMutationId === "string" ? body.clientMutationId : null
  const rawOrganizationId = typeof body?.organizationId === "string" ? body.organizationId : null

  if (rawClientMutationId && rawOrganizationId) {
    const existing = await prisma.dailyRecord.findFirst({
      where: { organizationId: rawOrganizationId, clientMutationId: rawClientMutationId },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json({ success: true, data: existing }, { status: 200 })
    }
  }

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
