import { createClient } from "@/utils/supabase/server";
import DashboardStats from "@/components/DashboardStats";
import SubjectCard from "@/components/SubjectCard";
import { classifyRisk } from "@/lib/calculations/attendance";

export const dynamic = "force-dynamic"; // always show fresh data, never cache stale attendance

interface LatestSnapshot {
  subject_id: string;
  total_conducted: number;
  total_attended: number;
  total_absent: number;
  percentage: number;
  tcbr: number;
  created_at: string;
}

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <p className="text-sm text-slate-500">Please log in.</p>;
  }

  // 1. Subjects owned by this user (RLS enforces this server-side too)
  const { data: subjects, error: subjectsError } = await supabase
    .from("subjects")
    .select("id, course_code, course_name")
    .eq("user_id", user.id);

  // 2. All snapshots for this user, most recent first — reduced to
  //    "latest per subject" in JS below.
  const { data: snapshots, error: snapshotsError } = await supabase
    .from("attendance_snapshots")
    .select("subject_id, total_conducted, total_attended, total_absent, tcbr, percentage, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // 3. Most recent sync session, for the "Last synced" timestamp
  const { data: lastSync } = await supabase
    .from("sync_sessions")
    .select("synced_at")
    .eq("user_id", user.id)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subjectsError || snapshotsError) {
    return (
      <div className="card border-red-200 bg-red-50 text-red-700">
        Failed to load dashboard data. Please refresh, or try again shortly.
      </div>
    );
  }

  if (!subjects || subjects.length === 0) {
    return (
      <div className="card text-center">
        <h2 className="text-lg font-semibold text-slate-900">No attendance synced yet</h2>
        <p className="mt-2 text-sm text-slate-500">
          Open your KLU ERP Attendance Register, then use the KLU AttendIQ
          browser extension to sync your data here.
        </p>
      </div>
    );
  }

  // Reduce snapshots to the latest one per subject_id
  const latestBySubject = new Map<string, LatestSnapshot>();
  for (const snap of (snapshots ?? []) as LatestSnapshot[]) {
    if (!latestBySubject.has(snap.subject_id)) {
      latestBySubject.set(snap.subject_id, snap);
    }
  }

  const rows = subjects
    .map((subj) => {
      const snap = latestBySubject.get(subj.id);
      return snap ? { ...subj, ...snap } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const totalConducted = rows.reduce((sum, r) => sum + Math.max(0, r.total_conducted - (r.tcbr ?? 0)), 0);
  const totalAttended = rows.reduce((sum, r) => sum + Math.min(r.total_attended, Math.max(0, r.total_conducted - (r.tcbr ?? 0))), 0);
  const overallPercentage =
    totalConducted > 0 ? Math.round((totalAttended / totalConducted) * 10000) / 100 : 0;

  let safeCount = 0;
  let warningCount = 0;
  let criticalCount = 0;
  for (const r of rows) {
    const risk = classifyRisk(r.percentage).level;
    if (risk === "excellent" || risk === "good" || risk === "safe") safeCount++;
    else if (risk === "warning") warningCount++;
    else criticalCount++;
  }

  return (
    <div className="space-y-6">
      <DashboardStats
        overallPercentage={overallPercentage}
        totalSubjects={rows.length}
        safeCount={safeCount}
        warningCount={warningCount}
        criticalCount={criticalCount}
        lastSyncedAt={lastSync?.synced_at ?? null}
      />

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Your subjects</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <SubjectCard
              key={r.id}
              subjectId={r.id}
              courseName={r.course_name}
              courseCode={r.course_code}
              conducted={r.total_conducted}
              attended={r.total_attended}
              absent={r.total_absent}
              percentage={r.percentage}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
