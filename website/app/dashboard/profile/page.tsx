import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, created_at")
    .eq("id", user.id)
    .single();

  return (
    <div className="max-w-md">
      <h1 className="mb-4 text-xl font-bold text-slate-900">Profile</h1>
      <div className="card space-y-3">
        <div>
          <p className="text-xs text-slate-500">Name</p>
          <p className="text-sm font-medium text-slate-900">{profile?.full_name ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Email</p>
          <p className="text-sm font-medium text-slate-900">{profile?.email ?? user.email}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Member since</p>
          <p className="text-sm font-medium text-slate-900">
            {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"}
          </p>
        </div>
      </div>
      <p className="mt-4 text-xs text-slate-400">
        This is your KLU AttendIQ account — separate from your KLU ERP login. We
        never store your ERP password.
      </p>
    </div>
  );
}
