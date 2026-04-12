/**
 * Traduction des erreurs offline en messages métier lisibles.
 *
 * Règle d'usage : toujours appeler getOfflineUserMessage() pour afficher
 * une erreur à l'utilisateur. Ne jamais afficher `lastError` brut en UI principale.
 */

export interface OfflineUserMessage {
  /** Titre court affiché en gras */
  title: string
  /** Explication métier actionnable */
  description: string
  /** Gravité : error = définitif / warning = transitoire */
  severity: "error" | "warning"
  /** Vrai si l'opération peut être retentée sans modification */
  retryable: boolean
}

// ---------------------------------------------------------------------------
// Labels lisibles par type de mutation
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  CREATE_DAILY_RECORD:      "saisie journalière",
  CREATE_FEED_MOVEMENT:     "mouvement d'aliment",
  CREATE_MEDICINE_MOVEMENT: "mouvement de médicament",
  CREATE_VACCINATION:       "vaccination",
  CREATE_TREATMENT:         "traitement",
  CREATE_SALE:              "vente",
  CREATE_PURCHASE:          "achat fournisseur",
  CREATE_EXPENSE:           "dépense",
  CREATE_EGG_RECORD:        "production d'œufs",
}

// ---------------------------------------------------------------------------
// Détection de catégorie à partir du message brut
// ---------------------------------------------------------------------------

function isDuplicate(error: string) {
  return /already|duplicate|deja.*enregistr|clientMutationId|idempotent|already.*recorded/i.test(error)
}

function isMissingRef(error: string) {
  return /foreign key|not found|introuvable|does not exist|record.*not.*found|no.*record/i.test(error)
}

function isNotSynced(error: string) {
  return /CLIENT_VALIDATION_FAILED|non.*synchronis|not.*yet.*sync|référence.*locale|local.*id/i.test(error)
}

function isValidation(error: string) {
  return /required|invalid|validation|zod|parse|schema|too short|too long|must be|expected/i.test(error)
}

function isInsufficientStock(error: string) {
  return /insuffi|stock.*épuis|quantit.*insuffi|out of stock/i.test(error)
}

function isTemporaryServer(error: string) {
  return /timeout|unavailable|503|502|504|internal server error|500|service.*unavail/i.test(error)
}

function isNetwork(error: string) {
  return /fetch|network|offline|failed to fetch|net::/i.test(error)
}

function isUnsupported(error: string) {
  return /SYNC_ACTION_NOT_SUPPORTED/i.test(error)
}

// ---------------------------------------------------------------------------
// Détection de l'entité manquante à partir du message brut
// ---------------------------------------------------------------------------

type MissingEntity =
  | "customer"
  | "supplier"
  | "batch"
  | "feedStock"
  | "medicineStock"
  | "stock"
  | null

/**
 * Tente de déduire quelle entité est manquante à partir du message backend.
 * Scanne les noms de champs (customerId, supplierId…) et les noms de modèle
 * (Customer, Supplier, Batch…) tels qu'ils apparaissent typiquement dans les
 * erreurs Prisma ou les validations custom.
 */
function detectMissingEntity(raw: string): MissingEntity {
  // Noms de champs et modèles — ordre : du plus spécifique au plus général
  if (/feedStockId|feedStock|feed_stock|aliment/i.test(raw))   return "feedStock"
  if (/medicineStockId|medicineStock|medicine_stock|medicament|médicament/i.test(raw)) return "medicineStock"
  if (/customerId|Customer\b|client\b/i.test(raw))              return "customer"
  if (/supplierId|Supplier\b|fournisseur/i.test(raw))           return "supplier"
  if (/batchId|Batch\b|\blot\b/i.test(raw))                    return "batch"
  if (/stockId|\bstock\b/i.test(raw))       return "stock"
  return null
}

// ---------------------------------------------------------------------------
// Labels courts par entité (pour composer les phrases)
// ---------------------------------------------------------------------------

const ENTITY_LABELS: Record<NonNullable<MissingEntity>, string> = {
  customer:      "Le client",
  supplier:      "Le fournisseur",
  batch:         "Le lot",
  feedStock:     "Le stock d'aliment",
  medicineStock: "Le médicament",
  stock:         "Le stock",
}

const ACTION_CONTEXT: Record<string, string> = {
  CREATE_DAILY_RECORD:      "cette saisie journalière",
  CREATE_FEED_MOVEMENT:     "ce mouvement d'aliment",
  CREATE_MEDICINE_MOVEMENT: "ce mouvement de médicament",
  CREATE_VACCINATION:       "cette vaccination",
  CREATE_TREATMENT:         "ce traitement",
  CREATE_SALE:              "cette vente",
  CREATE_PURCHASE:          "cet achat",
  CREATE_EXPENSE:           "cette dépense",
  CREATE_EGG_RECORD:        "cet enregistrement de production",
}

// ---------------------------------------------------------------------------
// Messages par type de mutation pour les cas de dépendance manquante
// ---------------------------------------------------------------------------

