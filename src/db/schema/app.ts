import {
  pgTable,
  text,
  varchar,
  integer,
  timestamp,
  boolean,
  numeric,
  date,
  serial,
  uniqueIndex,
  primaryKey,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============= ENUMS =============
export const staffTypeEnum = pgEnum("staff_type", ["teacher", "non_teaching"]);
export const attendanceStatusEnum = pgEnum("attendance_status", ["present", "absent"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "partial", "paid"]);
export const feeTypeEnum = pgEnum("fee_type", ["admission", "promotion", "tuition", "other"]);
export const livingWithEnum = pgEnum("living_with", [
  "both_parents",
  "mother_only",
  "father_only",
  "guardian",
  "other_person",
]);
export const genderEnum = pgEnum("gender", ["male", "female", "other"]);
// ============= CORE TABLES =============

/**
 * Academic Years table
 * Stores information about academic years (e.g., 2024-2025)
 */
export const academicYears = pgTable("academic_years", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull().unique(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Terms table
 * Stores information about terms within an academic year
 */
export const terms = pgTable("terms", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  sequenceNumber: integer("sequence_number").notNull(), // 1, 2, 3, etc
  academicYearId: integer("academic_year_id").notNull().references(() => academicYears.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Staff table
 * Stores information about all staff members (teachers and non-teaching staff)
 */
export const staff = pgTable("staff", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).unique(),
  phone: varchar("phone", { length: 20 }),
  dateOfBirth: date("date_of_birth"),
  gender: genderEnum("gender").notNull(),
  staffType: staffTypeEnum("staff_type").notNull(),
  cloudinaryImageUrl: text("cloudinary_image_url"),
  imageCldPubId: varchar("image_cld_pub_id", { length: 255 }),
  hireDate: date("hire_date").notNull(),
  registrationNumber: varchar("registration_number", { length: 50 }).unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Classes table
 * Stores information about classes
 */
export const classes = pgTable("classes", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  level: varchar("level", { length: 50 }).notNull(), // e.g., "Primary 1", "Primary 2"
  capacity: integer("capacity").notNull().default(0),
  supervisorId: integer("supervisor_id").notNull().references(() => staff.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Subjects table
 * Stores information about all subjects taught in the school
 */
export const subjects = pgTable("subjects", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 20 }).unique(),
  description: text("description"),
  cloudinaryImageUrl: text("cloudinary_image_url"),
  imageCldPubId: varchar("image_cld_pub_id", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Class-Subjects junction table
 * Links classes to subjects (many-to-many)
 * Each class has a set of subjects taught in that class
 */
export const classSubjects = pgTable(
  "class_subjects",
  {
    classId: integer("class_id").notNull().references(() => classes.id),
    subjectId: integer("subject_id").notNull().references(() => subjects.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.classId, table.subjectId] }),
  })
);

/**
 * Staff-Subjects junction table
 * Links staff (teachers) to subjects they teach (many-to-many)
 */
export const staffSubjects = pgTable(
  "staff_subjects",
  {
    staffId: integer("staff_id").notNull().references(() => staff.id),
    subjectId: integer("subject_id").notNull().references(() => subjects.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.staffId, table.subjectId] }),
  })
);

/**
 * Students table
 * Stores information about all students
 */
export const students = pgTable("students", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  dateOfBirth: date("date_of_birth"),
  gender: genderEnum("gender").notNull(),
  admissionDate: date("admission_date").notNull(),
  cloudinaryImageUrl: text("cloudinary_image_url"),
  imageCldPubId: varchar("image_cld_pub_id", { length: 255 }),
  registrationNumber: varchar("registration_number", { length: 50 }).unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Parents table
 * Stores information about parents/guardians
 * A parent can have multiple wards
 */
export const parents = pgTable("parents", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).unique(),
  phone: varchar("phone", { length: 20 }),
  occupation: varchar("occupation", { length: 100 }),
  address: text("address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Student-Parents junction table
 * Links students to parents (many-to-many)
 * A student can have multiple parents and a parent can have multiple wards
 */
export const studentParents = pgTable(
  "student_parents",
  {
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    parentId: integer("parent_id")
      .notNull()
      .references(() => parents.id, { onDelete: "cascade" }),
    relationship: varchar("relationship", { length: 50 }), // mother, father, guardian, etc
  },
  (table) => ({
    pk: primaryKey({ columns: [table.studentId, table.parentId] }),
  })
);

/**
 * Student-Siblings junction table
 * Links students to their siblings who are also in the school (many-to-many)
 */
export const studentSiblings = pgTable(
  "student_siblings",
  {
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    siblingId: integer("sibling_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.studentId, table.siblingId] }),
  })
);

/**
 * Health Details table
 * Stores health information for students including vaccination records
 */
export const healthDetails = pgTable("health_details", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .unique()
    .references(() => students.id, { onDelete: "cascade" }),
  diphtheria: boolean("diphtheria").notNull().default(false),
  polio: boolean("polio").notNull().default(false),
  whoopingCough: boolean("whooping_cough").notNull().default(false),
  tetanus: boolean("tetanus").notNull().default(false),
  measles: boolean("measles").notNull().default(false),
  tuberculosis: boolean("tuberculosis").notNull().default(false),
  otherConditions: text("other_conditions"),
  lastCheckupDate: date("last_checkup_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Other Significant Data table
 * Stores information about who the student lives with
 */
export const otherSignificantData = pgTable("other_significant_data", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .unique()
    .references(() => students.id, { onDelete: "cascade" }),
  livingWith: livingWithEnum("living_with").notNull(),
  otherDetails: text("other_details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Previous Schools table
 * Stores information about student's previous school(s)
 */
export const previousSchools = pgTable("previous_schools", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  schoolName: varchar("school_name", { length: 255 }).notNull(),
  dateOfAdmission: date("date_of_admission"),
  ageAtAdmission: integer("age_at_admission"),
  dateLastAttended: date("date_last_attended"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Student Class Enrollments table
 * Tracks which student is enrolled in which class for each academic year
 * Each student is admitted into a class based on the Term and Year
 */
export const studentClassEnrollments = pgTable(
  "student_class_enrollments",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    classId: integer("class_id").notNull().references(() => classes.id),
    academicYearId: integer("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    enrollmentDate: date("enrollment_date").notNull(),
    promotionDate: date("promotion_date"), // When promoted to next class
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    idx: uniqueIndex("idx_student_class_year").on(table.studentId, table.academicYearId),
  })
);

/**
 * Continuous Assessments table
 * Stores student marks (class mark and exam mark) for each subject per term
 * Every student studies all subjects for the class they belong to
 */
export const continuousAssessments = pgTable("continuous_assessments", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjects.id),
  academicYearId: integer("academic_year_id")
    .notNull()
    .references(() => academicYears.id),
  termId: integer("term_id").notNull().references(() => terms.id),
  classMark: numeric("class_mark", { precision: 5, scale: 2 }).notNull(),
  examMark: numeric("exam_mark", { precision: 5, scale: 2 }).notNull(),
  totalMark: numeric("total_mark", { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Positions/Grades table
 * Stores student positions and grades for each class per term
 * Students total marks are aggregated at end of each term to grade students based on positions
 */
export const positions = pgTable(
  "positions",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    classId: integer("class_id").notNull().references(() => classes.id),
    academicYearId: integer("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    termId: integer("term_id").notNull().references(() => terms.id),
    position: integer("position").notNull(), // 1st, 2nd, 3rd, etc
    totalScore: numeric("total_score", { precision: 8, scale: 2 }).notNull(),
    grade: varchar("grade", { length: 5 }), // A, B, C, etc
    remarks: text("remarks"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    idx: uniqueIndex("idx_student_class_term_position").on(
      table.studentId,
      table.classId,
      table.termId
    ),
  })
);

/**
 * Fees table
 * Stores information about fees applicable for different scenarios
 */
export const fees = pgTable("fees", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  feeType: feeTypeEnum("fee_type").notNull(),
  academicYearId: integer("academic_year_id")
    .notNull()
    .references(() => academicYears.id),
  applicableToLevel: varchar("applicable_to_level", { length: 50 }), // Class level the fee applies to
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Student Fees table
 * Tracks fees assigned to each student for each term
 * Each admission or promotion applies fees applicable for that term
 */
export const studentFees = pgTable("student_fees", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  feeId: integer("fee_id").notNull().references(() => fees.id),
  academicYearId: integer("academic_year_id")
    .notNull()
    .references(() => academicYears.id),
  termId: integer("term_id").notNull().references(() => terms.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  amountPaid: numeric("amount_paid", { precision: 10, scale: 2 }).notNull().default("0"),
  status: paymentStatusEnum("payment_status").notNull().default("pending"),
  dueDate: date("due_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Payments table
 * Records fees payments
 * Payments are recorded and reconciled against student fees
 */
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  studentFeeId: integer("student_fee_id").references(() => studentFees.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  paymentDate: date("payment_date").notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }), // cash, cheque, transfer, etc
  reference: varchar("reference", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Expense Categories table
 * Categorizes expenses (salaries, maintenance, allowances, etc)
 */
export const expenseCategories = pgTable("expense_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
});

/**
 * Expenses table
 * Tracks all school expenses including allowances, salaries, maintenance, etc
 */
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => expenseCategories.id),
  description: varchar("description", { length: 255 }).notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  expenseDate: date("expense_date").notNull(),
  vendor: varchar("vendor", { length: 100 }),
  reference: varchar("reference", { length: 100 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: integer("created_by").references(() => staff.id),
});

/**
 * Student Attendances table
 * Tracks daily attendance of students (present or absent)
 */
export const studentAttendances = pgTable(
  "student_attendances",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    attendanceDate: date("attendance_date").notNull(),
    status: attendanceStatusEnum("attendance_status").notNull(),
    remarks: text("remarks"),
  },
  (table) => ({
    idx: uniqueIndex("idx_student_date_attendance").on(table.studentId, table.attendanceDate),
  })
);

/**
 * Staff Attendances table
 * Tracks daily attendance of staff (present or absent)
 */
export const staffAttendances = pgTable(
  "staff_attendances",
  {
    id: serial("id").primaryKey(),
    staffId: integer("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    attendanceDate: date("attendance_date").notNull(),
    status: attendanceStatusEnum("attendance_status").notNull(),
    remarks: text("remarks"),
  },
  (table) => ({
    idx: uniqueIndex("idx_staff_date_attendance").on(table.staffId, table.attendanceDate),
  })
);

// ============= RELATIONS =============

export const academicYearsRelations = relations(academicYears, ({ many }) => ({
  terms: many(terms),
  fees: many(fees),
  enrollments: many(studentClassEnrollments),
  assessments: many(continuousAssessments),
  positions: many(positions),
  studentFees: many(studentFees),
}));

export const termsRelations = relations(terms, ({ one, many }) => ({
  academicYear: one(academicYears, {
    fields: [terms.academicYearId],
    references: [academicYears.id],
  }),
  assessments: many(continuousAssessments),
  positions: many(positions),
  studentFees: many(studentFees),
}));

export const staffRelations = relations(staff, ({ many, one }) => ({
  supervisedClasses: many(classes),
  subjects: many(staffSubjects),
  attendances: many(staffAttendances),
  expenses: many(expenses),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  supervisor: one(staff, {
    fields: [classes.supervisorId],
    references: [staff.id],
  }),
  subjects: many(classSubjects),
  enrollments: many(studentClassEnrollments),
  positions: many(positions),
}));

export const subjectsRelations = relations(subjects, ({ many }) => ({
  classes: many(classSubjects),
  teachers: many(staffSubjects),
  assessments: many(continuousAssessments),
}));

export const classSubjectsRelations = relations(classSubjects, ({ one }) => ({
  class: one(classes, {
    fields: [classSubjects.classId],
    references: [classes.id],
  }),
  subject: one(subjects, {
    fields: [classSubjects.subjectId],
    references: [subjects.id],
  }),
}));

export const staffSubjectsRelations = relations(staffSubjects, ({ one }) => ({
  staff: one(staff, {
    fields: [staffSubjects.staffId],
    references: [staff.id],
  }),
  subject: one(subjects, {
    fields: [staffSubjects.subjectId],
    references: [subjects.id],
  }),
}));

export const studentsRelations = relations(students, ({ many, one }) => ({
  parentRelations: many(studentParents),
  siblingRelations: many(studentSiblings),
  healthDetails: one(healthDetails),
  otherSignificantData: one(otherSignificantData),
  previousSchools: many(previousSchools),
  enrollments: many(studentClassEnrollments),
  assessments: many(continuousAssessments),
  positions: many(positions),
  fees: many(studentFees),
  payments: many(payments),
  attendances: many(studentAttendances),
}));

export const parentsRelations = relations(parents, ({ many }) => ({
  wards: many(studentParents),
}));

export const studentParentsRelations = relations(studentParents, ({ one }) => ({
  student: one(students, {
    fields: [studentParents.studentId],
    references: [students.id],
  }),
  parent: one(parents, {
    fields: [studentParents.parentId],
    references: [parents.id],
  }),
}));

export const studentSiblingsRelations = relations(studentSiblings, ({ one }) => ({
  student: one(students, {
    fields: [studentSiblings.studentId],
    references: [students.id],
  }),
  sibling: one(students, {
    fields: [studentSiblings.siblingId],
    references: [students.id],
  }),
}));

export const healthDetailsRelations = relations(healthDetails, ({ one }) => ({
  student: one(students, {
    fields: [healthDetails.studentId],
    references: [students.id],
  }),
}));

export const otherSignificantDataRelations = relations(otherSignificantData, ({ one }) => ({
  student: one(students, {
    fields: [otherSignificantData.studentId],
    references: [students.id],
  }),
}));

export const previousSchoolsRelations = relations(previousSchools, ({ one }) => ({
  student: one(students, {
    fields: [previousSchools.studentId],
    references: [students.id],
  }),
}));

export const studentClassEnrollmentsRelations = relations(
  studentClassEnrollments,
  ({ one }) => ({
    student: one(students, {
      fields: [studentClassEnrollments.studentId],
      references: [students.id],
    }),
    class: one(classes, {
      fields: [studentClassEnrollments.classId],
      references: [classes.id],
    }),
    academicYear: one(academicYears, {
      fields: [studentClassEnrollments.academicYearId],
      references: [academicYears.id],
    }),
  })
);

export const continuousAssessmentsRelations = relations(
  continuousAssessments,
  ({ one }) => ({
    student: one(students, {
      fields: [continuousAssessments.studentId],
      references: [students.id],
    }),
    subject: one(subjects, {
      fields: [continuousAssessments.subjectId],
      references: [subjects.id],
    }),
    academicYear: one(academicYears, {
      fields: [continuousAssessments.academicYearId],
      references: [academicYears.id],
    }),
    term: one(terms, {
      fields: [continuousAssessments.termId],
      references: [terms.id],
    }),
  })
);

export const positionsRelations = relations(positions, ({ one }) => ({
  student: one(students, {
    fields: [positions.studentId],
    references: [students.id],
  }),
  class: one(classes, {
    fields: [positions.classId],
    references: [classes.id],
  }),
  academicYear: one(academicYears, {
    fields: [positions.academicYearId],
    references: [academicYears.id],
  }),
  term: one(terms, {
    fields: [positions.termId],
    references: [terms.id],
  }),
}));

export const feesRelations = relations(fees, ({ one, many }) => ({
  academicYear: one(academicYears, {
    fields: [fees.academicYearId],
    references: [academicYears.id],
  }),
  studentFees: many(studentFees),
}));

export const studentFeesRelations = relations(studentFees, ({ one, many }) => ({
  student: one(students, {
    fields: [studentFees.studentId],
    references: [students.id],
  }),
  fee: one(fees, {
    fields: [studentFees.feeId],
    references: [fees.id],
  }),
  academicYear: one(academicYears, {
    fields: [studentFees.academicYearId],
    references: [academicYears.id],
  }),
  term: one(terms, {
    fields: [studentFees.termId],
    references: [terms.id],
  }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  student: one(students, {
    fields: [payments.studentId],
    references: [students.id],
  }),
  studentFee: one(studentFees, {
    fields: [payments.studentFeeId],
    references: [studentFees.id],
  }),
}));

export const expenseCategoriesRelations = relations(expenseCategories, ({ many }) => ({
  expenses: many(expenses),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  category: one(expenseCategories, {
    fields: [expenses.categoryId],
    references: [expenseCategories.id],
  }),
  createdByStaff: one(staff, {
    fields: [expenses.createdBy],
    references: [staff.id],
  }),
}));

export const studentAttendancesRelations = relations(studentAttendances, ({ one }) => ({
  student: one(students, {
    fields: [studentAttendances.studentId],
    references: [students.id],
  }),
}));

export const staffAttendancesRelations = relations(staffAttendances, ({ one }) => ({
  staff: one(staff, {
    fields: [staffAttendances.staffId],
    references: [staff.id],
  }),
}));

// ============= TYPE EXPORTS =============

export type AcademicYear = typeof academicYears.$inferSelect;
export type NewAcademicYear = typeof academicYears.$inferInsert;

export type Term = typeof terms.$inferSelect;
export type NewTerm = typeof terms.$inferInsert;

export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;

export type Class = typeof classes.$inferSelect;
export type NewClass = typeof classes.$inferInsert;

export type Subject = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;

export type ClassSubject = typeof classSubjects.$inferSelect;
export type NewClassSubject = typeof classSubjects.$inferInsert;

export type StaffSubject = typeof staffSubjects.$inferSelect;
export type NewStaffSubject = typeof staffSubjects.$inferInsert;

export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;

export type Parent = typeof parents.$inferSelect;
export type NewParent = typeof parents.$inferInsert;

export type StudentParent = typeof studentParents.$inferSelect;
export type NewStudentParent = typeof studentParents.$inferInsert;

export type StudentSibling = typeof studentSiblings.$inferSelect;
export type NewStudentSibling = typeof studentSiblings.$inferInsert;

export type HealthDetail = typeof healthDetails.$inferSelect;
export type NewHealthDetail = typeof healthDetails.$inferInsert;

export type OtherSignificantData = typeof otherSignificantData.$inferSelect;
export type NewOtherSignificantData = typeof otherSignificantData.$inferInsert;

export type PreviousSchool = typeof previousSchools.$inferSelect;
export type NewPreviousSchool = typeof previousSchools.$inferInsert;

export type StudentClassEnrollment = typeof studentClassEnrollments.$inferSelect;
export type NewStudentClassEnrollment = typeof studentClassEnrollments.$inferInsert;

export type ContinuousAssessment = typeof continuousAssessments.$inferSelect;
export type NewContinuousAssessment = typeof continuousAssessments.$inferInsert;

export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;

export type Fee = typeof fees.$inferSelect;
export type NewFee = typeof fees.$inferInsert;

export type StudentFee = typeof studentFees.$inferSelect;
export type NewStudentFee = typeof studentFees.$inferInsert;

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type NewExpenseCategory = typeof expenseCategories.$inferInsert;

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;

export type StudentAttendance = typeof studentAttendances.$inferSelect;
export type NewStudentAttendance = typeof studentAttendances.$inferInsert;

export type StaffAttendance = typeof staffAttendances.$inferSelect;
export type NewStaffAttendance = typeof staffAttendances.$inferInsert;
