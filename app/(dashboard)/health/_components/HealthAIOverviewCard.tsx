"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Stethoscope,
} from "lucide-react"
import { Button } from "@/src/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card"

interface HealthAIOverviewCardProps {
  organizationId: string
  enabled: boolean
  planLabel: string
  aiAccessLabel: string
  upsellMessage?: string
}

interface HealthAnalysisResult {
  overallStatus: "stable" | "monitor" | "urgent"
  summary: string
  keySignals: Array<{
    label: string
    severity: "low" | "medium" | "high"
    detail: string
  }>
  focusBatches: Array<{
    batchId: string
    batchNumber: string
    urgency: "monitor" | "urgent"
    reason: string
  }>
  recommendedActions: Array<{
    action: string
    priority: "immediate" | "soon" | "monitor"
    why: string
  }>
  whenToEscalate: string[]
}

function getStatusTone(status: HealthAnalysisResult["overallStatus"]) {
  switch (status) {
    case "stable":
      return "bg-emerald-100 text-emerald-800"
    case "monitor":
      return "bg-amber-100 text-amber-800"
    case "urgent":
      return "bg-red-100 text-red-800"
  }
}

export function HealthAIOverviewCard({
  organizationId,
  enabled,
  planLabel,
  aiAccessLabel,
  upsellMessage,
}: HealthAIOverviewCardProps) {
  const [result, setResult] = useState<HealthAnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAnalyze() {
    setError(null)

    startTransition(async () => {
      const response = await fetch("/api/ai/health", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ organizationId }),
      })

      const payload = await response.json() as {
        success: boolean
        error?: string
        data?: {
          analysis: HealthAnalysisResult
        }
      }

      if (!payload.success || !payload.data) {
        setError(payload.error ?? "Impossible de lancer l'analyse IA sante.")
        return
      }

      setResult(payload.data.analysis)
    })
  }

  if (!enabled) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle>IA sante animale</CardTitle>
          <CardDescription>
            Cette synthese sanitaire intelligente est disponible a partir du plan Pro.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-amber-900">
          <p>{upsellMessage ?? "L'analyse IA sante est reservee aux plans superieurs."}</p>
          <p className="font-medium">Plan actuel : {planLabel}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-blue-200 bg-blue-50/60">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-blue-700" />
              IA sante animale
            </CardTitle>
            <CardDescription>
              Synthese IA sur les 7 derniers jours: lots a surveiller, signaux faibles et actions terrain.
            </CardDescription>
          </div>
          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
            {aiAccessLabel}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleAnalyze} loading={isPending}>
            Lancer l&apos;analyse IA sante
          </Button>
          <span className="text-sm text-gray-600">Analyse organisationnelle sur 7 jours glissants</span>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4 rounded-2xl bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <Sparkles className="h-4 w-4 text-blue-700" />
                  Resume
                </p>
                <p className="mt-1 text-sm text-gray-700">{result.summary}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusTone(result.overallStatus)}`}>
                {result.overallStatus === "stable"
                  ? "Situation stable"
                  : result.overallStatus === "monitor"
                    ? "Surveillance renforcee"
                    : "Attention urgente"}
              </span>
            </div>

            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Signaux cles
              </p>
              <div className="mt-2 space-y-2">
                {result.keySignals.map((signal) => (
                  <div key={`${signal.label}-${signal.detail}`} className="rounded-xl border border-gray-100 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-gray-900">{signal.label}</p>
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                        {signal.severity}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{signal.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            {result.focusBatches.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-900">Lots a traiter en priorite</p>
                <div className="mt-2 space-y-2">
                  {result.focusBatches.map((batch) => (
                    <div key={batch.batchId} className="rounded-xl bg-gray-50 px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <Link href={`/batches/${batch.batchId}`} className="font-medium text-gray-900 hover:text-blue-600">
                          {batch.batchNumber}
                        </Link>
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          batch.urgency === "urgent"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {batch.urgency === "urgent" ? "urgent" : "surveiller"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{batch.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <CheckCircle2 className="h-4 w-4 text-blue-700" />
                Actions recommandees
              </p>
              <div className="mt-2 space-y-2">
                {result.recommendedActions.map((action) => (
                  <div key={`${action.action}-${action.why}`} className="rounded-xl bg-gray-50 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-gray-900">{action.action}</p>
                      <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">
                        {action.priority}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{action.why}</p>
                  </div>
                ))}
              </div>
            </div>

            {result.whenToEscalate.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-900">Quand escalader au veterinaire</p>
                <ul className="mt-2 space-y-2 text-sm text-gray-700">
                  {result.whenToEscalate.map((item) => (
                    <li key={item} className="rounded-xl bg-red-50 px-3 py-2">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
