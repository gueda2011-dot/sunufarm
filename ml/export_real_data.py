"""
export_real_data.py
-------------------
Exporte les BatchOutcomeSnapshot depuis la base Prisma vers
ml/data/real/ml_features_j14.csv — prêt pour l'entraînement ML.

SÉPARATION DES SOURCES — RÈGLE FONDAMENTALE :
  Ce script ne touche QUE ml/data/real/.
  Il ne lit JAMAIS ml/data/synthetic/ et n'y écrit jamais.

Pipeline :
  1. Audit DB (couche 1) — vérifie la qualité des snapshots en base
  2. Export CSV — convertit les snapshots en features J14 approximées
  3. Validation features (couche 2) — délégué à validate_real_data.py

Pré-requis :
  pip install psycopg2-binary python-dotenv

Usage :
  python ml/export_real_data.py [--min-lots 30] [--since 2026-01-01] [--skip-audit]

Variables d'environnement (.env.local ou shell) :
  DATABASE_URL — URL PostgreSQL Prisma (ex: postgresql://user:pass@host/db)
"""

import argparse
import csv
import json
import os
import sys
from datetime import datetime, timezone

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
    pass

ML_DIR      = os.path.dirname(__file__)
OUTPUT_DIR  = os.path.join(ML_DIR, "data", "real")
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "ml_features_j14.csv")
AUDIT_PATH  = os.path.join(OUTPUT_DIR, "db_audit.json")

FEATURE_COLS = [
    "effectif_initial",
    "mortalite_cumulee_j14",
    "taux_mortalite_j14",
    "aliment_cumule_j14",
    "poids_moyen_j14",
    "depenses_cumulees_j14",
    "temperature_moyenne_j14",
    "symptomes_detectes_j14",
    # Phase 4 — qualité données alimentation J1–J14
    "pct_estime_j14",
    "confiance_moyenne_j14",
]
TARGET = "target_lot_a_risque"

# Seuils cible — identiques à generate_dataset.py
SEUIL_MORTALITE = 8.0   # % mortalité totale
SEUIL_MARGE     = 0.0   # marge nette

# Plages biologiques valides (poulets de chair, Sénégal)
BIO_RANGES = {
    "entryCount":             (50,    5_000),
    "durationDays":           (30,    70),
    "finalMortalityRatePct":  (0.0,   50.0),
    "finalFCR":               (1.3,   5.0),
    "avgFinalWeightG":        (1_000, 3_500),
    "avgTemperatureMax":      (20.0,  44.0),
}


# ---------------------------------------------------------------------------
# COUCHE 1 — Audit DB (sur BatchOutcomeSnapshot directement)
# ---------------------------------------------------------------------------

# Requête d'audit : statistiques de qualité des snapshots en base
SQL_AUDIT = """
SELECT
    COUNT(*)                              AS total_snapshots,

    -- Complétude des champs critiques
    COUNT("finalMortalityRatePct")        AS has_mortality,
    COUNT("entryCount")                   AS has_entry_count,
    COUNT("durationDays")                 AS has_duration,

    -- Complétude des champs utiles mais optionnels
    COUNT("totalFeedKg")                  AS has_feed,
    COUNT("avgFinalWeightG")              AS has_weight,
    COUNT("avgTemperatureMax")            AS has_temperature,
    COUNT("finalMarginRatePct")           AS has_margin,
    COUNT("finalFCR")                     AS has_fcr,

    -- Cohérence biologique (comptage des valeurs hors plage)
    COUNT(*) FILTER (
        WHERE "entryCount" < 50 OR "entryCount" > 5000
    )                                     AS incoherent_entry_count,
    COUNT(*) FILTER (
        WHERE "durationDays" < 30 OR "durationDays" > 70
    )                                     AS incoherent_duration,
    COUNT(*) FILTER (
        WHERE "finalMortalityRatePct" < 0 OR "finalMortalityRatePct" > 50
    )                                     AS incoherent_mortality,
    COUNT(*) FILTER (
        WHERE "finalFCR" IS NOT NULL AND ("finalFCR" < 1.3 OR "finalFCR" > 5.0)
    )                                     AS incoherent_fcr,
    COUNT(*) FILTER (
        WHERE "avgFinalWeightG" IS NOT NULL
          AND ("avgFinalWeightG" < 1000 OR "avgFinalWeightG" > 3500)
    )                                     AS incoherent_weight,

    -- Clôture propre (lot terminé avec outcome disponible)
    COUNT(*) FILTER (
        WHERE "finalMortalityRatePct" IS NOT NULL
          AND "entryCount" IS NOT NULL
          AND "durationDays" >= 30
    )                                     AS properly_closed,

    -- Équilibre de la cible
    COUNT(*) FILTER (
        WHERE "finalMortalityRatePct" > {seuil_mortalite}
           OR ("finalMarginRatePct" IS NOT NULL AND "finalMarginRatePct" < {seuil_marge})
    )                                     AS n_at_risk

FROM "BatchOutcomeSnapshot"
WHERE "batchType" = 'CHAIR'
{since_clause}
""".format(
    seuil_mortalite=SEUIL_MORTALITE,
    seuil_marge=SEUIL_MARGE,
    since_clause="{since_clause}",   # placeholder pour paramètre dynamique
)


