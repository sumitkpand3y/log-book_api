-- AlterTable
ALTER TABLE "logs" ADD COLUMN     "rejectedByID" TEXT;

-- AddForeignKey
ALTER TABLE "logs" ADD CONSTRAINT "logs_rejectedByID_fkey" FOREIGN KEY ("rejectedByID") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
