-- CreateEnum
CREATE TYPE "exchange_rate_type" AS ENUM ('spot', 'closing', 'average');

-- AlterTable
ALTER TABLE "entity" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "currency_id" TEXT,
ADD COLUMN     "is_headquarters" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legal_name" TEXT,
ADD COLUMN     "modified_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "modified_by" TEXT,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "postal_code" TEXT,
ADD COLUMN     "state" TEXT;

-- CreateTable
CREATE TABLE "exchange_rate" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'exrt_' || gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "from_currency_id" TEXT NOT NULL,
    "to_currency_id" TEXT NOT NULL,
    "effective_date" DATE NOT NULL,
    "rate" DECIMAL(19,6) NOT NULL,
    "rate_type" "exchange_rate_type" NOT NULL DEFAULT 'spot',
    "created_by" TEXT,
    "modified_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_rate_org_id_to_currency_id_rate_type_effective_dat_idx" ON "exchange_rate"("org_id", "to_currency_id", "rate_type", "effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rate_org_id_from_currency_id_to_currency_id_effect_key" ON "exchange_rate"("org_id", "from_currency_id", "to_currency_id", "effective_date", "rate_type");

-- CreateIndex
CREATE INDEX "entity_currency_id_idx" ON "entity"("currency_id");

-- AddForeignKey
ALTER TABLE "entity" ADD CONSTRAINT "entity_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rate" ADD CONSTRAINT "exchange_rate_from_currency_id_fkey" FOREIGN KEY ("from_currency_id") REFERENCES "currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rate" ADD CONSTRAINT "exchange_rate_to_currency_id_fkey" FOREIGN KEY ("to_currency_id") REFERENCES "currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

