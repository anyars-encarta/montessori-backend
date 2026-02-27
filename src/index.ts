import express from "express";
import academicYearsRoutes from "./routes/academicYears.js";
import termsRoutes from "./routes/terms.js";
import staffRoutes from "./routes/staff.js";
import classesRoutes from "./routes/classes.js";
import subjectsRoutes from "./routes/subjects.js";
import studentsRoutes from "./routes/students.js";
import parentsRoutes from "./routes/parents.js";
import healthDetailsRoutes from "./routes/healthDetails.js";
import otherSignificantDataRoutes from "./routes/otherSignificantData.js";
import previousSchoolsRoutes from "./routes/previousSchools.js";
import studentClassEnrollmentsRoutes from "./routes/studentClassEnrollments.js";
import continuousAssessmentsRoutes from "./routes/continuousAssessments.js";
import positionsRoutes from "./routes/positions.js";
import feesRoutes from "./routes/fees.js";
import studentFeesRoutes from "./routes/studentFees.js";
import paymentsRoutes from "./routes/payments.js";
import expenseCategoriesRoutes from "./routes/expenseCategories.js";
import expensesRoutes from "./routes/expenses.js";
import studentAttendancesRoutes from "./routes/studentAttendances.js";
import staffAttendancesRoutes from "./routes/staffAttendances.js";
import classSubjectsRoutes from "./routes/classSubjects.js";
import staffSubjectsRoutes from "./routes/staffSubjects.js";
import studentParentsRoutes from "./routes/studentParents.js";
import studentSiblingsRoutes from "./routes/studentSiblings.js";
import cloudinaryRoutes from "./routes/cloudinary.js";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import securityMiddleware from "./middleware/security.js";
import { auth } from "./lib/auth.js";

const app = express();
const PORT = 8000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL, // React app URL
    methods: ["GET", "POST", "PUT", "DELETE"], // Specify allowed HTTP methods
    credentials: true, // allow cookies
  }),
);

app.all("/api/auth/*splat", toNodeHandler(auth));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(securityMiddleware);

// API Routes
app.use("/api/academic-years", academicYearsRoutes);
app.use("/api/terms", termsRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/classes", classesRoutes);
app.use("/api/subjects", subjectsRoutes);
app.use("/api/students", studentsRoutes);
app.use("/api/parents", parentsRoutes);
app.use("/api/health-details", healthDetailsRoutes);
app.use("/api/other-significant-data", otherSignificantDataRoutes);
app.use("/api/previous-schools", previousSchoolsRoutes);
app.use("/api/student-class-enrollments", studentClassEnrollmentsRoutes);
app.use("/api/continuous-assessments", continuousAssessmentsRoutes);
app.use("/api/positions", positionsRoutes);
app.use("/api/fees", feesRoutes);
app.use("/api/student-fees", studentFeesRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/expense-categories", expenseCategoriesRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/student-attendances", studentAttendancesRoutes);
app.use("/api/staff-attendances", staffAttendancesRoutes);
app.use("/api/class-subjects", classSubjectsRoutes);
app.use("/api/staff-subjects", staffSubjectsRoutes);
app.use("/api/student-parents", studentParentsRoutes);
app.use("/api/student-siblings", studentSiblingsRoutes);
app.use("/api/cloudinary", cloudinaryRoutes);

// Routes
app.get("/", (req, res) => {
  res.send("Montessori Backend server is running!");
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
