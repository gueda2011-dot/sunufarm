"""
export_real_data.py
-------------------
Exporte les BatchOutcomeSnapshot depuis la base Prisma vers
ml/data/real/ml_features_j14.csv — prêt pour l'entraînement ML.

SÉPARATION DES SOURCES — RÈGLE FONDAMENTALE :
  Ce script ne touche QUE ml/data/real/.
  Il ne lit JAMAIS ml/data/synthetic/ et n'y écrit jamais.
  Les fichiers synthétiques et réels ne sont jamais croisés.

Pré-requis :
  pip install psycopg2-binary python-dotenv pandas

Usage :
  python ml/export_real_data.py [--min-lots 30] [--since 2026-01-01]

Variables d'environnement (.env ou environnement système) :
  DATABASE_URL — URL PostgreSQL Prisma (ex: postgresql://user:pass@host/db)

Le fichier produit (ml_features_j14.csv) contient une ligne par lot clôturé,
avec les features normalisées au format attendu par train_model.py --source real.
"""

import argparse
import csv
import os
import sys
from datetime import date, datetime, timezone

# Tentative d'import des dépendances optionnelles
try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    psycopg2 = None  # type: ignore

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))
except ImportError:
    pass  # python-dotenv optionnel

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "data", "real")
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "ml_features_j14.csv")

FEATURE_COLS = [
    "effectif_initial",
    "mortalite_cumulee_j14",
    "taux_mortalite_j14",
    "aliment_cumule_j14",
    "poids_moyen_j14",
    "depenses_cumulees_j14",
    "temperature_moyenne_j14",
    "symptomes_detectes_j14",
]
TARGET = "target_lot_a_risque"

# Seuils pour définir "lot à risque" — mêmes que dans generate_dataset.py
SEUIL_MORTALITE = 8.0   # % de mortalité totale
SEUIL_MARGE = 0.0       # marge négative = risque


# ---------------------------------------------------------------------------
# Requête SQL sur BatchOutcomeSnapshot
# ---------------------------------------------------------------------------

# On recrée les features J14 depuis les champs du snapshot.
# BatchOutcomeSnapshot contient des données agrégées sur tout le cycle,
# donc on utilise une approximation J14 basée sur les ratios disponibles.
#
# Mapping BatchOutcomeSnapshot → features J14 :
#   effectif_initial      = entryCount
#   mortalite_cumulee_j14 = approx: round(finalMortalityRatePct/100 * entryCount * 14/45)
#   taux_mortalite_j14    = mortalite_cumulee_j14 / effectif_initial
#   aliment_cumule_j14    = approx: totalFeedKg * 14/durationDays (si disponible)
#   poids_moyen_j14       = approx: avgFinalWeightG * (14/45)^0.8  (courbe logistique)
#   depenses_cumulees_j14 = approx: non disponible → 0 (placeholder)
#   temperature_moyenne_j14 = avgTemperatureMax (seule donnée météo dispo)
#   symptomes_detectes_j14  = 1 si majorMortalityDays > 0 dans les premiers jours
#   target_lot_a_risque   = 1 si finalMortalityRatePct > 8 OU finalMarginRatePct < 0

SQL_QUERY = """
SELECT
    id                        AS snapshot_id,
    "entryCount"              AS effectif_initial,
    "durationDays"            AS duration_days,

    -- Approximation mortalité cumulée à J14
    -- (répartition proportionnelle de la mortalité totale)
    ROUND(
        ("finalMortalityRatePct" / 100.0) * "entryCount"
        * LEAST(14.0 / NULLIF("durationDays", 0), 1.0)
    )::int                    AS mortalite_cumulee_j14_approx,

    "finalMortalityRatePct"   AS mortality_rate_pct_final,
    "totalFeedKg"             AS total_feed_kg,
    "avgFinalWeightG"         AS avg_final_weight_g,
    "avgTemperatureMax"       AS avg_temperature_max,
    "majorMortalityDays"      AS major_mortality_days,
    "finalMarginRatePct"      AS final_margin_rate_pct,
    "treatmentCount"          AS treatment_count,
    "createdAt"               AS created_at
FROM "BatchOutcomeSnapshot"
WHERE
    "batchType" = 'BROILER'
    {since_clause}
ORDER BY "createdAt" DESC
"""


# ---------------------------------------------------------------------------
# Conversion snapshot → features J14
# ---------------------------------------------------------------------------

