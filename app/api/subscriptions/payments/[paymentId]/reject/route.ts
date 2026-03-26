import { NextResponse } from "next/server"
import { rejectSubscriptionPayment } from "@/src/actions/subscriptions"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const body = await request.json()
  const { paymentId } = await params

  const result = await rejectSubscriptionPayment({
    ...body,
    paymentId,
  })

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 },
    )
  }

  return NextResponse.json(result)
}
