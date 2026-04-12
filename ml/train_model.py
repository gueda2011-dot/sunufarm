"""
train_model.py
--------------
Feature engineering à J14 + entraînement d'un modèle ML simple.

SÉPARATION DES SOURCES — RÈGLE FONDAMENTALE :
  Les données synthétiques (generées localement pour le bootstrap) et les données
  réelles (exportées depuis BatchOutcomeSnapshot) ne sont JAMAIS mélangées.

  --source synthetic  →  lit ml/data/synthetic/  (bootstrap, développement)
  --source real       →  lit ml/data/real/        (données terrain anonymisées)

  Le model.json exporté porte la mention explicite de sa source (dataSource,
  sampleSize, trainedAt) — l'API Next.js la retourne au client pour affichage.

Ce script :
  1. Lit daily_records.csv + outcomes.csv depuis le bon répertoire source
  2. Construit ml_features_j14.csv (1 ligne / lot, snapshot à J14)
  3. Entraîne un RandomForestClassifier (ou LogisticRegression)
  4. Affiche les métriques (accuracy, confusion matrix, importance)
  5. Exporte model.json — utilisable directement en TypeScript

Usage :
  pip install scikit-learn pandas
  python ml/train_model.py --source synthetic [--model lr|rf]
  python ml/train_model.py --source real      [--model lr|rf]
"""

import argparse
import json
import os
from datetime import datetime, timezone

import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

ML_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(ML_DIR, "model.json")

# Répertoires sources — strictement séparés
DATA_DIRS = {
    "synthetic": os.path.join(ML_DIR, "data", "synthetic"),
    "real":      os.path.join(ML_DIR, "data", "real"),
}

# Seuil minimum de lots réels avant d'autoriser --source real
MIN_REAL_LOTS = 30

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


# ---------------------------------------------------------------------------
# 1. Feature engineering — source synthétique (CSV bruts)
# ---------------------------------------------------------------------------

def build_features_from_synthetic(data_dir: str) -> pd.DataFrame:
    """
    Source = ml/data/synthetic/ (lots/daily_records/outcomes générés).
    """
    records = pd.read_csv(os.path.join(data_dir, "daily_records.csv"))
    outcomes = pd.read_csv(os.path.join(data_dir, "outcomes.csv"))

    r14 = records[records["jour_age"] <= 14]

    agg = r14.groupby("lot_id").agg(
        mortalite_cumulee_j14=("mortalite_jour", "sum"),
        aliment_cumule_j14=("aliment_kg", "sum"),
        poids_moyen_j14=("poids_moyen_g", "last"),
        temperature_moyenne_j14=("temperature", "mean"),
        symptomes_detectes_j14=("symptome_sanitaire", "max"),
    ).reset_index()

    lots = pd.read_csv(os.path.join(data_dir, "lots.csv"))
    agg = agg.merge(lots[["lot_id", "effectif_initial", "prix_achat_unitaire"]], on="lot_id")

    agg["taux_mortalite_j14"] = (
        agg["mortalite_cumulee_j14"] / agg["effectif_initial"]
    ).round(4)

    PRIX_ALIMENT = 160  # FCFA/kg
    agg["depenses_cumulees_j14"] = (
        agg["effectif_initial"] * agg["prix_achat_unitaire"]
        + agg["aliment_cumule_j14"] * PRIX_ALIMENT
    ).round(0)

    agg = agg.merge(outcomes[["lot_id", "lot_a_risque"]], on="lot_id")
    agg = agg.rename(columns={"lot_a_risque": TARGET})

    return agg[["lot_id"] + FEATURE_COLS + [TARGET]]


# ---------------------------------------------------------------------------
# 1b. Feature engineering — source réelle (export BatchOutcomeSnapshot)
# ---------------------------------------------------------------------------

def build_features_from_real(data_dir: str) -> pd.DataFrame:
    """
    Source = ml/data/real/ml_features_j14.csv
    Ce fichier est produit par export_real_data.py depuis la base Prisma.

    Format attendu : mêmes colonnes que le synthétique + target_lot_a_risque.
    Aucune ligne synthétique ne doit figurer dans ce fichier.
    """
    features_path = os.path.join(data_dir, "ml_features_j14.csv")

    if not os.path.exists(features_path):
        raise FileNotFoundError(
            f"Fichier réel introuvable : {features_path}\n"
            "Lancez d'abord : python ml/export_real_data.py"
        )

    df = pd.read_csv(features_path)

    # Vérification de sécurité : refus d'un fichier mal formé
    missing = [c for c in FEATURE_COLS + [TARGET] if c not in df.columns]
    if missing:
        raise ValueError(f"Colonnes manquantes dans le fichier réel : {missing}")

    # Contrôle de taille
    if len(df) < MIN_REAL_LOTS:
        raise ValueError(
            f"Pas assez de lots réels ({len(df)} < {MIN_REAL_LOTS} minimum).\n"
            "Attendez d'avoir suffisamment de données terrain ou "
            "utilisez --source synthetic pour le développement."
        )

    return df