def run_db_audit(conn, since: str | None) -> dict:
    """
    Exécute l'audit qualité sur BatchOutcomeSnapshot.
    Retourne un rapport structuré + flag ready_for_export.
    """
    since_clause = ""
    params: list = []
    if since:
        since_clause = 'AND "createdAt" >= %s'
        params.append(since)

    query = SQL_AUDIT.format(since_clause=since_clause)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(query, params or None)
    row = dict(cur.fetchone())
    cur.close()

    total = row["total_snapshots"] or 0
    if total == 0:
        return {
            "auditedAt": datetime.now(timezone.utc).isoformat(),
            "totalSnapshots": 0,
            "ready_for_export": False,
            "blockers": ["Aucun snapshot CHAIR dans BatchOutcomeSnapshot."],
            "checks": {},
        }

    def rate(n):
        return round((n or 0) / total, 3)

    # --- Complétude ---
    completeness = {
        "mortality":    rate(row["has_mortality"]),
        "entry_count":  rate(row["has_entry_count"]),
        "duration":     rate(row["has_duration"]),
        "feed":         rate(row["has_feed"]),         # optionnel
        "weight":       rate(row["has_weight"]),       # optionnel
        "temperature":  rate(row["has_temperature"]),  # optionnel
        "margin":       rate(row["has_margin"]),       # optionnel
        "fcr":          rate(row["has_fcr"]),          # optionnel
    }

    # Champs critiques = ceux sans lesquels on ne peut pas construire les features
    critical_completeness = min(
        completeness["mortality"],
        completeness["entry_count"],
        completeness["duration"],
    )

    # --- Cohérence biologique ---
    n_incoherent = max(
        row["incoherent_entry_count"] or 0,
        row["incoherent_duration"]    or 0,
        row["incoherent_mortality"]   or 0,
    )
    coherence_rate = round(1 - (n_incoherent / total), 3)

    # --- Clôture propre ---
    closure_rate = rate(row["properly_closed"])

    # --- Équilibre cible ---
    n_risk = row["n_at_risk"] or 0
    n_safe = total - n_risk
    minority_ratio = round(min(n_risk, n_safe) / total, 3) if total > 0 else 0

    # --- Gates ---
    blockers = []
    if critical_completeness < 0.80:
        blockers.append(
            f"Complétude critique insuffisante ({critical_completeness*100:.0f}% < 80%) — "
            "mortalité, effectif ou durée trop souvent absents."
        )
    if coherence_rate < 0.75:
        n_bad = n_incoherent
        blockers.append(
            f"Trop de snapshots biologiquement incohérents "
            f"({n_bad}/{total} hors plages attendues)."
        )
    if closure_rate < 0.70:
        blockers.append(
            f"Trop de lots mal clôturés ({closure_rate*100:.0f}% proprement fermés < 70%). "
            "Vérifiez que closeBatch() appelle bien generateBatchOutcomeSnapshot()."
        )
    if minority_ratio < 0.10:
        blockers.append(
            f"Déséquilibre extrême des classes "
            f"({n_risk} à risque / {n_safe} sains — classe minoritaire < 10%). "
            "Le modèle ne pourra pas apprendre de signaux fiables."
        )

    audit = {
        "auditedAt": datetime.now(timezone.utc).isoformat(),
        "totalSnapshots": total,
        "ready_for_export": len(blockers) == 0,
        "blockers": blockers,
        "checks": {
            "completeness": {
                "critical_rate": critical_completeness,
                "passed": critical_completeness >= 0.80,
                "details": completeness,
            },
            "coherence": {
                "rate": coherence_rate,
                "n_incoherent": n_incoherent,
                "passed": coherence_rate >= 0.75,
                "details": {
                    "incoherent_entry_count": row["incoherent_entry_count"] or 0,
                    "incoherent_duration":    row["incoherent_duration"]    or 0,
                    "incoherent_mortality":   row["incoherent_mortality"]   or 0,
                    "incoherent_fcr":         row["incoherent_fcr"]         or 0,
                    "incoherent_weight":      row["incoherent_weight"]      or 0,
                },
            },
            "closure_quality": {
                "rate": closure_rate,
                "n_properly_closed": row["properly_closed"] or 0,
                "passed": closure_rate >= 0.70,
            },
            "class_balance": {
                "n_at_risk":      n_risk,
                "n_safe":         n_safe,
                "minority_ratio": minority_ratio,
                "passed":         minority_ratio >= 0.10,
            },
        },
    }
    return audit


