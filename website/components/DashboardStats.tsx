export interface DashboardStatsProps {
  overallPercentage: number;
  totalSubjects: number;
  safeCount: number;
  warningCount: number;
  criticalCount: number;
  lastSyncedAt: string | null;
}

export default function DashboardStats({
  overallPercentage,
  totalSubjects,
  safeCount,
  warningCount,
  criticalCount,
  lastSyncedAt,
}: DashboardStatsProps) {
  return (
    <div className="card">
      <p className="text-sm text-slate-500">Overall Attendance</p>
      <p className="mt-1 text-5xl font-bold text-slate-900">{overallPercentage}%</p>

      <div className="mt-5 grid grid-cols-4 gap-3">
        <div>
          <p className="text-xl font-semibold text-slate-900">{totalSubjects}</p>
          <p className="text-xs text-slate-500">Subjects</p>
        </div>
        <div>
          <p className="text-xl font-semibold text-emerald-600">{safeCount}</p>
          <p className="text-xs text-slate-500">Safe</p>
        </div>
        <div>
          <p className="text-xl font-semibold text-orange-500">{warningCount}</p>
          <p className="text-xs text-slate-500">Warning</p>
        </div>
        <div>
          <p className="text-xl font-semibold text-red-600">{criticalCount}</p>
          <p className="text-xs text-slate-500">Critical</p>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Last synced:{" "}
        {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : "Never — sync from the extension"}
      </p>
    </div>
  );
}
