import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "../src/db";
import {
  account,
  academicYears,
  classSubjects,
  classes,
  continuousAssessments,
  expenseCategories,
  expenses,
  fees,
  healthDetails,
  otherSignificantData,
  parents,
  payments,
  positions,
  previousSchools,
  session,
  staff,
  staffAttendances,
  staffSubjects,
  studentAttendances,
  studentClassEnrollments,
  studentFees,
  studentParents,
  studentSiblings,
  students,
  subjects,
  terms,
  user,
} from "../src/db/schema";

type SeedUser = {
  id: string;
  name: string;
  email: string;
  role: "student" | "teacher" | "admin";
  password: string;
  image: string;
  imageCldPubId: string;
};

type SeedAcademicYear = {
  year: number;
  startDate: string;
  endDate: string;
};

type SeedTerm = {
  name: string;
  sequenceNumber: number;
  academicYearId: number;
  startDate: string;
  endDate: string;
};

type SeedStaff = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  staffType: "teacher" | "non_teaching";
  hireDate: string;
  isActive: boolean;
  cloudinaryImageUrl: string;
};

type SeedSubject = {
  name: string;
  code: string;
  description: string;
  cloudinaryImageUrl: string;
};

type SeedClass = {
  name: string;
  level: string;
  capacity: number;
  supervisorId: number;
  subjectIds: number[];
};

type SeedStaffSubject = {
  staffId: number;
  subjectIds: number[];
};

type SeedStudent = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  admissionDate: string;
  registrationNumber: string;
  cloudinaryImageUrl: string;
};

type SeedParent = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  occupation: string;
  address: string;
};

type SeedStudentParent = {
  studentId: number;
  parentId: number;
  relationship: string;
};

type SeedStudentClassEnrollment = {
  studentId: number;
  classId: number;
  academicYearId: number;
  enrollmentDate: string;
};

