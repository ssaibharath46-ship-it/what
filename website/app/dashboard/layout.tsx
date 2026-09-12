import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import LogoutButton from "@/components/LogoutButton";
import ExtensionAuthBridge from "@/components/ExtensionAuthBridge";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/calculator", label: "Calculator" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/history", label: "History" },
  { href: "/dashboard/profile", label: "Profile" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Belt-and-suspenders: middleware already protects /dashboard, but
  // Server Components should never assume that ran.
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <ExtensionAuthBridge />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="font-bold text-slate-900">KLU AttendIQ</span>
          <nav className="hidden gap-5 text-sm font-medium text-slate-600 sm:flex">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-emerald-600">
                {link.label}
              </Link>
            ))}
          </nav>
          <LogoutButton />
        </div>
        {/* Mobile nav */}
        <nav className="flex gap-4 overflow-x-auto px-6 pb-3 text-sm font-medium text-slate-600 sm:hidden">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="whitespace-nowrap hover:text-emerald-600">
              {link.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
