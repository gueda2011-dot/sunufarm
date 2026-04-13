"""
predict.py
----------
Fonction predictLotRisk utilisable seule ou depuis un script externe.

Interface :
  from ml.predict import predictLotRisk, LotJ14Data

  result = predictLotRisk(LotJ14Data(
      effectif_initial=500,
      mortalite_cumulee_j14=18,
      taux_mortalite_j14=0.036,
      aliment_cumule_j14=320.5,
      poids_moyen_j14=380.2,
      depenses_cumulees_j14=290_000,
      temperature_moyenne_j14=30.5,
      symptomes_detectes_j14=0,
  ))

  print(result)
  # PredictionResult(score=0.73, classe='orange', explication='...')

Usage standalone :
  python ml/predict.py
"""

import json
import math
import os
from dataclasses import dataclass
from typing import List

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.json")


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

@dataclass
class LotJ14Data:
    """Snapshot d'un lot à J14 — données disponibles en cours de cycle."""
    effectif_initial: int
    mortalite_cumulee_j14: int
    taux_mortalite_j14: float       # ex: 0.036 = 3.6%
    aliment_cumule_j14: float       # kg
    poids_moyen_j14: float          # grammes
    depenses_cumulees_j14: float    # FCFA
    temperature_moyenne_j14: float  # °C
    symptomes_detectes_j14: int     # 0 ou 1
    # Phase 4 — qualité données alimentation (optionnel, avec valeurs par défaut sûres)
    pct_estime_j14: float = 0.0     # % de jours J1–J14 estimés depuis sac (0–100)
    confiance_moyenne_j14: float = 1.0  # confiance moyenne données J14 (0.0–1.0)


@dataclass
class PredictionResult:
    score: float          # probabilité 0–1
    classe: str           # "vert" | "orange" | "rouge"
    explication: str      # phrase humaine


# ---------------------------------------------------------------------------
# Inférence (régression logistique pure Python — pas de scikit-learn requis)
# ---------------------------------------------------------------------------

def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def _score_from_model(data: LotJ14Data, model: dict) -> float:
    """
    Applique la régression logistique exportée dans model.json.
    Étapes : standardisation → produit scalaire → sigmoid.
    """
    feature_order = model["feature_cols"]
    mean = model["scaler_mean"]
    scale = model["scaler_scale"]
    coef = model["coef"]
    intercept = model["intercept"]

    values = {
        "effectif_initial": data.effectif_initial,
        "mortalite_cumulee_j14": data.mortalite_cumulee_j14,
        "taux_mortalite_j14": data.taux_mortalite_j14,
        "aliment_cumule_j14": data.aliment_cumule_j14,
        "poids_moyen_j14": data.poids_moyen_j14,
        "depenses_cumulees_j14": data.depenses_cumulees_j14,
        "temperature_moyenne_j14": data.temperature_moyenne_j14,
        "symptomes_detectes_j14": data.symptomes_detectes_j14,
        # Phase 4 — qualité données (optionnel selon version modèle)
        "pct_estime_j14": data.pct_estime_j14,
        "confiance_moyenne_j14": data.confiance_moyenne_j14,
    }

    # Standardisation
    standardized = [
        (values[feat] - mean[i]) / scale[i]
        for i, feat in enumerate(feature_order)
    ]

    # Produit scalaire + intercept
    logit = sum(c * x for c, x in zip(coef, standardized)) + intercept

    return round(_sigmoid(logit), 4)


def _classe_from_score(score: float) -> str:
    if score < 0.35:
        return "vert"
    elif score < 0.65:
        return "orange"
    else:
        return "rouge"


def _explain(data: LotJ14Data, score: float, model: dict) -> str:
    """
    Génère une explication simple en français basée sur les features
    les plus discriminantes.
    """
    feature_order = model["feature_cols"]
    coef = model["coef"]

    # Features avec coefficients positifs forts (contributeurs au risque)
    contrib = sorted(
        zip(feature_order, coef),
        key=lambda x: -abs(x[1])
    )

    reasons: List[str] = []

    if data.taux_mortalite_j14 > 0.06:
        reasons.append(f"mortalité élevée à J14 ({data.taux_mortalite_j14*100:.1f}%)")
    elif data.taux_mortalite_j14 > 0.03:
        reasons.append(f"mortalité modérée à J14 ({data.taux_mortalite_j14*100:.1f}%)")

    if data.poids_moyen_j14 < 320:
        reasons.append(f"poids faible à J14 ({data.poids_moyen_j14:.0f} g)")

    if data.symptomes_detectes_j14 == 1:
        reasons.append("symptômes sanitaires détectés")

    if data.temperature_moyenne_j14 > 33:
        reasons.append(f"température élevée ({data.temperature_moyenne_j14:.1f}°C)")

    if score < 0.35:
        return "Lot sain : indicateurs dans les normes à J14."
    elif not reasons:
        return "Risque modéré : surveillance recommandée."
    else:
        return "Risque élevé à cause de : " + ", ".join(reasons) + "."


# ---------------------------------------------------------------------------
# API publique
# ---------------------------------------------------------------------------

def predictLotRisk(data: LotJ14Data) -> PredictionResult:
    """
    Prédit le risque d'un lot à partir des données disponibles à J14.

    Retourne :
      score  — probabilité de risque (0.0 → 1.0)
      classe — "vert" / "orange" / "rouge"
      explication — phrase en français
    """
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(
            f"Modèle introuvable : {MODEL_PATH}\n"
            "Lancez d'abord : python ml/generate_dataset.py && python ml/train_model.py"
        )

    with open(MODEL_PATH, "r", encoding="utf-8") as f:
        model = json.load(f)

    score = _score_from_model(data, model)
    classe = _classe_from_score(score)
    explication = _explain(data, score, model)

    return PredictionResult(score=score, classe=classe, explication=explication)


# ---------------------------------------------------------------------------
# Demo standalone
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Lot sain
    sain = LotJ14Data(
        effectif_initial=500,
        mortalite_cumulee_j14=8,
        taux_mortalite_j14=0.016,
        aliment_cumule_j14=310.0,
        poids_moyen_j14=395.0,
        depenses_cumulees_j14=295_000,
        temperature_moyenne_j14=29.5,
        symptomes_detectes_j14=0,
    )

    # Lot à risque
    risque = LotJ14Data(
        effectif_initial=600,
        mortalite_cumulee_j14=55,
        taux_mortalite_j14=0.092,
        aliment_cumule_j14=280.0,
        poids_moyen_j14=295.0,
        depenses_cumulees_j14=385_000,
        temperature_moyenne_j14=33.8,
        symptomes_detectes_j14=1,
    )

    for label, data in [("Lot SAIN", sain), ("Lot À RISQUE", risque)]:
        result = predictLotRisk(data)
        print(f"\n{label}")
        print(f"  Score      : {result.score:.2f}")
        print(f"  Classe     : {result.classe.upper()}")
        print(f"  Explication: {result.explication}")