type SeedData = {
  users: SeedUser[];
  academicYears: SeedAcademicYear[];
  terms: SeedTerm[];
  staff: SeedStaff[];
  subjects: SeedSubject[];
  classes: SeedClass[];
  staffSubjects: SeedStaffSubject[];
  students: SeedStudent[];
  parents: SeedParent[];
  studentParents: SeedStudentParent[];
  studentClassEnrollments: SeedStudentClassEnrollment[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadSeedData = async (): Promise<SeedData> => {
  const dataPath = path.join(__dirname, "data.json");
  const raw = await readFile(dataPath, "utf-8");
  return JSON.parse(raw) as SeedData;
};

const classKey = (name: string, level: string) => `${name}::${level}`;

const resolveAcademicYearId = (
  reference: number,
  startDate: string,
  seedAcademicYears: SeedAcademicYear[],
  academicYearIdByYear: Map<number, number>,
) => {
  const fromIndex = seedAcademicYears[reference - 1];
  if (fromIndex) {
    const mapped = academicYearIdByYear.get(fromIndex.year);
    if (mapped) return mapped;
  }

  const directYearMatch = academicYearIdByYear.get(reference);
  if (directYearMatch) return directYearMatch;

  const startYear = Number(startDate.slice(0, 4));
  const byDate = academicYearIdByYear.get(startYear);
  if (byDate) return byDate;

  throw new Error(
    `Could not resolve academic year reference '${reference}' for start date '${startDate}'.`,
  );
};

const seed = async () => {
  const data = await loadSeedData();

  // Delete data in reverse dependency order
  await db.delete(payments);
  await db.delete(studentFees);
  await db.delete(fees);
  await db.delete(positions);
  await db.delete(continuousAssessments);
  await db.delete(studentAttendances);
  await db.delete(staffAttendances);
  await db.delete(expenses);
  await db.delete(expenseCategories);
  await db.delete(previousSchools);
  await db.delete(otherSignificantData);
  await db.delete(healthDetails);
  await db.delete(studentSiblings);
  await db.delete(studentClassEnrollments);
  await db.delete(studentParents);
  await db.delete(staffSubjects);
  await db.delete(classSubjects);
  await db.delete(classes);
  await db.delete(subjects);
  await db.delete(students);
  await db.delete(parents);
  await db.delete(staff);
  await db.delete(terms);
  await db.delete(academicYears);
  await db.delete(session);
  await db.delete(account);
  await db.delete(user);

    // Insert User data
    if (data.users.length) {
      await db
        .insert(user)
        .values(
          data.users.map((seedUser) => ({
            id: seedUser.id,
            name: seedUser.name,
            email: seedUser.email,
            emailVerified: true,
            image: seedUser.image,
            imageCldPubId: seedUser.imageCldPubId,
            role: seedUser.role,
          })),
        )
        .onConflictDoNothing({ target: user.id });

      await db
        .insert(account)
        .values(
          data.users.map((seedUser) => ({
            id: `acc_${seedUser.id}`,
            userId: seedUser.id,
            accountId: seedUser.email,
            providerId: "credentials",
            password: seedUser.password,
          })),
        )
        .onConflictDoNothing({
          target: [account.providerId, account.accountId],
        });
    }

    // Insert Academic Years
    if (data.academicYears.length) {
      await db
        .insert(academicYears)
        .values(
          data.academicYears.map((year) => ({
            year: year.year,
            startDate: year.startDate,
            endDate: year.endDate,
          })),
        )
        .onConflictDoNothing({ target: academicYears.year });
    }

    const academicYearRows = await db
      .select({ id: academicYears.id, year: academicYears.year })
      .from(academicYears);
    const academicYearIdByYear = new Map(
      academicYearRows.map((row) => [row.year, row.id]),
    );

    // Insert Terms
    if (data.terms.length) {
      await db
        .insert(terms)
        .values(
          data.terms.map((term) => ({
            name: term.name,
            sequenceNumber: term.sequenceNumber,
            academicYearId: resolveAcademicYearId(
              term.academicYearId,
              term.startDate,
              data.academicYears,
              academicYearIdByYear,
            ),
            startDate: term.startDate,
            endDate: term.endDate,
          })),
        )
        .onConflictDoNothing();
    }

    // Insert Staff
    if (data.staff.length) {
      await db
        .insert(staff)
        .values(
          data.staff.map((s) => ({
            firstName: s.firstName,
            lastName: s.lastName,
            email: s.email,
            phone: s.phone,
            dateOfBirth: s.dateOfBirth,
            staffType: s.staffType,
            hireDate: s.hireDate,
            isActive: s.isActive,
            cloudinaryImageUrl: s.cloudinaryImageUrl,
          })),
        )
        .onConflictDoNothing();
    }

    const staffRows = await db
      .select({ id: staff.id, email: staff.email })
      .from(staff);
    const staffIdByEmail = new Map<string, number>();
    staffRows.forEach((row) => {
      if (row.email) {
        staffIdByEmail.set(row.email, row.id);
      }
    });

    // Insert Subjects
    if (data.subjects.length) {
      await db
        .insert(subjects)
        .values(
          data.subjects.map((subj) => ({
            name: subj.name,
            code: subj.code,
            description: subj.description,
            cloudinaryImageUrl: subj.cloudinaryImageUrl,
          })),
        )
        .onConflictDoNothing({ target: subjects.code });
    }

    const subjectRows = await db
      .select({ id: subjects.id, code: subjects.code })
      .from(subjects);
    const subjectIdByCode = new Map<string, number>();
    subjectRows.forEach((row) => {
      if (row.code) {
        subjectIdByCode.set(row.code, row.id);
      }
    });

    // Insert Classes
    if (data.classes.length) {
      await db
        .insert(classes)
        .values(
          data.classes.map((cls) => {
            const supervisorSeed = data.staff[cls.supervisorId - 1];
            if (!supervisorSeed) {
              throw new Error(
                `Supervisor reference '${cls.supervisorId}' not found for class '${cls.name}'.`,
              );
            }

            const supervisorDbId = staffIdByEmail.get(supervisorSeed.email);
            if (!supervisorDbId) {
              throw new Error(
                `Supervisor '${supervisorSeed.email}' not found in staff table for class '${cls.name}'.`,
              );
            }

            return {
              name: cls.name,
              level: cls.level,
              capacity: cls.capacity,
              supervisorId: supervisorDbId,
            };
          }),
        )
        .onConflictDoNothing();
    }

    const classRows = await db
      .select({ id: classes.id, name: classes.name, level: classes.level })
      .from(classes);
    const classIdByKey = new Map(
      classRows.map((row) => [classKey(row.name, row.level), row.id]),
    );

    // Insert Class Subjects
    if (data.classes.length && subjectIdByCode.size) {
      const classSubjectsData: Array<{
        classId: number;
        subjectId: number;
      }> = [];
      data.classes.forEach((cls) => {
        const mappedClassId = classIdByKey.get(classKey(cls.name, cls.level));
        if (!mappedClassId) return;

        cls.subjectIds.forEach((subjectRef) => {
          const seedSubject = data.subjects[subjectRef - 1];
          if (!seedSubject) return;
          const mappedSubjectId = subjectIdByCode.get(seedSubject.code);
          if (!mappedSubjectId) return;

          classSubjectsData.push({
            classId: mappedClassId,
            subjectId: mappedSubjectId,
          });
        });
      });

      if (classSubjectsData.length) {
        await db
          .insert(classSubjects)
          .values(classSubjectsData)
          .onConflictDoNothing();
      }
    }

    // Insert Staff Subjects
    if (data.staffSubjects.length && subjectIdByCode.size) {
      const staffSubjectsData: Array<{
        staffId: number;
        subjectId: number;
      }> = [];
      data.staffSubjects.forEach((ss) => {
        const seedStaff = data.staff[ss.staffId - 1];
        if (!seedStaff) return;

        const mappedStaffId = staffIdByEmail.get(seedStaff.email);
        if (!mappedStaffId) return;

        ss.subjectIds.forEach((subjectRef) => {
          const seedSubject = data.subjects[subjectRef - 1];
          if (!seedSubject) return;

          const mappedSubjectId = subjectIdByCode.get(seedSubject.code);
          if (!mappedSubjectId) return;

          staffSubjectsData.push({
            staffId: mappedStaffId,
            subjectId: mappedSubjectId,
          });
        });
      });

      if (staffSubjectsData.length) {
        await db
          .insert(staffSubjects)
          .values(staffSubjectsData)
          .onConflictDoNothing();
      }
    }

    // Insert Students
    if (data.students.length) {
      await db
        .insert(students)
        .values(
          data.students.map((s) => ({
            firstName: s.firstName,
            lastName: s.lastName,
            dateOfBirth: s.dateOfBirth,
            admissionDate: s.admissionDate,
            registrationNumber: s.registrationNumber,
            cloudinaryImageUrl: s.cloudinaryImageUrl,
          })),
        )
        .onConflictDoNothing();
    }

    // Insert Parents
    if (data.parents.length) {
      await db
        .insert(parents)
        .values(
          data.parents.map((p) => ({
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
            phone: p.phone,
            occupation: p.occupation,
            address: p.address,
          })),
        )
        .onConflictDoNothing();
    }

    const studentRows = await db
      .select({ id: students.id, registrationNumber: students.registrationNumber })
      .from(students);
    const studentIdByRegistration = new Map<string, number>();
    studentRows.forEach((row) => {
      if (row.registrationNumber) {
        studentIdByRegistration.set(row.registrationNumber, row.id);
      }
    });

    const parentRows = await db
      .select({ id: parents.id, email: parents.email })
      .from(parents);
    const parentIdByEmail = new Map<string, number>();
    parentRows.forEach((row) => {
      if (row.email) {
        parentIdByEmail.set(row.email, row.id);
      }
    });

    // Insert Student Parents
    if (
      data.studentParents.length &&
      studentIdByRegistration.size &&
      parentIdByEmail.size
    ) {
      const studentParentRows: Array<{
        studentId: number;
        parentId: number;
        relationship: string;
      }> = [];

      data.studentParents.forEach((sp) => {
        const seedStudent = data.students[sp.studentId - 1];
        const seedParent = data.parents[sp.parentId - 1];

        const mappedStudentId = seedStudent
          ? studentIdByRegistration.get(seedStudent.registrationNumber)
          : undefined;

        const mappedParentId = seedParent
          ? parentIdByEmail.get(seedParent.email)
          : undefined;

        if (mappedStudentId && mappedParentId) {
          studentParentRows.push({
            studentId: mappedStudentId,
            parentId: mappedParentId,
            relationship: sp.relationship,
          });
        }
      });

      await db
        .insert(studentParents)
        .values(studentParentRows)
        .onConflictDoNothing();
    }

    // Insert Student Class Enrollments
    if (
      data.studentClassEnrollments.length &&
      studentIdByRegistration.size &&
      classIdByKey.size
    ) {
      const studentEnrollmentRows: Array<{
        studentId: number;
        classId: number;
        academicYearId: number;
        enrollmentDate: string;
      }> = [];

      data.studentClassEnrollments.forEach((sce) => {
        const seedStudent = data.students[sce.studentId - 1];
        const seedClass = data.classes[sce.classId - 1];

        const mappedStudentId = seedStudent
          ? studentIdByRegistration.get(seedStudent.registrationNumber)
          : undefined;

        const mappedClassId = seedClass
          ? classIdByKey.get(classKey(seedClass.name, seedClass.level))
          : undefined;

        const mappedAcademicYearId = resolveAcademicYearId(
          sce.academicYearId,
          sce.enrollmentDate,
          data.academicYears,
          academicYearIdByYear,
        );

        if (mappedStudentId && mappedClassId) {
          studentEnrollmentRows.push({
            studentId: mappedStudentId,
            classId: mappedClassId,
            academicYearId: mappedAcademicYearId,
            enrollmentDate: sce.enrollmentDate,
          });
        }
      });

      await db
        .insert(studentClassEnrollments)
        .values(studentEnrollmentRows)
        .onConflictDoNothing();
    }
  
};

seed()
  .then(() => {
    console.log("Seed completed.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
