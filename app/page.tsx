import { redirect } from "next/navigation"

/**
 * Page racine "/" → redirect permanent vers "/dashboard".
 * Les utilisateurs non connectés seront redirigés vers "/login"
 * par le layout dashboard via auth().
 */
export default function RootPage() {
  redirect("/dashboard")
}
