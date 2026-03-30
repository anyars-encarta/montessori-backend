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
  // user,
  schoolDetails,
} from "../src/db/schema";

const seed = async () => {
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
  // await db.delete(user);
  await db.delete(schoolDetails);
};

seed()
  .then(() => {
    console.log("Database deletion completed.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Database deletion failed:", error);
    process.exit(1);
  });