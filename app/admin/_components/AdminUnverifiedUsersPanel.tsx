"use client"

import { useState, useTransition } from "react"
import { AlertTriangle, CheckCircle2, Mail, RefreshCw } from "lucide-react"
import { Button } from "@/src/components/ui/button"
import {
  adminResendVerificationEmail,
  adminResendVerificationEmailsBatch,
} from "@/src/actions/admin-auth"

interface UnverifiedUserItem {
  id: string
  name: string | null
  email: string
  phone: string | null
  createdAt: string
  organizations: string[]
  hasActiveToken: boolean
  latestTokenExpiresAt: string | null
}

interface AdminUnverifiedUsersPanelProps {
  users: UnverifiedUserItem[]
  emailConfigured: boolean
}

export function AdminUnverifiedUsersPanel({
  users,
  emailConfigured,
}: AdminUnverifiedUsersPanelProps) {
  const [message, setMessage] = useState("")
  const [isBatchPending, startBatchTransition] = useTransition()
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  const missingTokenCount = users.filter((user) => !user.hasActiveToken).length

  const handleResendOne = (userId: string) => {
    setPendingUserId(userId)
    setMessage("")

    void (async () => {
      try {
        const result = await adminResendVerificationEmail({ userId })

        if (!result.success) {
          setMessage(result.error)
          return
        }

        setMessage(`Email de confirmation renvoye a ${result.data.email}.`)
      } finally {
        setPendingUserId(null)
      }
    })()
  }

  const handleResendBatch = () => {
    setMessage("")

    startBatchTransition(async () => {
      const result = await adminResendVerificationEmailsBatch()

      if (!result.success) {
        setMessage(result.error)
        return
      }

      setMessage(`${result.data.sent} email(s) de confirmation renvoye(s).`)
    })
  }

  return (
    <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Comptes non confirmes</h2>
            <p className="text-sm text-gray-500">
              Repere les utilisateurs bloques avant activation email et permet de relancer
              la confirmation sans intervention base de donnees.
            </p>
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleResendBatch}
            disabled={!emailConfigured || isBatchPending || users.length === 0}
          >
            <RefreshCw className={`h-4 w-4 ${isBatchPending ? "animate-spin" : ""}`} />
            {isBatchPending ? "Renvoi global..." : "Renvoyer jusqu'a 50 emails"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 border-b border-gray-100 px-6 py-5 md:grid-cols-3">
        <div className="rounded-2xl bg-gray-50 px-4 py-3">
          <p className="text-sm text-gray-500">Comptes en attente</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{users.length}</p>
        </div>
        <div className="rounded-2xl bg-gray-50 px-4 py-3">
          <p className="text-sm text-gray-500">Sans token actif</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{missingTokenCount}</p>
        </div>
        <div className="rounded-2xl bg-gray-50 px-4 py-3">
          <p className="text-sm text-gray-500">Email transactionnel</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {emailConfigured ? "Configure" : "Non configure"}
          </p>
        </div>
      </div>

      {!emailConfigured && (
        <div className="mx-6 mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          L&apos;envoi d&apos;emails n&apos;est pas configure sur cet environnement. Le diagnostic reste
          visible, mais les renvois sont desactives.
        </div>
      )}

      {message && (
        <div className="mx-6 mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <div className="px-6 py-5">
        {users.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun compte non confirme detecte.</p>
        ) : (
          <div className="space-y-3">
            {users.map((user) => {
              const isPending = pendingUserId === user.id

              return (
                <div key={user.id} className="rounded-2xl border border-gray-100 px-4 py-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div>
                        <p className="font-medium text-gray-900">
                          {user.name?.trim() || "Utilisateur sans nom"}
                        </p>
                        <p className="text-sm text-gray-600">{user.email}</p>
                        {user.phone ? (
                          <p className="text-xs text-gray-500">{user.phone}</p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
                          Cree le {user.createdAt}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 font-medium ${
                          user.hasActiveToken
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}>
                          {user.hasActiveToken ? "Token actif" : "Token manquant ou expire"}
                        </span>
                        {user.latestTokenExpiresAt ? (
                          <span className="rounded-full bg-blue-100 px-2.5 py-1 font-medium text-blue-800">
                            Expire le {user.latestTokenExpiresAt}
                          </span>
                        ) : null}
                      </div>

                      <p className="text-sm text-gray-500">
                        Organisations: {user.organizations.length > 0 ? user.organizations.join(", ") : "aucune"}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {user.hasActiveToken ? (
                        <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Pret a renvoyer
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Nouveau token necessaire
                        </span>
                      )}

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleResendOne(user.id)}
                        disabled={!emailConfigured || isPending || isBatchPending}
                      >
                        <Mail className="h-4 w-4" />
                        {isPending ? "Renvoi..." : "Renvoyer"}
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
