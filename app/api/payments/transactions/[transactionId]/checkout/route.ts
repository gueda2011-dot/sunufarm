import { auth } from "@/src/auth"
import { requireMembership } from "@/src/lib/auth"
import { apiError, apiSuccess } from "@/src/lib/api-response"
import { hasModuleAccess } from "@/src/lib/permissions"
import prisma from "@/src/lib/prisma"
import { createWaveCheckoutSessionForTransaction } from "@/src/lib/payments"
import {
  applyRateLimit,
  createRateLimitHeaders,
  getClientIpFromHeaders,
} from "@/src/lib/rate-limit"
import { isTrustedMutationOrigin } from "@/src/lib/request-security"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  if (!isTrustedMutationOrigin(request)) {
    return apiError("Origine de requete non autorisee.", {
      status: 403,
      code: "UNTRUSTED_ORIGIN",
    })
  }

  const session = await auth()
  if (!session?.user?.id) {
    return apiError("Non authentifie", { status: 401, code: "UNAUTHENTICATED" })
  }

  const { transactionId } = await params
  const rateLimit = applyRateLimit({
    key: `checkout:${session.user.id}:${transactionId}:${getClientIpFromHeaders(request.headers)}`,
    limit: 5,
    windowMs: 60_000,
  })

  if (!rateLimit.allowed) {
    return apiError("Trop de tentatives de paiement. Reessayez dans un instant.", {
      status: 429,
      code: "RATE_LIMITED",
      headers: createRateLimitHeaders(rateLimit, 5),
    })
  }

  const transaction = await prisma.paymentTransaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      organizationId: true,
      provider: true,
      status: true,
    },
  })

  if (!transaction) {
    return apiError("Transaction introuvable", { status: 404, code: "TRANSACTION_NOT_FOUND" })
  }

  const membershipResult = await requireMembership(
    session.user.id,
    transaction.organizationId,
  )

  if (!membershipResult.success) {
    return apiError(membershipResult.error, {
      status: membershipResult.status,
      code: membershipResult.code,
    })
  }

  if (!hasModuleAccess(membershipResult.data.role, membershipResult.data.modulePermissions, "SETTINGS")) {
    return apiError("Acces refuse au module SETTINGS.", {
      status: 403,
      code: "MODULE_ACCESS_DENIED",
    })
  }

  try {
    const checkout = await createWaveCheckoutSessionForTransaction(transaction.id)

    return apiSuccess({
      provider: transaction.provider,
      checkoutUrl: checkout.checkoutUrl,
      checkoutId: checkout.checkoutId,
      expiresAt: checkout.expiresAt,
    }, { headers: createRateLimitHeaders(rateLimit, 5) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR"

    if (message === "WAVE_NOT_CONFIGURED") {
      return apiError("Wave n'est pas encore configure dans l'environnement.", {
        status: 503,
        code: "WAVE_NOT_CONFIGURED",
      })
    }

    if (message === "PROVIDER_NOT_SUPPORTED") {
      return apiError("Ce provider mobile money n'est pas encore actif.", {
        status: 400,
        code: "PROVIDER_NOT_SUPPORTED",
      })
    }

    return apiError("Impossible d'initialiser le paiement Wave.", {
      status: 500,
      code: "CHECKOUT_INIT_FAILED",
    })
  }
}
