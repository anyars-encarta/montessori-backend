import express from "express";
import { eq, sql } from "drizzle-orm";
import { db } from '../db/index.js';
import { classes, staff, students } from '../db/schema/index.js';

const router = express.Router();

router.get("/summary", async (_req, res) => {
  try {
    const [
      totalStudentsRow,
      totalActiveStudentsRow,
      totalTeachersRow,
      totalNonTeachingStaffRow,
      totalClassesRow,
      genderRows,
    ] = await Promise.all([
      db
        .select({
          totalStudents: sql<number>`count(*)`,
        })
        .from(students),
      db
        .select({
          totalActiveStudents: sql<number>`count(*)`,
        })
        .from(students)
        .where(eq(students.isActive, true)),
      db
        .select({
          totalTeachers: sql<number>`count(*)`,
        })
        .from(staff)
        .where(eq(staff.staffType, "teacher")),
      db
        .select({
          totalNonTeachingStaff: sql<number>`count(*)`,
        })
        .from(staff)
        .where(eq(staff.staffType, "non_teaching")),
      db
        .select({
          totalClasses: sql<number>`count(*)`,
        })
        .from(classes),
      db
        .select({
          gender: students.gender,
          total: sql<number>`count(*)`,
        })
        .from(students)
        .where(eq(students.isActive, true))
        .groupBy(students.gender),
    ]);

    const genderTotals = {
      maleStudents: 0,
      femaleStudents: 0,
      otherStudents: 0,
    };

    for (const row of genderRows) {
      const count = Number(row.total ?? 0);
      if (row.gender === "male") {
        genderTotals.maleStudents = count;
      } else if (row.gender === "female") {
        genderTotals.femaleStudents = count;
      } else {
        genderTotals.otherStudents = count;
      }
    }

    const data = [
      {
        totalStudents: Number(totalStudentsRow[0]?.totalStudents ?? 0),
        totalActiveStudents: Number(
          totalActiveStudentsRow[0]?.totalActiveStudents ?? 0,
        ),
        totalTeachers: Number(totalTeachersRow[0]?.totalTeachers ?? 0),
        totalNonTeachingStaff: Number(
          totalNonTeachingStaffRow[0]?.totalNonTeachingStaff ?? 0,
        ),
        totalClasses: Number(totalClassesRow[0]?.totalClasses ?? 0),
        ...genderTotals,
      },
    ];

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        total: data.length,
      },
    });
  } catch (error) {
    console.error("GET /dashboard/summary error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch dashboard summary",
    });
  }
});

export default router;
