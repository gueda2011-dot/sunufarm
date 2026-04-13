"""
validate_real_data.py
---------------------
Valide la qualité des données réelles AVANT de lancer l'entraînement ML.

Deux usages :
  1. Standalone — rapport complet imprimé + validation_report.json produit
       python ml/validate_real_data.py

  2. Importé par train_model.py — gate automatique
       from ml.validate_real_data import check_readiness
       report = check_readiness()
       if not report["ready_for_training"]: sys.exit(1)

Ce que ce script vérifie sur ml/data/real/ml_features_j14.csv :

  GATE 1 — Quantité
    - Nombre de lots >= MIN_LOTS (défaut 30)

  GATE 2 — Complétude
    - Taux de nulls sur les features critiques <= MAX_NULL_RATE (défaut 20%)

  GATE 3 — Cohérence biologique (plages attendues pour poulets de chair)
    - effectif_initial         : 50 – 5 000
    - taux_mortalite_j14       : 0 – 0.30  (>30% à J14 = données suspectes)
    - poids_moyen_j14          : 50 – 800 g (J14 cible ~380 g)
    - temperature_moyenne_j14  : 22 – 42 °C

  GATE 4 — Équilibre des classes (target_lot_a_risque)
    - % classe minoritaire >= MIN_CLASS_RATIO (défaut 10%)
    - (ex: 95% "à risque" → vraisemblablement un biais de sélection)

  GATE 5 — Variance des features
    - Aucune colonne critique entièrement nulle ou constante
    - (une feature constante n'apporte aucune information au modèle)

  AVERTISSEMENTS non-bloquants :
    - Certaines features optionnelles vides (depenses_cumulees_j14, aliment_cumule_j14)
    - Équilibre classes entre 10% et 20% (entraînement possible mais moins fiable)

Sortie :
  ml/data/real/validation_report.json — lisible par train_model.py
  Code de sortie 0 (OK) / 1 (échec)
"""

import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

# pandas uniquement si disponible — sinon lecture CSV manuelle
try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

# ---------------------------------------------------------------------------
# Constantes — ajustables selon les besoins terrain
# ---------------------------------------------------------------------------

DATA_DIR = os.path.join(os.path.dirname(__file__), "data", "real")
FEATURES_PATH = os.path.join(DATA_DIR, "ml_features_j14.csv")
REPORT_PATH = os.path.join(DATA_DIR, "validation_report.json")

# Gates (seuils de blocage)
MIN_LOTS = 30               # nombre minimum de lots
MAX_NULL_RATE = 0.20        # max 20% de nulls sur features critiques
MIN_COHERENCE_RATE = 0.75   # min 75% de lignes biologiquement cohérentes
MIN_CLASS_RATIO = 0.10      # classe minoritaire >= 10%

# Features critiques (doivent être non-nulles)
CRITICAL_FEATURES = [
    "effectif_initial",
    "taux_mortalite_j14",
    "poids_moyen_j14",
    "temperature_moyenne_j14",
]

# Features optionnelles (avertissement si vide mais pas bloquant)
OPTIONAL_FEATURES = [
    "aliment_cumule_j14",
    "depenses_cumulees_j14",
    "symptomes_detectes_j14",
    # Phase 4 — qualité données alimentation (défaut sûr si absent : 0.0 / 1.0)
    "pct_estime_j14",
    "confiance_moyenne_j14",
]

# Plages biologiques attendues pour poulets de chair (CHAIR / broiler)
BIOLOGICAL_RANGES = {
    "effectif_initial":         (50,   5_000),
    "taux_mortalite_j14":       (0.0,  0.30),   # 0–30% à J14
    "poids_moyen_j14":          (50,   800),     # grammes
    "temperature_moyenne_j14":  (22,   42),      # °C
    "mortalite_cumulee_j14":    (0,    None),    # >=0
    "aliment_cumule_j14":       (0,    None),    # >=0
}


