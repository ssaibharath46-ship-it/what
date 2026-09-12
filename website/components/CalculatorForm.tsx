"use client";

import { useMemo, useState } from "react";
import { runCalculator, type CalculatorResult } from "@/lib/calculations/attendance";

export interface CalculatorSubjectOption {
  id: string;
  courseName: string;
  conducted: number;
  attended: number;
  tcbr: number;
}

export default function CalculatorForm({
  subjects,
  initialSubjectId,
}: {
  subjects: CalculatorSubjectOption[];
  initialSubjectId?: string;
}) {
  const [subjectId, setSubjectId] = useState(
    initialSubjectId && subjects.some((s) => s.id === initialSubjectId)
      ? initialSubjectId
      : subjects[0]?.id ?? ""
  );
  const [target, setTarget] = useState(75);

  const subject = subjects.find((s) => s.id === subjectId);

  const result: CalculatorResult | null = useMemo(() => {
    if (!subject) return null;
    return runCalculator(
      { conducted: Math.max(0, subject.conducted - subject.tcbr), attended: Math.min(subject.attended, Math.max(0, subject.conducted - subject.tcbr)) },
      target
    );
  }, [subject, target]);

  if (subjects.length === 0) {
    return (
      <div className="card text-sm text-slate-500">
        No subjects synced yet — sync your attendance first.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
          <select
            className="input-field"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.courseName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Target percentage
          </label>
          <div className="flex gap-2">
            {[75, 80, 85].map((t) => (
              <button
                key={t}
                onClick={() => setTarget(t)}
                className={`rounded-lg px-3 py-2 text-sm font-medium border ${
                  target === t
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-slate-700 border-slate-300"
                }`}
              >
                {t}%
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={100}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              className="input-field w-20"
            />
          </div>
        </div>
      </div>

      {result && subject && (
        <div className="card">
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold text-slate-900">
              {result.currentPercentage}%
            </span>
            <span className="text-sm text-slate-500">
              {subject.attended} attended / {Math.max(0, subject.conducted - subject.tcbr)} effective conducted{subject.tcbr ? ` · ${subject.tcbr} TCBR excluded` : ""}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs text-slate-500">You can miss</p>
              <p className="text-2xl font-bold text-slate-900">
                {Number.isFinite(result.canMiss) ? result.canMiss : "∞"} classes
              </p>
              <p className="text-xs text-slate-500">and stay at or above {target}%</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs text-slate-500">You must attend</p>
              <p className="text-2xl font-bold text-slate-900">
                {Number.isFinite(result.needToAttend) ? result.needToAttend : "∞"} classes
              </p>
              <p className="text-xs text-slate-500">consecutively to reach {target}%</p>
            </div>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-sm font-medium text-slate-700">If you...</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-4 font-medium">Classes</th>
                    <th className="py-1 pr-4 font-medium">Attend all → %</th>
                    <th className="py-1 font-medium">Miss all → %</th>
                  </tr>
                </thead>
                <tbody>
                  {result.projections.map((p) => (
                    <tr key={p.classes} className="border-t border-slate-100">
                      <td className="py-1.5 pr-4">{p.classes}</td>
                      <td className="py-1.5 pr-4 text-emerald-600 font-medium">
                        {p.attendPercent}%
                      </td>
                      <td className="py-1.5 text-red-600 font-medium">{p.missPercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
