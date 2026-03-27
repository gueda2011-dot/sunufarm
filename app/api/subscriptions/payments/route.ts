import { NextResponse } from "next/server"
import { createSubscriptionPaymentRequest } from "@/src/actions/subscriptions"
import { getRequestAuditContext, isTrustedMutationOrigin } from "@/src/lib/request-security"

export async function POST(request: Request) {
  if (!isTrustedMutationOrigin(request)) {
    return NextResponse.json(
      { success: false, error: "Origine de requete non autorisee." },
      { status: 403 },
    )
  }

  const body = await request.json()
  const result = await createSubscriptionPaymentRequest(
    body,
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