# ---------------------------------------------------------------------------
# Lecture CSV sans pandas (fallback)
# ---------------------------------------------------------------------------

def _read_csv_plain(path: str) -> list[dict]:
    import csv
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _to_float(val: Any) -> float | None:
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Checks individuels
# ---------------------------------------------------------------------------

def check_quantity(rows: list[dict]) -> dict:
    n = len(rows)
    passed = n >= MIN_LOTS
    return {
        "name": "quantity",
        "passed": passed,
        "value": n,
        "threshold": MIN_LOTS,
        "message": (
            f"{n} lots disponibles (minimum : {MIN_LOTS})"
            if passed
            else f"Seulement {n} lots — {MIN_LOTS - n} de plus nécessaires"
        ),
        "blocking": True,
    }


def check_completeness(rows: list[dict]) -> dict:
    """Vérifie le taux de nulls sur les features critiques."""
    n = len(rows)
    if n == 0:
        return {"name": "completeness", "passed": False, "score": 0.0,
                "blocking": True, "message": "Aucune donnée", "details": {}}

    field_null_rates: dict[str, float] = {}
    for feat in CRITICAL_FEATURES:
        nulls = sum(
            1 for r in rows
            if r.get(feat) is None or r.get(feat) == "" or r.get(feat) == "0"
            and feat in ("poids_moyen_j14",)  # poids=0 = manquant probable
        )
        field_null_rates[feat] = round(nulls / n, 3)

    # Score global = moyenne inverse des taux de nulls
    avg_null = sum(field_null_rates.values()) / len(field_null_rates)
    completeness_score = round(1 - avg_null, 3)
    passed = avg_null <= MAX_NULL_RATE

    return {
        "name": "completeness",
        "passed": passed,
        "score": completeness_score,
        "threshold": round(1 - MAX_NULL_RATE, 2),
        "message": (
            f"Complétude {completeness_score*100:.0f}% sur features critiques"
            if passed
            else f"Trop de valeurs manquantes (complétude {completeness_score*100:.0f}% < {(1-MAX_NULL_RATE)*100:.0f}%)"
        ),
        "details": field_null_rates,
        "blocking": True,
    }


def check_coherence(rows: list[dict]) -> dict:
    """Vérifie que les valeurs sont dans les plages biologiques attendues."""
    n = len(rows)
    if n == 0:
        return {"name": "coherence", "passed": False, "score": 0.0,
                "blocking": True, "message": "Aucune donnée", "details": {}}

    field_anomaly_counts: dict[str, int] = {f: 0 for f in BIOLOGICAL_RANGES}
    row_ok = [True] * n

    for i, row in enumerate(rows):
        for feat, (lo, hi) in BIOLOGICAL_RANGES.items():
            val = _to_float(row.get(feat))
            if val is None:
                continue
            if lo is not None and val < lo:
                field_anomaly_counts[feat] += 1
                row_ok[i] = False
            if hi is not None and val > hi:
                field_anomaly_counts[feat] += 1
                row_ok[i] = False

    coherent_rows = sum(row_ok)
    coherence_rate = round(coherent_rows / n, 3)
    passed = coherence_rate >= MIN_COHERENCE_RATE

    field_anomaly_rates = {
        f: round(c / n, 3) for f, c in field_anomaly_counts.items() if c > 0
    }

    return {
        "name": "coherence",
        "passed": passed,
        "score": coherence_rate,
        "threshold": MIN_COHERENCE_RATE,
        "message": (
            f"{coherent_rows}/{n} lots dans les plages biologiques attendues"
            if passed
            else f"Trop d'anomalies biologiques ({n - coherent_rows}/{n} lots hors plages)"
        ),
        "details": field_anomaly_rates or {},
        "blocking": True,
    }


