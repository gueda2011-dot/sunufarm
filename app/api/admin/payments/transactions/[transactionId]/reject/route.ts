import { NextResponse } from "next/server"
import { adminRejectPaymentTransaction } from "@/src/actions/subscriptions"
import {
  applyRateLimit,
  createRateLimitHeaders,
  getClientIpFromHeaders,
} from "@/src/lib/rate-limit"
import { getRequestAuditContext, isTrustedMutationOrigin } from "@/src/lib/request-security"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  if (!isTrustedMutationOrigin(request)) {
    return NextResponse.json(
      { success: false, error: "Origine de requete non autorisee." },
      { status: 403 },
    )
  }

  const { transactionId } = await params
  const rateLimit = applyRateLimit({
    key: `admin-payment-reject:${transactionId}:${getClientIpFromHeaders(request.headers)}`,
    limit: 10,
    windowMs: 60_000,
  })

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Trop de tentatives de rejet. Reessayez dans un instant." },
      { status: 429, headers: createRateLimitHeaders(rateLimit, 10) },
    )
  }

  const result = await adminRejectPaymentTransaction(
    { transactionId },
    getRequestAuditContext(request.headers),
  )

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 },
    )
  }

  return NextResponse.json(result)
}
