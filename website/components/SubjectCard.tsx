import Link from "next/link";
import { classifyRisk } from "@/lib/calculations/attendance";

const RISK_STYLES: Record<string, string> = {
  excellent: "bg-emerald-100 text-emerald-800",
  good: "bg-green-100 text-green-800",
  safe: "bg-yellow-100 text-yellow-800",
  warning: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

export interface SubjectCardProps {
  subjectId: string;
  courseName: string;
  courseCode: string;
  conducted: number;
  attended: number;
  absent: number;
  percentage: number;
}

export default function SubjectCard({
  subjectId,
  courseName,
  courseCode,
  conducted,
  attended,
  absent,
  percentage,
}: SubjectCardProps) {
  const risk = classifyRisk(percentage);

  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900 text-sm leading-snug">
            {courseName}
          </h3>
          <p className="text-xs text-slate-500">{courseCode}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${RISK_STYLES[risk.level]}`}
        >
          {risk.emoji} {risk.label}
        </span>
      </div>

      <div className="text-3xl font-bold text-slate-900">{percentage}%</div>

      <div className="flex justify-between text-xs text-slate-500">
        <span>Conducted: {conducted}</span>
        <span>Attended: {attended}</span>
        <span>Absent: {absent}</span>
      </div>

      <Link
        href={`/dashboard/calculator?subject=${subjectId}`}
        className="mt-1 text-xs font-medium text-emerald-600"
      >
        Open calculator →
      </Link>
    </div>
  );
}
