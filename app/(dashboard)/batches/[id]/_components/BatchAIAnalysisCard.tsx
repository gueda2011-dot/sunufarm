"use client"

import { useState, useTransition } from "react"
import { Sparkles, AlertTriangle, BadgeDollarSign, CheckCircle2 } from "lucide-react"
import { Button } from "@/src/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card"

interface AnalysisResult {
  summary: string
  keyRisks: Array<{
    title: string
    severity: "low" | "medium" | "high"
    reason: string
  }>
  profitabilityInsights: string[]
  recommendations: Array<{
    action: string
    priority: "immediate" | "soon" | "monitor"
    why: string
  }>
}

interface BatchAIAnalysisCardProps {
  organizationId: string
  batchId: string
  planLabel: string
  aiAccessLabel: string
  dailyLimitLabel: string
  monthlyLimitLabel: string
  enabled: boolean
  upsellMessage?: string
}

export function BatchAIAnalysisCard({
  organizationId,
  batchId,
  planLabel,
  aiAccessLabel,
  dailyLimitLabel,
  monthlyLimitLabel,
  enabled,
  upsellMessage,
}: BatchAIAnalysisCardProps) {
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cached, setCached] = useState(false)
  const [usageLabel, setUsageLabel] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAnalyze() {
    setError(null)

    startTransition(async () => {
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId,
          batchId,
        }),
      })

      const payload = await response.json() as {
        success: boolean
        error?: string
        data?: {
          analysis: AnalysisResult
          cached: boolean
          usage: {
            dailyUsed: number
            dailyLimit: number
            monthlyUsed: number
            monthlyLimit: number
            totalTrialUsed: number
            totalTrialLimit: number
          }
        }
      }

      if (!payload.success || !payload.data) {
        setError(payload.error ?? "Impossible de lancer l'analyse AI.")
        return
      }

      setResult(payload.data.analysis)
      setCached(payload.data.cached)

      const usage = payload.data.usage
      if (usage.totalTrialLimit > 0) {
        setUsageLabel(`${usage.totalTrialUsed}/${usage.totalTrialLimit} analyses d'essai utilisees`)
      } else {
        setUsageLabel(
          `${usage.dailyUsed}/${usage.dailyLimit} aujourd'hui · ${usage.monthlyUsed}/${usage.monthlyLimit} ce mois`,
        )
      }
    })
  }

  if (!enabled) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle>Analyse AI du lot</CardTitle>
          <CardDescription>
            Passe au plan Pro ou Business pour obtenir des analyses utiles a la decision.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-amber-900">
          <p>{upsellMessage ?? "L'analyse AI est reservee aux plans superieurs."}</p>
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
              <Sparkles className="h-5 w-5 text-blue-700" />
              Analyse AI du lot
            </CardTitle>
            <CardDescription>
              Synthese rentabilite, risques et recommandations orientees business.
            </CardDescription>
          </div>
          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
            {aiAccessLabel}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-white px-4 py-3 text-sm text-gray-700">
            <p className="font-medium text-gray-900">Quota journalier</p>
            <p className="mt-1">{dailyLimitLabel}</p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3 text-sm text-gray-700">
            <p className="font-medium text-gray-900">Quota mensuel</p>
            <p className="mt-1">{monthlyLimitLabel}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleAnalyze} loading={isPending}>
            Lancer l&apos;analyse AI
          </Button>
          {usageLabel && (
            <span className="text-sm text-gray-600">{usageLabel}</span>
          )}
          {cached && (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
              Resultat en cache
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4 rounded-2xl bg-white p-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">Resume</p>
              <p className="mt-1 text-sm text-gray-700">{result.summary}</p>
            </div>

            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Risques cles
              </p>
              <div className="mt-2 space-y-2">
                {result.keyRisks.map((risk) => (
                  <div key={`${risk.title}-${risk.reason}`} className="rounded-xl border border-gray-100 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-gray-900">{risk.title}</p>
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                        {risk.severity}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{risk.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <BadgeDollarSign className="h-4 w-4 text-green-700" />
                Lecture rentabilite
              </p>
              <ul className="mt-2 space-y-2 text-sm text-gray-700">
                {result.profitabilityInsights.map((insight) => (
                  <li key={insight} className="rounded-xl bg-gray-50 px-3 py-2">
                    {insight}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <CheckCircle2 className="h-4 w-4 text-blue-700" />
                Recommandations
              </p>
              <div className="mt-2 space-y-2">
                {result.recommendations.map((recommendation) => (
                  <div key={`${recommendation.action}-${recommendation.why}`} className="rounded-xl bg-gray-50 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-gray-900">{recommendation.action}</p>
                      <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">
                        {recommendation.priority}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{recommendation.why}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