def print_audit(audit: dict):
    total = audit["totalSnapshots"]
    print(f"\n{'='*55}")
    print("AUDIT DB — BatchOutcomeSnapshot (CHAIR)")
    print(f"{'='*55}")
    print(f"  Snapshots    : {total}")
    print(f"  Pret export  : {'OUI' if audit['ready_for_export'] else 'NON'}")

    checks = audit.get("checks", {})

    c = checks.get("completeness", {})
    status = "OK  " if c.get("passed") else "FAIL"
    print(f"  [{status}] Completude critique   : {c.get('critical_rate', 0)*100:.0f}%")
    det = c.get("details", {})
    for field, rate in det.items():
        marker = "  " if rate >= 0.80 else "!!"
        print(f"         {marker} {field:<16}: {rate*100:.0f}%")

    c = checks.get("coherence", {})
    status = "OK  " if c.get("passed") else "FAIL"
    print(f"  [{status}] Coherence biologique  : {c.get('rate', 0)*100:.0f}%"
          f"  ({c.get('n_incoherent', 0)} lots hors plage)")

    c = checks.get("closure_quality", {})
    status = "OK  " if c.get("passed") else "FAIL"
    print(f"  [{status}] Cloture propre        : {c.get('rate', 0)*100:.0f}%"
          f"  ({c.get('n_properly_closed', 0)}/{total})")

    c = checks.get("class_balance", {})
    status = "OK  " if c.get("passed") else "FAIL"
    print(f"  [{status}] Equilibre classes     : "
          f"{c.get('n_at_risk', 0)} a risque / {c.get('n_safe', 0)} sains"
          f"  (minorite {c.get('minority_ratio', 0)*100:.0f}%)")

    if audit["blockers"]:
        print()
        print("  BLOCAGES :")
        for b in audit["blockers"]:
            print(f"    - {b}")

    print(f"{'='*55}")


# ---------------------------------------------------------------------------
# Requête d'export des snapshots
# ---------------------------------------------------------------------------