def snapshot_to_features(row: dict) -> dict | None:
    """
    Convertit un BatchOutcomeSnapshot en features J14 approximées.

    Les features J14 sont une approximation car le snapshot contient
    uniquement des données agrégées sur tout le cycle.

    Retourne None si les données sont insuffisantes.
    """
    effectif = row["effectif_initial"]
    if not effectif or effectif <= 0:
        return None

    duration = row["duration_days"] or 45

    # --- mortalité cumulée J14 ---
    mortalite_j14 = row["mortalite_cumulee_j14_approx"] or 0

    # --- taux mortalité J14 ---
    taux_mort_j14 = round(mortalite_j14 / effectif, 4)

    # --- aliment cumulé J14 (approx) ---
    total_feed = row["total_feed_kg"]
    if total_feed and total_feed > 0:
        aliment_j14 = round(total_feed * (14.0 / duration), 2)
    else:
        aliment_j14 = 0.0

    # --- poids moyen J14 (approx via courbe logistique) ---
    poids_final = row["avg_final_weight_g"]
    if poids_final and poids_final > 0:
        # Approximation : poids J14 ≈ poids_final × (14/duration)^0.75
        ratio = (14.0 / duration) ** 0.75
        poids_j14 = round(poids_final * ratio, 1)
    else:
        poids_j14 = 0.0

    # --- dépenses J14 : non disponibles dans le snapshot, placeholder 0 ---
    # Les dépenses cumulées J14 ne sont pas stockées dans BatchOutcomeSnapshot.
    # On les laisse à 0 — le modèle entraîné sur données réelles pondèrera
    # cette feature moins fortement.
    depenses_j14 = 0.0

    # --- température J14 ---
    temperature_j14 = row["avg_temperature_max"] or 30.0

    # --- symptômes détectés J14 ---
    # majorMortalityDays = jours où mortalité > 2% sur tout le cycle.
    # Si au moins 1, on considère qu'un épisode a pu survenir avant J14.
    symptomes_j14 = 1 if (row["major_mortality_days"] or 0) > 0 else 0

    # --- cible : lot à risque ---
    mort_pct = row["mortality_rate_pct_final"] or 0.0
    marge_pct = row["final_margin_rate_pct"]
    lot_a_risque = int(
        mort_pct > SEUIL_MORTALITE
        or (marge_pct is not None and marge_pct < SEUIL_MARGE)
    )

    return {
        "snapshot_id": row["snapshot_id"],
        "effectif_initial": effectif,
        "mortalite_cumulee_j14": mortalite_j14,
        "taux_mortalite_j14": taux_mort_j14,
        "aliment_cumule_j14": aliment_j14,
        "poids_moyen_j14": poids_j14,
        "depenses_cumulees_j14": depenses_j14,
        "temperature_moyenne_j14": temperature_j14,
        "symptomes_detectes_j14": symptomes_j14,
        "target_lot_a_risque": lot_a_risque,
    }


# ---------------------------------------------------------------------------
# Export principal
# ---------------------------------------------------------------------------

def export(database_url: str, since: str | None, min_lots: int):
    if psycopg2 is None:
        print("ERREUR : psycopg2 non installé.")
        print("  pip install psycopg2-binary")
        sys.exit(1)

    since_clause = ""
    params = []
    if since:
        since_clause = 'AND "createdAt" >= %s'
        params.append(since)

    query = SQL_QUERY.format(since_clause=since_clause)

    print(f"Connexion à la base de données...")
    conn = psycopg2.connect(database_url)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(query, params or None)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    print(f"  {len(rows)} snapshots récupérés depuis BatchOutcomeSnapshot")

    features = []
    skipped = 0
    for row in rows:
        f = snapshot_to_features(dict(row))
        if f:
            features.append(f)
        else:
            skipped += 1

    if skipped:
        print(f"  {skipped} snapshots ignorés (données insuffisantes)")

    if len(features) < min_lots:
        print(
            f"AVERTISSEMENT : seulement {len(features)} lots réels disponibles "
            f"(minimum recommandé : {min_lots}).\n"
            "L'entraînement sur données réelles n'est pas encore fiable.\n"
            "Continuez d'utiliser --source synthetic pour l'instant."
        )
        if len(features) == 0:
            return

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    cols = ["snapshot_id"] + FEATURE_COLS + [TARGET]
    with open(OUTPUT_PATH, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(features)

    n_risque = sum(f["target_lot_a_risque"] for f in features)
    print(f"\nExport termine -> {OUTPUT_PATH}")
    print(f"  Lots exportes   : {len(features)}")
    print(f"  Lots a risque   : {n_risque} ({100*n_risque/len(features):.1f}%)")
    print(f"\nProchaine etape : python ml/train_model.py --source real")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Export BatchOutcomeSnapshot → ml/data/real/ (NE PAS MÉLANGER avec synthétique)"
    )
    parser.add_argument(
        "--since", default=None,
        help="Date ISO (ex: 2026-01-01) pour filtrer les snapshots récents"
    )
    parser.add_argument(
        "--min-lots", type=int, default=30,
        help="Avertissement si moins de N lots disponibles (défaut: 30)"
    )
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
    if not database_url:
        print("ERREUR : variable DATABASE_URL non définie.")
        print("  Ajoutez DATABASE_URL dans .env.local ou exportez-la dans le shell.")
        sys.exit(1)

    export(database_url, args.since, args.min_lots)


if __name__ == "__main__":
    main()
