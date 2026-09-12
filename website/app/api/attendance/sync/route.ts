import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculatePercentage } from "@/lib/calculations/attendance";

// The extension runs as its own origin (chrome-extension://<id>), so this
// route needs explicit CORS headers. Replace with your real published
// extension ID once you have one — during development "*" is easiest but
// should be tightened before publishing.
const ALLOWED_EXTENSION_ORIGINS = (process.env.EXTENSION_ORIGINS || process.env.EXTENSION_ORIGIN || "*")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function corsHeaders(origin?: string | null) {
  const allowAny = ALLOWED_EXTENSION_ORIGINS.includes("*");
  const allowed = allowAny || (origin ? ALLOWED_EXTENSION_ORIGINS.includes(origin) : false);
  return {
    "Access-Control-Allow-Origin": allowed ? (allowAny ? "*" : origin!) : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

// ----------------------------------------------------------------
// Types matching what the Chrome extension sends
// ----------------------------------------------------------------
const VALID_COMPONENTS = ["Lecture", "Practical", "Skill", "Tutorial", "Other"] as const;
type ComponentName = (typeof VALID_COMPONENTS)[number];

interface IncomingComponent {
  component: ComponentName;
  conducted: number;
  attended: number;
}

interface IncomingSubject {
  courseCode: string;
  courseName: string;
  ltps?: string;
  section?: string;
  conducted: number;
  attended: number;
  absent: number;
  tcbr?: number;
  // Optional Lecture/Practical/Skill breakdown. When present, its conducted/
  // attended sums MUST match the subject's combined totals above — the
  // combined fields stay the source of truth for attendance_snapshots,
  // components are stored alongside for the per-type breakdown UI.
  components?: IncomingComponent[];
}

interface SyncPayload {
  academicYear: string;
  semester: string;
  subjects: IncomingSubject[];
}

// Very small in-memory rate limiter (per server instance).
// For production, replace with a durable store (Supabase table or Upstash Redis).
const lastSyncByUser = new Map<string, number>();
const MIN_SYNC_INTERVAL_MS = 60 * 1000; // 1 sync per minute per user

function isRateLimited(userId: string): boolean {
  const last = lastSyncByUser.get(userId);
  const now = Date.now();
  if (last && now - last < MIN_SYNC_INTERVAL_MS) return true;
  lastSyncByUser.set(userId, now);
  return false;
}

// ----------------------------------------------------------------
// Basic payload validation — never trust the client
// ----------------------------------------------------------------
function validatePayload(body: unknown): { ok: true; data: SyncPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Empty payload" };
  const b = body as Record<string, unknown>;

  if (typeof b.academicYear !== "string" || !b.academicYear.trim()) {
    return { ok: false, error: "Missing academicYear" };
  }
  if (typeof b.semester !== "string" || !b.semester.trim()) {
    return { ok: false, error: "Missing semester" };
  }
  if (!Array.isArray(b.subjects) || b.subjects.length === 0) {
    return { ok: false, error: "subjects must be a non-empty array" };
  }
  if (b.subjects.length > 40) {
    return { ok: false, error: "Too many subjects in a single sync — looks malformed" };
  }

  for (const [i, s] of (b.subjects as unknown[]).entries()) {
    const subj = s as Record<string, unknown>;
    if (typeof subj.courseCode !== "string" || !subj.courseCode.trim()) {
      return { ok: false, error: `subjects[${i}].courseCode invalid` };
    }
    if (typeof subj.courseName !== "string" || !subj.courseName.trim()) {
      return { ok: false, error: `subjects[${i}].courseName invalid` };
    }
    if (
      typeof subj.conducted !== "number" ||
      typeof subj.attended !== "number" ||
      typeof subj.absent !== "number" ||
      subj.conducted < 0 ||
      subj.attended < 0 ||
      subj.absent < 0 ||
      !Number.isFinite(subj.conducted as number) ||
      !Number.isFinite(subj.attended as number) ||
      !Number.isFinite(subj.absent as number)
    ) {
      return { ok: false, error: `subjects[${i}] has invalid numeric fields` };
    }
    if (subj.attended > subj.conducted) {
      return { ok: false, error: `subjects[${i}]: attended cannot exceed conducted` };
    }
    // Attendance is defined by Conducted and Attended. Some ERP exports expose
    // an "Absent" value that is a derived/TCBR-adjusted metric and may not equal
    // Conducted - Attended. Normalize it instead of rejecting an otherwise valid sync.
    subj.absent = Math.max(0, (subj.conducted as number) - (subj.attended as number));

    // Optional component breakdown
    if (subj.components !== undefined) {
      if (!Array.isArray(subj.components)) {
        return { ok: false, error: `subjects[${i}].components must be an array` };
      }
      if (subj.components.length > 10) {
        return { ok: false, error: `subjects[${i}].components has too many entries` };
      }

      let compConducted = 0;
      let compAttended = 0;

      for (const [j, c] of (subj.components as unknown[]).entries()) {
        const comp = c as Record<string, unknown>;
        if (
          typeof comp.component !== "string" ||
          !(VALID_COMPONENTS as readonly string[]).includes(comp.component)
        ) {
          return {
            ok: false,
            error: `subjects[${i}].components[${j}].component must be one of ${VALID_COMPONENTS.join(", ")}`,
          };
        }
        if (
          typeof comp.conducted !== "number" ||
          typeof comp.attended !== "number" ||
          comp.conducted < 0 ||
          comp.attended < 0
        ) {
          return { ok: false, error: `subjects[${i}].components[${j}] has invalid numeric fields` };
        }
        if (comp.attended > comp.conducted) {
          return {
            ok: false,
            error: `subjects[${i}].components[${j}]: attended cannot exceed conducted`,
          };
        }
        compConducted += comp.conducted as number;
        compAttended += comp.attended as number;
      }

      // Components must sum to the subject's combined totals (small drift allowed)
      if (
        subj.components.length > 0 &&
        (Math.abs(compConducted - (subj.conducted as number)) > 1 ||
          Math.abs(compAttended - (subj.attended as number)) > 1)
      ) {
        return {
          ok: false,
          error: `subjects[${i}].components totals do not match the subject's combined conducted/attended`,
        };
      }
    }
  }

  return { ok: true, data: b as unknown as SyncPayload };
}

export async function POST(req: NextRequest) {
  const response = await handlePost(req);
  // Attach CORS headers to whatever status/body handlePost produced,
  // so every exit path (success, 401, 400, 429, 500) is covered in one place.
  Object.entries(corsHeaders(req.headers.get("origin"))).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  // 1. Authenticate the caller via their Supabase session (our own auth, not KLU's)
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }
  const accessToken = authHeader.replace("Bearer ", "");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!, // server-side only, never exposed to extension/client
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }

  // 2. Rate limit
  if (isRateLimited(user.id)) {
    return NextResponse.json(
      { error: "Please wait before syncing again." },
      { status: 429 }
    );
  }

  // 3. Parse + validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validation = validatePayload(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const payload = validation.data;

  // 4. Make sure the application profile exists.
  // Older/existing Auth users may have been created before the profile trigger
  // was installed, so the FK on sync_sessions can otherwise fail.
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? "",
        full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
      },
      { onConflict: "id" }
    );

  if (profileError) {
    console.error("[attendance/sync] profile upsert failed", profileError);
    return NextResponse.json(
      { error: "Failed to prepare student profile", detail: profileError.message },
      { status: 500 }
    );
  }

  // 5. Create sync session
  const { data: session, error: sessionError } = await supabase
    .from("sync_sessions")
    .insert({
      user_id: user.id,
      academic_year: payload.academicYear,
      semester: payload.semester,
      subjects_count: payload.subjects.length,
      status: "success",
    })
    .select()
    .single();

  if (sessionError || !session) {
    console.error("[attendance/sync] sync session insert failed", sessionError);
    return NextResponse.json(
      { error: "Failed to create sync session", detail: sessionError?.message ?? "No session row returned" },
      { status: 500 }
    );
  }

  // 6. Upsert subjects + insert fresh attendance snapshots
  const results = [];
  for (const subj of payload.subjects) {
    // Re-derive percentage server-side — never trust a client-supplied percentage
    // KLU's TCBR (Total Classes Before Registration) classes are excluded
    // from the attendance denominator. Keep raw ERP counts in the snapshot,
    // but calculate the displayed percentage from the effective denominator.
    const effectiveConducted = Math.max(0, subj.conducted - (subj.tcbr ?? 0));
    const effectiveAttended = Math.min(subj.attended, effectiveConducted);
    const percentage = calculatePercentage({
      conducted: effectiveConducted,
      attended: effectiveAttended,
    });

    const { data: subjectRow, error: subjectError } = await supabase
      .from("subjects")
      .upsert(
        {
          user_id: user.id,
          course_code: subj.courseCode,
          course_name: subj.courseName,
          ltps: subj.ltps ?? null,
          section: subj.section ?? null,
          academic_year: payload.academicYear,
          semester: payload.semester,
        },
        { onConflict: "user_id,course_code,academic_year,semester" }
      )
      .select()
      .single();

    if (subjectError || !subjectRow) {
      results.push({ courseCode: subj.courseCode, ok: false, error: subjectError?.message });
      continue;
    }

    const { error: snapshotError } = await supabase.from("attendance_snapshots").insert({
      user_id: user.id,
      subject_id: subjectRow.id,
      sync_session_id: session.id,
      total_conducted: subj.conducted,
      total_attended: subj.attended,
      total_absent: subj.absent,
      tcbr: subj.tcbr ?? 0,
      percentage,
    });

    if (snapshotError) {
      results.push({ courseCode: subj.courseCode, ok: false, error: snapshotError.message });
      continue;
    }

    // Insert the Lecture/Practical/Skill breakdown, if the extension sent one.
    // These ride on the same sync_session_id, so history can join them back
    // to the combined snapshot above.
    if (subj.components && subj.components.length > 0) {
      const componentRows = subj.components.map((c) => ({
        user_id: user.id,
        subject_id: subjectRow.id,
        sync_session_id: session.id,
        component: c.component,
        conducted: c.conducted,
        attended: c.attended,
      }));

      const { error: componentsError } = await supabase
        .from("attendance_components")
        .insert(componentRows);

      results.push({
        courseCode: subj.courseCode,
        ok: !componentsError,
        error: componentsError?.message,
      });
      continue;
    }

    results.push({ courseCode: subj.courseCode, ok: true });
  }

  const failures = results.filter((r) => !r.ok);
  if (failures.length > 0) {
    await supabase
      .from("sync_sessions")
      .update({ status: failures.length === results.length ? "failed" : "partial" })
      .eq("id", session.id);
  }

  return NextResponse.json({
    syncSessionId: session.id,
    subjectsProcessed: results.filter((r) => r.ok).length,
    subjectsFailed: failures.length,
    failures,
  });
}