def check_class_balance(rows: list[dict]) -> dict:
    """Vérifie l'équilibre de la cible (lot_a_risque)."""
    n = len(rows)
    if n == 0:
        return {"name": "class_balance", "passed": False,
                "blocking": True, "message": "Aucune donnée"}

    n_risk = sum(1 for r in rows if _to_float(r.get("target_lot_a_risque")) == 1)
    n_safe = n - n_risk
    minority_ratio = round(min(n_risk, n_safe) / n, 3)

    passed = minority_ratio >= MIN_CLASS_RATIO
    warning = minority_ratio < 0.20 and passed  # entre 10% et 20% : avertissement

    return {
        "name": "class_balance",
        "passed": passed,
        "warning": warning,
        "minority_ratio": minority_ratio,
        "threshold": MIN_CLASS_RATIO,
        "n_risk": n_risk,
        "n_safe": n_safe,
        "message": (
            f"{n_risk} lots à risque, {n_safe} sains "
            f"(classe minoritaire : {minority_ratio*100:.0f}%)"
            + (" — équilibre faible, résultats moins fiables" if warning else "")
        ),
        "blocking": True,
    }


def check_variance(rows: list[dict]) -> dict:
    """
    Détecte les features constantes ou entièrement nulles.
    Une feature sans variance n'apporte aucune information au modèle.
    """
    all_features = CRITICAL_FEATURES + OPTIONAL_FEATURES
    constant_features: list[str] = []
    empty_features: list[str] = []
    warnings: list[str] = []

    for feat in all_features:
        values = [_to_float(r.get(feat)) for r in rows]
        non_null = [v for v in values if v is not None]

        if len(non_null) == 0:
            empty_features.append(feat)
        elif len(set(round(v, 4) for v in non_null)) == 1:
            constant_features.append(feat)

    # Features critiques vides/constantes = bloquant
    critical_problems = [f for f in (constant_features + empty_features)
                         if f in CRITICAL_FEATURES]
    # Features optionnelles vides = avertissement
    optional_problems = [f for f in empty_features if f in OPTIONAL_FEATURES]

    if optional_problems:
        warnings.append(
            f"Features optionnelles absentes : {optional_problems} "
            "(modèle possible mais moins précis)"
        )

    passed = len(critical_problems) == 0
    return {
        "name": "variance",
        "passed": passed,
        "constant_features": constant_features,
        "empty_features": empty_features,
        "critical_problems": critical_problems,
        "warnings": warnings,
        "message": (
            "Toutes les features critiques ont de la variance"
            if passed and not critical_problems
            else f"Features critiques sans variance ou vides : {critical_problems}"
        ),
        "blocking": True,
    }


def check_optional_coverage(rows: list[dict]) -> dict:
    """
    Rapport non-bloquant sur les features optionnelles.
    Utile pour savoir si certaines approximations J14 sont fiables.
    """
    n = len(rows)
    coverage: dict[str, float] = {}
    for feat in OPTIONAL_FEATURES:
        filled = sum(
            1 for r in rows
            if _to_float(r.get(feat)) is not None and _to_float(r.get(feat)) != 0.0
        )
        coverage[feat] = round(filled / n, 3) if n > 0 else 0.0

    return {
        "name": "optional_coverage",
        "passed": True,   # jamais bloquant
        "blocking": False,
        "coverage": coverage,
        "message": "Couverture des features optionnelles (non-bloquant)",
    }


# ---------------------------------------------------------------------------
# Score global + décision
# ---------------------------------------------------------------------------

def compute_quality_score(checks: list[dict]) -> float:
    """
    Score composite 0–1 :
      - Complétude  : 35%
      - Cohérence   : 35%
      - Équilibre   : 20%
      - Variance    : 10%
    """
    weights = {
        "completeness":  0.35,
        "coherence":     0.35,
        "class_balance": 0.20,
        "variance":      0.10,
    }
    score = 0.0
    for check in checks:
        name = check["name"]
        if name not in weights:
            continue
        # Score numérique du check
        if "score" in check:
            val = check["score"]
        elif "minority_ratio" in check:
            # Balance : linéaire entre [0.10, 0.35] → [0, 1]
            r = check["minority_ratio"]
            val = min(1.0, max(0.0, (r - 0.05) / 0.30))
        else:
            val = 1.0 if check["passed"] else 0.0

        score += weights[name] * val

    return round(score, 3)


