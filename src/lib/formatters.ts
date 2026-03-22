/**
 * SunuFarm — Utilitaires de formatage
 *
 * Fonctions pures, sans effet de bord, tolérantes aux valeurs null/undefined.
 * Toutes les valeurs manquantes retournent "—" par convention UI.
 * Monnaie : FCFA (XOF) uniquement — entiers, pas de centimes.
 */

import { format, formatDistanceToNow, isValid } from "date-fns"
import { fr } from "date-fns/locale"

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/** Normalise une date depuis Date | string | number | null | undefined */
function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) return null
  const d = value instanceof Date ? value : new Date(value)
  return isValid(d) ? d : null
}

// ---------------------------------------------------------------------------
// Monnaie FCFA
// ---------------------------------------------------------------------------

const fcfaFormatter = new Intl.NumberFormat("fr-SN", {
  style: "currency",
  currency: "XOF",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/**
 * Formate un montant entier en FCFA.
 * @example formatMoneyFCFA(125000) → "125 000 FCFA"
 */
export function formatMoneyFCFA(amount: number | null | undefined): string {
  if (amount == null) return "—"
  return fcfaFormatter.format(Math.round(amount))
}

/**
 * Formate un montant FCFA en version compacte pour les KPI cards.
 * @example formatMoneyFCFACompact(1_250_000) → "1.3M FCFA"
 * @example formatMoneyFCFACompact(125_000)   → "125K FCFA"
 * @example formatMoneyFCFACompact(800)        → "800 FCFA"
 */
export function formatMoneyFCFACompact(amount: number | null | undefined): string {
  if (amount == null) return "—"
  const abs = Math.abs(amount)
  const sign = amount < 0 ? "-" : ""
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M FCFA`
  if (abs >= 1_000)     return `${sign}${Math.round(abs / 1_000)}K FCFA`
  return `${sign}${abs} FCFA`
}

/**
 * Parse une saisie utilisateur en entier FCFA.
 * Supprime tout caractère non numérique avant conversion.
 * @example parseFCFA("125 000 FCFA") → 125000
 */
export function parseFCFA(value: string | null | undefined): number {
  if (!value) return 0
  return parseInt(value.replace(/[^\d]/g, ""), 10) || 0
}

// ---------------------------------------------------------------------------
// Nombres
// ---------------------------------------------------------------------------

const numberFormatter = new Intl.NumberFormat("fr-SN")

/**
 * Formate un nombre avec séparateurs de milliers locaux.
 * @example formatNumber(4500) → "4 500"
 */
export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "—"
  return numberFormatter.format(value)
}

/**
 * Formate un pourcentage avec le nombre de décimales souhaité.
 * @example formatPercent(78.5)    → "78.5%"
 * @example formatPercent(78.5, 0) → "79%"
 */
export function formatPercent(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (value == null) return "—"
  return `${value.toFixed(decimals)}%`
}

// ---------------------------------------------------------------------------
// Poids
// ---------------------------------------------------------------------------

/**
 * Formate un poids en grammes vers une unité lisible.
 * @example formatWeight(1750) → "1.75 kg"
 * @example formatWeight(850)  → "850 g"
 */
export function formatWeight(grams: number | null | undefined): string {
  if (grams == null) return "—"
  if (grams >= 1000) {
    const kg = grams / 1000
    // Supprime les zéros décimaux inutiles : 1.750 → "1.75", 2.000 → "2"
    const formatted = parseFloat(kg.toFixed(3)).toString()
    return `${formatted} kg`
  }
  return `${Math.round(grams)} g`
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * Formate une date au format court lisible.
 * @example formatDate(new Date("2026-03-20")) → "20 mars 2026"
 */
export function formatDate(
  date: Date | string | number | null | undefined,
): string {
  const d = toDate(date)
  if (!d) return "—"
  return format(d, "d MMM yyyy", { locale: fr })
}

/**
 * Formate une date avec l'heure.
 * @example formatDateTime(date) → "20 mars 2026 à 14:32"
 */
export function formatDateTime(
  date: Date | string | number | null | undefined,
): string {
  const d = toDate(date)
  if (!d) return "—"
  return format(d, "d MMM yyyy 'à' HH:mm", { locale: fr })
}

/**
 * Formate une date en distance relative depuis maintenant.
 * @example formatRelativeDate(twoDaysAgo) → "il y a 2 jours"
 */
export function formatRelativeDate(
  date: Date | string | number | null | undefined,
): string {
  const d = toDate(date)
  if (!d) return "—"
  return formatDistanceToNow(d, { locale: fr, addSuffix: true })
}

// ---------------------------------------------------------------------------
// Codes lot
// ---------------------------------------------------------------------------

/**
 * Retourne le code lot tel quel pour l'affichage, avec fallback.
 * Ne génère pas de code — la génération appartient au domaine (generateBatchNumber).
 * @example formatBatchCode("SF-2026-001") → "SF-2026-001"
 */
export function formatBatchCode(code: string | null | undefined): string {
  return code?.trim() || "—"
}
