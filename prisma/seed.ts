/**
 * SunuFarm — Seeds de démonstration
 * Données sénégalaises réalistes pour le développement et les tests
 *
 * 2 organisations isolées pour valider le multi-tenant
 * Mot de passe de tous les comptes de test : Sunufarm2025!
 *
 * Usage : npx prisma db seed
 *
 * Note : Prisma CLI charge .env automatiquement avant d'exécuter le seed.
 * SUNUFARM_DATABASE_URL doit être défini dans .env ou dans l'environnement.
 */

import {
  PrismaClient,
  BatchType,
  BatchStatus,
  BuildingType,
  FeedMovementType,
  MedicineMovementType,
  SaleProductType,
  UserRole,
  SubscriptionPlan,
  SubscriptionStatus,
} from "../src/generated/prisma"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"

// PrismaPg accepte un PoolConfig directement — évite le conflit @types/pg
const adapter = new PrismaPg({ connectionString: process.env.SUNUFARM_DATABASE_URL })
const prisma = new PrismaClient({ adapter })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Date minuit UTC — pour les champs @db.Date */
function dt(date: Date): Date {
  return new Date(date.toISOString().split("T")[0] + "T00:00:00.000Z")
}

// ---------------------------------------------------------------------------
// Suppression dans l'ordre inverse des dépendances
// ---------------------------------------------------------------------------

