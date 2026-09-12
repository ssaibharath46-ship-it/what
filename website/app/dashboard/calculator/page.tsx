import { createClient } from "@/utils/supabase/server";
import CalculatorForm from "@/components/CalculatorForm";

export const dynamic = "force-dynamic";

export default async function CalculatorPage({
  searchParams,
}: {
  searchParams: { subject?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, course_name")
    .eq("user_id", user.id);

  const { data: snapshots } = await supabase
    .from("attendance_snapshots")
    .select("subject_id, total_conducted, total_attended, tcbr, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const latestBySubject = new Map<string, { total_conducted: number; total_attended: number; tcbr: number }>();
  for (const s of snapshots ?? []) {
    if (!latestBySubject.has(s.subject_id)) {
      latestBySubject.set(s.subject_id, {
        total_conducted: s.total_conducted,
        total_attended: s.total_attended,
        tcbr: s.tcbr ?? 0,
      });
    }
  }

  const options = (subjects ?? [])
    .map((s) => {
      const snap = latestBySubject.get(s.id);
      if (!snap) return null;
      return {
        id: s.id,
        courseName: s.course_name,
        conducted: snap.total_conducted,
        attended: snap.total_attended,
        tcbr: snap.tcbr,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-slate-900">Attendance Calculator</h1>
      <CalculatorForm subjects={options} initialSubjectId={searchParams.subject} />
    </div>
  );
}
