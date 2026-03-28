"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { BellRing, Mail, RotateCcw, ShieldCheck, Trash2, UserPlus2 } from "lucide-react"
import {
  addUserToOrganizationByEmail,
  removeUserFromOrganization,
  updateUserModulePermissions,
  updateUserNotificationPreference,
  updateUserRole,
  type OrgMember,
} from "@/src/actions/organizations"
import { Button } from "@/src/components/ui/button"
import { Input } from "@/src/components/ui/input"
import type { UserRole } from "@/src/generated/prisma/client"
import {
  APP_MODULES,
  APP_MODULE_LABELS,
  getEffectiveModulePermissions,
  parseModulePermissions,
  type AppModule,
} from "@/src/lib/permissions"

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: "OWNER", label: "Proprietaire" },
  { value: "MANAGER", label: "Manager" },
  { value: "TECHNICIAN", label: "Technicien" },
  { value: "DATA_ENTRY", label: "Saisie" },
  { value: "ACCOUNTANT", label: "Comptable" },
  { value: "VET", label: "Veterinaire" },
  { value: "VIEWER", label: "Lecture seule" },
]

interface TeamManagementClientProps {
  organizationId: string
  actorUserId: string
  canManageTeam: boolean
  initialMembers: OrgMember[]
}

export function TeamManagementClient({
  organizationId,
  actorUserId,
  canManageTeam,
  initialMembers,
}: TeamManagementClientProps) {
  const [members, setMembers] = useState(initialMembers)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<UserRole>("VIEWER")
  const [isPending, startTransition] = useTransition()

  const sortedMembers = useMemo(
    () => [...members].sort((left, right) => (
      left.role.localeCompare(right.role) ||
      left.user.email.localeCompare(right.user.email)
    )),
    [members],
  )

  const handleInvite = () => {
    startTransition(async () => {
      const result = await addUserToOrganizationByEmail({
        organizationId,
        email: inviteEmail,
        role: inviteRole,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      setMembers((previous) => [...previous, result.data])
      setInviteEmail("")
      setInviteRole("VIEWER")
      toast.success("Membre ajoute a l'organisation")
    })
  }

  const handleRoleChange = (targetUserId: string, role: UserRole) => {
    startTransition(async () => {
      const result = await updateUserRole({
        organizationId,
        targetUserId,
        role,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      setMembers((previous) => previous.map((member) => (
        member.userId === targetUserId ? result.data : member
      )))
      toast.success("Role mis a jour")
    })
  }

  const handleRemove = (targetUserId: string) => {
    startTransition(async () => {
      const result = await removeUserFromOrganization({
        organizationId,
        targetUserId,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      setMembers((previous) => previous.filter((member) => member.userId !== targetUserId))
      toast.success("Membre retire")
    })
  }

  const handleToggleModule = (member: OrgMember, module: AppModule) => {
    const currentModules = getEffectiveModulePermissions(member.role, member.modulePermissions)
    const nextModules = currentModules.includes(module)
      ? currentModules.filter((item) => item !== module && item !== "DASHBOARD")
      : [...currentModules, module]

    startTransition(async () => {
      const result = await updateUserModulePermissions({
        organizationId,
        targetUserId: member.userId,
        modulePermissions: nextModules,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      setMembers((previous) => previous.map((item) => (
        item.userId === member.userId ? result.data : item
      )))
      toast.success("Acces modules mis a jour")
    })
  }

  const handleResetModules = (targetUserId: string) => {
    startTransition(async () => {
      const result = await updateUserModulePermissions({
        organizationId,
        targetUserId,
        modulePermissions: null,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      setMembers((previous) => previous.map((item) => (
        item.userId === targetUserId ? result.data : item
      )))
      toast.success("Acces du role reappliques")
    })
  }

  const handleToggleNotificationEmail = (member: OrgMember) => {
    startTransition(async () => {
      const result = await updateUserNotificationPreference({
        organizationId,
        targetUserId: member.userId,
        emailNotificationsEnabled: !member.emailNotificationsEnabled,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      setMembers((previous) => previous.map((item) => (
        item.userId === member.userId ? result.data : item
      )))
      toast.success("Preference email mise a jour")
    })
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-4 ${
        canManageTeam
          ? "border-green-200 bg-green-50"
          : "border-gray-200 bg-gray-50"
      }`}>
        <div className="flex items-start gap-3">
          <div className={`rounded-2xl p-2 ${
            canManageTeam ? "bg-white text-green-700" : "bg-white text-gray-500"
          }`}>
            {canManageTeam ? <UserPlus2 className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Ajouter un membre existant</p>
              <p className="mt-1 text-sm text-gray-600">
                Saisissez l&apos;email d&apos;un compte deja cree pour l&apos;ajouter a cette organisation.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-[1.5fr_0.8fr_auto]">
              <Input
                type="email"
                value={inviteEmail}
                disabled={!canManageTeam || isPending}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="utilisateur@exemple.com"
              />
              <select
                value={inviteRole}
                disabled={!canManageTeam || isPending}
                onChange={(event) => setInviteRole(event.target.value as UserRole)}
                className="h-[52px] rounded-xl border border-gray-300 bg-white px-4 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-600 disabled:opacity-60"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
              <Button
                onClick={handleInvite}
                disabled={!canManageTeam || !inviteEmail.trim()}
                loading={isPending}
              >
                <Mail className="h-4 w-4" />
                Ajouter
              </Button>
            </div>

            {!canManageTeam && (
              <p className="text-xs text-gray-500">
                Seul le proprietaire de l&apos;organisation peut gerer les roles et les modules visibles.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {sortedMembers.map((member) => {
          const isSelf = member.userId === actorUserId
          const usesDefaultModules = parseModulePermissions(member.modulePermissions) === null
          const enabledModules = getEffectiveModulePermissions(member.role, member.modulePermissions)

          return (
            <div
              key={member.id}
              className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {member.user.name?.trim() || "Utilisateur sans nom"}
                  </p>
                  <p className="truncate text-sm text-gray-500">{member.user.email}</p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <select
                    value={member.role}
                    disabled={!canManageTeam || isPending || isSelf}
                    onChange={(event) => handleRoleChange(member.userId, event.target.value as UserRole)}
                    className="h-11 min-w-[180px] rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-600 disabled:opacity-60"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canManageTeam || isPending || isSelf}
                    onClick={() => handleRemove(member.userId)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Retirer
                  </Button>
                </div>
              </div>
              {isSelf && (
                <p className="mt-2 text-xs text-gray-500">
                  Votre propre role ne peut pas etre modifie depuis cette page.
                </p>
              )}

              <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Emails automatiques</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Recoit le recap des alertes generees automatiquement par SunuFarm.
                      </p>
                    </div>

                    <Button
                      variant={member.emailNotificationsEnabled ? "primary" : "outline"}
                      size="sm"
                      disabled={!canManageTeam || isPending}
                      onClick={() => handleToggleNotificationEmail(member)}
                    >
                      <BellRing className="h-4 w-4" />
                      {member.emailNotificationsEnabled ? "Actifs" : "Desactives"}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Acces modules</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {usesDefaultModules
                        ? "Ce membre utilise actuellement les acces par defaut de son role."
                        : "Ce membre utilise un jeu d'acces personnalise."}
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canManageTeam || isPending || isSelf || member.role === "OWNER"}
                    onClick={() => handleResetModules(member.userId)}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Revenir au role
                  </Button>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {APP_MODULES.map((module) => {
                    const checked = enabledModules.includes(module)
                    const disabled =
                      !canManageTeam ||
                      isPending ||
                      isSelf ||
                      member.role === "OWNER" ||
                      module === "DASHBOARD"

                    return (
                      <label
                        key={`${member.id}-${module}`}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
                          checked
                            ? "border-green-200 bg-green-50 text-green-900"
                            : "border-gray-200 bg-white text-gray-700"
                        } ${
                          disabled ? "opacity-70" : "cursor-pointer"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => handleToggleModule(member, module)}
                          className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-600"
                        />
                        <span>{APP_MODULE_LABELS[module]}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
