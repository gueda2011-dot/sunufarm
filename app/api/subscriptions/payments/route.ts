import { createSubscriptionPaymentRequest } from "@/src/actions/subscriptions"
import { apiError, apiFromActionResult } from "@/src/lib/api-response"
import { getRequestAuditContext, isTrustedMutationOrigin } from "@/src/lib/request-security"

export async function POST(request: Request) {
  if (!isTrustedMutationOrigin(request)) {
    return apiError("Origine de requete non autorisee.", {
      status: 403,
      code: "UNTRUSTED_ORIGIN",
    })
  }

  const body = await request.json()
  const result = await createSubscriptionPaymentRequest(
    body,
    getRequestAuditContext(request.headers),
  )

  return apiFromActionResult(result)
}
