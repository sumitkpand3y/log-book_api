/*
  Warnings:

  - You are about to drop the `Logs` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Logs" DROP CONSTRAINT "Logs_approvedById_fkey";

-- DropForeignKey
ALTER TABLE "Logs" DROP CONSTRAINT "Logs_courseId_fkey";

-- DropForeignKey
ALTER TABLE "Logs" DROP CONSTRAINT "Logs_createdById_fkey";

-- DropTable
DROP TABLE "Logs";

-- CreateTable
CREATE TABLE "course_teachers" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs" (
    "id" TEXT NOT NULL,
    "caseNo" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "age" DOUBLE PRECISION NOT NULL,
    "sex" "Sex" NOT NULL,
    "uhid" TEXT NOT NULL,
    "chiefComplaint" TEXT NOT NULL,
    "historyPresenting" TEXT NOT NULL,
    "pastHistory" TEXT NOT NULL,
    "personalHistory" TEXT NOT NULL,
    "familyHistory" TEXT NOT NULL,
    "clinicalExamination" TEXT NOT NULL,
    "labExaminations" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "management" TEXT NOT NULL,
    "status" "LogStatus" NOT NULL DEFAULT 'DRAFT',
    "rejectionReason" TEXT,
    "teacherComments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "courseId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,

    CONSTRAINT "logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_teachers_courseId_teacherId_key" ON "course_teachers"("courseId", "teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "logs_caseNo_key" ON "logs"("caseNo");

-- AddForeignKey
ALTER TABLE "course_teachers" ADD CONSTRAINT "course_teachers_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_teachers" ADD CONSTRAINT "course_teachers_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs" ADD CONSTRAINT "logs_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs" ADD CONSTRAINT "logs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs" ADD CONSTRAINT "logs_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
