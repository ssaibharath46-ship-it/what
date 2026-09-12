/**
 * KLU AttendIQ — Attendance Calculation Engine
 * Pure functions, no side effects. Safe to unit test directly.
 */

export type RiskLevel = "excellent" | "good" | "safe" | "warning" | "critical";

export interface AttendanceInput {
  conducted: number;
  attended: number;
}

export interface RiskResult {
  level: RiskLevel;
  label: string;
  emoji: string;
}

// ----------------------------------------------------------------
// Basic percentage
// ----------------------------------------------------------------
export function calculatePercentage({ conducted, attended }: AttendanceInput): number {
  if (conducted <= 0) return 0;
  const pct = (attended / conducted) * 100;
  return Math.round(pct * 100) / 100; // 2 decimal places
}

// ----------------------------------------------------------------
// Risk classification
// ----------------------------------------------------------------
export function classifyRisk(percentage: number): RiskResult {
  if (percentage >= 90) return { level: "excellent", label: "Excellent", emoji: "🟢" };
  if (percentage >= 85) return { level: "good", label: "Good", emoji: "🟢" };
  if (percentage >= 75) return { level: "safe", label: "Safe Zone", emoji: "🟡" };
  if (percentage >= 65) return { level: "warning", label: "Warning", emoji: "🟠" };
  return { level: "critical", label: "Critical", emoji: "🔴" };
}

// ----------------------------------------------------------------
// Future projection if student ATTENDS the next N classes
// ----------------------------------------------------------------
export function projectAttending(
  input: AttendanceInput,
  futureClasses: number
): number {
  const { conducted, attended } = input;
  return calculatePercentage({
    conducted: conducted + futureClasses,
    attended: attended + futureClasses,
  });
}

// ----------------------------------------------------------------
// Future projection if student MISSES the next N classes
// ----------------------------------------------------------------
export function projectMissing(
  input: AttendanceInput,
  futureClasses: number
): number {
  const { conducted, attended } = input;
  return calculatePercentage({
    conducted: conducted + futureClasses,
    attended, // attended stays the same
  });
}

// ----------------------------------------------------------------
// How many classes can the student miss and stay at/above target?
// Solves: attended / (conducted + x) >= target/100  for max integer x
// ----------------------------------------------------------------
export function classesCanMiss(input: AttendanceInput, targetPercent: number): number {
  const { conducted, attended } = input;
  if (targetPercent <= 0) return Infinity as unknown as number;

  const currentPct = calculatePercentage(input);
  if (currentPct < targetPercent) return 0; // already below target, can't afford to miss any

  // attended / (conducted + x) >= target/100
  // x <= (attended * 100 / target) - conducted
  const maxX = Math.floor((attended * 100) / targetPercent - conducted);
  return Math.max(0, maxX);
}

// ----------------------------------------------------------------
// How many CONSECUTIVE classes must the student attend to reach target?
// Solves: (attended + x) / (conducted + x) >= target/100  for min integer x
// ----------------------------------------------------------------
export function classesNeededToReachTarget(
  input: AttendanceInput,
  targetPercent: number
): number {
  const { conducted, attended } = input;
  const currentPct = calculatePercentage(input);
  if (currentPct >= targetPercent) return 0;

  // (attended + x) / (conducted + x) >= target/100
  // 100*(attended + x) >= target*(conducted + x)
  // 100*attended + 100x >= target*conducted + target*x
  // x*(100 - target) >= target*conducted - 100*attended
  // x >= (target*conducted - 100*attended) / (100 - target)
  if (targetPercent >= 100) return Infinity as unknown as number; // can never hit 100% once a class is missed

  const numerator = targetPercent * conducted - 100 * attended;
  const denominator = 100 - targetPercent;
  const minX = Math.ceil(numerator / denominator);
  return Math.max(0, minX);
}

// ----------------------------------------------------------------
// Full calculator bundle — what the dashboard calls for one subject
// ----------------------------------------------------------------
export interface CalculatorResult {
  currentPercentage: number;
  risk: RiskResult;
  canMiss: number;
  needToAttend: number;
  projections: { classes: number; attendPercent: number; missPercent: number }[];
}

export function runCalculator(
  input: AttendanceInput,
  targetPercent: number,
  projectionSteps: number[] = [1, 5, 10]
): CalculatorResult {
  const currentPercentage = calculatePercentage(input);
  return {
    currentPercentage,
    risk: classifyRisk(currentPercentage),
    canMiss: classesCanMiss(input, targetPercent),
    needToAttend: classesNeededToReachTarget(input, targetPercent),
    projections: projectionSteps.map((n) => ({
      classes: n,
      attendPercent: projectAttending(input, n),
      missPercent: projectMissing(input, n),
    })),
  };
}

// ----------------------------------------------------------------
// Trend detection between two snapshots (e.g. last sync vs this sync)
// ----------------------------------------------------------------
export type TrendDirection = "up" | "down" | "flat";

export function detectTrend(previousPercent: number, currentPercent: number): {
  direction: TrendDirection;
  delta: number;
} {
  const delta = Math.round((currentPercent - previousPercent) * 100) / 100;
  if (Math.abs(delta) < 0.01) return { direction: "flat", delta: 0 };
  return { direction: delta > 0 ? "up" : "down", delta };
}
