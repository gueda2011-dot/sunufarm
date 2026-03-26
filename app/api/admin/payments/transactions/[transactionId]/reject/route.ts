import { NextResponse } from "next/server"
import { adminRejectPaymentTransaction } from "@/src/actions/subscriptions"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  const { transactionId } = await params
  const result = await adminRejectPaymentTransaction({ transactionId })

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 },
    )
  }

  return NextResponse.json(result)
}
