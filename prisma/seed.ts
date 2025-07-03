// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
enum Sex {
  MALE = "MALE",
  FEMALE = "FEMALE",
}

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed...");

  await prisma.log.deleteMany();
  await prisma.courseEnrollment.deleteMany();
  await prisma.course.deleteMany();
  await prisma.user.deleteMany();

  // 1. Create Users
  console.log("👥 Creating users...");

  // Hash password for all users (password: "password123")
  const hashedPassword = await bcrypt.hash("password123", 10);

  // Create Admin
  const admin = await prisma.user.create({
    data: {
      name: "System Administrator",
      email: "admin@medical-college.edu",
      password: hashedPassword,
      role: "ADMIN",
    },
  });

  // Create Teachers
  const teachers = await Promise.all([
    prisma.user.create({
      data: {
        name: "Dr. Sarah Johnson",
        email: "sarah.johnson@medical-college.edu",
        password: hashedPassword,
        role: "TEACHER",
      },
    }),
    prisma.user.create({
      data: {
        name: "Dr. Michael Chen",
        email: "michael.chen@medical-college.edu",
        password: hashedPassword,
        role: "TEACHER",
      },
    }),
    prisma.user.create({
      data: {
        name: "Dr. Priya Sharma",
        email: "priya.sharma@medical-college.edu",
        password: hashedPassword,
        role: "TEACHER",
      },
    }),
    prisma.user.create({
      data: {
        name: "Dr. Robert Miller",
        email: "robert.miller@medical-college.edu",
        password: hashedPassword,
        role: "TEACHER",
      },
    }),
  ]);
  // Create Students/Learners
  const students = await Promise.all([
    prisma.user.create({
      data: {
        name: "John Smith",
        email: "john.smith@student.medical-college.edu",
        password: hashedPassword,
        role: "LEARNER",
      },
    }),
    prisma.user.create({
      data: {
        name: "Emily Davis",
        email: "emily.davis@student.medical-college.edu",
        password: hashedPassword,
        role: "LEARNER",
      },
    }),
    prisma.user.create({
      data: {
        name: "Raj Patel",
        email: "raj.patel@student.medical-college.edu",
        password: hashedPassword,
        role: "LEARNER",
      },
    }),
    prisma.user.create({
      data: {
        name: "Lisa Wang",
        email: "lisa.wang@student.medical-college.edu",
        password: hashedPassword,
        role: "LEARNER",
      },
    }),
    prisma.user.create({
      data: {
        name: "Ahmed Hassan",
        email: "ahmed.hassan@student.medical-college.edu",
        password: hashedPassword,
        role: "LEARNER",
      },
    }),
    prisma.user.create({
      data: {
        name: "Maria Rodriguez",
        email: "maria.rodriguez@student.medical-college.edu",
        password: hashedPassword,
        role: "LEARNER",
      },
    }),
    prisma.user.create({
      data: {
        name: "David Kim",
        email: "david.kim@student.medical-college.edu",
        password: hashedPassword,
        role: "LEARNER",
      },
    }),
    prisma.user.create({
      data: {
        name: "Sophia Brown",
        email: "sophia.brown@student.medical-college.edu",
        password: hashedPassword,
        role: "LEARNER",
      },
    }),
  ]);

  console.log(`✅ Created ${1 + teachers.length + students.length} users`);

  // 4. Create Courses
  const courses = await Promise.all([
    prisma.course.create({
      data: {
        title: "Internal Medicine Rotation",
        name: "Internal Medicine Rotation",
        enrollmentNumber: "MED-INT-2024-01",
        facultyName: "Dr. Sarah Johnson",
        designation: "Associate Professor",
        hospitalName: "Aster General Hospital",
        location: "Kochi",
        contactProgram: "InternalMedDept",
        teacherId: teachers[0].id,
        startDate: new Date("2024-01-15"),
        endDate: new Date("2024-06-15"),
        status: "Active",
      },
    }),
    prisma.course.create({
      data: {
        title: "Surgery Rotation - General",
        name: "Surgery Rotation - General",
        enrollmentNumber: "MED-SUR-2024-01",
        facultyName: "Dr. Michael Chen",
        designation: "Senior Surgeon",
        hospitalName: "Aster General Hospital",
        location: "Bangalore",
        contactProgram: "SurgeryDept",
        teacherId: teachers[1].id,
        startDate: new Date("2024-02-01"),
        endDate: new Date("2024-07-01"),
        status: "Active",
      },
    }),
    prisma.course.create({
      data: {
        title: "Pediatrics Clinical Rotation",
        name: "Pediatrics Clinical Rotation",
        enrollmentNumber: "MED-PED-2024-01",
        facultyName: "Dr. Priya Sharma",
        designation: "Pediatrician",
        hospitalName: "Aster Children's Hospital",
        location: "Chennai",
        contactProgram: "PediatricsDept",
        teacherId: teachers[2].id,
        startDate: new Date("2024-01-20"),
        endDate: new Date("2024-06-20"),
        status: "Active",
      },
    }),
    prisma.course.create({
      data: {
        title: "Emergency Medicine Rotation",
        name: "Emergency Medicine Rotation",
        enrollmentNumber: "MED-EM-2024-01",
        facultyName: "Dr. Robert Miller",
        designation: "ER Consultant",
        hospitalName: "Aster Emergency Center",
        location: "Hyderabad",
        contactProgram: "EmergencyMed",
        teacherId: teachers[3].id,
        startDate: new Date("2024-03-01"),
        endDate: new Date("2024-08-01"),
        status: "Active",
      },
    }),
    prisma.course.create({
      data: {
        title: "Cardiology Fellowship",
        name: "Cardiology Fellowship",
        enrollmentNumber: "MED-CARD-2024-01",
        facultyName: "Dr. Sarah Johnson",
        designation: "Cardiologist",
        hospitalName: "Aster Heart Institute",
        location: "Delhi",
        contactProgram: "CardiologyFellowship",
        teacherId: teachers[0].id,
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-12-31"),
        status: "Active",
      },
    }),
  ]);

  console.log("📝 Creating course enrollments...");

  const enrollments: Awaited<
    ReturnType<typeof prisma.courseEnrollment.create>
  >[] = [];

  const enrollmentData = [
    // Internal Medicine
    { studentIndex: 0, courseIndex: 0 }, // John Smith
    { studentIndex: 1, courseIndex: 0 }, // Emily Davis
    { studentIndex: 2, courseIndex: 0 }, // Raj Patel

    // Surgery
    { studentIndex: 3, courseIndex: 1 }, // Lisa Wang
    { studentIndex: 4, courseIndex: 1 }, // Ahmed Hassan
    { studentIndex: 5, courseIndex: 1 }, // Maria Rodriguez

    // Pediatrics
    { studentIndex: 6, courseIndex: 2 }, // David Kim
    { studentIndex: 7, courseIndex: 2 }, // Sophia Brown
    { studentIndex: 0, courseIndex: 2 }, // John Smith (multiple courses)

    // Emergency Medicine
    { studentIndex: 1, courseIndex: 3 }, // Emily Davis (multiple courses)
    { studentIndex: 2, courseIndex: 3 }, // Raj Patel (multiple courses)
    { studentIndex: 3, courseIndex: 3 }, // Lisa Wang (multiple courses)

    // Cardiology Fellowship
    { studentIndex: 4, courseIndex: 4 }, // Ahmed Hassan (advanced)
    { studentIndex: 5, courseIndex: 4 }, // Maria Rodriguez (advanced)
  ];

  for (const { studentIndex, courseIndex } of enrollmentData) {
    const created = await prisma.courseEnrollment.create({
      data: {
        courseId: courses[courseIndex].id,
        learnerId: students[studentIndex].id,
        enrolledAt: new Date(
          Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
        ), // random past 30 days
      },
    });
    enrollments.push(created);
  }

  console.log(`✅ Created ${enrollments.length} course enrollments`);
  await Promise.all(
  enrollmentData.map(async ({ studentIndex, courseIndex }) => {
    const courseId = courses[courseIndex].id;
    const learnerId = students[studentIndex].id;

    const existing = await prisma.courseEnrollment.findUnique({
      where: {
        courseId_learnerId: {
          courseId,
          learnerId
        }
      }
    });

    if (!existing) {
      await prisma.courseEnrollment.create({
        data: {
          courseId,
          learnerId,
          enrolledAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        },
      });
    }
  })
);

  //   // 5. Create Enrollments
  //   const enrollments = await Promise.all([
  //     prisma.courseEnrollment.create({
  //       data: {
  //         courseId: courses[0].id,
  //         learnerId: students[0].id,
  //       },
  //     }),
  //     // More enrollments...
  //   ]);

  // 6. Create Logs (Tasks)
  const logs: Awaited<ReturnType<typeof prisma.log.create>>[] = [];
  const taskTemplates = [
    {
      caseNo: "CASE-2024-001",
      age: 45,
      sex: Sex.MALE,
      uhid: "UH001234",
      chiefComplaint: "Chest pain and shortness of breath for 2 hours",
      historyPresenting:
        "Patient presented with acute onset chest pain, described as crushing, radiating to left arm. Associated with diaphoresis and nausea.",
      pastHistory:
        "Hypertension for 5 years, on medication. No previous cardiac events.",
      personalHistory:
        "Smoker - 20 pack years. Occasional alcohol consumption.",
      familyHistory: "Father died of myocardial infarction at age 55.",
      clinicalExamination:
        "BP: 160/95, HR: 110, RR: 24, Temp: 98.6F. Patient appears distressed, diaphoretic. Heart sounds S1, S2 present, no murmurs.",
      labExaminations:
        "ECG shows ST elevation in leads II, III, aVF. Troponin I elevated at 15.2 ng/ml.",
      diagnosis: "ST-elevation myocardial infarction (STEMI) - Inferior wall",
      management:
        "Immediate cardiology consult, dual antiplatelet therapy, anticoagulation, prepared for primary PCI.",
    },
    {
      caseNo: "CASE-2024-002",
      age: 8,
      sex: Sex.FEMALE,
      uhid: "UH005678",
      chiefComplaint: "Fever and cough for 3 days",
      historyPresenting:
        "Child presented with high grade fever (102F), productive cough, and decreased oral intake.",
      pastHistory:
        "No significant past medical history. Immunizations up to date.",
      personalHistory: "Lives with parents and 2 siblings. Attends daycare.",
      familyHistory: "No significant family history.",
      clinicalExamination:
        "Temp: 102F, HR: 120, RR: 28, SpO2: 94% on room air. Chest examination reveals crackles in right lower lobe.",
      labExaminations:
        "WBC: 15,000, Chest X-ray shows right lower lobe consolidation.",
      diagnosis: "Community-acquired pneumonia",
      management:
        "Admitted for IV antibiotics (Ampicillin), supportive care, monitoring oxygen saturation.",
    },
    {
      caseNo: "CASE-2024-003",
      age: 32,
      sex: Sex.FEMALE,
      uhid: "UH009876",
      chiefComplaint: "Abdominal pain and vomiting",
      historyPresenting:
        "Patient presents with severe right lower quadrant pain, started 12 hours ago. Associated with nausea and vomiting.",
      pastHistory: "No significant medical history.",
      personalHistory: "Non-smoker, social drinker.",
      familyHistory: "Mother had gallbladder surgery.",
      clinicalExamination:
        "Temp: 100.4F, BP: 120/80, HR: 95. Abdomen tender in RLQ, positive McBurney's point, guarding present.",
      labExaminations:
        "WBC: 12,500 with left shift, CT abdomen shows appendiceal wall thickening.",
      diagnosis: "Acute appendicitis",
      management:
        "NPO, IV fluids, antibiotics, surgical consultation for appendectomy.",
    },
    {
      caseNo: "CASE-2024-004",
      age: 68,
      sex: Sex.MALE,
      uhid: "UH012345",
      chiefComplaint: "Altered mental status",
      historyPresenting:
        "Family reports patient became confused and disoriented over past 2 days. Decreased oral intake.",
      pastHistory: "Diabetes mellitus type 2, chronic kidney disease stage 3.",
      personalHistory: "Retired teacher, lives with spouse.",
      familyHistory: "Mother had dementia.",
      clinicalExamination:
        "Alert but confused, oriented to person only. Vital signs stable. No focal neurological deficits.",
      labExaminations:
        "Glucose: 45 mg/dl, Creatinine: 2.1, Urinalysis shows UTI.",
      diagnosis: "Hypoglycemia secondary to poor oral intake, UTI",
      management:
        "IV dextrose, antibiotics for UTI, diabetes management adjustment.",
    },
  ];
  for (let i = 0; i < students.length; i++) {
    const template = taskTemplates[i % taskTemplates.length]; // rotate through templates

    const log = await prisma.log.create({
      data: {
        caseNo: `${template.caseNo}-${i + 1}`,
        date: new Date(), // or random past date
        age: template.age,
        sex: template.sex,
        uhid: template.uhid,
        chiefComplaint: template.chiefComplaint,
        historyPresenting: template.historyPresenting,
        pastHistory: template.pastHistory,
        personalHistory: template.personalHistory,
        familyHistory: template.familyHistory,
        clinicalExamination: template.clinicalExamination,
        labExaminations: template.labExaminations,
        diagnosis: template.diagnosis,
        management: template.management,
        status: "SUBMITTED",
        submittedAt: new Date(),
        courseId: courses[i % courses.length].id, // rotate courses
        createdById: students[i].id, // each student gets 1 log
      },
    });

    logs.push(log);
  }

  console.log(`✅ Created ${logs.length} logs`);

  console.log("🎉 Seeding done!");
}

main()
  .catch((e) => {
    console.error("❌ Error during seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
