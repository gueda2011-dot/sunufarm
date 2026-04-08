/**
 * SunuFarm — Cron : Intelligence Collective
 *
 * Deux missions :
 *   1. Backfill : génère les snapshots des lots fermés qui n'en ont pas encore
 *   2. Stats : loggue les métriques globales du pool pour supervision
 *
 * Fréquence recommandée : 1x/jour (heure creuse)
 * Sécurisé par CRON_SECRET (header Authorization: Bearer <secret>)
 *
 * Ajout dans vercel.json :
 *   { "path": "/api/cron/collective-intelligence", "schedule": "0 3 * * *" }
 */

import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { backfillBatchOutcomeSnapshots } from "@/src/lib/collective-intelligence"
import { getCollectivePoolStats } from "@/src/lib/collective-benchmark"
import { getServerEnv } from "@/src/lib/env"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET() {
  try {
    // Vérification du secret cron
    const env = getServerEnv()
    const headersList = await headers()
    const authHeader = headersList.get("Authorization")

    if (env.CRON_SECRET) {
      const expectedToken = `Bearer ${env.CRON_SECRET}`
      if (authHeader !== expectedToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    const startedAt = new Date()

    // 1. Backfill des lots fermés sans snapshot
    const backfillResult = await backfillBatchOutcomeSnapshots({ batchSize: 30 })

    // 2. Stats du pool collectif (pour monitoring)
    const poolStats = await getCollectivePoolStats()

    const duration = Date.now() - startedAt.getTime()

    return NextResponse.json({
      ok: true,
      duration_ms: duration,
      backfill: backfillResult,
      pool: {
        totalSnapshots: poolStats.totalSnapshots,
        byType: poolStats.byType,
        byRegion: poolStats.byRegion,
        latestSnapshotAt: poolStats.latestSnapshotAt,
      },
    })
  } catch (error) {
    console.error("[Cron/CollectiveIntelligence] Erreur:", error)
    return NextResponse.json(
      { ok: false, error: "Erreur interne du cron d'intelligence collective" },
      { status: 500 },
    )
  }
}
