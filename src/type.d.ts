type UserRoles = "admin" | "teacher" | "staff";

type RateLimitRole = UserRoles | "guest";

type EnrollmentMode = "admission" | "promotion" | "repeat";

type NormalizedAttendanceEntry = {
  studentId: number | null;
  status: unknown;
  remarks: string | null;
};