# ---------------------------------------------------------------------------
# API publique
# ---------------------------------------------------------------------------

def run_validation() -> dict:
    """
    Exécute toutes les vérifications et retourne le rapport complet.
    Écrit validation_report.json dans ml/data/real/.
    """
    if not os.path.exists(FEATURES_PATH):
        report = {
            "validatedAt": datetime.now(timezone.utc).isoformat(),
            "source": "real",
            "ready_for_training": False,
            "blockers": [
                f"Fichier introuvable : {FEATURES_PATH}. "
                "Lancez d'abord : python ml/export_real_data.py"
            ],
            "checks": {},
            "quality_score": 0.0,
        }
        _write_report(report)
        return report

    rows = _read_csv_plain(FEATURES_PATH)

    checks = [
        check_quantity(rows),
        check_completeness(rows),
        check_coherence(rows),
        check_class_balance(rows),
        check_variance(rows),
        check_optional_coverage(rows),
    ]

    # Blockers = checks bloquants ayant échoué
    blockers = [
        c["message"] for c in checks
        if c.get("blocking") and not c["passed"]
    ]

    quality_score = compute_quality_score(checks)
    ready = len(blockers) == 0

    report = {
        "validatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "real",
        "totalLots": len(rows),
        "ready_for_training": ready,
        "quality_score": quality_score,
        "blockers": blockers,
        "checks": {c["name"]: c for c in checks},
    }

    _write_report(report)
    return report


def check_readiness() -> dict:
    """
    Version silencieuse pour import par train_model.py.
    Retourne le rapport (lit validation_report.json si récent, sinon re-valide).
    """
    # Si un rapport récent existe (< 1h), on l'utilise
    if os.path.exists(REPORT_PATH):
        with open(REPORT_PATH, encoding="utf-8") as f:
            cached = json.load(f)
        validated_at = datetime.fromisoformat(cached.get("validatedAt", "2000-01-01T00:00:00+00:00"))
        age_seconds = (datetime.now(timezone.utc) - validated_at).total_seconds()
        if age_seconds < 3600:
            return cached

    return run_validation()


def _write_report(report: dict):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Affichage console
# ---------------------------------------------------------------------------

def _print_report(report: dict):
    print("\n" + "=" * 60)
    print("RAPPORT DE VALIDATION — DONNEES REELLES")
    print("=" * 60)
    print(f"Date        : {report['validatedAt']}")
    print(f"Lots        : {report.get('totalLots', '?')}")
    print(f"Score       : {report['quality_score'] * 100:.0f}/100")
    print(f"Pret        : {'OUI' if report['ready_for_training'] else 'NON'}")
    print()

    for name, check in report.get("checks", {}).items():
        status = "OK" if check.get("passed") else ("--" if not check.get("blocking") else "FAIL")
        print(f"  [{status:4}] {name:<20}  {check.get('message', '')}")
        # Détails si anomalies
        details = check.get("details") or check.get("coverage")
        if details and not check.get("passed"):
            for k, v in details.items():
                print(f"              {k}: {v}")
        for w in check.get("warnings", []):
            print(f"         WARN {w}")

    if report["blockers"]:
        print()
        print("BLOCAGES :")
        for b in report["blockers"]:
            print(f"  - {b}")

    print()
    if report["ready_for_training"]:
        print(">> Pret pour l'entrainement : python ml/train_model.py --source real")
    else:
        print(">> Corriger les blocages avant d'utiliser --source real.")
        print("   En attendant : python ml/train_model.py --source synthetic")
    print("=" * 60)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    report = run_validation()
    _print_report(report)
    sys.exit(0 if report["ready_for_training"] else 1)
