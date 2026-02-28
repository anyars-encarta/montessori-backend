import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "../src/db";
import {
  account,
  academicYears,
  classSubjects,
  classes,
  parents,
  session,
  staff,
  staffSubjects,
  studentClassEnrollments,
  studentParents,
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

const seed = async () => {
  const data = await loadSeedData();

  // Delete data in reverse dependency order
  await db.delete(studentClassEnrollments);
  await db.delete(studentParents);
  await db.delete(students);
  await db.delete(parents);
  await db.delete(staffSubjects);
  await db.delete(classSubjects);
  await db.delete(classes);
  await db.delete(staff);
  await db.delete(subjects);
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

    // Insert Terms
    if (data.terms.length) {
      await db
        .insert(terms)
        .values(
          data.terms.map((term) => ({
            name: term.name,
            sequenceNumber: term.sequenceNumber,
            academicYearId: term.academicYearId,
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

    // Insert Classes
    if (data.classes.length) {
      await db
        .insert(classes)
        .values(
          data.classes.map((cls) => ({
            name: cls.name,
            level: cls.level,
            capacity: cls.capacity,
            supervisorId: cls.supervisorId,
          })),
        )
        .onConflictDoNothing();
    }

    // Get IDs for building relationships
    const subjectRows = await db.select({ id: subjects.id }).from(subjects);
    const subjectIds = subjectRows.map((row) => row.id);

    const classRows = await db.select({ id: classes.id }).from(classes);
    const classIds = classRows.map((row) => row.id);

    const staffRows = await db.select({ id: staff.id }).from(staff);
    const staffIds = staffRows.map((row) => row.id);

    // Insert Class Subjects
    if (data.classes.length && subjectIds.length) {
      const classSubjectsData: Array<{
        classId: number;
        subjectId: number;
      }> = [];
      data.classes.forEach((cls, idx) => {
        if (classIds[idx]) {
          cls.subjectIds.forEach((subjIdx) => {
            if (subjectIds[subjIdx - 1]) {
              classSubjectsData.push({
                classId: classIds[idx],
                subjectId: subjectIds[subjIdx - 1],
              });
            }
          });
        }
      });

      if (classSubjectsData.length) {
        await db
          .insert(classSubjects)
          .values(classSubjectsData)
          .onConflictDoNothing();
      }
    }

    // Insert Staff Subjects
    if (data.staffSubjects.length && subjectIds.length) {
      const staffSubjectsData: Array<{
        staffId: number;
        subjectId: number;
      }> = [];
      data.staffSubjects.forEach((ss) => {
        if (staffIds[ss.staffId - 1]) {
          ss.subjectIds.forEach((subjIdx) => {
            if (subjectIds[subjIdx - 1]) {
              staffSubjectsData.push({
                staffId: staffIds[ss.staffId - 1],
                subjectId: subjectIds[subjIdx - 1],
              });
            }
          });
        }
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

    // Get student and parent IDs
    const studentRows = await db.select({ id: students.id }).from(students);
    const studentIds = studentRows.map((row) => row.id);

    const parentRows = await db.select({ id: parents.id }).from(parents);
    const parentIds = parentRows.map((row) => row.id);

    // Insert Student Parents
    if (data.studentParents.length && studentIds.length && parentIds.length) {
      await db
        .insert(studentParents)
        .values(
          data.studentParents
            .map((sp) => ({
              studentId: studentIds[sp.studentId - 1],
              parentId: parentIds[sp.parentId - 1],
              relationship: sp.relationship,
            }))
            .filter(
              (sp) => sp.studentId !== undefined && sp.parentId !== undefined,
            ),
        )
        .onConflictDoNothing();
    }

    // Insert Student Class Enrollments
    if (
      data.studentClassEnrollments.length &&
      studentIds.length &&
      classIds.length
    ) {
      const academicYearRows = await db
        .select({ id: academicYears.id })
        .from(academicYears);
      const academicYearIds = academicYearRows.map((row) => row.id);

      await db
        .insert(studentClassEnrollments)
        .values(
          data.studentClassEnrollments
            .map((sce) => ({
              studentId: studentIds[sce.studentId - 1],
              classId: classIds[sce.classId - 1],
              academicYearId: academicYearIds[sce.academicYearId - 1],
              enrollmentDate: sce.enrollmentDate,
            }))
            .filter(
              (sce) =>
                sce.studentId !== undefined &&
                sce.classId !== undefined &&
                sce.academicYearId !== undefined,
            ),
        )
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
