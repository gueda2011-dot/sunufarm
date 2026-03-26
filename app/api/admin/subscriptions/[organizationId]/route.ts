import { NextResponse } from "next/server"
import { adminUpdateOrganizationSubscription } from "@/src/actions/subscriptions"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const body = await request.json()
  const { organizationId } = await params

  const result = await adminUpdateOrganizationSubscription({
    ...body,
    organizationId,
  })

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 },
    )
  }

  return NextResponse.json(result)
}
