import express from "express";
import academicYearsRoutes from "./routes/academicYears.js";
import termsRoutes from "./routes/terms.js";
import schoolDetailsRouter from "./routes/schoolDetails.js";
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
import cloudinaryRoutes from "./routes/cloudinary.js";
import dashboardRoutes from "./routes/dashboard.js";
import usersRoutes from "./routes/users.js";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import securityMiddleware from "./middleware/security.js";
import requireAuth from "./middleware/requireAuth.js";
import { auth } from "./lib/auth.js";

const app = express();

const normalizeOrigin = (value: string) => {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
  if (!trimmed) return "";

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
};

const configuredFrontendUrls = (process.env.FRONTEND_URL ?? "")
  .split(",")
  .map((origin) => normalizeOrigin(origin))
  .filter((origin) => Boolean(origin));

const allowedOrigins = new Set<string>([
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://localhost:4173",
  "http://localhost:4174",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:4174",
]);

allowedOrigins.forEach((origin) => {
  const normalized = normalizeOrigin(origin);
  if (normalized !== origin) {
    allowedOrigins.delete(origin);
    allowedOrigins.add(normalized);
  }
});

configuredFrontendUrls.forEach((origin) => {
  allowedOrigins.add(origin);
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedRequestOrigin = normalizeOrigin(origin);

      if (allowedOrigins.has(normalizedRequestOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${normalizedRequestOrigin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true, // allow cookies
  }),
);

app.all("/api/auth/*splat", toNodeHandler(auth));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", requireAuth);
app.use("/api", securityMiddleware);

// API Routes
app.use("/api/academic-years", academicYearsRoutes);
app.use("/api/terms", termsRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/school-details", schoolDetailsRouter);
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
app.use("/api/cloudinary", cloudinaryRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", usersRoutes);

// Routes
app.get("/", (req, res) => {
  res.send("Montessori Backend server is running!");
});

export default app;