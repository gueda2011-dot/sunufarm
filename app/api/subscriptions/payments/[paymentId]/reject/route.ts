import { rejectSubscriptionPayment } from "@/src/actions/subscriptions"
import { apiError, apiFromActionResult } from "@/src/lib/api-response"
import { getRequestAuditContext, isTrustedMutationOrigin } from "@/src/lib/request-security"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  if (!isTrustedMutationOrigin(request)) {
    return apiError("Origine de requete non autorisee.", {
      status: 403,
      code: "UNTRUSTED_ORIGIN",
    })
  }

  const body = await request.json()
  const { paymentId } = await params

  const result = await rejectSubscriptionPayment(
    {
      ...body,
      paymentId,
    },
    getRequestAuditContext(request.headers),
  )

  return apiFromActionResult(result)
}
