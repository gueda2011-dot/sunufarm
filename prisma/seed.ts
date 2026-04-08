import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"

import {
  BatchStatus,
  BatchType,
  BuildingType,
  FeedMovementType,
  NotificationStatus,
  NotificationType,
  PrismaClient,
  SaleProductType,
  SubscriptionPlan,
  SubscriptionStatus,
  UserRole,
} from "../src/generated/prisma"

const adapter = new PrismaPg({
  connectionString: process.env.SUNUFARM_DATABASE_URL,
})

const prisma = new PrismaClient({ adapter })

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function dateOnly(date: Date): Date {
  return new Date(date.toISOString().slice(0, 10) + "T00:00:00.000Z")
}

async function clearAll() {
  console.log("Cleaning existing data...")

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
}

async function createReferenceData() {
  const species = await prisma.species.create({
    data: {
      name: "Poulet",
      code: "POULET",
    },
  })

  const breed = await prisma.breed.create({
    data: {
      name: "Cobb 500",
      code: "COBB500",
      speciesId: species.id,
    },
  })

  const [feedGrowth, feedFinish] = await Promise.all([
    prisma.feedType.create({
      data: {
        name: "Croissance",
        code: "CROISSANCE",
      },
    }),
    prisma.feedType.create({
      data: {
        name: "Finition",
        code: "FINITION",
      },
    }),
  ])

  const [catChicks, catFeed, catVaccines, catMisc] = await Promise.all([
    prisma.expenseCategory.create({
      data: {
        name: "Achat poussins",
        code: "POUSSINS",
        isSystem: true,
      },
    }),
    prisma.expenseCategory.create({
      data: {
        name: "Aliment",
        code: "ALIMENT",
        isSystem: true,
      },
    }),
    prisma.expenseCategory.create({
      data: {
        name: "Vaccins",
        code: "MEDICAMENT",
        isSystem: true,
      },
    }),
    prisma.expenseCategory.create({
      data: {
        name: "Divers",
        code: "AUTRE",
        isSystem: true,
      },
    }),
  ])

  return {
    species,
    breed,
    feedGrowth,
    feedFinish,
    catChicks,
    catFeed,
    catVaccines,
    catMisc,
  }
}

