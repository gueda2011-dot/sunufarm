"""
generate_dataset.py
-------------------
Génère un dataset synthétique réaliste pour SunuFarm.
Contexte : poulets de chair, Sénégal, durée de cycle ~45 jours.

Outputs (dans ./data/synthetic/) :
  - lots.csv
  - daily_records.csv
  - outcomes.csv

Usage :
  python ml/generate_dataset.py [--lots 200] [--seed 42]
"""

import argparse
import csv
import math
import os
import random
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import List

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "data", "synthetic")

# Prix aliment moyen (FCFA / kg) – sac de 50 kg ~8 000 FCFA
PRIX_ALIMENT_KG = 160          # FCFA
# Prix poussin à l'entrée
PRIX_POUSSIN_MIN = 350
PRIX_POUSSIN_MAX = 550         # FCFA / tête
# Prix de vente poulet vif selon poids (FCFA / kg vif)
PRIX_VENTE_KG_MIN = 850
PRIX_VENTE_KG_MAX = 1100

# Seuil de marge pour "lot à risque"
SEUIL_MARGE_FCFA = 0           # marge nette négative = risque
SEUIL_MORTALITE = 0.08         # 8 %


# ---------------------------------------------------------------------------
# Structures
# ---------------------------------------------------------------------------

@dataclass
class Lot:
    lot_id: str
    date_entree: date
    effectif_initial: int
    prix_achat_unitaire: int   # FCFA / poussin
    duree_prevue: int = 45     # jours


@dataclass
class DailyRecord:
    lot_id: str
    jour_age: int
    mortalite_jour: int
    aliment_kg: float
    eau_litres: float
    poids_moyen_g: float
    temperature: float
    symptome_sanitaire: int    # 0 ou 1


@dataclass
class Outcome:
    lot_id: str
    effectif_final: int
    mortalite_totale_pct: float
    poids_final_moyen_g: float
    cout_total_fcfa: float
    revenu_total_fcfa: float
    marge_finale_fcfa: float
    lot_a_risque: int          # 0 ou 1


# ---------------------------------------------------------------------------
# Générateurs
# ---------------------------------------------------------------------------

def generate_lot(idx: int, rng: random.Random) -> Lot:
    """Crée un lot avec des paramètres aléatoires réalistes."""
    # Date d'entrée quelconque dans les 2 dernières années
    start = date(2024, 1, 1)
    offset = rng.randint(0, 730)
    return Lot(
        lot_id=f"LOT-{idx:04d}",
        date_entree=start + timedelta(days=offset),
        effectif_initial=rng.randint(200, 1000),
        prix_achat_unitaire=rng.randint(PRIX_POUSSIN_MIN, PRIX_POUSSIN_MAX),
        duree_prevue=rng.choice([44, 45, 46]),
    )


def _mortalite_quotidienne(jour: int, stress_event: bool, rng: random.Random) -> float:
    """
    Retourne un taux de mortalité quotidien (fraction de l'effectif restant).
    - Jours 1-5 : plus élevé (stress du transport)
    - Jours 6-40 : faible
    - Jour 35+ : légèrement remonté (fin de cycle, chaleur)
    - stress_event (maladie) : multiplie par 3–6
    """
    if jour <= 5:
        base = rng.uniform(0.002, 0.008)
    elif jour <= 35:
        base = rng.uniform(0.0005, 0.002)
    else:
        base = rng.uniform(0.001, 0.004)

    if stress_event:
        base *= rng.uniform(3, 6)

    return min(base, 0.05)  # max 5 % / jour


def _poids_theorique(jour: int) -> float:
    """
    Courbe de croissance logistique simplifiée (g).
    J1 ≈ 45 g (poussin d'1 jour), J45 ≈ 2 200 g
    """
    poids_max = 2300.0
    k = 0.12
    inflexion = 22
    return poids_max / (1 + math.exp(-k * (jour - inflexion)))


def generate_daily_records(lot: Lot, rng: random.Random):
    """Génère les enregistrements quotidiens pour un lot."""
    records: List[DailyRecord] = []

    # Paramètre de performance du lot (0 = mauvais, 1 = excellent)
    perf_factor = rng.uniform(0.75, 1.10)

    # Événement sanitaire : 20 % des lots ont un épisode entre J15 et J35
    has_event = rng.random() < 0.20
    event_start = rng.randint(15, 35) if has_event else -1
    event_duration = rng.randint(3, 7) if has_event else 0

    effectif = lot.effectif_initial
    aliment_cumule = 0.0

    for jour in range(1, lot.duree_prevue + 1):
        # --- Mortalité ---
        stress = has_event and (event_start <= jour < event_start + event_duration)
        taux_mort = _mortalite_quotidienne(jour, stress, rng)
        morts = max(0, round(effectif * taux_mort * rng.uniform(0.8, 1.2)))
        morts = min(morts, effectif)
        effectif -= morts

        # --- Aliment (g/tête/jour) selon âge ---
        if jour <= 7:
            aliment_tete = rng.uniform(18, 28)
        elif jour <= 21:
            aliment_tete = rng.uniform(55, 85)
        elif jour <= 35:
            aliment_tete = rng.uniform(110, 145)
        else:
            aliment_tete = rng.uniform(145, 175)

        aliment_kg = round(effectif * aliment_tete / 1000 * perf_factor, 2)
        aliment_cumule += aliment_kg

        # --- Eau (ratio ~1.7–2 × aliment en litres) ---
        eau_litres = round(aliment_kg * rng.uniform(1.7, 2.0), 2)

        # --- Poids moyen ---
        poids_th = _poids_theorique(jour)
        bruit = rng.gauss(0, 25)
        poids_moyen = round(max(30, poids_th * perf_factor + bruit), 1)

        # --- Température ambiante (28–34 °C, légèrement plus haute en cas de stress) ---
        temp_base = rng.uniform(28, 32)
        if stress:
            temp_base += rng.uniform(1, 2)
        temperature = round(min(36, temp_base), 1)

        # --- Symptôme sanitaire ---
        symptome = 1 if (stress and rng.random() < 0.7) else 0

        records.append(DailyRecord(
            lot_id=lot.lot_id,
            jour_age=jour,
            mortalite_jour=morts,
            aliment_kg=aliment_kg,
            eau_litres=eau_litres,
            poids_moyen_g=poids_moyen,
            temperature=temperature,
            symptome_sanitaire=symptome,
        ))

    return records, effectif, aliment_cumule


