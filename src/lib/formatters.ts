/**
 * SunuFarm - Utilitaires de formatage
 *
 * Fonctions pures, sans effet de bord, tolerantes aux valeurs null/undefined.
 * Toutes les valeurs manquantes retournent "—" par convention UI.
 * Monnaie : FCFA (XOF) uniquement - entiers, pas de centimes.
 */

import { format, formatDistanceToNow, isValid } from "date-fns"
import { fr } from "date-fns/locale"

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(value)
  return isValid(date) ? date : null
}

const fcfaFormatter = new Intl.NumberFormat("fr-SN", {
  style: "currency",
  currency: "XOF",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export function formatMoneyFCFA(amount: number | null | undefined): string {
  if (amount == null) return "—"
  return fcfaFormatter.format(Math.round(amount))
}

export function formatMoneyFCFACompact(amount: number | null | undefined): string {
  if (amount == null) return "—"
  const abs = Math.abs(amount)
  const sign = amount < 0 ? "-" : ""
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M FCFA`
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}K FCFA`
  return `${sign}${abs} FCFA`
}

export function parseFCFA(value: string | null | undefined): number {
  if (!value) return 0
  return parseInt(value.replace(/[^\d]/g, ""), 10) || 0
}

const numberFormatter = new Intl.NumberFormat("fr-SN")

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "—"
  return numberFormatter.format(value)
}

export function formatPercent(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (value == null) return "—"
  return `${value.toFixed(decimals)}%`
}

export function formatCountWithUnit(
  value: number | null | undefined,
  singular: string,
  plural?: string,
): string {
  if (value == null) return "—"
  const unit = value > 1 ? (plural ?? `${singular}s`) : singular
  return `${formatNumber(value)} ${unit}`
}

export function formatWeight(grams: number | null | undefined): string {
  if (grams == null) return "—"
  if (grams >= 1000) {
    const kg = grams / 1000
    const formatted = parseFloat(kg.toFixed(3)).toString()
    return `${formatted} kg`
  }
  return `${Math.round(grams)} g`
}

export function formatQuantity(
  value: number | null | undefined,
  unit: string,
  decimals = 0,
): string {
  if (value == null) return "—"
  const formatted = decimals > 0
    ? value.toFixed(decimals)
    : formatNumber(Math.round(value))
  return `${formatted} ${unit}`
}

export function formatDurationDays(days: number | null | undefined): string {
  if (days == null) return "—"
  return formatCountWithUnit(days, "jour")
}

export function formatRemainingDays(days: number | null | undefined): string {
  if (days == null) return "—"
  return `${formatDurationDays(days)} restant${days > 1 ? "s" : ""}`
}

export function formatAiCredits(value: number | null | undefined): string {
  if (value == null) return "—"
  if (value <= 0) return "IA epuisee"
  return formatCountWithUnit(value, "analyse IA", "analyses IA")
}

export function formatDate(
  date: Date | string | number | null | undefined,
): string {
  const normalizedDate = toDate(date)
  if (!normalizedDate) return "—"
  return format(normalizedDate, "d MMM yyyy", { locale: fr })
}

export function formatDateTime(
  date: Date | string | number | null | undefined,
): string {
  const normalizedDate = toDate(date)
  if (!normalizedDate) return "—"
  return format(normalizedDate, "d MMM yyyy 'à' HH:mm", { locale: fr })
}

export function formatRelativeDate(
  date: Date | string | number | null | undefined,
): string {
  const normalizedDate = toDate(date)
  if (!normalizedDate) return "—"
  return formatDistanceToNow(normalizedDate, { locale: fr, addSuffix: true })
}

export function formatBatchCode(code: string | null | undefined): string {
  return code?.trim() || "—"
}
