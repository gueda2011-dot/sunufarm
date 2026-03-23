"use client"

import { useMemo, useState, useTransition } from "react"
import { useForm, useWatch, type SubmitHandler } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Button } from "@/src/components/ui/button"
import { Input } from "@/src/components/ui/input"
import { Label } from "@/src/components/ui/label"
import {
  createFeedMovement,
  createMedicineMovement,
} from "@/src/actions/stock"
import {
  buildMovementNotesWithSource,
  computeSignedDeltaQuantity,
  getStockMovementKindMeta,
  getStockMovementSourceLabel,
  getSupportedStockMovementKinds,
  type StockAdjustmentDirection,
  type StockDomain,
  type StockMovementKind,
  type StockMovementSource,
  validateStockMovementInput,
} from "@/src/lib/stock-movement-conventions"

type StockOption = {
  id: string
  label: string
  availableQuantity: number
  unit: string
}

type FormValues = {
  stockId: string
  type: StockMovementKind
  source: StockMovementSource
  quantity: number
  adjustmentDirection?: StockAdjustmentDirection
  unitPriceFcfa?: number | ""
  reference?: string
  notes?: string
  date: string
}

type Props = {
  domain: StockDomain
  organizationId: string
  stockOptions: StockOption[]
  onCreated: () => Promise<void>
}

function buildSchema(domain: StockDomain, stockOptions: StockOption[]) {
  return z
    .object({
      stockId: z.string().min(1, "Stock requis"),
      type: z.enum(["ENTREE", "SORTIE", "AJUSTEMENT", "INVENTAIRE"]),
      source: z.enum(["MANUEL", "ACHAT", "VENTE", "SANTE", "CORRECTION"]),
      quantity: z.coerce.number().positive("Quantite requise"),
      adjustmentDirection: z.enum(["PLUS", "MOINS"]).optional(),
      unitPriceFcfa: z
        .union([z.literal(""), z.coerce.number().int().positive()])
        .optional(),
      reference: z.string().max(100).optional(),
      notes: z.string().max(1000).optional(),
      date: z.string().min(1, "Date requise"),
    })
    .superRefine((values, ctx) => {
      const stock = stockOptions.find((item) => item.id === values.stockId)
      const availableQuantity = stock?.availableQuantity ?? 0
      const supportedKinds = getSupportedStockMovementKinds(domain)

      if (!supportedKinds.includes(values.type)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["type"],
          message:
            domain === "MEDICAMENT"
              ? "Le backend medicament ne supporte pas encore l'ajustement direct."
              : "Type de mouvement non supporte.",
        })
        return
      }

      const message = validateStockMovementInput({
        type: values.type,
        quantity: values.quantity,
        availableQuantity,
        stockId: values.stockId,
        adjustmentDirection: values.adjustmentDirection,
      })

      if (message) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["quantity"],
          message,
        })
      }
    })
}

function getDefaultType(domain: StockDomain): StockMovementKind {
  return getSupportedStockMovementKinds(domain)[0]
}

