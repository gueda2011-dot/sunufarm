import fs from "node:fs/promises"
import path from "node:path"
import React from "react"
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer"

const OUTPUT_PATH = path.join(process.cwd(), "public", "sunufarm-resume-app.pdf")

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#163020",
    backgroundColor: "#ffffff",
    paddingTop: 36,
    paddingBottom: 42,
    paddingHorizontal: 38,
    lineHeight: 1.45,
  },
  header: {
    marginBottom: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#d9e7dc",
  },
  eyebrow: {
    fontSize: 9,
    color: "#4f7a5b",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 5,
  },
  title: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: "#0f3d22",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: "#456452",
  },
  meta: {
    fontSize: 9,
    color: "#6c8775",
    marginTop: 6,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#0f3d22",
    marginBottom: 7,
    textTransform: "uppercase",
  },
  paragraph: {
    marginBottom: 6,
    color: "#23372a",
  },
  cardRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  card: {
    flex: 1,
    backgroundColor: "#f4f8f4",
    borderWidth: 1,
    borderColor: "#dce8df",
    borderRadius: 8,
    padding: 10,
  },
  cardLabel: {
    fontSize: 8,
    color: "#6a8572",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: "#0f3d22",
    marginBottom: 2,
  },
  cardText: {
    fontSize: 9,
    color: "#4f6656",
  },
  bullet: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 5,
  },
  bulletDot: {
    width: 10,
    fontFamily: "Helvetica-Bold",
    color: "#16803c",
  },
  bulletText: {
    flex: 1,
    color: "#23372a",
  },
  twoCol: {
    flexDirection: "row",
    gap: 12,
  },
  col: {
    flex: 1,
  },
  footer: {
    position: "absolute",
    left: 38,
    right: 38,
    bottom: 18,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#d9e7dc",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 8,
    color: "#6c8775",
  },
})

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bullet}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  )
}