SQL_EXPORT = """
SELECT
    id                        AS snapshot_id,
    "entryCount"              AS effectif_initial,
    "durationDays"            AS duration_days,

    -- Approximation mortalité cumulée à J14
    -- (répartition proportionnelle, hypothèse de mortalité uniforme sur le cycle)
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
    -- Phase 4 — qualité données alimentation
    "pctEstimatedJ14"         AS pct_estimated_j14,
    "avgConfidenceJ14"        AS avg_confidence_j14,
    "createdAt"               AS created_at

FROM "BatchOutcomeSnapshot"
WHERE
    "batchType" = 'CHAIR'
    -- Exclure les lots trop courts ou incohérents (nettoyage minimal)
    AND "durationDays" >= 30
    AND "finalMortalityRatePct" IS NOT NULL
    AND "entryCount" >= 50
    {since_clause}
ORDER BY "createdAt" DESC
"""


# ---------------------------------------------------------------------------
# Conversion snapshot → features J14 approximées
# ---------------------------------------------------------------------------

def snapshot_to_features(row: dict) -> dict | None:
    """
    Convertit un BatchOutcomeSnapshot en features J14 approximées.

    LIMITES DE L'APPROXIMATION :
      Les snapshots contiennent des agrégats sur tout le cycle.
      Les features J14 sont reconstruites par interpolation :
        - mortalité : répartition proportionnelle (hypothèse uniforme)
        - poids     : courbe logistique approchée (14/durée)^0.75
        - aliment   : proportion temporelle linéaire
        - dépenses  : non disponibles → 0 (le modèle réel devra traiter ce cas)

    Ces approximations sont légitimes pour l'entraînement mais doivent
    être mentionnées dans le model.json (fait par train_model.py).
    """
    effectif = row.get("effectif_initial")
    if not effectif or int(effectif) <= 0:
        return None

    effectif = int(effectif)
    duration = int(row.get("duration_days") or 45)

    # Mortalité J14
    mortalite_j14 = int(row.get("mortalite_cumulee_j14_approx") or 0)
    taux_mort_j14 = round(mortalite_j14 / effectif, 4)

    # Aliment J14 (interpolation linéaire)
    total_feed = row.get("total_feed_kg")
    if total_feed and float(total_feed) > 0:
        aliment_j14 = round(float(total_feed) * (14.0 / duration), 2)
    else:
        aliment_j14 = 0.0

    # Poids J14 (courbe logistique approchée)
    poids_final = row.get("avg_final_weight_g")
    if poids_final and int(poids_final) > 0:
        ratio = (14.0 / duration) ** 0.75
        poids_j14 = round(int(poids_final) * ratio, 1)
    else:
        poids_j14 = 0.0

    # Dépenses J14 : non disponibles dans BatchOutcomeSnapshot
    # → placeholder 0.0 (feature exclue de fait du modèle réel si constante)
    depenses_j14 = 0.0

    # Température (moyenne sur tout le cycle — meilleure approximation disponible)
    temperature_j14 = float(row.get("avg_temperature_max") or 30.0)

    # Symptômes : proxy via majorMortalityDays (jours > 2% mortalité)
    symptomes_j14 = 1 if int(row.get("major_mortality_days") or 0) > 0 else 0

    # Cible
    mort_pct = float(row.get("mortality_rate_pct_final") or 0.0)
    marge_pct_raw = row.get("final_margin_rate_pct")
    marge_pct = float(marge_pct_raw) if marge_pct_raw is not None else None
    lot_a_risque = int(
        mort_pct > SEUIL_MORTALITE
        or (marge_pct is not None and marge_pct < SEUIL_MARGE)
    )

    # Phase 4 — qualité données alimentation
    # Valeur par défaut sûre si le snapshot est antérieur à Phase 4 (NULL en base)
    pct_estime = row.get("pct_estimated_j14")
    pct_estime_j14 = float(pct_estime) if pct_estime is not None else 0.0

    avg_conf = row.get("avg_confidence_j14")
    confiance_j14 = float(avg_conf) if avg_conf is not None else 1.0

    return {
        "snapshot_id":              row["snapshot_id"],
        "effectif_initial":         effectif,
        "mortalite_cumulee_j14":    mortalite_j14,
        "taux_mortalite_j14":       taux_mort_j14,
        "aliment_cumule_j14":       aliment_j14,
        "poids_moyen_j14":          poids_j14,
        "depenses_cumulees_j14":    depenses_j14,
        "temperature_moyenne_j14":  temperature_j14,
        "symptomes_detectes_j14":   symptomes_j14,
        "pct_estime_j14":           pct_estime_j14,
        "confiance_moyenne_j14":    confiance_j14,
        "target_lot_a_risque":      lot_a_risque,
    }


