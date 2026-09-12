import { createClient } from "@/utils/supabase/server";
import { classifyRisk } from "@/lib/calculations/attendance";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: subjects } = await supabase.from("subjects").select("id, course_code, course_name").eq("user_id", user.id);
  const { data: snapshots } = await supabase
    .from("attendance_snapshots")
    .select("subject_id, total_conducted, total_attended, tcbr, percentage, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const latestBySubject = new Map<string, any>();
  for (const s of snapshots ?? []) if (!latestBySubject.has(s.subject_id)) latestBySubject.set(s.subject_id, s);

  const rows = (subjects ?? []).map((s) => {
    const snap = latestBySubject.get(s.id);
    return snap ? { ...s, ...snap } : null;
  }).filter(Boolean) as any[];

  if (!rows.length) return <div className="card text-sm text-slate-500">No synced data yet — sync your attendance to see analytics.</div>;

  const totalConducted = rows.reduce((n, r) => n + Math.max(0, Number(r.total_conducted || 0) - Number(r.tcbr || 0)), 0);
  const totalAttended = rows.reduce((n, r) => {
    const effectiveConducted = Math.max(0, Number(r.total_conducted || 0) - Number(r.tcbr || 0));
    return n + Math.min(Number(r.total_attended || 0), effectiveConducted);
  }, 0);
  const overall = totalConducted ? Math.round((totalAttended / totalConducted) * 10000) / 100 : 0;
  const sorted = [...rows].sort((a, b) => b.percentage - a.percentage);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];
  const atRisk = rows.filter((r) => r.percentage < 85).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">Latest attendance intelligence from your synced ERP data.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card"><p className="text-xs text-slate-500">Overall</p><p className="mt-1 text-2xl font-bold">{overall}%</p></div>
        <div className="card"><p className="text-xs text-slate-500">Subjects</p><p className="mt-1 text-2xl font-bold">{rows.length}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Below 85%</p><p className="mt-1 text-2xl font-bold text-orange-600">{atRisk}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Strongest</p><p className="mt-1 truncate font-semibold text-emerald-700">{strongest.course_name}</p></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card"><p className="text-sm text-slate-500">Strongest subject</p><p className="mt-1 font-semibold">{strongest.course_name}</p><p className="text-2xl font-bold text-emerald-700">{strongest.percentage}%</p></div>
        <div className="card"><p className="text-sm text-slate-500">Needs attention</p><p className="mt-1 font-semibold">{weakest.course_name}</p><p className="text-2xl font-bold text-red-700">{weakest.percentage}%</p></div>
      </div>

      <div className="card">
        <p className="mb-4 text-sm font-medium text-slate-700">Subject comparison</p>
        <div className="space-y-4">
          {sorted.map((r) => {
            const risk = classifyRisk(r.percentage);
            return <div key={r.id}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs text-slate-600">
                <span className="truncate">{r.course_code} — {r.course_name}</span><span className="font-semibold">{r.percentage}%</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, r.percentage))}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{risk.label} · {r.total_attended}/{r.total_conducted} attended</p>
            </div>;
          })}
        </div>
      </div>
    </div>
  );
}
