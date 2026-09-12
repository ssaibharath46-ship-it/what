import { createClient } from "@/utils/supabase/server";
import { detectTrend } from "@/lib/calculations/attendance";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: sessions } = await supabase
    .from("sync_sessions")
    .select("id, synced_at, subjects_count, status")
    .eq("user_id", user.id)
    .order("synced_at", { ascending: false });

  // For each session, compute overall % from its snapshots
  const { data: snapshots } = await supabase
    .from("attendance_snapshots")
    .select("sync_session_id, total_conducted, total_attended")
    .eq("user_id", user.id);

  const bySession = new Map<string, { conducted: number; attended: number }>();
  for (const s of snapshots ?? []) {
    const cur = bySession.get(s.sync_session_id) ?? { conducted: 0, attended: 0 };
    cur.conducted += s.total_conducted;
    cur.attended += s.total_attended;
    bySession.set(s.sync_session_id, cur);
  }

  const rows = (sessions ?? []).map((session) => {
    const totals = bySession.get(session.id);
    const percentage =
      totals && totals.conducted > 0
        ? Math.round((totals.attended / totals.conducted) * 10000) / 100
        : null;
    return { ...session, percentage };
  });

  if (rows.length === 0) {
    return (
      <div className="card text-sm text-slate-500">
        No sync history yet. Every time you sync from the extension, a snapshot
        is saved here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Sync History</h1>

      <div className="card divide-y divide-slate-100">
        {rows.map((row, i) => {
          const prev = rows[i + 1]; // next item chronologically is the older one
          const trend =
            row.percentage !== null && prev?.percentage != null
              ? detectTrend(prev.percentage, row.percentage)
              : null;

          return (
            <div key={row.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {new Date(row.synced_at).toLocaleString()}
                </p>
                <p className="text-xs text-slate-500">
                  {row.subjects_count} subjects · {row.status}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-slate-900">
                  {row.percentage !== null ? `${row.percentage}%` : "—"}
                </p>
                {trend && trend.direction !== "flat" && (
                  <p
                    className={`text-xs font-medium ${
                      trend.direction === "up" ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {trend.direction === "up" ? "▲" : "▼"} {Math.abs(trend.delta)}%
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
