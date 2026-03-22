import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card"
import { formatMoneyFCFA }                          from "@/src/lib/formatters"

interface ExpenseSummaryCardsProps {
  totalExpenses: number
  totalSales:    number
  netResult:     number
}

export function ExpenseSummaryCards({
  totalExpenses,
  totalSales,
  netResult,
}: ExpenseSummaryCardsProps) {
  const netClass = netResult >= 0 ? "text-green-600" : "text-red-600"

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500">
            Total dépenses
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900">
            {formatMoneyFCFA(totalExpenses)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500">
            Total ventes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900">
            {formatMoneyFCFA(totalSales)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500">
            Résultat net
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${netClass}`}>
            {formatMoneyFCFA(netResult)}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
