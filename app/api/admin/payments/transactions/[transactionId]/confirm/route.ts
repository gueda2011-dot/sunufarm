import { NextResponse } from "next/server"
import { adminConfirmPaymentTransaction } from "@/src/actions/subscriptions"
import {
  applyRateLimit,
  createRateLimitHeaders,
  getClientIpFromHeaders,
} from "@/src/lib/rate-limit"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  const { transactionId } = await params
  const rateLimit = applyRateLimit({
    key: `admin-payment-confirm:${transactionId}:${getClientIpFromHeaders(request.headers)}`,
    limit: 10,
    windowMs: 60_000,
  })

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Trop de tentatives de confirmation. Reessayez dans un instant." },
      { status: 429, headers: createRateLimitHeaders(rateLimit, 10) },
    )
  }

  const result = await adminConfirmPaymentTransaction({ transactionId })

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 },
    )
  }

  return NextResponse.json(result)
}
