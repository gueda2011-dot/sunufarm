/**
 * SunuFarm — Utilitaires généraux
 *
 * cn()                : fusionne les classes Tailwind sans conflits (clsx + tailwind-merge)
 * generateBatchNumber : génère le numéro de lot au format SF-{YYYY}-{NNN}
 * slugify             : convertit un texte en slug URL-safe
 */

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// ---------------------------------------------------------------------------
// cn — fusion de classes Tailwind
// ---------------------------------------------------------------------------

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// ---------------------------------------------------------------------------
// generateBatchNumber — numéro de lot SunuFarm
//
// Format : SF-{YYYY}-{NNN} avec padding sur 3 chiffres minimum.
// Exemples : SF-2026-001, SF-2026-047, SF-2026-123
// La séquence est calculée par l'appelant (server action batches.ts).
// ---------------------------------------------------------------------------

export function generateBatchNumber(year: number, sequence: number): string {
  return `SF-${year}-${String(sequence).padStart(3, "0")}`
}

// ---------------------------------------------------------------------------
// slugify — conversion texte → slug URL-safe
// ---------------------------------------------------------------------------

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // supprime les accents
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