export function StockMovementForm({
  domain,
  organizationId,
  stockOptions,
  onCreated,
}: Props) {
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const schema = useMemo(
    () => buildSchema(domain, stockOptions),
    [domain, stockOptions],
  )

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      stockId: stockOptions[0]?.id ?? "",
      type: getDefaultType(domain),
      source: "MANUEL",
      quantity: 0,
      adjustmentDirection: "PLUS",
      unitPriceFcfa: "",
      reference: "",
      notes: "",
      date: new Date().toISOString().split("T")[0],
    },
  })

  const selectedStockId = useWatch({ control, name: "stockId" })
  const selectedType = useWatch({ control, name: "type" })
  const selectedSource = useWatch({ control, name: "source" })
  const selectedStock = stockOptions.find((stock) => stock.id === selectedStockId)
  const kindMeta = getStockMovementKindMeta(selectedType)

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    setSubmitError(null)

    startTransition(async () => {
      const notes = buildMovementNotesWithSource(values.source, values.notes)

      if (domain === "ALIMENT") {
        const result = await createFeedMovement({
          organizationId,
          feedStockId: values.stockId,
          type: values.type,
          quantityKg: computeSignedDeltaQuantity(
            values.type,
            values.quantity,
            values.adjustmentDirection,
          ),
          unitPriceFcfa:
            values.unitPriceFcfa === "" ? undefined : values.unitPriceFcfa,
          reference: values.reference?.trim() || undefined,
          notes,
          date: new Date(`${values.date}T00:00:00Z`),
        })

        if (!result.success) {
          setSubmitError(result.error)
          toast.error(result.error)
          return
        }
      } else {
        if (values.type === "AJUSTEMENT") {
          const error =
            "Le stock medicament n'accepte pas encore l'ajustement direct. Utilisez un inventaire pour recalage complet."
          setSubmitError(error)
          toast.error(error)
          return
        }

        const result = await createMedicineMovement({
          organizationId,
          medicineStockId: values.stockId,
          type: values.type,
          quantity: values.quantity,
          unitPriceFcfa:
            values.unitPriceFcfa === "" ? undefined : values.unitPriceFcfa,
          reference: values.reference?.trim() || undefined,
          notes,
          date: new Date(`${values.date}T00:00:00Z`),
        })

        if (!result.success) {
          setSubmitError(result.error)
          toast.error(result.error)
          return
        }
      }

      await onCreated()
      toast.success(
        `${kindMeta.label} ${getStockMovementSourceLabel(selectedSource).toLowerCase()} enregistree`,
      )
      reset({
        stockId: values.stockId,
        type: getDefaultType(domain),
        source: "MANUEL",
        quantity: 0,
        adjustmentDirection: "PLUS",
        unitPriceFcfa: "",
        reference: "",
        notes: "",
        date: new Date().toISOString().split("T")[0],
      })
    })
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-base font-semibold text-gray-900">
          {domain === "ALIMENT"
            ? "Nouveau mouvement d'aliment"
            : "Nouveau mouvement de medicament"}
        </h2>
        <p className="mt-1 text-sm text-gray-500">{kindMeta.description}</p>
      </div>

      <form className="mt-4 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor={`${domain}-stock`} required>
              Stock cible
            </Label>
            <select
              id={`${domain}-stock`}
              className="h-[52px] w-full rounded-xl border border-gray-300 bg-white px-4 text-sm text-gray-900 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600"
              {...register("stockId")}
            >
              {stockOptions.length === 0 ? (
                <option value="">Aucun stock disponible</option>
              ) : null}
              {stockOptions.map((stock) => (
                <option key={stock.id} value={stock.id}>
                  {stock.label}
                </option>
              ))}
            </select>
            {errors.stockId ? (
              <p className="mt-1 text-sm text-red-600">{errors.stockId.message}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor={`${domain}-type`} required>
              Type de mouvement
            </Label>
            <select
              id={`${domain}-type`}
              className="h-[52px] w-full rounded-xl border border-gray-300 bg-white px-4 text-sm text-gray-900 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600"
              {...register("type")}
            >
              {getSupportedStockMovementKinds(domain).map((kind) => (
                <option key={kind} value={kind}>
                  {getStockMovementKindMeta(kind).label}
                </option>
              ))}
            </select>
            {errors.type ? (
              <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor={`${domain}-source`} required>
              Source du mouvement
            </Label>
            <select
              id={`${domain}-source`}
              className="h-[52px] w-full rounded-xl border border-gray-300 bg-white px-4 text-sm text-gray-900 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600"
              {...register("source")}
            >
              <option value="MANUEL">Manuel</option>
              <option value="ACHAT">Achat</option>
              <option value="VENTE">Vente</option>
              <option value="SANTE">Sante</option>
              <option value="CORRECTION">Correction</option>
            </select>
          </div>

          <div>
            <Label htmlFor={`${domain}-date`} required>
              Date
            </Label>
            <Input
              id={`${domain}-date`}
              type="date"
              {...register("date")}
              error={errors.date?.message}
            />
          </div>

          <div>
            <Label htmlFor={`${domain}-quantity`} required>
              Quantite
            </Label>
            <Input
              id={`${domain}-quantity`}
              type="number"
              step="0.01"
              min="0"
              placeholder={
                selectedStock
                  ? `Disponible: ${selectedStock.availableQuantity} ${selectedStock.unit}`
                  : "0"
              }
              {...register("quantity")}
              error={errors.quantity?.message}
            />
          </div>

          {selectedType === "AJUSTEMENT" ? (
            <div>
              <Label htmlFor={`${domain}-direction`} required>
                Sens de lajustement
              </Label>
              <select
                id={`${domain}-direction`}
                className="h-[52px] w-full rounded-xl border border-gray-300 bg-white px-4 text-sm text-gray-900 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600"
                {...register("adjustmentDirection")}
              >
                <option value="PLUS">Correction a la hausse</option>
                <option value="MOINS">Correction a la baisse</option>
              </select>
            </div>
          ) : null}

          <div>
            <Label htmlFor={`${domain}-price`}>Prix unitaire FCFA</Label>
            <Input
              id={`${domain}-price`}
              type="number"
              min="1"
              step="1"
              placeholder="Optionnel"
              {...register("unitPriceFcfa")}
              error={errors.unitPriceFcfa?.message}
            />
          </div>

          <div>
            <Label htmlFor={`${domain}-reference`}>Reference</Label>
            <Input
              id={`${domain}-reference`}
              type="text"
              placeholder="BL, facture ou note interne"
              {...register("reference")}
              error={errors.reference?.message}
            />
          </div>
        </div>

        <div>
          <Label htmlFor={`${domain}-notes`}>Notes</Label>
          <textarea
            id={`${domain}-notes`}
            rows={3}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600"
            placeholder="Commentaire libre"
            {...register("notes")}
          />
          {errors.notes ? (
            <p className="mt-1 text-sm text-red-600">{errors.notes.message}</p>
          ) : null}
        </div>

        {selectedStock ? (
          <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Disponible actuel :{" "}
            <span className="font-semibold text-gray-900">
              {selectedStock.availableQuantity} {selectedStock.unit}
            </span>
          </div>
        ) : null}

        {submitError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {submitError}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            loading={isPending}
            disabled={stockOptions.length === 0}
          >
            Enregistrer le mouvement
          </Button>
        </div>
      </form>
    </div>
  )
}