async function clearAll() {
  console.log("  Nettoyage des données existantes...")
  await prisma.auditLog.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.saleItem.deleteMany()
  await prisma.sale.deleteMany()
  await prisma.purchaseItem.deleteMany()
  await prisma.purchase.deleteMany()
  await prisma.invoice.deleteMany()
  await prisma.expense.deleteMany()
  await prisma.expenseCategory.deleteMany()
  await prisma.mortalityRecord.deleteMany()
  await prisma.dailyRecord.deleteMany()
  await prisma.eggProductionRecord.deleteMany()
  await prisma.weightRecord.deleteMany()
  await prisma.vaccinationRecord.deleteMany()
  await prisma.treatmentRecord.deleteMany()
  await prisma.medicineMovement.deleteMany()
  await prisma.medicineStock.deleteMany()
  await prisma.feedMovement.deleteMany()
  await prisma.feedStock.deleteMany()
  await prisma.vaccinationPlanItem.deleteMany()
  await prisma.vaccinationPlan.deleteMany()
  await prisma.batch.deleteMany()
  await prisma.employee.deleteMany()
  await prisma.building.deleteMany()
  await prisma.farm.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.supplier.deleteMany()
  await prisma.userOrganization.deleteMany()
  await prisma.subscriptionPayment.deleteMany()
  await prisma.subscription.deleteMany()
  await prisma.organization.deleteMany()
  await prisma.verificationToken.deleteMany()
  await prisma.session.deleteMany()
  await prisma.account.deleteMany()
  await prisma.user.deleteMany()
  await prisma.mortalityReason.deleteMany()
  await prisma.feedType.deleteMany()
  await prisma.breed.deleteMany()
  await prisma.species.deleteMany()
  console.log("  OK\n")
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("🌱 SunuFarm — Initialisation des données de démonstration\n")
  await clearAll()

  const passwordHash = await bcrypt.hash("Sunufarm2025!", 10)
  const today = dt(new Date())

  // =========================================================================
  // RÉFÉRENTIELS GLOBAUX (partagés entre toutes les organisations)
  // =========================================================================
  console.log("📚 Référentiels globaux...")

  // Espèces
  const [poulet, pondeuse, pintade] = await Promise.all([
    prisma.species.create({ data: { name: "Poulet", code: "POULET" } }),
    prisma.species.create({ data: { name: "Pondeuse", code: "PONDEUSE" } }),
    prisma.species.create({ data: { name: "Pintade", code: "PINTADE" } }),
  ])

  // Races
  const [cobb500, ross308, isaBrown, lohmann] = await Promise.all([
    prisma.breed.create({ data: { name: "Cobb 500",       code: "COBB500",  speciesId: poulet.id } }),
    prisma.breed.create({ data: { name: "Ross 308",       code: "ROSS308",  speciesId: poulet.id } }),
    prisma.breed.create({ data: { name: "ISA Brown",      code: "ISA_BROWN", speciesId: pondeuse.id } }),
    prisma.breed.create({ data: { name: "Lohmann Brown",  code: "LOHMANN",  speciesId: pondeuse.id } }),
  ])

  // Types d'aliment
  const [feedPreDemarrage, feedDemarrage, feedCroissance, feedFinition] = await Promise.all([
    prisma.feedType.create({ data: { name: "Pré-démarrage", code: "PREDEMARRAGE" } }),
    prisma.feedType.create({ data: { name: "Démarrage",     code: "DEMARRAGE"    } }),
    prisma.feedType.create({ data: { name: "Croissance",    code: "CROISSANCE"   } }),
    prisma.feedType.create({ data: { name: "Finition",      code: "FINITION"     } }),
  ])
  const feedPonteType = await prisma.feedType.create({ data: { name: "Ponte", code: "PONTE" } })

  // Motifs de mortalité globaux
  await Promise.all([
    prisma.mortalityReason.create({ data: { name: "Maladie respiratoire", code: "MALADIE_RESP",      isDefault: false } }),
    prisma.mortalityReason.create({ data: { name: "Maladie digestive",    code: "MALADIE_DIG",       isDefault: false } }),
    prisma.mortalityReason.create({ data: { name: "Accident / blessure",  code: "ACCIDENT",          isDefault: false } }),
    prisma.mortalityReason.create({ data: { name: "Prédation",            code: "PREDATION",         isDefault: false } }),
    prisma.mortalityReason.create({ data: { name: "Stress thermique",     code: "STRESS_THERMIQUE",  isDefault: false } }),
    prisma.mortalityReason.create({ data: { name: "Non précisé",          code: "NON_PRECISE",       isDefault: true  } }),
  ])

  // Catégories de dépenses système
  const catAliment = await prisma.expenseCategory.create({
    data: { name: "Aliment",                   code: "ALIMENT",     isSystem: true },
  })
  await Promise.all([
    prisma.expenseCategory.create({ data: { name: "Médicaments / Vaccins",        code: "MEDICAMENT",  isSystem: true } }),
    prisma.expenseCategory.create({ data: { name: "Main d'oeuvre",               code: "MAIN_OEUVRE", isSystem: true } }),
    prisma.expenseCategory.create({ data: { name: "Energie (electricite, eau)",  code: "ENERGIE",     isSystem: true } }),
    prisma.expenseCategory.create({ data: { name: "Transport",                    code: "TRANSPORT",   isSystem: true } }),
    prisma.expenseCategory.create({ data: { name: "Materiel et equipements",      code: "MATERIEL",    isSystem: true } }),
    prisma.expenseCategory.create({ data: { name: "Loyer / foncier",              code: "LOYER",       isSystem: true } }),
    prisma.expenseCategory.create({ data: { name: "Autres charges",               code: "AUTRE",       isSystem: true } }),
  ])

  // =========================================================================
  // ORGANISATION 1 — Ferme Diallo et Fils (Dakar)
  // Compte principal de démonstration — données complètes
  // =========================================================================
  console.log("🏢 Organisation 1 : Ferme Diallo et Fils (Dakar)...")

  // Utilisateurs org 1
  const [superAdmin, owner1, manager1, tech1, saisie1, comptable1] = await Promise.all([
    prisma.user.create({ data: { email: "admin@sunufarm.sn",         name: "SunuFarm Admin", passwordHash } }),
    prisma.user.create({ data: { email: "ousmane.diallo@sunufarm.sn",  name: "Ousmane Diallo",  passwordHash } }),
    prisma.user.create({ data: { email: "mamadou.fall@sunufarm.sn",    name: "Mamadou Fall",    passwordHash } }),
    prisma.user.create({ data: { email: "fatou.sow@sunufarm.sn",       name: "Fatou Sow",       passwordHash } }),
    prisma.user.create({ data: { email: "ibrahima.ba@sunufarm.sn",     name: "Ibrahima Ba",     passwordHash } }),
    prisma.user.create({ data: { email: "aminata.diop@sunufarm.sn",    name: "Aminata Diop",    passwordHash } }),
  ])

  const platformOrg = await prisma.organization.create({
    data: {
      name: "SunuFarm Platform",
      slug: "sunufarm-platform",
      currency: "XOF",
      locale: "fr-SN",
      timezone: "Africa/Dakar",
    },
  })

  await prisma.userOrganization.create({
    data: {
      userId: superAdmin.id,
      organizationId: platformOrg.id,
      role: UserRole.SUPER_ADMIN,
    },
  })

  await prisma.subscription.create({
    data: {
      organizationId: platformOrg.id,
      plan: SubscriptionPlan.BUSINESS,
      status: SubscriptionStatus.ACTIVE,
      amountFcfa: 25_000,
      currentPeriodStart: today,
      currentPeriodEnd: dt(addDays(today, 365)),
    },
  })

  const org1 = await prisma.organization.create({
    data: {
      name:     "Ferme Diallo et Fils",
      slug:     "ferme-diallo",
      currency: "XOF",
      locale:   "fr-SN",
      timezone: "Africa/Dakar",
      phone:    "+221 77 123 45 67",
      address:  "Route de Diamniadio km 35, Dakar, Sénégal",
    },
  })

  await Promise.all([
    prisma.userOrganization.create({ data: { userId: owner1.id,    organizationId: org1.id, role: UserRole.OWNER     } }),
    prisma.userOrganization.create({ data: { userId: manager1.id,  organizationId: org1.id, role: UserRole.MANAGER   } }),
    prisma.userOrganization.create({ data: { userId: tech1.id,     organizationId: org1.id, role: UserRole.TECHNICIAN } }),
    prisma.userOrganization.create({ data: { userId: saisie1.id,   organizationId: org1.id, role: UserRole.DATA_ENTRY } }),
    prisma.userOrganization.create({ data: { userId: comptable1.id, organizationId: org1.id, role: UserRole.ACCOUNTANT } }),
  ])

  await prisma.subscription.create({
    data: {
      organizationId: org1.id,
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      amountFcfa: 10_000,
      currentPeriodStart: today,
      currentPeriodEnd: dt(addDays(today, 30)),
    },
  })

  // Fournisseurs org 1
  const [supplierPoussins, supplierAliment1] = await Promise.all([
    prisma.supplier.create({ data: {
      organizationId: org1.id,
      name:    "AVISEN Sénégal",
      phone:   "+221 33 869 12 00",
      type:    "POUSSIN",
      address: "Zone industrielle de Dakar",
    }}),
    prisma.supplier.create({ data: {
      organizationId: org1.id,
      name:    "Avicoop",
      phone:   "+221 33 832 45 78",
      type:    "ALIMENT",
      address: "Pikine, Dakar",
    }}),
  ])

  // Clients org 1
  const [clientSandaga] = await Promise.all([
    prisma.customer.create({ data: {
      organizationId: org1.id,
      name:    "Marché Sandaga",
      phone:   "+221 77 234 56 78",
      type:    "REVENDEUR",
      address: "Marché Sandaga, Dakar",
    }}),
    prisma.customer.create({ data: {
      organizationId: org1.id,
      name:  "Restaurant Le Baobab",
      phone: "+221 77 345 67 89",
      type:  "PROFESSIONNEL",
    }}),
    prisma.customer.create({ data: {
      organizationId: org1.id,
      name:  "Mbaye Diop",
      phone: "+221 77 456 78 90",
      type:  "PARTICULIER",
    }}),
  ])

  // Ferme 1 — Diamniadio
  const farm1 = await prisma.farm.create({
    data: {
      organizationId: org1.id,
      name:          "Ferme de Diamniadio",
      code:          "DKR-01",
      address:       "Route de Diamniadio km 35, Sénégal",
      latitude:      14.7285,
      longitude:     -17.1637,
      totalCapacity: 10_000,
    },
  })

  const [bat1A, bat1B, bat1C] = await Promise.all([
    prisma.building.create({ data: {
      organizationId: org1.id,
      farmId:         farm1.id,
      name:           "Poulailler A",
      code:           "BAT-A",
      type:           BuildingType.POULAILLER_FERME,
      capacity:       4000,
      surfaceM2:      400,
      ventilationType: "Tunnel",
    }}),
    prisma.building.create({ data: {
      organizationId: org1.id,
      farmId:         farm1.id,
      name:           "Poulailler B",
      code:           "BAT-B",
      type:           BuildingType.POULAILLER_SEMI_FERME,
      capacity:       3000,
      surfaceM2:      300,
      ventilationType: "Naturelle",
    }}),
    prisma.building.create({ data: {
      organizationId: org1.id,
      farmId:         farm1.id,
      name:           "Poulailler C",
      code:           "BAT-C",
      type:           BuildingType.POULAILLER_FERME,
      capacity:       3000,
      surfaceM2:      300,
      ventilationType: "Forcée",
    }}),
  ])

  // Employés ferme 1
  await Promise.all([
    prisma.employee.create({ data: {
      organizationId:    org1.id,
      farmId:            farm1.id,
      firstName:         "Lamine",
      lastName:          "Seck",
      role:              "Technicien d'élevage",
      phone:             "+221 77 567 89 01",
      hireDate:          dt(addDays(today, -365)),
      monthlySalaryFcfa: 180_000,
    }}),
    prisma.employee.create({ data: {
      organizationId:    org1.id,
      farmId:            farm1.id,
      firstName:         "Mariama",
      lastName:          "Diallo",
      role:              "Agent de saisie",
      phone:             "+221 77 678 90 12",
      hireDate:          dt(addDays(today, -180)),
      monthlySalaryFcfa: 120_000,
    }}),
  ])

  // Stock aliment ferme 1
  const feedStock1 = await prisma.feedStock.create({
    data: {
      organizationId:   org1.id,
      farmId:           farm1.id,
      feedTypeId:       feedCroissance.id,
      name:             "Aliment Croissance Avicoop N°2",
      supplierName:     "Avicoop",
      quantityKg:       2800,
      unitPriceFcfa:    425,
      alertThresholdKg: 500,
    },
  })

  // Entrée de stock initiale
  await prisma.feedMovement.create({
    data: {
      organizationId: org1.id,
      feedStockId:    feedStock1.id,
      feedTypeId:     feedCroissance.id,
      type:           FeedMovementType.ENTREE,
      quantityKg:     4000,
      unitPriceFcfa:  425,
      totalFcfa:      1_700_000,
      reference:      "BL-2026-089",
      date:           dt(addDays(today, -32)),
      recordedById:   manager1.id,
    },
  })

  // Stock médicaments ferme 1
  const medStock1 = await prisma.medicineStock.create({
    data: {
      organizationId:  org1.id,
      farmId:          farm1.id,
      name:            "Vaccin Newcastle HB1",
      category:        "Vaccin",
      unit:            "dose",
      quantityOnHand:  5000,
      alertThreshold:  1000,
      unitPriceFcfa:   45,
      expiryDate:      dt(addDays(today, 180)),
      notes:           "Conserver entre 2°C et 8°C",
    },
  })

  const medStock2 = await prisma.medicineStock.create({
    data: {
      organizationId:  org1.id,
      farmId:          farm1.id,
      name:            "Amoxicilline 10% — poudre",
      category:        "Antibiotique",
      unit:            "g",
      quantityOnHand:  800,
      alertThreshold:  200,
      unitPriceFcfa:   1_200,
      expiryDate:      dt(addDays(today, 90)),
    },
  })

  await prisma.medicineStock.create({
    data: {
      organizationId:  org1.id,
      farmId:          farm1.id,
      name:            "Vitamine E + Sélénium",
      category:        "Complément",
      unit:            "ml",
      quantityOnHand:  150,
      alertThreshold:  300,   // en dessous du seuil → alerte
      unitPriceFcfa:   3_500,
      expiryDate:      dt(addDays(today, 45)),   // péremption proche → double alerte
    },
  })

  // Entrée stock Newcastle (mouvement)
  await prisma.medicineMovement.create({
    data: {
      organizationId: org1.id,
      medicineStockId: medStock1.id,
      type:            MedicineMovementType.ENTREE,
      quantity:        5000,
      unitPriceFcfa:   45,
      totalFcfa:       225_000,
      date:            dt(addDays(today, -20)),
      reference:       "VACC-2026-012",
      recordedById:    manager1.id,
    },
  })

  // ── LOT 1 — SF-2026-001 : Poulet de chair actif (Cobb 500, 30 jours) ──────

  const entryDate1 = addDays(today, -30)

  const batch1 = await prisma.batch.create({
    data: {
      organizationId: org1.id,
      buildingId:     bat1A.id,
      number:         "SF-2026-001",
      type:           BatchType.CHAIR,
      status:         BatchStatus.ACTIVE,
      speciesId:      poulet.id,
      breedId:        cobb500.id,
      entryDate:      dt(entryDate1),
      entryCount:     2000,
      entryAgeDay:    1,
      entryWeightG:   42,
      supplierId:     supplierPoussins.id,
      unitCostFcfa:   750,
      totalCostFcfa:  1_500_000,
      notes:          "1ère bande 2026 — objectif 2 kg à J42",
    },
  })

  // 30 saisies journalières lot 1
  let mortCumul1 = 0
  for (let j = 0; j < 30; j++) {
    const ageDay  = j + 1
    const dateJ   = dt(addDays(entryDate1, j))
    const mort    = j < 7 ? (Math.random() < 0.4 ? 2 : 1) : (Math.random() < 0.15 ? 1 : 0)
    mortCumul1   += mort
    const effectif = 2000 - mortCumul1

    // Consommation aliment : courbe croissante avec l'âge
    const gPerBird = ageDay < 8 ? 30 : ageDay < 15 ? 65 : ageDay < 22 ? 105 : 150
    const feedKg   = Math.round((effectif * gPerBird) / 1000 * 10) / 10

    await prisma.dailyRecord.create({
      data: {
        organizationId: org1.id,
        batchId:        batch1.id,
        date:           dateJ,
        mortality:      mort,
        feedKg,
        waterLiters:    Math.round(feedKg * 2 * 10) / 10,
        temperatureMin: Math.round((28 + Math.random() * 4) * 10) / 10,
        temperatureMax: Math.round((33 + Math.random() * 4) * 10) / 10,
        humidity:       Math.round((60 + Math.random() * 15) * 10) / 10,
        recordedById:   j % 3 === 0 ? tech1.id : saisie1.id,
      },
    })
  }

  // Dépense aliment lot 1
  await prisma.expense.create({
    data: {
      organizationId: org1.id,
      batchId:        batch1.id,
      farmId:         farm1.id,
      categoryId:     catAliment.id,
      date:           dt(addDays(today, -32)),
      description:    "Achat aliment croissance Avicoop N°2 — 4 tonnes",
      amountFcfa:     1_700_000,
      supplierId:     supplierAliment1.id,
      reference:      "BL-2026-089",
      createdById:    manager1.id,
    },
  })

  // Dépense achat poussins lot 1
  await prisma.expense.create({
    data: {
      organizationId: org1.id,
      batchId:        batch1.id,
      farmId:         farm1.id,
      date:           dt(entryDate1),
      description:    "Achat 2000 poussins Cobb 500 — AVISEN",
      amountFcfa:     1_500_000,
      supplierId:     supplierPoussins.id,
      createdById:    manager1.id,
    },
  })

  // ── LOT 2 — SF-2025-018 : Cycle clôturé (vendu) ─────────────────────────

  const entryDate2 = addDays(today, -85)
  const closeDate2 = dt(addDays(today, -40))

  const batch2 = await prisma.batch.create({
    data: {
      organizationId: org1.id,
      buildingId:     bat1B.id,
      number:         "SF-2025-018",
      type:           BatchType.CHAIR,
      status:         BatchStatus.SOLD,
      speciesId:      poulet.id,
      breedId:        ross308.id,
      entryDate:      dt(entryDate2),
      entryCount:     1500,
      entryAgeDay:    1,
      entryWeightG:   44,
      supplierId:     supplierPoussins.id,
      unitCostFcfa:   720,
      totalCostFcfa:  1_080_000,
      closedAt:       closeDate2,
      closeReason:    "Vente intégrale au marché Sandaga à J45",
    },
  })

  // 45 saisies lot 2
  let mortCumul2 = 0
  for (let j = 0; j < 45; j++) {
    const ageDay   = j + 1
    const dateJ    = dt(addDays(entryDate2, j))
    const mort     = j < 7 ? (Math.random() < 0.35 ? 2 : 1) : (Math.random() < 0.1 ? 1 : 0)
    mortCumul2    += mort
    const effectif = 1500 - mortCumul2
    const gPerBird = ageDay < 8 ? 30 : ageDay < 15 ? 65 : ageDay < 22 ? 105 : ageDay < 35 ? 150 : 175
    const feedKg   = Math.round((effectif * gPerBird) / 1000 * 10) / 10

    await prisma.dailyRecord.create({
      data: {
        organizationId: org1.id,
        batchId:        batch2.id,
        date:           dateJ,
        mortality:      mort,
        feedKg,
        waterLiters:    Math.round(feedKg * 1.9 * 10) / 10,
        recordedById:   saisie1.id,
      },
    })
  }

  // Dépenses lot 2 (nécessaires pour calculer la rentabilité)
  await Promise.all([
    prisma.expense.create({ data: {
      organizationId: org1.id,
      batchId:        batch2.id,
      farmId:         farm1.id,
      date:           dt(entryDate2),
      description:    "Achat 1500 poussins Ross 308 — AVISEN",
      amountFcfa:     1_080_000,
      supplierId:     supplierPoussins.id,
      createdById:    manager1.id,
    }}),
    prisma.expense.create({ data: {
      organizationId: org1.id,
      batchId:        batch2.id,
      farmId:         farm1.id,
      date:           dt(addDays(entryDate2, -2)),
      description:    "Aliment démarrage + croissance — lot Ross 308",
      amountFcfa:     950_000,
      supplierId:     supplierAliment1.id,
      reference:      "BL-2025-147",
      createdById:    manager1.id,
    }}),
    prisma.expense.create({ data: {
      organizationId: org1.id,
      batchId:        batch2.id,
      farmId:         farm1.id,
      date:           dt(addDays(entryDate2, 5)),
      description:    "Vaccins + médicaments lot Ross 308",
      amountFcfa:     85_000,
      createdById:    manager1.id,
    }}),
  ])

  // Vente lot 2 — totalFcfa = SUM des SaleItems (calculé depuis les lignes)
  // 1440 sujets × 1.55 kg moyen = 2232 kg × 1480 FCFA/kg = 3 303 360 FCFA
  const saleItemTotal2 = Math.round(2232 * 1480)   // 3 303 360

  const sale1 = await prisma.sale.create({
    data: {
      organizationId: org1.id,
      customerId:     clientSandaga.id,
      saleDate:       closeDate2,
      productType:    SaleProductType.POULET_VIF,
      totalFcfa:      saleItemTotal2,
      paidFcfa:       saleItemTotal2,
      notes:          "1440 sujets × 1.55 kg moyen × 1480 FCFA/kg",
      createdById:    manager1.id,
    },
  })

  await prisma.saleItem.create({
    data: {
      saleId:        sale1.id,
      batchId:       batch2.id,
      description:   "Poulets vifs Ross 308 — 1440 sujets × 1.55 kg",
      quantity:      2232,
      unit:          "KG",
      unitPriceFcfa: 1480,
      totalFcfa:     saleItemTotal2,
    },
  })

  // Vente partiellement payée — pour tester "Reste à encaisser" dans SalesPage
  // Lot 1 (actif) : acompte reçu sur une commande en cours
  const saleItemPartial = Math.round(500 * 1550)   // 500 sujets × 1550 FCFA

  const sale2 = await prisma.sale.create({
    data: {
      organizationId: org1.id,
      customerId:     clientSandaga.id,
      saleDate:       dt(addDays(today, -3)),
      productType:    SaleProductType.POULET_VIF,
      totalFcfa:      saleItemPartial,
      paidFcfa:       Math.round(saleItemPartial / 2),   // 50 % versé
      notes:          "Commande en cours — acompte 50% reçu",
      createdById:    manager1.id,
    },
  })

  await prisma.saleItem.create({
    data: {
      saleId:        sale2.id,
      batchId:       batch1.id,
      description:   "Poulets vifs Cobb 500 — 500 sujets (commande à venir)",
      quantity:      500,
      unit:          "PIECE",
      unitPriceFcfa: 1550,
      totalFcfa:     saleItemPartial,
    },
  })

  // ── LOT 3 — SF-2026-002 : Pondeuse active (ISA Brown, 45 jours) ──────────

  const entryDate3 = addDays(today, -45)

  const batch3 = await prisma.batch.create({
    data: {
      organizationId: org1.id,
      buildingId:     bat1C.id,
      number:         "SF-2026-002",
      type:           BatchType.PONDEUSE,
      status:         BatchStatus.ACTIVE,
      speciesId:      pondeuse.id,
      breedId:        isaBrown.id,
      entryDate:      dt(entryDate3),
      entryCount:     800,
      entryAgeDay:    18,
      entryWeightG:   1_650,
      unitCostFcfa:   2_800,
      totalCostFcfa:  2_240_000,
      notes:          "Bande pondeuses — démarrage ponte prévu J140",
    },
  })

  // Saisies + production œufs lot 3 (15 derniers jours — ponte démarrée)
  let mortCumul3 = 0
  for (let j = 0; j < 45; j++) {
    const dateJ    = dt(addDays(entryDate3, j))
    const mort     = Math.random() < 0.08 ? 1 : 0
    mortCumul3    += mort
    const effectif = 800 - mortCumul3
    const feedKg   = Math.round((effectif * 115) / 1000 * 10) / 10

    await prisma.dailyRecord.create({
      data: {
        organizationId: org1.id,
        batchId:        batch3.id,
        date:           dateJ,
        mortality:      mort,
        feedKg,
        waterLiters:    Math.round(feedKg * 2.1 * 10) / 10,
        recordedById:   tech1.id,
      },
    })

    // Ponte démarrée à partir de J30 (âge 18+30 = 48 semaines ≈ démarrage)
    if (j >= 30) {
      const tauxPonte  = 0.72 + (j - 30) * 0.005 // montée en production
      const totalEggs  = Math.round(effectif * tauxPonte)
      const broken     = Math.round(totalEggs * 0.018)
      const dirty      = Math.round(totalEggs * 0.01)

      await prisma.eggProductionRecord.create({
        data: {
          organizationId: org1.id,
          batchId:        batch3.id,
          date:           dateJ,
          totalEggs,
          sellableEggs:   totalEggs - broken - dirty,
          brokenEggs:     broken,
          dirtyEggs:      dirty,
          smallEggs:      0,
          passageCount:   2,
          recordedById:   tech1.id,
        },
      })
    }
  }

  // =========================================================================
  // ORGANISATION 2 — Avicole Thiès SARL
  // Données minimales pour tester l'isolation multi-tenant
  // =========================================================================
  console.log("🏢 Organisation 2 : Avicole Thiès SARL (test isolation multi-tenant)...")

  const owner2 = await prisma.user.create({
    data: { email: "cheikh.ndiaye@sunufarm.sn", name: "Cheikh Ndiaye", passwordHash },
  })

  const org2 = await prisma.organization.create({
    data: {
      name:     "Avicole Thiès SARL",
      slug:     "avicole-thies",
      currency: "XOF",
      locale:   "fr-SN",
      timezone: "Africa/Dakar",
      phone:    "+221 33 951 23 45",
      address:  "Zone agropastorale, Thiès, Sénégal",
    },
  })

  await prisma.userOrganization.create({
    data: { userId: owner2.id, organizationId: org2.id, role: UserRole.OWNER },
  })

  // org2 est en essai gratuit de 7 jours (3 crédits IA) — pour tester le système trial
  await prisma.subscription.create({
    data: {
      organizationId:  org2.id,
      plan:            SubscriptionPlan.BASIC,
      status:          SubscriptionStatus.TRIAL,
      amountFcfa:      0,
      startedAt:       today,
      trialEndsAt:     dt(addDays(today, 5)),   // 5 jours restants (sur 7)
      aiCreditsTotal:  3,
      aiCreditsUsed:   1,                        // 1 analyse déjà consommée
    },
  })

  const farm2 = await prisma.farm.create({
    data: {
      organizationId: org2.id,
      name:           "Ferme de Mbour",
      code:           "THIS-01",
      address:        "Route de Mbour, Thiès",
      latitude:       14.7886,
      longitude:      -16.9260,
      totalCapacity:  5_000,
    },
  })

  const bat2A = await prisma.building.create({
    data: {
      organizationId: org2.id,
      farmId:         farm2.id,
      name:           "Bâtiment Principal",
      code:           "BP-01",
      type:           BuildingType.POULAILLER_FERME,
      capacity:       3_000,
      surfaceM2:      300,
      ventilationType: "Naturelle",
    },
  })

  // Lot pondeuses org 2 — même numéro SF-2026-001 (unique par org, pas globalement)
  const entryDate4 = addDays(today, -60)

  const batch4 = await prisma.batch.create({
    data: {
      organizationId: org2.id,
      buildingId:     bat2A.id,
      number:         "SF-2026-001",   // volontairement identique à org 1 — test isolation
      type:           BatchType.PONDEUSE,
      status:         BatchStatus.ACTIVE,
      speciesId:      pondeuse.id,
      breedId:        lohmann.id,
      entryDate:      dt(entryDate4),
      entryCount:     1200,
      entryAgeDay:    20,
      entryWeightG:   1_700,
      unitCostFcfa:   2_900,
      totalCostFcfa:  3_480_000,
    },
  })

  // 30 derniers jours de saisies + ponte pour org 2
  let mortCumul4 = 0
  for (let j = 0; j < 30; j++) {
    const dateJ    = dt(addDays(today, -30 + j))
    const mort     = Math.random() < 0.07 ? 1 : 0
    mortCumul4    += mort
    const effectif = 1200 - mortCumul4
    const feedKg   = Math.round((effectif * 118) / 1000 * 10) / 10

    await prisma.dailyRecord.create({
      data: {
        organizationId: org2.id,
        batchId:        batch4.id,
        date:           dateJ,
        mortality:      mort,
        feedKg,
        waterLiters:    Math.round(feedKg * 2.0 * 10) / 10,
        recordedById:   owner2.id,
      },
    })

    const totalEggs = Math.round(effectif * 0.78)
    const broken    = Math.round(totalEggs * 0.02)
    const dirty     = Math.round(totalEggs * 0.01)

    await prisma.eggProductionRecord.create({
      data: {
        organizationId: org2.id,
        batchId:        batch4.id,
        date:           dateJ,
        totalEggs,
        sellableEggs:   totalEggs - broken - dirty,
        brokenEggs:     broken,
        dirtyEggs:      dirty,
        smallEggs:      0,
        passageCount:   2,
        recordedById:   owner2.id,
      },
    })
  }

  // =========================================================================
  // Résumé
  // =========================================================================
  console.log("\n✅ Données de démonstration créées avec succès !")
  console.log("\n📋 Comptes de test (mot de passe : Sunufarm2025!) :")
  console.log("   Plateforme SunuFarm :")
  console.log("   → admin@sunufarm.sn             (SUPER_ADMIN)")
  console.log("   Organisation 1 — Ferme Diallo et Fils (Dakar) :")
  console.log("   → ousmane.diallo@sunufarm.sn   (OWNER)")
  console.log("   → mamadou.fall@sunufarm.sn      (MANAGER)")
  console.log("   → fatou.sow@sunufarm.sn          (TECHNICIAN)")
  console.log("   → ibrahima.ba@sunufarm.sn        (DATA_ENTRY)")
  console.log("   → aminata.diop@sunufarm.sn       (ACCOUNTANT)")
  console.log("\n   Organisation 2 — Avicole Thiès SARL :")
  console.log("   → cheikh.ndiaye@sunufarm.sn     (OWNER)")
  console.log("\n📦 Données créées (org 1) :")
  console.log("   → 3 lots (SF-2026-001 actif J30, SF-2025-018 vendu, SF-2026-002 pondeuses)")
  console.log("   → 2 ventes (intégrale + acompte partiel pour tester 'Reste à encaisser')")
  console.log("   → 3 stocks médicaments (dont 1 stock bas + péremption proche)")
  console.log("   → Rentabilité lot SF-2025-018 : ~3.3M FCFA revenus / ~2.1M FCFA coûts")
  console.log("\n🔒 Test isolation multi-tenant : connectez-vous avec cheikh.ndiaye")
  console.log("   Il ne voit PAS les données de l'organisation Diallo.")
}

main()
  .catch((e) => {
    console.error("❌ Erreur lors du seed :", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
