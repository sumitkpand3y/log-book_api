/*
  Warnings:

  - A unique constraint covering the columns `[moodleId]` on the table `courses` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "course_enrollments" ADD COLUMN     "completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "progress" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "batchWise" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "classroomId" INTEGER,
ADD COLUMN     "classroomName" TEXT,
ADD COLUMN     "classroomShortname" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "moodleId" TEXT,
ADD COLUMN     "primaryTrainer" TEXT,
ADD COLUMN     "secondaryTrainer" TEXT,
ADD COLUMN     "shortname" TEXT,
ADD COLUMN     "trainingLocation" TEXT,
ADD COLUMN     "trainingLocationEndDate" TIMESTAMP(3),
ADD COLUMN     "trainingLocationStartDate" TIMESTAMP(3),
ADD COLUMN     "trainingLocationStatus" TEXT,
ADD COLUMN     "visible" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "course_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courses_moodleId_key" ON "courses"("moodleId");

-- AddForeignKey
ALTER TABLE "course_logs" ADD CONSTRAINT "course_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_logs" ADD CONSTRAINT "course_logs_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
