import { NextResponse } from "next/server"
import { createSubscriptionPaymentRequest } from "@/src/actions/subscriptions"

export async function POST(request: Request) {
  const body = await request.json()
  const result = await createSubscriptionPaymentRequest(body)

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 },
    )
  }

  return NextResponse.json(result)
}
