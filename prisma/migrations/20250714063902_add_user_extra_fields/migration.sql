/*
  Warnings:

  - A unique constraint covering the columns `[moodleId]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "kycVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastLogin" TIMESTAMP(3),
ADD COLUMN     "moodleId" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "studentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_moodleId_key" ON "users"("moodleId");
