CREATE TYPE "PaymentProvider" AS ENUM ('MANUAL', 'WAVE', 'ORANGE_MONEY', 'FREE_MONEY', 'BANK_TRANSFER');

CREATE TYPE "PaymentTransactionStatus" AS ENUM (
  'CREATED',
  'PENDING',
  'REQUIRES_ACTION',
  'CONFIRMED',
  'FAILED',
  'CANCELED',
  'EXPIRED'
);

CREATE TABLE "PaymentTransaction" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subscriptionPaymentId" TEXT,
  "requestedPlan" "SubscriptionPlan" NOT NULL,
  "provider" "PaymentProvider" NOT NULL DEFAULT 'MANUAL',
  "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'CREATED',
  "amountFcfa" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "idempotencyKey" TEXT NOT NULL,
  "checkoutToken" TEXT,
  "providerReference" TEXT,
  "providerTransactionId" TEXT,
  "providerStatus" TEXT,
  "providerPayload" JSONB,
  "expiresAt" TIMESTAMP(3),
  "initiatedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentWebhookEvent" (
  "id" TEXT NOT NULL,
  "paymentTransactionId" TEXT,
  "provider" "PaymentProvider" NOT NULL,
  "eventType" TEXT NOT NULL,
  "providerEventId" TEXT,
  "signature" TEXT,
  "payload" JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "processingError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentTransaction_idempotencyKey_key" ON "PaymentTransaction"("idempotencyKey");
CREATE UNIQUE INDEX "PaymentTransaction_checkoutToken_key" ON "PaymentTransaction"("checkoutToken");
CREATE UNIQUE INDEX "PaymentTransaction_providerReference_key" ON "PaymentTransaction"("providerReference");
CREATE UNIQUE INDEX "PaymentWebhookEvent_providerEventId_key" ON "PaymentWebhookEvent"("providerEventId");

CREATE INDEX "PaymentTransaction_organizationId_status_idx" ON "PaymentTransaction"("organizationId", "status");
CREATE INDEX "PaymentTransaction_subscriptionPaymentId_idx" ON "PaymentTransaction"("subscriptionPaymentId");
CREATE INDEX "PaymentTransaction_provider_status_idx" ON "PaymentTransaction"("provider", "status");
CREATE INDEX "PaymentTransaction_userId_createdAt_idx" ON "PaymentTransaction"("userId", "createdAt");
CREATE INDEX "PaymentWebhookEvent_provider_eventType_idx" ON "PaymentWebhookEvent"("provider", "eventType");
CREATE INDEX "PaymentWebhookEvent_paymentTransactionId_idx" ON "PaymentWebhookEvent"("paymentTransactionId");

ALTER TABLE "PaymentTransaction"
ADD CONSTRAINT "PaymentTransaction_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentTransaction"
ADD CONSTRAINT "PaymentTransaction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentTransaction"
ADD CONSTRAINT "PaymentTransaction_subscriptionPaymentId_fkey"
FOREIGN KEY ("subscriptionPaymentId") REFERENCES "SubscriptionPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentWebhookEvent"
ADD CONSTRAINT "PaymentWebhookEvent_paymentTransactionId_fkey"
FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