def compute_outcome(lot: Lot, records: List[DailyRecord], effectif_final: int,
                    aliment_cumule: float, rng: random.Random) -> Outcome:
    """Calcule l'outcome économique du lot."""
    mortalite_totale = lot.effectif_initial - effectif_final
    mortalite_pct = mortalite_totale / lot.effectif_initial

    poids_final = records[-1].poids_moyen_g  # poids au dernier jour

    # Coûts
    cout_poussins = lot.effectif_initial * lot.prix_achat_unitaire
    cout_aliment = aliment_cumule * PRIX_ALIMENT_KG
    # Autres frais (vaccins, eau, main d'œuvre) ≈ 15–20 % des coûts directs
    autres_frais = (cout_poussins + cout_aliment) * rng.uniform(0.15, 0.20)
    cout_total = round(cout_poussins + cout_aliment + autres_frais, 0)

    # Revenus : effectif_final × poids_kg × prix_vente_kg
    prix_vente = rng.uniform(PRIX_VENTE_KG_MIN, PRIX_VENTE_KG_MAX)
    revenu_total = round(effectif_final * (poids_final / 1000) * prix_vente, 0)

    marge = round(revenu_total - cout_total, 0)

    # Cible ML
    lot_a_risque = int(mortalite_pct > SEUIL_MORTALITE or marge < SEUIL_MARGE_FCFA)

    return Outcome(
        lot_id=lot.lot_id,
        effectif_final=effectif_final,
        mortalite_totale_pct=round(mortalite_pct * 100, 2),
        poids_final_moyen_g=round(poids_final, 1),
        cout_total_fcfa=cout_total,
        revenu_total_fcfa=revenu_total,
        marge_finale_fcfa=marge,
        lot_a_risque=lot_a_risque,
    )


# ---------------------------------------------------------------------------
# Écriture CSV
# ---------------------------------------------------------------------------

def write_lots(lots: List[Lot], path: str):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["lot_id", "type_lot", "date_entree", "effectif_initial",
                    "prix_achat_unitaire", "duree_prevue"])
        for l in lots:
            w.writerow([l.lot_id, "chair", l.date_entree.isoformat(),
                        l.effectif_initial, l.prix_achat_unitaire, l.duree_prevue])


def write_daily_records(records: List[DailyRecord], path: str):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["lot_id", "jour_age", "mortalite_jour", "aliment_kg",
                    "eau_litres", "poids_moyen_g", "temperature", "symptome_sanitaire"])
        for r in records:
            w.writerow([r.lot_id, r.jour_age, r.mortalite_jour, r.aliment_kg,
                        r.eau_litres, r.poids_moyen_g, r.temperature, r.symptome_sanitaire])


def write_outcomes(outcomes: List[Outcome], path: str):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["lot_id", "effectif_final", "mortalite_totale_pct",
                    "poids_final_moyen_g", "cout_total_fcfa", "revenu_total_fcfa",
                    "marge_finale_fcfa", "lot_a_risque"])
        for o in outcomes:
            w.writerow([o.lot_id, o.effectif_final, o.mortalite_totale_pct,
                        o.poids_final_moyen_g, o.cout_total_fcfa, o.revenu_total_fcfa,
                        o.marge_finale_fcfa, o.lot_a_risque])


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Génère le dataset SunuFarm ML")
    parser.add_argument("--lots", type=int, default=300, help="Nombre de lots à générer")
    parser.add_argument("--seed", type=int, default=42, help="Graine aléatoire")
    args = parser.parse_args()

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    rng = random.Random(args.seed)

    lots: List[Lot] = []
    all_records: List[DailyRecord] = []
    outcomes: List[Outcome] = []

    print(f"Génération de {args.lots} lots...")

    for i in range(1, args.lots + 1):
        lot = generate_lot(i, rng)
        records, effectif_final, aliment_cumule = generate_daily_records(lot, rng)
        outcome = compute_outcome(lot, records, effectif_final, aliment_cumule, rng)

        lots.append(lot)
        all_records.extend(records)
        outcomes.append(outcome)

    # Écriture
    write_lots(lots, os.path.join(OUTPUT_DIR, "lots.csv"))
    write_daily_records(all_records, os.path.join(OUTPUT_DIR, "daily_records.csv"))
    write_outcomes(outcomes, os.path.join(OUTPUT_DIR, "outcomes.csv"))

    # Stats rapides
    n_risque = sum(o.lot_a_risque for o in outcomes)
    print(f"  lots.csv          : {len(lots)} lignes")
    print(f"  daily_records.csv : {len(all_records)} lignes")
    print(f"  outcomes.csv      : {len(outcomes)} lignes")
    print(f"  Lots à risque     : {n_risque}/{len(outcomes)} ({100*n_risque/len(outcomes):.1f}%)")
    print(f"  Fichiers dans     : {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
