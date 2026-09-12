import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

/**
 * Supabase client for use in Server Components, Server Actions, and Route
 * Handlers. Reads/writes the user's auth session via cookies, so
 * `auth.getUser()` reflects the real logged-in user — never trust a
 * user_id passed from the browser instead of this.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // `setAll` was called from a Server Component. This can be
            // ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  );
}