# ---------------------------------------------------------------------------
# Export principal
# ---------------------------------------------------------------------------

def export(database_url: str, since: str | None, min_lots: int, skip_audit: bool):
    if psycopg2 is None:
        print("ERREUR : psycopg2 non installe.")
        print("  pip install psycopg2-binary")
        sys.exit(1)

    print("Connexion a la base de donnees...")
    conn = psycopg2.connect(database_url)

    # --- COUCHE 1 : Audit DB ---
    if not skip_audit:
        print("Audit DB en cours...")
        audit = run_db_audit(conn, since)
        print_audit(audit)

        # Sauvegarde de l'audit
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        with open(AUDIT_PATH, "w", encoding="utf-8") as f:
            json.dump(audit, f, indent=2, ensure_ascii=False)

        if not audit["ready_for_export"]:
            print("\nExport annule : corrigez les blocages ci-dessus.")
            print("Conseil : utilisez --source synthetic pendant la periode de montee en qualite.")
            conn.close()
            sys.exit(1)
    else:
        print("Audit DB ignore (--skip-audit).")

    # --- Export des snapshots ---
    since_clause = ""
    params: list = []
    if since:
        since_clause = 'AND "createdAt" >= %s'
        params.append(since)

    query = SQL_EXPORT.format(since_clause=since_clause)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(query, params or None)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    print(f"\n{len(rows)} snapshots eligibles recuperes")

    features = []
    skipped = 0
    for row in rows:
        f = snapshot_to_features(dict(row))
        if f:
            features.append(f)
        else:
            skipped += 1

    if skipped:
        print(f"  {skipped} snapshots ignores (donnees insuffisantes apres conversion)")

    if len(features) == 0:
        print("ERREUR : aucun lot exportable.")
        sys.exit(1)

    if len(features) < min_lots:
        print(
            f"\nATTENTION : seulement {len(features)} lots disponibles "
            f"(minimum recommande : {min_lots}).\n"
            "L'export est produit mais l'entrainement reste deconseille.\n"
            "validate_real_data.py bloquera si le seuil n'est pas atteint."
        )

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    cols = ["snapshot_id"] + FEATURE_COLS + [TARGET]
    with open(OUTPUT_PATH, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(features)

    n_risque = sum(f["target_lot_a_risque"] for f in features)
    print(f"\nExport termine -> {OUTPUT_PATH}")
    print(f"  Lots exportes : {len(features)}")
    print(f"  Lots a risque : {n_risque} ({100*n_risque/len(features):.1f}%)")
    print(f"\nEtape suivante : python ml/validate_real_data.py")
    print(f"Puis si OK     : python ml/train_model.py --source real")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Export BatchOutcomeSnapshot -> ml/data/real/ (sources strictement separees)"
    )
    parser.add_argument(
        "--since", default=None,
        help="Filtrer les snapshots apres cette date ISO (ex: 2026-01-01)"
    )
    parser.add_argument(
        "--min-lots", type=int, default=30,
        help="Seuil d'avertissement si moins de N lots (defaut: 30)"
    )
    parser.add_argument(
        "--skip-audit", action="store_true",
        help="Ignorer l'audit DB (deconseille — uniquement pour les tests)"
    )
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
    if not database_url:
        print("ERREUR : variable DATABASE_URL non definie.")
        print("  Ajoutez-la dans .env.local ou exportez-la dans le shell.")
        sys.exit(1)

    export(database_url, args.since, args.min_lots, args.skip_audit)


if __name__ == "__main__":
    main()
