import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

type Step = {
  label: string
  command: string
}

const root = process.cwd()

const steps: Step[] = [
  {
    label: "TypeScript",
    command: "npx tsc --noEmit",
  },
  {
    label: "Vitest cible feed/business",
    command: "npx vitest run src/lib/business-dashboard.test.ts src/lib/predictive-mortality-rules.test.ts src/lib/business-reports.test.ts src/lib/feed-reconstruction.test.ts src/lib/collective-benchmark.test.ts",
  },
]

const requiredDocs = [
  "docs/roadmaps/feed-logic-refactor.md",
  "docs/pilots/feed-refactor-3a-ab-test.md",
  "docs/release-notes/feed-refactor-rollout.md",
]

function runStep(step: Step) {
  console.log(`\n=== ${step.label} ===`)
  const result = spawnSync(step.command, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: true,
  })

  if (result.status !== 0) {
    throw new Error(`Echec de l'etape "${step.label}" (${step.command})`)
  }
}

function verifyDocs() {
  console.log("\n=== Documentation ===")
  const missing = requiredDocs.filter((relativePath) => !existsSync(path.join(root, relativePath)))
  if (missing.length > 0) {
    throw new Error(`Documentation manquante : ${missing.join(", ")}`)
  }

  for (const relativePath of requiredDocs) {
    console.log(`OK ${relativePath}`)
  }
}

function printPendingItems() {
  console.log("\n=== Points restant manuels ===")
  const roadmapPath = path.join(root, "docs/roadmaps/feed-logic-refactor.md")
  const roadmap = readFileSync(roadmapPath, "utf8")
  const pendingItems = roadmap
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- [ ] "))

  if (pendingItems.length === 0) {
    console.log("Aucun point manuel ouvert dans la roadmap.")
    return
  }

  for (const item of pendingItems) {
    console.log(item)
  }
}

function main() {
  console.log("Orchestration des phases restantes de la roadmap feed")
  console.log(`Workspace: ${root}`)

  for (const step of steps) {
    runStep(step)
  }

  verifyDocs()
  printPendingItems()

  console.log("\nCommande terminee.")
}

main()