# ---------------------------------------------------------------------------
# 2. Entraînement
# ---------------------------------------------------------------------------

def train(df: pd.DataFrame, model_type: str = "lr"):
    X = df[FEATURE_COLS]
    y = df[TARGET]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    if model_type == "lr":
        clf = LogisticRegression(max_iter=500, random_state=42)
        clf.fit(X_train_s, y_train)
    else:
        clf = RandomForestClassifier(
            n_estimators=100, max_depth=6, random_state=42, class_weight="balanced"
        )
        clf.fit(X_train_s, y_train)

    y_pred = clf.predict(X_test_s)

    print(f"\n{'='*50}")
    print(f"Modele : {model_type.upper()}")
    print(f"Accuracy : {accuracy_score(y_test, y_pred):.3f}")
    print("\nClassification report :")
    print(classification_report(y_test, y_pred, target_names=["sain", "a risque"]))

    cm = confusion_matrix(y_test, y_pred)
    print("Confusion matrix :")
    print(f"  TN={cm[0,0]}  FP={cm[0,1]}")
    print(f"  FN={cm[1,0]}  TP={cm[1,1]}")

    print("\nImportance des features :")
    importances = abs(clf.coef_[0]) if model_type == "lr" else clf.feature_importances_
    for feat, imp in sorted(zip(FEATURE_COLS, importances), key=lambda x: -x[1]):
        bar = "#" * int(imp * 40)
        print(f"  {feat:<30} {imp:.4f}  {bar}")

    return clf, scaler, accuracy_score(y_test, y_pred)


# ---------------------------------------------------------------------------
# 3. Export model.json (pour inférence TypeScript)
# ---------------------------------------------------------------------------

def export_model_json(clf, scaler, model_type: str, source: str,
                      sample_size: int, accuracy: float):
    """
    Sérialise le modèle + métadonnées de source.

    Le champ dataSource est critique : il permet à l'API Next.js d'informer
    le client que le modèle est basé sur des données synthétiques ou réelles.
    Ne jamais omettre ce champ ni le falsifier.
    """
    payload = {
        # --- Identité du modèle ---
        "type": "logistic_regression",
        "modelAlgorithm": model_type,

        # --- Provenance — NE PAS MÉLANGER ---
        "dataSource": source,           # "synthetic" | "real"
        "sampleSize": sample_size,
        "accuracy": round(accuracy, 4),
        "trainedAt": datetime.now(timezone.utc).isoformat(),

        # --- Paramètres d'inférence ---
        "feature_cols": FEATURE_COLS,
        "scaler_mean": scaler.mean_.tolist(),
        "scaler_scale": scaler.scale_.tolist(),
        "coef": (
            clf.coef_[0].tolist()
            if model_type == "lr"
            else clf.feature_importances_.tolist()
        ),
        "intercept": (
            float(clf.intercept_[0]) if model_type == "lr" else 0.0
        ),
    }

    with open(MODEL_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    print(f"\nModele exporte -> {MODEL_PATH}")
    print(f"  dataSource  : {source}")
    print(f"  sampleSize  : {sample_size} lots")
    print(f"  accuracy    : {accuracy:.3f}")
    print(f"  trainedAt   : {payload['trainedAt']}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Entrainement ML SunuFarm — sources synthétiques et réelles séparées"
    )
    parser.add_argument(
        "--source", choices=["synthetic", "real"], required=True,
        help=(
            "Source des données : "
            "'synthetic' = ml/data/synthetic/ (bootstrap), "
            "'real' = ml/data/real/ (données terrain anonymisées). "
            "Les deux sources ne sont JAMAIS mélangées."
        ),
    )
    parser.add_argument(
        "--model", choices=["lr", "rf"], default="lr",
        help="Algorithme : lr (Logistic Regression) ou rf (Random Forest)",
    )
    args = parser.parse_args()

    data_dir = DATA_DIRS[args.source]

    print(f"Source : {args.source.upper()} ({data_dir})")

    if args.source == "synthetic":
        records_path = os.path.join(data_dir, "daily_records.csv")
        if not os.path.exists(records_path):
            print("Dataset manquant. Lancez d'abord : python ml/generate_dataset.py")
            return
        print("Construction des features J14 (source synthetique)...")
        df = build_features_from_synthetic(data_dir)
        # Sauvegarde des features dans le bon sous-répertoire
        df.to_csv(os.path.join(data_dir, "ml_features_j14.csv"), index=False)
    else:
        print("Chargement des features J14 (source reelle)...")
        df = build_features_from_real(data_dir)

    n_risque = int(df[TARGET].sum())
    print(f"  {len(df)} lots, {n_risque} a risque ({100*n_risque/len(df):.1f}%)")

    clf, scaler, accuracy = train(df, args.model)
    export_model_json(clf, scaler, args.model, args.source, len(df), accuracy)


if __name__ == "__main__":
    main()
