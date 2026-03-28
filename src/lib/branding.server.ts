import { readFile } from "node:fs/promises"
import path from "node:path"

let logoDataUriPromise: Promise<string> | null = null

function getSunuFarmLogoAbsolutePath() {
  return path.join(process.cwd(), "public", "branding", "logo-sunufarm.png")
}

export function getSunuFarmLogoDataUri() {
  if (!logoDataUriPromise) {
    logoDataUriPromise = readFile(getSunuFarmLogoAbsolutePath()).then((buffer) => (
      `data:image/png;base64,${buffer.toString("base64")}`
    ))
  }

  return logoDataUriPromise
}
