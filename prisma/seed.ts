/**
 * SunuFarm — Seeds de démonstration
 * Données sénégalaises réalistes pour le développement et les tests
 *
 * 2 organisations isolées pour valider le multi-tenant
 * Mot de passe de tous les comptes de test : Sunufarm2025!
 *
 * Usage : npx prisma db seed
 */

import { PrismaClient, BatchType, BatchStatus, BuildingType, FeedMovementType, SaleProductType, UserRole } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import bcrypt from "bcryptjs"
import * as dotenv from "dotenv"
import path from "path"

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") })

const pool = new Pool({ connectionString: process.env.SUNUFARM_DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Date sans heure (minuit UTC) pour les champs @db.Date */
function d(date: Date): Date {
  return new Date(date.toISOString().split("T")[0] + "T00:00:00.000Z")
}

// ---------------------------------------------------------------------------
// Suppression dans l'ordre inverse des dépendances
// ---------------------------------------------------------------------------

async function clearAll() {
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
  await prisma.organization.deleteMany()
  await prisma.verificationToken.deleteMany()
  await prisma.session.deleteMany()
  await prisma.account.deleteMany()
  await prisma.user.deleteMany()
  await prisma.mortalityReason.deleteMany()
  await prisma.feedType.deleteMany()
  await prisma.breed.deleteMany()
  await prisma.species.deleteMany()
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Nettoyage des données existantes...")
  await clearAll()
  console.log("OK\n")

  // =========================================================================
  // RÉFÉRENTIELS GLOBAUX
  // =========================================================================

  const poulet = await prisma.species.create({ data: { name: "Poulet", code: "POULET" } })
  await prisma.species.createMany({
    data: [
      { name: "Pintade", code: "PINTADE" },
      { name: "Dinde", code: "DINDE" },
      { name: "Caille", code: "CAILLE" },
    ],
  })

  const cobb500 = await prisma.breed.create({ data: { name: "Cobb 500", code: "COBB500", speciesId: poulet.id } })
  const ross308 = await prisma.breed.create({ data: { name: "Ross 308", code: "ROSS308", speciesId: poulet.id } })
  const isaBrown = await prisma.breed.create({ data: { name: "ISA Brown", code: "ISA_BROWN", speciesId: poulet.id } })
  await prisma.breed.create({ data: { name: "Label Rouge", code: "LABEL_ROUGE", speciesId: poulet.id } })

  const ftDemarrage = await prisma.feedType.create({ data: { name: "Démarrage", code: "DEMARRAGE" } })
  const ftCroissance = await prisma.feedType.create({ data: { name: "Croissance", code: "CROISSANCE" } })
  const ftFinition = await prisma.feedType.create({ data: { name: "Finition", code: "FINITION" } })
  const ftPonte = await prisma.feedType.create({ data: { name: "Ponte", code: "PONTE" } })

  // Motifs globaux
  const mrMaladie = await prisma.mortalityReason.create({ data: { name: "Maladie", code: "MALADIE" } })
  const mrStress = await prisma.mortalityReason.create({ data: { name: "Stress thermique", code: "STRESS_THERMIQUE" } })
  await prisma.mortalityReason.createMany({
    data: [
      { name: "Accident", code: "ACCIDENT" },
      { name: "Prédation", code: "PREDATION" },
      { name: "Non précisé", code: "NON_PRECISE", isDefault: true },
    ],
  })

  // Catégories de dépenses système
  const ecPoussins = await prisma.expenseCategory.create({ data: { name: "Achat poussins", code: "POUSSIN", isSystem: true } })
  const ecAliment = await prisma.expenseCategory.create({ data: { name: "Aliment", code: "ALIMENT", isSystem: true } })
  const ecMedicament = await prisma.expenseCategory.create({ data: { name: "Médicaments", code: "MEDICAMENT", isSystem: true } })
  const ecEnergie = await prisma.expenseCategory.create({ data: { name: "Énergie", code: "ENERGIE", isSystem: true } })
  const ecMainOeuvre = await prisma.expenseCategory.create({ data: { name: "Main d'œuvre", code: "MAIN_OEUVRE", isSystem: true } })
  await prisma.expenseCategory.createMany({
    data: [
      { name: "Transport", code: "TRANSPORT", isSystem: true },
      { name: "Maintenance", code: "MAINTENANCE", isSystem: true },
      { name: "Autre", code: "AUTRE", isSystem: true },
    ],
  })

  // =========================================================================
  // MOTS DE PASSE (tous les comptes de test : Sunufarm2025!)
  // =========================================================================

  const passwordHash = await bcrypt.hash("Sunufarm2025!", 10)

  // =========================================================================
  // ORGANISATION 1 : Avicole Ndiaye & Fils — Dakar / Thiès
  // =========================================================================

  const org1 = await prisma.organization.create({
    data: {
      name: "Avicole Ndiaye & Fils",
      slug: "ndiaye-fils",
      currency: "XOF",
      locale: "fr-SN",
      timezone: "Africa/Dakar",
      phone: "+221 77 123 45 67",
      address: "Route de Rufisque, Dakar, Sénégal",
    },
  })

  // Utilisateurs org1 — tous les rôles représentés
  const [uMoussa, uFatou, uIbrahima, uAissatou, uOmar, uAminata] = await Promise.all([
    prisma.user.create({ data: { name: "Moussa Ndiaye",      email: "moussa.ndiaye@sunufarm.test",   passwordHash } }),
    prisma.user.create({ data: { name: "Fatou Diallo",       email: "fatou.diallo@sunufarm.test",    passwordHash } }),
    prisma.user.create({ data: { name: "Ibrahima Sow",       email: "ibrahima.sow@sunufarm.test",    passwordHash } }),
    prisma.user.create({ data: { name: "Aissatou Diop",      email: "aissatou.diop@sunufarm.test",   passwordHash } }),
    prisma.user.create({ data: { name: "Omar Faye",          email: "omar.faye@sunufarm.test",       passwordHash } }),
    prisma.user.create({ data: { name: "Dr. Aminata Cissé",  email: "aminata.cisse@sunufarm.test",   passwordHash } }),
  ])

  await prisma.userOrganization.createMany({
    data: [
      { userId: uMoussa.id,   organizationId: org1.id, role: UserRole.OWNER      },
      { userId: uFatou.id,    organizationId: org1.id, role: UserRole.MANAGER     },
      { userId: uIbrahima.id, organizationId: org1.id, role: UserRole.TECHNICIAN  },
      { userId: uAissatou.id, organizationId: org1.id, role: UserRole.DATA_ENTRY  },
      { userId: uOmar.id,     organizationId: org1.id, role: UserRole.ACCOUNTANT  },
      { userId: uAminata.id,  organizationId: org1.id, role: UserRole.VET         },
    ],
  })

  // Fermes
  const farm1 = await prisma.farm.create({
    data: {
      organizationId: org1.id,
      name: "Ferme de Pikine",
      code: "PKN-01",
      address: "Pikine Est, Dakar",
      latitude: 14.7645,
      longitude: -17.3837,
      totalCapacity: 20000,
    },
  })
  const farm2 = await prisma.farm.create({
    data: {
      organizationId: org1.id,
      name: "Ferme de Mbour",
      code: "MBR-01",
      address: "Zone agricole de Mbour, Thiès",
      latitude: 14.3756,
      longitude: -16.9656,
      totalCapacity: 15000,
    },
  })

  // Bâtiments farm1 (Pikine) — 3 bâtiments
  const bat1A = await prisma.building.create({
    data: { organizationId: org1.id, farmId: farm1.id, name: "Bâtiment A", code: "PKN-A", type: BuildingType.POULAILLER_FERME,      capacity: 6000, surfaceM2: 300, ventilationType: "Naturelle" },
  })
  const bat1B = await prisma.building.create({
    data: { organizationId: org1.id, farmId: farm1.id, name: "Bâtiment B", code: "PKN-B", type: BuildingType.POULAILLER_FERME,      capacity: 5000, surfaceM2: 250, ventilationType: "Naturelle" },
  })
  await prisma.building.create({
    data: { organizationId: org1.id, farmId: farm1.id, name: "Bâtiment C", code: "PKN-C", type: BuildingType.POULAILLER_SEMI_FERME, capacity: 4000, surfaceM2: 200, ventilationType: "Naturelle" },
  })

  // Bâtiments farm2 (Mbour) — 2 bâtiments
  const bat2A = await prisma.building.create({
    data: { organizationId: org1.id, farmId: farm2.id, name: "Poulailler 1", code: "MBR-1", type: BuildingType.POULAILLER_FERME, capacity: 5000, surfaceM2: 250, ventilationType: "Forcée" },
  })
  await prisma.building.create({
    data: { organizationId: org1.id, farmId: farm2.id, name: "Poulailler 2", code: "MBR-2", type: BuildingType.POULAILLER_FERME, capacity: 5000, surfaceM2: 250, ventilationType: "Forcée" },
  })

  // Fournisseurs
  const supPoussin1 = await prisma.supplier.create({
    data: { organizationId: org1.id, name: "Sénégal Aviculture SARL", phone: "+221 33 820 15 50", email: "contact@senegalaviculture.sn", address: "Zone industrielle, Dakar",      type: "POUSSIN" },
  })
  const supAliment1 = await prisma.supplier.create({
    data: { organizationId: org1.id, name: "Avicoop Sénégal",          phone: "+221 33 832 00 00", email: "commandes@avicoop.sn",        address: "Route de Rufisque, Dakar",  type: "ALIMENT" },
  })

  // Clients
  const cust1A = await prisma.customer.create({
    data: { organizationId: org1.id, name: "Marché Sandaga",        phone: "+221 77 456 78 90", address: "Marché Sandaga, Dakar",                   type: "PROFESSIONNEL" },
  })
  await prisma.customer.create({
    data: { organizationId: org1.id, name: "Restaurant Le Baobab",  phone: "+221 78 234 56 78", address: "Avenue Cheikh Anta Diop, Dakar",          type: "PROFESSIONNEL" },
  })

  // Employés
  await prisma.employee.createMany({
    data: [
      { organizationId: org1.id, farmId: farm1.id, firstName: "Serigne", lastName: "Diop",  phone: "+221 76 111 22 33", role: "Technicien d'élevage", hireDate: new Date("2024-03-01"), monthlySalaryFcfa: 180000, isActive: true },
      { organizationId: org1.id, farmId: farm1.id, firstName: "Ndèye",   lastName: "Fall",  phone: "+221 77 333 44 55", role: "Agent de saisie",       hireDate: new Date("2024-06-15"), monthlySalaryFcfa: 120000, isActive: true },
    ],
  })

  // =========================================================================
  // LOTS ORG 1
  // =========================================================================

  // J0 = date d'entrée des sujets
  const j0Chair1   = new Date("2026-02-18") // lot chair actif  → 30 jours de saisies
  const j0Ponde1   = new Date("2026-03-05") // lot pondeuse actif → 15 jours de saisies
  const j0Sold1    = new Date("2026-01-02") // lot chair vendu    → clôturé 10 fév
  const closedDate1 = new Date("2026-02-10")

  // Lot 1 — Chair actif (SF-2026-001) — Bâtiment A, Pikine — 5 000 Cobb 500
  const batch1 = await prisma.batch.create({
    data: {
      organizationId: org1.id,
      buildingId:     bat1A.id,
      number:         "SF-2026-001",
      type:           BatchType.CHAIR,
      status:         BatchStatus.ACTIVE,
      speciesId:      poulet.id,
      breedId:        cobb500.id,
      entryDate:      j0Chair1,
      entryCount:     5000,
      entryAgeDay:    0,
      entryWeightG:   42,
      supplierId:     supPoussin1.id,
      unitCostFcfa:   650,
      totalCostFcfa:  3250000,
    },
  })

  // Lot 2 — Pondeuse actif (SF-2026-002) — Bâtiment B, Pikine — 3 000 ISA Brown
  const batch2 = await prisma.batch.create({
    data: {
      organizationId: org1.id,
      buildingId:     bat1B.id,
      number:         "SF-2026-002",
      type:           BatchType.PONDEUSE,
      status:         BatchStatus.ACTIVE,
      speciesId:      poulet.id,
      breedId:        isaBrown.id,
      entryDate:      j0Ponde1,
      entryCount:     3000,
      entryAgeDay:    126, // 18 semaines — entrée en ponte
      entryWeightG:   1600,
      supplierId:     supPoussin1.id,
      unitCostFcfa:   2800,
      totalCostFcfa:  8400000,
    },
  })

  // Lot 3 — Chair vendu (SF-2025-047) — Poulailler 1, Mbour — 4 000 Cobb 500
  const batch3 = await prisma.batch.create({
    data: {
      organizationId: org1.id,
      buildingId:     bat2A.id,
      number:         "SF-2025-047",
      type:           BatchType.CHAIR,
      status:         BatchStatus.SOLD,
      speciesId:      poulet.id,
      breedId:        cobb500.id,
      entryDate:      j0Sold1,
      entryCount:     4000,
      entryAgeDay:    0,
      entryWeightG:   43,
      supplierId:     supPoussin1.id,
      unitCostFcfa:   650,
      totalCostFcfa:  2600000,
      closedAt:       closedDate1,
      closeReason:    "Vente totale réalisée le 10 février 2026",
    },
  })

  // =========================================================================
  // SAISIES JOURNALIÈRES — Lot chair actif (30 jours)
  //
  // Courbe aliment Cobb 500 (g/sujet/jour) :
  //   J1-7   : 15-28g  (démarrage)
  //   J8-14  : 38-58g  (croissance début)
  //   J15-21 : 65-86g  (croissance pleine)
  //   J22-30 : 90-113g (finition)
  //
  // Mortalité : J1-3 = 3/j, J4-7 = 2/j, J8+ = 1-2/j (~0.04% effectif/j)
  // =========================================================================

  const feedCurve = [
    15, 18, 20, 22, 24, 25, 28,        // J1-7
    38, 42, 46, 50, 53, 55, 58,        // J8-14
    65, 68, 72, 76, 80, 83, 86,        // J15-21
    90, 93, 96, 100, 103, 106, 110, 113, // J22-29 (30 valeurs total)
  ]
  const mortalityCurve = [3, 3, 3, 2, 2, 2, 2, 2, 1, 2, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1]

  let dead1 = 0
  for (let day = 1; day <= 30; day++) {
    const mortality = mortalityCurve[day - 1]
    dead1 += mortality
    const living    = batch1.entryCount - dead1
    const feedKg    = Math.round(feedCurve[day - 1] * living / 100) / 10  // arrondi 0.1 kg

    const dr = await prisma.dailyRecord.create({
      data: {
        organizationId: org1.id,
        batchId:        batch1.id,
        date:           d(addDays(j0Chair1, day)),
        mortality,
        feedKg,
        waterLiters:    Math.round(feedKg * 18) / 10, // 1.8× aliment
        temperatureMin: 28 + (day < 15 ? 2 : 0),
        temperatureMax: 33 + (day < 15 ? 2 : 0),
        humidity:       65,
        recordedById:   uAissatou.id,
        lockedAt:       day < 29 ? d(addDays(j0Chair1, day + 2)) : null,
      },
    })

    // Motif renseigné sur ~60% des jours (les autres restent "Non précisé" → alerte J+3)
    if (day % 5 !== 0 && mortality > 0) {
      await prisma.mortalityRecord.create({
        data: {
          dailyRecordId:    dr.id,
          mortalityReasonId: day <= 10 ? mrMaladie.id : mrStress.id,
          count:            mortality,
        },
      })
    }
  }

  // =========================================================================
  // PESÉES — Lot chair actif (J7, J14, J21, J28 — courbe Cobb 500)
  // =========================================================================

  const pesees = [
    { day: 7,  avg: 185,  sample: 50 },
    { day: 14, avg: 550,  sample: 50 },
    { day: 21, avg: 1100, sample: 50 },
    { day: 28, avg: 1750, sample: 50 },
  ]
  for (const p of pesees) {
    await prisma.weightRecord.create({
      data: {
        organizationId: org1.id,
        batchId:        batch1.id,
        date:           d(addDays(j0Chair1, p.day)),
        batchAgeDay:    p.day,
        sampleCount:    p.sample,
        avgWeightG:     p.avg,
        minWeightG:     Math.round(p.avg * 0.85),
        maxWeightG:     Math.round(p.avg * 1.15),
        recordedById:   uIbrahima.id,
      },
    })
  }

  // =========================================================================
  // PRODUCTION D'ŒUFS — Lot pondeuse (15 jours)
  // Taux de ponte progressif : J1 = 50% → J15 = 78%
  // =========================================================================

  const layingCurve = [50, 53, 57, 60, 63, 65, 67, 69, 71, 72, 74, 75, 76, 77, 78]
  let living2 = batch2.entryCount

  for (let day = 1; day <= 15; day++) {
    const total    = Math.round(living2 * layingCurve[day - 1] / 100)
    const broken   = Math.round(total * 0.015)
    const dirty    = Math.round(total * 0.010)
    const sellable = total - broken - dirty

    await prisma.eggProductionRecord.create({
      data: {
        organizationId: org1.id,
        batchId:        batch2.id,
        date:           d(addDays(j0Ponde1, day)),
        totalEggs:      total,
        sellableEggs:   sellable,
        brokenEggs:     broken,
        dirtyEggs:      dirty,
        smallEggs:      0,
        passageCount:   2,
        recordedById:   uAissatou.id,
      },
    })
    if (day % 5 === 0) living2 -= 1 // légère mortalité pondeuse
  }

  // =========================================================================
  // STOCKS ALIMENTS — Ferme Pikine
  // =========================================================================

  const fsDemar = await prisma.feedStock.create({
    data: { organizationId: org1.id, farmId: farm1.id, feedTypeId: ftDemarrage.id,  name: "Aliment démarrage Avicoop", supplierName: "Avicoop Sénégal", quantityKg: 420,  unitPriceFcfa: 340, alertThresholdKg: 500 },
  })
  const fsCrois = await prisma.feedStock.create({
    data: { organizationId: org1.id, farmId: farm1.id, feedTypeId: ftCroissance.id, name: "Aliment croissance Avicoop", supplierName: "Avicoop Sénégal", quantityKg: 2350, unitPriceFcfa: 310, alertThresholdKg: 1000 },
  })
  const fsPonte = await prisma.feedStock.create({
    data: { organizationId: org1.id, farmId: farm1.id, feedTypeId: ftPonte.id,      name: "Aliment ponte Avicoop",     supplierName: "Avicoop Sénégal", quantityKg: 3150, unitPriceFcfa: 325, alertThresholdKg: 1500 },
  })

  await prisma.feedMovement.createMany({
    data: [
      { organizationId: org1.id, feedStockId: fsDemar.id, feedTypeId: ftDemarrage.id,  type: FeedMovementType.ENTREE, quantityKg: 2000, unitPriceFcfa: 340, totalFcfa: 680000,  batchId: batch1.id, reference: "BL-2026-0218", date: d(j0Chair1) },
      { organizationId: org1.id, feedStockId: fsCrois.id, feedTypeId: ftCroissance.id, type: FeedMovementType.ENTREE, quantityKg: 5000, unitPriceFcfa: 310, totalFcfa: 1550000, reference: "BL-2026-0301", date: d(new Date("2026-03-01")) },
      { organizationId: org1.id, feedStockId: fsPonte.id, feedTypeId: ftPonte.id,      type: FeedMovementType.ENTREE, quantityKg: 5000, unitPriceFcfa: 325, totalFcfa: 1625000, reference: "BL-2026-0305", date: d(new Date("2026-03-05")) },
    ],
  })

  // =========================================================================
  // DÉPENSES — Lots org1
  // =========================================================================

  await prisma.expense.createMany({
    data: [
      // Charges directes lot chair actif
      { organizationId: org1.id, batchId: batch1.id, categoryId: ecPoussins.id,   date: d(j0Chair1),                   description: "Achat 5 000 poussins Cobb 500",       amountFcfa: 3250000, supplierId: supPoussin1.id, createdById: uFatou.id  },
      { organizationId: org1.id, batchId: batch1.id, categoryId: ecAliment.id,    date: d(new Date("2026-03-01")),      description: "Aliment démarrage J1-J14",             amountFcfa: 680000,  supplierId: supAliment1.id, createdById: uOmar.id   },
      { organizationId: org1.id, batchId: batch1.id, categoryId: ecAliment.id,    date: d(new Date("2026-03-08")),      description: "Aliment croissance J15-J30",           amountFcfa: 1550000, supplierId: supAliment1.id, createdById: uOmar.id   },
      { organizationId: org1.id, batchId: batch1.id, categoryId: ecMedicament.id, date: d(new Date("2026-02-25")),      description: "Vaccin Newcastle HB1",                 amountFcfa: 85000,                              createdById: uAminata.id },
      { organizationId: org1.id, batchId: batch1.id, categoryId: ecMedicament.id, date: d(new Date("2026-03-04")),      description: "Vaccin Gumboro D78",                   amountFcfa: 72000,                              createdById: uAminata.id },
      // Charges directes lot pondeuse
      { organizationId: org1.id, batchId: batch2.id, categoryId: ecPoussins.id,   date: d(j0Ponde1),                   description: "Achat 3 000 poulettes ISA Brown 18 sem", amountFcfa: 8400000, supplierId: supPoussin1.id, createdById: uFatou.id  },
      { organizationId: org1.id, batchId: batch2.id, categoryId: ecAliment.id,    date: d(new Date("2026-03-06")),      description: "Aliment ponte J1-J15",                 amountFcfa: 975000,  supplierId: supAliment1.id, createdById: uOmar.id   },
      // Charges indirectes ferme Pikine
      { organizationId: org1.id, farmId: farm1.id,   categoryId: ecEnergie.id,    date: d(new Date("2026-03-01")),      description: "Facture électricité mars 2026",         amountFcfa: 120000,                              createdById: uOmar.id   },
      { organizationId: org1.id, farmId: farm1.id,   categoryId: ecMainOeuvre.id, date: d(new Date("2026-03-01")),      description: "Salaires mars 2026 — Pikine",           amountFcfa: 300000,                              createdById: uOmar.id   },
    ],
  })

  // =========================================================================
  // VENTE — Lot vendu (batch3, SF-2025-047) — 3 920 poulets vifs
  // =========================================================================

  const sale1 = await prisma.sale.create({
    data: {
      organizationId: org1.id,
      customerId:     cust1A.id,
      saleDate:       d(closedDate1),
      productType:    SaleProductType.POULET_VIF,
      totalFcfa:      8563600,
      paidFcfa:       8563600,
      createdById:    uFatou.id,
    },
  })
  await prisma.saleItem.create({
    data: {
      saleId:        sale1.id,
      batchId:       batch3.id,
      description:   "Poulets vifs Cobb 500 — 39 jours, ~1 750 g",
      quantity:      3920,        // 4 000 - 80 morts sur 39 jours
      unit:          "PIECE",
      unitPriceFcfa: 2185,
      totalFcfa:     8565200,     // 3920 × 2185
    },
  })

  // =========================================================================
  // ORGANISATION 2 : Ba Aviculture — Saint-Louis / Ziguinchor
  // (isolation multi-tenant : données totalement séparées)
  // =========================================================================

  const org2 = await prisma.organization.create({
    data: {
      name:     "Ba Aviculture",
      slug:     "ba-aviculture",
      currency: "XOF",
      locale:   "fr-SN",
      timezone: "Africa/Dakar",
      phone:    "+221 77 987 65 43",
      address:  "Quartier Guet Ndar, Saint-Louis, Sénégal",
    },
  })

  const [uAbdoulaye, uRokhaya, uCheikh, uMariama, uSouleymane] = await Promise.all([
    prisma.user.create({ data: { name: "Abdoulaye Ba",     email: "abdoulaye.ba@sunufarm.test",     passwordHash } }),
    prisma.user.create({ data: { name: "Rokhaya Diallo",   email: "rokhaya.diallo@sunufarm.test",   passwordHash } }),
    prisma.user.create({ data: { name: "Cheikh Mbaye",     email: "cheikh.mbaye@sunufarm.test",     passwordHash } }),
    prisma.user.create({ data: { name: "Mariama Sall",     email: "mariama.sall@sunufarm.test",     passwordHash } }),
    prisma.user.create({ data: { name: "Souleymane Sarr",  email: "souleymane.sarr@sunufarm.test",  passwordHash } }),
  ])

  await prisma.userOrganization.createMany({
    data: [
      { userId: uAbdoulaye.id,  organizationId: org2.id, role: UserRole.OWNER      },
      { userId: uRokhaya.id,    organizationId: org2.id, role: UserRole.MANAGER     },
      { userId: uCheikh.id,     organizationId: org2.id, role: UserRole.TECHNICIAN  },
      { userId: uMariama.id,    organizationId: org2.id, role: UserRole.DATA_ENTRY  },
      { userId: uSouleymane.id, organizationId: org2.id, role: UserRole.VIEWER      },
    ],
  })

  const farm3 = await prisma.farm.create({
    data: { organizationId: org2.id, name: "Ferme Saint-Louis Nord", code: "STL-01", address: "Route de Rosso, Saint-Louis", latitude: 16.0334, longitude: -16.5085, totalCapacity: 12000 },
  })
  const farm4 = await prisma.farm.create({
    data: { organizationId: org2.id, name: "Ferme de Ziguinchor",    code: "ZIG-01", address: "Zone agricole, Ziguinchor",   latitude: 12.5589, longitude: -16.2719, totalCapacity: 8000  },
  })

  const bat3A = await prisma.building.create({
    data: { organizationId: org2.id, farmId: farm3.id, name: "Poulailler Principal",  code: "STL-P1", type: BuildingType.POULAILLER_FERME,      capacity: 6000, surfaceM2: 300, ventilationType: "Tunnel"    },
  })
  const bat3B = await prisma.building.create({
    data: { organizationId: org2.id, farmId: farm3.id, name: "Poulailler Secondaire", code: "STL-P2", type: BuildingType.POULAILLER_FERME,      capacity: 5000, surfaceM2: 250, ventilationType: "Naturelle"  },
  })
  const bat4A = await prisma.building.create({
    data: { organizationId: org2.id, farmId: farm4.id, name: "Bâtiment Principal",   code: "ZIG-B1", type: BuildingType.POULAILLER_SEMI_FERME, capacity: 4000, surfaceM2: 200, ventilationType: "Naturelle"  },
  })

  const supPoussin2 = await prisma.supplier.create({
    data: { organizationId: org2.id, name: "Nord Aviculture",          phone: "+221 33 961 20 00", address: "Zone industrielle, Saint-Louis", type: "POUSSIN" },
  })
  await prisma.supplier.create({
    data: { organizationId: org2.id, name: "Aliment Pro Saint-Louis", phone: "+221 77 112 23 34", address: "Route de Dakar, Saint-Louis",    type: "ALIMENT" },
  })

  const cust2A = await prisma.customer.create({
    data: { organizationId: org2.id, name: "Marché Central Saint-Louis", phone: "+221 77 654 32 10", address: "Marché Central, Saint-Louis",   type: "PROFESSIONNEL" },
  })

  await prisma.employee.create({
    data: { organizationId: org2.id, farmId: farm3.id, firstName: "Ousmane", lastName: "Ndiaye", phone: "+221 70 555 66 77", role: "Technicien d'élevage", hireDate: new Date("2025-01-10"), monthlySalaryFcfa: 175000, isActive: true },
  })

  // Lots org2
  const j0Chair2 = new Date("2026-02-20")

  const batch4 = await prisma.batch.create({
    data: {
      organizationId: org2.id,
      buildingId:     bat3A.id,
      number:         "SF-2026-003",
      type:           BatchType.CHAIR,
      status:         BatchStatus.ACTIVE,
      speciesId:      poulet.id,
      breedId:        ross308.id,
      entryDate:      j0Chair2,
      entryCount:     4500,
      entryAgeDay:    0,
      entryWeightG:   43,
      supplierId:     supPoussin2.id,
      unitCostFcfa:   680,
      totalCostFcfa:  3060000,
    },
  })

  await prisma.batch.create({
    data: {
      organizationId: org2.id,
      buildingId:     bat3B.id,
      number:         "SF-2026-004",
      type:           BatchType.PONDEUSE,
      status:         BatchStatus.ACTIVE,
      speciesId:      poulet.id,
      breedId:        isaBrown.id,
      entryDate:      new Date("2026-02-01"),
      entryCount:     2500,
      entryAgeDay:    140,
      entryWeightG:   1650,
      supplierId:     supPoussin2.id,
      unitCostFcfa:   2900,
      totalCostFcfa:  7250000,
    },
  })

  const batch6 = await prisma.batch.create({
    data: {
      organizationId: org2.id,
      buildingId:     bat4A.id,
      number:         "SF-2025-038",
      type:           BatchType.CHAIR,
      status:         BatchStatus.SOLD,
      speciesId:      poulet.id,
      breedId:        ross308.id,
      entryDate:      new Date("2025-12-01"),
      entryCount:     3500,
      entryAgeDay:    0,
      entryWeightG:   42,
      supplierId:     supPoussin2.id,
      unitCostFcfa:   680,
      totalCostFcfa:  2380000,
      closedAt:       new Date("2026-01-15"),
      closeReason:    "Vente totale réalisée le 15 janvier 2026",
    },
  })

  // Saisies journalières lot chair org2 (28 jours)
  let dead2 = 0
  for (let day = 1; day <= 28; day++) {
    const mortality = mortalityCurve[day - 1]
    dead2 += mortality
    const living = batch4.entryCount - dead2
    const feedKg = Math.round(feedCurve[day - 1] * living / 100) / 10

    await prisma.dailyRecord.create({
      data: {
        organizationId: org2.id,
        batchId:        batch4.id,
        date:           d(addDays(j0Chair2, day)),
        mortality,
        feedKg,
        waterLiters:    Math.round(feedKg * 18) / 10,
        temperatureMin: 27,
        temperatureMax: 32,
        humidity:       70,
        recordedById:   uMariama.id,
        lockedAt:       day < 27 ? d(addDays(j0Chair2, day + 2)) : null,
      },
    })
  }

  // Stock aliments org2
  const fsCrois2 = await prisma.feedStock.create({
    data: { organizationId: org2.id, farmId: farm3.id, feedTypeId: ftCroissance.id, name: "Aliment croissance Nord Aviculture", quantityKg: 3500, unitPriceFcfa: 315, alertThresholdKg: 1200 },
  })
  await prisma.feedMovement.create({
    data: { organizationId: org2.id, feedStockId: fsCrois2.id, feedTypeId: ftCroissance.id, type: FeedMovementType.ENTREE, quantityKg: 5000, unitPriceFcfa: 315, totalFcfa: 1575000, reference: "BL-2026-STL-001", date: d(j0Chair2) },
  })

  // Dépenses org2
  await prisma.expense.createMany({
    data: [
      { organizationId: org2.id, batchId: batch4.id, categoryId: ecPoussins.id, date: d(j0Chair2),                description: "Achat 4 500 poussins Ross 308",  amountFcfa: 3060000, supplierId: supPoussin2.id, createdById: uRokhaya.id },
      { organizationId: org2.id, batchId: batch4.id, categoryId: ecAliment.id,  date: d(new Date("2026-03-01")), description: "Aliment croissance J1-J28",       amountFcfa: 1575000,                              createdById: uRokhaya.id },
      { organizationId: org2.id, farmId: farm3.id,   categoryId: ecEnergie.id,  date: d(new Date("2026-03-01")), description: "Facture électricité mars 2026",   amountFcfa: 95000,                                createdById: uRokhaya.id },
    ],
  })

  // Vente lot vendu org2
  const sale2 = await prisma.sale.create({
    data: {
      organizationId: org2.id,
      customerId:     cust2A.id,
      saleDate:       d(new Date("2026-01-15")),
      productType:    SaleProductType.POULET_VIF,
      totalFcfa:      7534500,
      paidFcfa:       7534500,
      createdById:    uRokhaya.id,
    },
  })
  await prisma.saleItem.create({
    data: {
      saleId:        sale2.id,
      batchId:       batch6.id,
      description:   "Poulets vifs Ross 308 — 45 jours, ~2 100 g",
      quantity:      3430,        // 3500 - 70 morts
      unit:          "PIECE",
      unitPriceFcfa: 2195,
      totalFcfa:     7528850,
    },
  })

  // =========================================================================
  // RÉCAPITULATIF
  // =========================================================================

  console.log("=== SEED TERMINÉ ===\n")
  console.log("Organisations :")
  console.log(`  • ${org1.name} (slug: ${org1.slug})`)
  console.log(`  • ${org2.name} (slug: ${org2.slug})`)
  console.log("\nMot de passe de tous les comptes : Sunufarm2025!\n")
  console.log("Comptes org1 (Ndiaye & Fils) :")
  for (const u of [uMoussa, uFatou, uIbrahima, uAissatou, uOmar, uAminata]) {
    console.log(`  ${u.email}`)
  }
  console.log("\nComptes org2 (Ba Aviculture) :")
  for (const u of [uAbdoulaye, uRokhaya, uCheikh, uMariama, uSouleymane]) {
    console.log(`  ${u.email}`)
  }
  console.log("\nLots créés :")
  for (const b of [batch1, batch2, batch3, batch4, batch6]) {
    console.log(`  ${b.number} — ${b.type} — ${b.status}`)
  }
}

main()
  .catch((e) => {
    console.error("Erreur seed :", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
