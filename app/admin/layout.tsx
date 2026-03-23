import Link from "next/link"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requirePlatformSuperAdmin } from "@/src/lib/auth"

export const metadata: Metadata = {
  title: "Admin Plateforme",
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const sessionResult = await requirePlatformSuperAdmin()
  if (!sessionResult.success) {
    redirect("/dashboard")
  }

  const session = sessionResult.data

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Administration plateforme
            </p>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">
              SunuFarm Admin
            </h1>
          </div>

          <div className="text-right">
            <p className="text-sm font-medium text-slate-900">
              {session.user.name ?? "Super Admin"}
            </p>
            <p className="text-xs text-slate-500">{session.user.email}</p>
          </div>
        </div>

        <nav className="mx-auto flex max-w-7xl gap-3 px-4 pb-4 sm:px-6 lg:px-8">
          <Link
            href="/admin"
            className="rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-200"
          >
            Accueil admin
          </Link>
          <Link
            href="/admin/organizations"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Organisations
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