function SummaryDocument() {
  const generatedAt = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })

  return (
    <Document
      title="SunuFarm - Resume de l'application"
      author="Codex"
      subject="Synthese fonctionnelle et technique"
      language="fr-FR"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Synthese applicative</Text>
          <Text style={styles.title}>SunuFarm</Text>
          <Text style={styles.subtitle}>
            Application web de gestion avicole pour suivre l&apos;exploitation,
            piloter les lots et structurer les operations quotidiennes.
          </Text>
          <Text style={styles.meta}>Document genere le {generatedAt}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vue d&apos;ensemble</Text>
          <Text style={styles.paragraph}>
            SunuFarm est une plateforme de pilotage d&apos;exploitation avicole
            orientee terrain. L&apos;application aide un eleveur ou une equipe a
            centraliser la saisie journaliere, suivre la mortalite, controler
            les stocks, enregistrer ventes et depenses, puis lire des KPI utiles
            depuis un tableau de bord unique.
          </Text>
          <Text style={styles.paragraph}>
            Le produit est pense comme un SaaS multi-tenant: chaque organisation
            dispose de ses fermes, de ses batiments, de ses lots, de ses
            utilisateurs, de ses paiements et de ses droits d&apos;acces.
          </Text>
        </View>

        <View style={styles.cardRow}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Cible</Text>
            <Text style={styles.cardValue}>Exploitations avicoles</Text>
            <Text style={styles.cardText}>
              Petits elevages, fermes structurees et operations multi-sites.
            </Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Promesse</Text>
            <Text style={styles.cardValue}>Mieux organiser</Text>
            <Text style={styles.cardText}>
              Transformer les donnees quotidiennes en decisions plus rapides.
            </Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Monetisation</Text>
            <Text style={styles.cardValue}>Basic / Pro / Business</Text>
            <Text style={styles.cardText}>
              Acces progressif aux rapports, a la rentabilite et a l&apos;IA.
            </Text>
          </View>
        </View>

        <View style={[styles.section, { marginTop: 16 }]}>
          <Text style={styles.sectionTitle}>Modules metier visibles</Text>
          <Bullet>Tableau de bord global avec KPI, alertes de saisie et suivi de mortalite.</Bullet>
          <Bullet>Saisie journaliere rapide pour aliment, eau, mortalite, temperature et observations.</Bullet>
          <Bullet>Gestion des lots d&apos;elevage avec cycle de vie, cout d&apos;entree et suivi de performance.</Bullet>
          <Bullet>Production d&apos;oeufs, sante animale, traitements, vaccinations et stock medical.</Bullet>
          <Bullet>Fermes, batiments, stocks d&apos;aliment, clients, achats, ventes et finances.</Bullet>
          <Bullet>Rapports mensuels, exports PDF par lot et espace d&apos;abonnement par plan.</Bullet>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Parcours utilisateur</Text>
          <Bullet>Connexion par email et mot de passe via NextAuth.</Bullet>
          <Bullet>Redirection vers le tableau de bord, puis navigation laterale par domaine.</Bullet>
          <Bullet>Priorite produit donnee a la saisie terrain et au suivi des lots actifs.</Bullet>
          <Bullet>Consultation des rapports et de la rentabilite selon le plan souscrit.</Bullet>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>SunuFarm - Resume applicatif</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Architecture technique</Text>
          <Bullet>Framework principal: Next.js 16 avec App Router et React 19.</Bullet>
          <Bullet>Rendu hybride: Server Components pour les pages, composants client pour les interactions.</Bullet>
          <Bullet>Base de donnees PostgreSQL pilotee par Prisma 7 avec schema riche et fortement type.</Bullet>
          <Bullet>Actions serveur pour les operations metier et routes API pour cas specifiques.</Bullet>
          <Bullet>Generation de PDF deja integree avec @react-pdf/renderer.</Bullet>
          <Bullet>React Query utilise pour certaines couches de donnees cote client.</Bullet>
        </View>

        <View style={styles.twoCol}>
          <View style={styles.col}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Modele de donnees</Text>
              <Text style={styles.paragraph}>
                Le schema couvre l&apos;ensemble du coeur metier: organisations,
                utilisateurs, permissions par ferme, fermes, batiments, lots,
                saisies journalieres, mortalite detaillee, oeufs, sante,
                stocks, commerce, finances, notifications, audit et abonnements.
              </Text>
              <Text style={styles.paragraph}>
                Cette profondeur indique une base solide pour un produit SaaS
                complet plutot qu&apos;un simple tableau de suivi.
              </Text>
            </View>
          </View>
          <View style={styles.col}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Securite et controle</Text>
              <Bullet>Isolation par organisation sur les modeles operationnels.</Bullet>
              <Bullet>Verification d&apos;appartenance avant acces aux donnees.</Bullet>
              <Bullet>Journal d&apos;audit pour les actions critiques.</Bullet>
              <Bullet>Rate limiting et controle d&apos;origine sur la route d&apos;analyse IA.</Bullet>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>IA, abonnements et logique business</Text>
          <Bullet>
            L&apos;application integre une analyse intelligente de lots avec mise en
            cache, controle d&apos;usage et blocage selon le niveau d&apos;abonnement.
          </Bullet>
          <Bullet>
            Trois plans structurent l&apos;offre: Basic pour l&apos;organisation de base,
            Pro pour les rapports, la rentabilite et l&apos;IA, Business pour le
            multi-ferme, l&apos;equipe et les exports avances.
          </Bullet>
          <Bullet>
            Le circuit de paiement est trace via demandes, transactions et
            validations, avec une base prevue pour des integrations de paiement.
          </Bullet>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lecture rapide</Text>
          <Text style={styles.paragraph}>
            SunuFarm n&apos;est pas seulement un dashboard. C&apos;est une application de
            gestion d&apos;exploitation avicole qui combine operations quotidiennes,
            pilotage economique, suivi sanitaire et logique SaaS moderne.
          </Text>
          <Text style={styles.paragraph}>
            L&apos;etat actuel montre deja une structure produit convaincante:
            navigation metier complete, rapport PDF par lot, abonnement
            graduel, base de donnees mature et debut d&apos;intelligence
            applicative autour des lots.
          </Text>
          <Text style={styles.paragraph}>
            En bref, la valeur de l&apos;app est de reduire le desordre operationnel
            et de rendre la ferme plus lisible, plus mesurable et plus
            pilotable.
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>SunuFarm - Resume applicatif</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}

async function main() {
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  const doc = React.createElement(SummaryDocument)
  const buffer = await renderToBuffer(doc)
  await fs.writeFile(OUTPUT_PATH, buffer)
  console.log(`PDF genere: ${OUTPUT_PATH}`)
}

main().catch((error) => {
  console.error("Echec de generation du PDF:", error)
  process.exitCode = 1
})
