import { NextResponse } from "next/server"
import { auth } from "@/src/auth"
import { requireMembership } from "@/src/lib/auth"
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
    return NextResponse.json(
      { success: false, error: "Origine de requete non autorisee." },
      { status: 403 },
    )
  }

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Non authentifie" }, { status: 401 })
  }

  const { transactionId } = await params
  const rateLimit = applyRateLimit({
    key: `checkout:${session.user.id}:${transactionId}:${getClientIpFromHeaders(request.headers)}`,
    limit: 5,
    windowMs: 60_000,
  })

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Trop de tentatives de paiement. Reessayez dans un instant." },
      { status: 429, headers: createRateLimitHeaders(rateLimit, 5) },
    )
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
    return NextResponse.json({ success: false, error: "Transaction introuvable" }, { status: 404 })
  }

  const membershipResult = await requireMembership(
    session.user.id,
    transaction.organizationId,
  )

  if (!membershipResult.success) {
    return NextResponse.json({ success: false, error: membershipResult.error }, { status: 403 })
  }

  try {
    const checkout = await createWaveCheckoutSessionForTransaction(transaction.id)

    return NextResponse.json({
      success: true,
      data: {
        provider: transaction.provider,
        checkoutUrl: checkout.checkoutUrl,
        checkoutId: checkout.checkoutId,
        expiresAt: checkout.expiresAt,
      },
    }, { headers: createRateLimitHeaders(rateLimit, 5) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR"

    if (message === "WAVE_NOT_CONFIGURED") {
      return NextResponse.json(
        { success: false, error: "Wave n'est pas encore configure dans l'environnement." },
        { status: 503 },
      )
    }

    if (message === "PROVIDER_NOT_SUPPORTED") {
      return NextResponse.json(
        { success: false, error: "Ce provider mobile money n'est pas encore actif." },
        { status: 400 },
      )
    }

    return NextResponse.json(
      { success: false, error: "Impossible d'initialiser le paiement Wave." },
      { status: 500 },
    )
  }
}
