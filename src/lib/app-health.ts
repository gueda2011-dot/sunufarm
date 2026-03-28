export type AppHealthStatus = "healthy" | "warn" | "critical"

export interface AppHealthSnapshot {
  cronSecretConfigured: boolean
  emailNotificationsConfigured: boolean
  emailNotificationsPartiallyConfigured: boolean
  paymentWebhooksConfigured: boolean
  pendingSubscriptionPayments: number
  oldestPendingSubscriptionPaymentAt?: Date | null
  pendingPaymentTransactions: number
  stalePendingPaymentTransactions: number
  failedWebhookEventsLast24h: number
  auditLogsLast24h: number
}

export interface AppHealthCheck {
  key: string
  label: string
  status: AppHealthStatus
  value: string
  description: string
}

export interface AppHealthReport {
  overallStatus: AppHealthStatus
  checks: AppHealthCheck[]
}

function resolveBacklogStatus(count: number, oldestAt: Date | null | undefined, now: Date) {
  if (count === 0) return "healthy" as const
  if (!oldestAt) return "warn" as const

  const ageHours = (now.getTime() - oldestAt.getTime()) / (1000 * 60 * 60)
  if (ageHours >= 48 || count >= 10) return "critical" as const
  return "warn" as const
}

export function buildAppHealthReport(
  snapshot: AppHealthSnapshot,
  now = new Date(),
): AppHealthReport {
  const checks: AppHealthCheck[] = [
    {
      key: "cron",
      label: "Cron notifications",
      status: snapshot.cronSecretConfigured ? "healthy" : "critical",
      value: snapshot.cronSecretConfigured ? "Protege" : "A configurer",
      description: snapshot.cronSecretConfigured
        ? "Le cron automatique peut appeler l endpoint protege."
        : "CRON_SECRET manque: les notifications auto ne sont pas suffisamment protegees.",
    },
    {
      key: "email",
      label: "Digest email",
      status: snapshot.emailNotificationsConfigured
        ? "healthy"
        : snapshot.emailNotificationsPartiallyConfigured
          ? "critical"
          : "warn",
      value: snapshot.emailNotificationsConfigured
        ? "Operationnel"
        : snapshot.emailNotificationsPartiallyConfigured
          ? "Configuration incomplete"
          : "Desactive",
      description: snapshot.emailNotificationsConfigured
        ? "Les emails de recap automatique peuvent etre envoyes."
        : snapshot.emailNotificationsPartiallyConfigured
          ? "Une partie de la configuration email manque encore."
          : "Les notifications in-app fonctionnent, mais aucun digest email n est configure.",
    },
    {
      key: "webhooks",
      label: "Webhooks paiement",
      status: snapshot.paymentWebhooksConfigured
        ? snapshot.failedWebhookEventsLast24h >= 5
          ? "critical"
          : snapshot.failedWebhookEventsLast24h > 0
            ? "warn"
            : "healthy"
        : "warn",
      value: snapshot.paymentWebhooksConfigured
        ? snapshot.failedWebhookEventsLast24h > 0
          ? `${snapshot.failedWebhookEventsLast24h} erreur(s) / 24h`
          : "Aucune erreur / 24h"
        : "Fallback manuel",
      description: snapshot.paymentWebhooksConfigured
        ? "La chaine webhook est configuree et les erreurs recentes sont surveillees."
        : "Aucun secret webhook configure: la plateforme repose encore sur le traitement manuel admin.",
    },
    {
      key: "payments-backlog",
      label: "Demandes d abonnement",
      status: resolveBacklogStatus(
        snapshot.pendingSubscriptionPayments,
        snapshot.oldestPendingSubscriptionPaymentAt,
        now,
      ),
      value:
        snapshot.pendingSubscriptionPayments === 0
          ? "Aucune attente"
          : `${snapshot.pendingSubscriptionPayments} en attente`,
      description:
        snapshot.pendingSubscriptionPayments === 0
          ? "Aucune demande de paiement abonnement n attend de traitement."
          : "Des validations manuelles restent a traiter cote admin.",
    },
    {
      key: "transactions",
      label: "Transactions techniques",
      status:
        snapshot.stalePendingPaymentTransactions > 0
          ? "critical"
          : snapshot.pendingPaymentTransactions > 0
            ? "warn"
            : "healthy",
      value:
        snapshot.pendingPaymentTransactions === 0
          ? "Rien en attente"
          : snapshot.stalePendingPaymentTransactions > 0
            ? `${snapshot.stalePendingPaymentTransactions} stale / ${snapshot.pendingPaymentTransactions}`
            : `${snapshot.pendingPaymentTransactions} en cours`,
      description:
        snapshot.stalePendingPaymentTransactions > 0
          ? "Certaines transactions techniques semblent bloquees et demandent une verification."
          : snapshot.pendingPaymentTransactions > 0
            ? "Des transactions sont encore en traitement ou en attente d action."
            : "Aucune transaction technique ne parait bloqueuse pour l instant.",
    },
  ]

  const overallStatus = checks.some((check) => check.status === "critical")
    ? "critical"
    : checks.some((check) => check.status === "warn")
      ? "warn"
      : "healthy"

  return {
    overallStatus,
    checks,
  }
}