async function createDemoWorkspace(passwordHash: string) {
  const today = dateOnly(new Date())
  const started30DaysAgo = dateOnly(addDays(today, -30))
  const started35DaysAgo = dateOnly(addDays(today, -35))

  const user = await prisma.user.create({
    data: {
      email: "demo@sunufarm.com",
      name: "Compte Demo",
      emailVerified: new Date(),
      passwordHash,
    },
  })

  const organization = await prisma.organization.create({
    data: {
      name: "SunuFarm Demo",
      slug: "sunufarm-demo",
      currency: "XOF",
      locale: "fr-SN",
      timezone: "Africa/Dakar",
      phone: "+221 77 000 00 00",
      address: "Diamniadio, Senegal",
    },
  })

  await prisma.userOrganization.create({
    data: {
      userId: user.id,
      organizationId: organization.id,
      role: UserRole.OWNER,
    },
  })

  await prisma.subscription.create({
    data: {
      organizationId: organization.id,
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      amountFcfa: 10_000,
      currentPeriodStart: today,
      currentPeriodEnd: dateOnly(addDays(today, 30)),
    },
  })

  const farm = await prisma.farm.create({
    data: {
      organizationId: organization.id,
      name: "Ferme Demo Diamniadio",
      code: "DEMO-01",
      address: "Zone avicole de Diamniadio",
      totalCapacity: 1500,
    },
  })

  const [buildingLoss, buildingProfit] = await Promise.all([
    prisma.building.create({
      data: {
        organizationId: organization.id,
        farmId: farm.id,
        name: "Poulailler Perte",
        code: "LOSS-01",
        type: BuildingType.POULAILLER_FERME,
        capacity: 700,
        surfaceM2: 140,
        ventilationType: "Naturelle",
      },
    }),
    prisma.building.create({
      data: {
        organizationId: organization.id,
        farmId: farm.id,
        name: "Poulailler Profit",
        code: "PROFIT-01",
        type: BuildingType.POULAILLER_FERME,
        capacity: 700,
        surfaceM2: 140,
        ventilationType: "Tunnel",
      },
    }),
  ])

  const [supplierChicks, supplierFeed, customerMarket] = await Promise.all([
    prisma.supplier.create({
      data: {
        organizationId: organization.id,
        name: "Avisen Demo",
        type: "POUSSIN",
        phone: "+221 33 800 00 01",
      },
    }),
    prisma.supplier.create({
      data: {
        organizationId: organization.id,
        name: "Avicoop Demo",
        type: "ALIMENT",
        phone: "+221 33 800 00 02",
      },
    }),
    prisma.customer.create({
      data: {
        organizationId: organization.id,
        name: "Marche Central Demo",
        type: "REVENDEUR",
        phone: "+221 77 900 00 00",
      },
    }),
  ])

  const refs = await createReferenceData()

  const batchLoss = await prisma.batch.create({
    data: {
      organizationId: organization.id,
      buildingId: buildingLoss.id,
      number: "BANDE-DEMO-LOSS",
      type: BatchType.CHAIR,
      status: BatchStatus.ACTIVE,
      speciesId: refs.species.id,
      breedId: refs.breed.id,
      entryDate: started30DaysAgo,
      entryCount: 500,
      entryAgeDay: 1,
      entryWeightG: 42,
      supplierId: supplierChicks.id,
      unitCostFcfa: 600,
      totalCostFcfa: 300_000,
      notes: [
        "Bande Demo - scenario perte",
        "Cout total: 1 200 000 FCFA",
        "Cout par poulet: 2 400 FCFA",
        "Prix marche: 2 200 FCFA",
        "Marge projetee: -200 FCFA/poulet",
      ].join(" | "),
    },
  })

  const batchProfit = await prisma.batch.create({
    data: {
      organizationId: organization.id,
      buildingId: buildingProfit.id,
      number: "BANDE-DEMO-PROFIT",
      type: BatchType.CHAIR,
      status: BatchStatus.SOLD,
      speciesId: refs.species.id,
      breedId: refs.breed.id,
      entryDate: started35DaysAgo,
      entryCount: 500,
      entryAgeDay: 1,
      entryWeightG: 43,
      supplierId: supplierChicks.id,
      unitCostFcfa: 600,
      totalCostFcfa: 300_000,
      closedAt: today,
      closeReason: "Vente complete a 3 000 FCFA par poulet",
      notes: [
        "Bande Demo - scenario profit",
        "Prix de vente moyen: 3 000 FCFA",
        "Cout par poulet: 2 400 FCFA",
        "Marge reelle: 600 FCFA/poulet",
        "Marge totale: 300 000 FCFA",
      ].join(" | "),
    },
  })

  await prisma.feedStock.create({
    data: {
      organizationId: organization.id,
      farmId: farm.id,
      feedTypeId: refs.feedGrowth.id,
      name: "Aliment croissance demo",
      supplierName: supplierFeed.name,
      quantityKg: 400,
      unitPriceFcfa: 500,
      alertThresholdKg: 450,
    },
  }).then(async (feedStock) => {
    await prisma.feedMovement.createMany({
      data: [
        {
          organizationId: organization.id,
          feedStockId: feedStock.id,
          feedTypeId: refs.feedGrowth.id,
          type: FeedMovementType.ENTREE,
          quantityKg: 2000,
          unitPriceFcfa: 500,
          totalFcfa: 1_000_000,
          reference: "DEMO-FEED-IN",
          recordedById: user.id,
          date: started30DaysAgo,
        },
        {
          organizationId: organization.id,
          feedStockId: feedStock.id,
          feedTypeId: refs.feedGrowth.id,
          type: FeedMovementType.SORTIE,
          quantityKg: 80,
          batchId: batchLoss.id,
          notes: "Consommation journaliere type - 5 jours restants",
          recordedById: user.id,
          date: dateOnly(addDays(today, -5)),
        },
        {
          organizationId: organization.id,
          feedStockId: feedStock.id,
          feedTypeId: refs.feedGrowth.id,
          type: FeedMovementType.SORTIE,
          quantityKg: 80,
          batchId: batchLoss.id,
          recordedById: user.id,
          date: dateOnly(addDays(today, -4)),
        },
        {
          organizationId: organization.id,
          feedStockId: feedStock.id,
          feedTypeId: refs.feedGrowth.id,
          type: FeedMovementType.SORTIE,
          quantityKg: 80,
          batchId: batchLoss.id,
          recordedById: user.id,
          date: dateOnly(addDays(today, -3)),
        },
        {
          organizationId: organization.id,
          feedStockId: feedStock.id,
          feedTypeId: refs.feedGrowth.id,
          type: FeedMovementType.SORTIE,
          quantityKg: 80,
          batchId: batchLoss.id,
          recordedById: user.id,
          date: dateOnly(addDays(today, -2)),
        },
        {
          organizationId: organization.id,
          feedStockId: feedStock.id,
          feedTypeId: refs.feedGrowth.id,
          type: FeedMovementType.SORTIE,
          quantityKg: 80,
          batchId: batchLoss.id,
          recordedById: user.id,
          date: dateOnly(addDays(today, -1)),
        },
      ],
    })
  })

  await prisma.expense.createMany({
    data: [
      {
        organizationId: organization.id,
        batchId: batchLoss.id,
        farmId: farm.id,
        categoryId: refs.catChicks.id,
        date: started30DaysAgo,
        description: "Achat poussins - Bande Demo",
        amountFcfa: 300_000,
        supplierId: supplierChicks.id,
        createdById: user.id,
      },
      {
        organizationId: organization.id,
        batchId: batchLoss.id,
        farmId: farm.id,
        categoryId: refs.catFeed.id,
        date: dateOnly(addDays(started30DaysAgo, 3)),
        description: "Aliment - Bande Demo",
        amountFcfa: 800_000,
        supplierId: supplierFeed.id,
        createdById: user.id,
      },
      {
        organizationId: organization.id,
        batchId: batchLoss.id,
        farmId: farm.id,
        categoryId: refs.catVaccines.id,
        date: dateOnly(addDays(started30DaysAgo, 7)),
        description: "Vaccins - Bande Demo",
        amountFcfa: 50_000,
        createdById: user.id,
      },
      {
        organizationId: organization.id,
        batchId: batchLoss.id,
        farmId: farm.id,
        categoryId: refs.catMisc.id,
        date: dateOnly(addDays(started30DaysAgo, 15)),
        description: "Divers - Bande Demo",
        amountFcfa: 50_000,
        createdById: user.id,
      },
      {
        organizationId: organization.id,
        batchId: batchProfit.id,
        farmId: farm.id,
        categoryId: refs.catChicks.id,
        date: started35DaysAgo,
        description: "Achat poussins - Bande Profit",
        amountFcfa: 300_000,
        supplierId: supplierChicks.id,
        createdById: user.id,
      },
      {
        organizationId: organization.id,
        batchId: batchProfit.id,
        farmId: farm.id,
        categoryId: refs.catFeed.id,
        date: dateOnly(addDays(started35DaysAgo, 3)),
        description: "Aliment - Bande Profit",
        amountFcfa: 800_000,
        supplierId: supplierFeed.id,
        createdById: user.id,
      },
      {
        organizationId: organization.id,
        batchId: batchProfit.id,
        farmId: farm.id,
        categoryId: refs.catVaccines.id,
        date: dateOnly(addDays(started35DaysAgo, 6)),
        description: "Vaccins - Bande Profit",
        amountFcfa: 50_000,
        createdById: user.id,
      },
      {
        organizationId: organization.id,
        batchId: batchProfit.id,
        farmId: farm.id,
        categoryId: refs.catMisc.id,
        date: dateOnly(addDays(started35DaysAgo, 12)),
        description: "Divers - Bande Profit",
        amountFcfa: 50_000,
        createdById: user.id,
      },
    ],
  })

  const lossDailyData = [
    { dayOffset: -9, mortality: 4, feedKg: 75, waterLiters: 150, min: 28.8, max: 34.6, humidity: 70, weight: 1280, note: "Premiers signes de stress thermique" },
    { dayOffset: -8, mortality: 3, feedKg: 77, waterLiters: 154, min: 29.1, max: 34.9, humidity: 71, weight: 1310, note: "Consommation stable" },
    { dayOffset: -7, mortality: 5, feedKg: 79, waterLiters: 158, min: 29.4, max: 35.2, humidity: 73, weight: 1335, note: "Mortalite en hausse" },
    { dayOffset: -6, mortality: 4, feedKg: 80, waterLiters: 160, min: 29.2, max: 35.0, humidity: 72, weight: 1360, note: "Ventilation a renforcer" },
    { dayOffset: -5, mortality: 6, feedKg: 80, waterLiters: 161, min: 29.6, max: 35.5, humidity: 74, weight: 1380, note: "Lot sous pression" },
    { dayOffset: -4, mortality: 5, feedKg: 81, waterLiters: 162, min: 29.7, max: 35.4, humidity: 75, weight: 1400, note: "Stock aliment a 5 jours" },
    { dayOffset: -3, mortality: 4, feedKg: 82, waterLiters: 164, min: 29.3, max: 35.1, humidity: 73, weight: 1420, note: "Prix mini > prix marche" },
    { dayOffset: -2, mortality: 3, feedKg: 81, waterLiters: 162, min: 29.0, max: 34.8, humidity: 72, weight: 1450, note: "Suivi renforce" },
    { dayOffset: -1, mortality: 4, feedKg: 80, waterLiters: 160, min: 28.9, max: 34.7, humidity: 71, weight: 1475, note: "Marge toujours negative" },
    { dayOffset: 0, mortality: 2, feedKg: 79, waterLiters: 158, min: 28.7, max: 34.5, humidity: 70, weight: 1500, note: "Fin de demo - scenario perte" },
  ]

  await prisma.dailyRecord.createMany({
    data: lossDailyData.map((item) => ({
      organizationId: organization.id,
      batchId: batchLoss.id,
      date: dateOnly(addDays(today, item.dayOffset)),
      mortality: item.mortality,
      feedKg: item.feedKg,
      waterLiters: item.waterLiters,
      temperatureMin: item.min,
      temperatureMax: item.max,
      humidity: item.humidity,
      avgWeightG: item.weight,
      observations: item.note,
      recordedById: user.id,
    })),
  })

  const profitDailyData = [
    { dayOffset: -6, mortality: 1, feedKg: 72, waterLiters: 144, min: 28.2, max: 33.2, humidity: 66, weight: 1700 },
    { dayOffset: -5, mortality: 0, feedKg: 73, waterLiters: 146, min: 28.0, max: 33.0, humidity: 65, weight: 1760 },
    { dayOffset: -4, mortality: 1, feedKg: 74, waterLiters: 148, min: 28.1, max: 33.1, humidity: 65, weight: 1820 },
    { dayOffset: -3, mortality: 0, feedKg: 74, waterLiters: 149, min: 28.0, max: 33.0, humidity: 64, weight: 1880 },
    { dayOffset: -2, mortality: 1, feedKg: 75, waterLiters: 150, min: 27.9, max: 32.9, humidity: 64, weight: 1940 },
    { dayOffset: -1, mortality: 0, feedKg: 75, waterLiters: 150, min: 27.8, max: 32.8, humidity: 63, weight: 2000 },
    { dayOffset: 0, mortality: 0, feedKg: 76, waterLiters: 152, min: 27.8, max: 32.7, humidity: 63, weight: 2050 },
  ]

  await prisma.dailyRecord.createMany({
    data: profitDailyData.map((item) => ({
      organizationId: organization.id,
      batchId: batchProfit.id,
      date: dateOnly(addDays(today, item.dayOffset)),
      mortality: item.mortality,
      feedKg: item.feedKg,
      waterLiters: item.waterLiters,
      temperatureMin: item.min,
      temperatureMax: item.max,
      humidity: item.humidity,
      avgWeightG: item.weight,
      observations: "Scenario rentable pour comparaison commerciale",
      recordedById: user.id,
    })),
  })

  const saleTotalProfit = 500 * 3_000
  const marginPerChicken = 3_000 - 2_400

  const sale = await prisma.sale.create({
    data: {
      organizationId: organization.id,
      customerId: customerMarket.id,
      saleDate: today,
      productType: SaleProductType.POULET_VIF,
      totalFcfa: saleTotalProfit,
      paidFcfa: saleTotalProfit,
      notes: `Prix moyen: 3 000 FCFA | Cout/poulet: 2 400 FCFA | Marge/poulet: ${marginPerChicken} FCFA`,
      createdById: user.id,
    },
  })

  await prisma.saleItem.create({
    data: {
      saleId: sale.id,
      batchId: batchProfit.id,
      description: "500 poulets vendus a 3 000 FCFA",
      quantity: 500,
      unit: "PIECE",
      unitPriceFcfa: 3_000,
      totalFcfa: saleTotalProfit,
    },
  })

  await prisma.notification.createMany({
    data: [
      {
        organizationId: organization.id,
        userId: user.id,
        type: NotificationType.MORTALITE_ELEVEE,
        status: NotificationStatus.NON_LU,
        title: "Risque mortalite eleve",
        message: "La Bande Demo Perte cumule une mortalite anormale sur les 10 derniers jours.",
        resourceType: "BATCH",
        resourceId: batchLoss.id,
      },
      {
        organizationId: organization.id,
        userId: user.id,
        type: NotificationType.STOCK_ALIMENT_CRITIQUE,
        status: NotificationStatus.NON_LU,
        title: "Stock aliment critique",
        message: "Il reste environ 5 jours d'aliment sur la ferme demo.",
        resourceType: "BATCH",
        resourceId: batchLoss.id,
      },
    ],
  })

  console.log("")
  console.log("Demo account created successfully.")
  console.log("Email: demo@sunufarm.com")
  console.log("Password: demo123")
  console.log("")
  console.log("Scenario 1 - Bande Demo Perte")
  console.log("  Total costs: 1 200 000 FCFA")
  console.log("  Cost per chicken: 2 400 FCFA")
  console.log("  Market price: 2 200 FCFA")
  console.log("  Margin per chicken: -200 FCFA")
  console.log("")
  console.log("Scenario 2 - Bande Demo Profit")
  console.log("  Sale price: 3 000 FCFA")
  console.log("  Cost per chicken: 2 400 FCFA")
  console.log("  Real margin per chicken: 600 FCFA")
  console.log("  Total profit: 300 000 FCFA")
}

async function main() {
  console.log("Initializing SunuFarm demo seed...")

  await clearAll()

  const passwordHash = await bcrypt.hash("demo123", 10)
  await createDemoWorkspace(passwordHash)
}

main()
  .catch((error) => {
    console.error("Seed failed:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