function getMissingRefMessage(raw: string, action?: string, scope?: string): string {
  const entity = detectMissingEntity(raw)
  const context = action ? ACTION_CONTEXT[action] : null

  // Message précis si entité identifiable
  if (entity) {
    const entityLabel = ENTITY_LABELS[entity]
    const contextSuffix = context ? ` lié à ${context}` : ""
    return `${entityLabel}${contextSuffix} n'a pas été retrouvé. Synchronisez vos données puis réessayez.`
  }

  // Fallbacks par action quand l'entité n'est pas détectable dans le message
  if (action === "CREATE_SALE") {
    return "Le client ou le lot lié à cette vente n'a pas été retrouvé. Synchronisez vos données puis réessayez."
  }
  if (action === "CREATE_PURCHASE") {
    return "Le fournisseur lié à cet achat n'a pas été retrouvé. Synchronisez vos données puis réessayez."
  }
  if (action === "CREATE_DAILY_RECORD") {
    return "Le lot ou le stock d'aliment lié à cette saisie n'a pas été retrouvé. Synchronisez vos références puis réessayez."
  }
  if (action === "CREATE_FEED_MOVEMENT") {
    return "Le stock d'aliment lié à ce mouvement n'a pas été retrouvé ou n'est pas encore synchronisé."
  }
  if (action === "CREATE_MEDICINE_MOVEMENT") {
    return "Le médicament lié à ce mouvement n'a pas été retrouvé ou n'est pas encore synchronisé."
  }
  if (action === "CREATE_VACCINATION" || action === "CREATE_TREATMENT" || scope === "health") {
    return "Le lot ou le médicament lié à cette opération n'a pas été retrouvé."
  }

  return "Une donnée liée à cette opération n'a pas été retrouvée. Synchronisez vos données puis réessayez."
}

// ---------------------------------------------------------------------------
// Messages par type de mutation pour les conflits
// ---------------------------------------------------------------------------

function getConflictMessage(action?: string): string {
  if (action === "CREATE_DAILY_RECORD") {
    return "Cette saisie journalière semble déjà avoir été enregistrée par un autre appareil ou une session précédente."
  }
  if (action === "CREATE_EGG_RECORD") {
    return "Un enregistrement de production d'œufs existe déjà pour cette date et ce lot."
  }
  if (action === "CREATE_VACCINATION") {
    return "Une vaccination avec le même identifiant a déjà été enregistrée."
  }
  return "Cette opération semble déjà avoir été enregistrée. Aucune action supplémentaire requise."
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

export function getOfflineUserMessage({
  action,
  scope,
  status,
  error,
}: {
  action?: string
  scope?: string
  status?: string
  error?: string | null
}): OfflineUserMessage {
  const raw = error ?? ""
  const isConflictStatus = status === "conflict"

  // ── Conflit (status ou message) ──────────────────────────────────────────
  if (isConflictStatus || /\bconflict\b/i.test(raw)) {
    // Si c'est un doublon explicite on est plus précis
    if (isDuplicate(raw) || isConflictStatus) {
      return {
        title: "Déjà enregistré",
        description: getConflictMessage(action),
        severity: "warning",
        retryable: false,
      }
    }
  }

  // ── Doublon ───────────────────────────────────────────────────────────────
  if (isDuplicate(raw)) {
    return {
      title: "Déjà enregistré",
      description: getConflictMessage(action),
      severity: "warning",
      retryable: false,
    }
  }

  // ── Référence locale non synchronisée ────────────────────────────────────
  if (isNotSynced(raw)) {
    return {
      title: "Référence non synchronisée",
      description:
        "Une référence utilisée dans cette opération n'a pas encore été synchronisée avec le serveur. " +
        "Synchronisez d'abord les lots ou les stocks associés.",
      severity: "error",
      retryable: true,
    }
  }

  // ── Dépendance introuvable ────────────────────────────────────────────────
  if (isMissingRef(raw)) {
    return {
      title: "Donnée liée introuvable",
      description: getMissingRefMessage(raw, action, scope),
      severity: "error",
      retryable: true,
    }
  }

  // ── Données invalides ─────────────────────────────────────────────────────
  if (isValidation(raw)) {
    return {
      title: "Données invalides",
      description: "Certaines informations de cette opération sont invalides ou incomplètes. Vérifiez la saisie.",
      severity: "error",
      retryable: false,
    }
  }

  // ── Stock insuffisant ─────────────────────────────────────────────────────
  if (isInsufficientStock(raw)) {
    return {
      title: "Stock insuffisant",
      description: "La quantité disponible en stock est insuffisante pour cette opération.",
      severity: "error",
      retryable: false,
    }
  }

  // ── Réseau / offline ──────────────────────────────────────────────────────
  if (isNetwork(raw)) {
    return {
      title: "Connexion requise",
      description:
        "Cette opération nécessite une connexion réseau. Elle sera relancée automatiquement au retour du réseau.",
      severity: "warning",
      retryable: true,
    }
  }

  // ── Serveur temporairement indisponible ───────────────────────────────────
  if (isTemporaryServer(raw)) {
    return {
      title: "Serveur momentanément indisponible",
      description: "Le serveur est momentanément indisponible. Cette opération sera réessayée automatiquement.",
      severity: "warning",
      retryable: true,
    }
  }

  // ── Opération non supportée ───────────────────────────────────────────────
  if (isUnsupported(raw)) {
    return {
      title: "Opération non supportée",
      description: "Ce type d'opération n'est pas encore pris en charge par la synchronisation automatique.",
      severity: "error",
      retryable: false,
    }
  }

  // ── Erreur générique (failed sans détail) ─────────────────────────────────
  if (!raw || raw === "SYNC_FAILED") {
    const actionLabel = action ? `La ${ACTION_LABELS[action] ?? "opération"}` : "Cette opération"
    return {
      title: "Erreur de synchronisation",
      description: `${actionLabel} n'a pas pu être synchronisée. Réessayez ou vérifiez votre connexion.`,
      severity: "error",
      retryable: true,
    }
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  return {
    title: "Erreur inattendue",
    description: "Une erreur inattendue est survenue lors de la synchronisation de cette opération.",
    severity: "error",
    retryable: true,
  }
}

// ---------------------------------------------------------------------------
// Variante légère pour les erreurs globales (sans type de mutation)
// ---------------------------------------------------------------------------

export function getOfflineGlobalErrorMessage(error: string | null): string | null {
  if (!error) return null
  const msg = getOfflineUserMessage({ error })
  return `${msg.title} — ${msg.description}`
}
