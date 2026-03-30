CREATE TYPE "PushDevicePlatform" AS ENUM ('WEB', 'ANDROID', 'IOS', 'UNKNOWN');

CREATE TABLE "UserPushDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "platform" "PushDevicePlatform" NOT NULL DEFAULT 'WEB',
  "deviceLabel" TEXT,
  "userAgent" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserPushDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserPushDevice_organizationId_token_key"
ON "UserPushDevice"("organizationId", "token");

CREATE INDEX "UserPushDevice_userId_idx"
ON "UserPushDevice"("userId");

CREATE INDEX "UserPushDevice_organizationId_idx"
ON "UserPushDevice"("organizationId");

CREATE INDEX "UserPushDevice_userId_organizationId_isActive_idx"
ON "UserPushDevice"("userId", "organizationId", "isActive");

CREATE INDEX "UserPushDevice_organizationId_isActive_idx"
ON "UserPushDevice"("organizationId", "isActive");

ALTER TABLE "UserPushDevice"
ADD CONSTRAINT "UserPushDevice_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserPushDevice"
ADD CONSTRAINT "UserPushDevice_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
