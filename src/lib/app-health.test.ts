import { describe, expect, it } from "vitest"
import { buildAppHealthReport } from "@/src/lib/app-health"

describe("app-health", () => {
  it("signale un etat sain quand les garde-fous sont en place", () => {
    const report = buildAppHealthReport({
      cronSecretConfigured: true,
      emailNotificationsConfigured: true,
      emailNotificationsPartiallyConfigured: false,
      paymentWebhooksConfigured: true,
      pendingSubscriptionPayments: 0,
      oldestPendingSubscriptionPaymentAt: null,
      pendingPaymentTransactions: 0,
      stalePendingPaymentTransactions: 0,
      failedWebhookEventsLast24h: 0,
      auditLogsLast24h: 24,
    })

    expect(report.overallStatus).toBe("healthy")
    expect(report.checks.every((check) => check.status === "healthy")).toBe(true)
  })

  it("remonte un avertissement quand les emails sont desactives et qu un backlog existe", () => {
    const report = buildAppHealthReport(
      {
        cronSecretConfigured: true,
        emailNotificationsConfigured: false,
        emailNotificationsPartiallyConfigured: false,
        paymentWebhooksConfigured: false,
        pendingSubscriptionPayments: 2,
        oldestPendingSubscriptionPaymentAt: new Date("2026-03-28T08:00:00.000Z"),
        pendingPaymentTransactions: 1,
        stalePendingPaymentTransactions: 0,
        failedWebhookEventsLast24h: 0,
        auditLogsLast24h: 12,
      },
      new Date("2026-03-28T12:00:00.000Z"),
    )

    expect(report.overallStatus).toBe("warn")
    expect(report.checks.find((check) => check.key === "email")?.status).toBe("warn")
    expect(report.checks.find((check) => check.key === "payments-backlog")?.status).toBe("warn")
    expect(report.checks.find((check) => check.key === "transactions")?.status).toBe("warn")
  })

  it("passe en critique quand le cron manque ou que des transactions sont stale", () => {
    const report = buildAppHealthReport(
      {
        cronSecretConfigured: false,
        emailNotificationsConfigured: false,
        emailNotificationsPartiallyConfigured: true,
        paymentWebhooksConfigured: true,
        pendingSubscriptionPayments: 12,
        oldestPendingSubscriptionPaymentAt: new Date("2026-03-25T12:00:00.000Z"),
        pendingPaymentTransactions: 3,
        stalePendingPaymentTransactions: 2,
        failedWebhookEventsLast24h: 7,
        auditLogsLast24h: 4,
      },
      new Date("2026-03-28T12:00:00.000Z"),
    )

    expect(report.overallStatus).toBe("critical")
    expect(report.checks.find((check) => check.key === "cron")?.status).toBe("critical")
    expect(report.checks.find((check) => check.key === "email")?.status).toBe("critical")
    expect(report.checks.find((check) => check.key === "webhooks")?.status).toBe("critical")
    expect(report.checks.find((check) => check.key === "transactions")?.status).toBe("critical")
  })
})
