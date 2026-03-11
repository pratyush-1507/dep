import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * proxy.ts — Auth session refresh & guard utility.
 * Use this instead of middleware.ts.
 *
 * Call `getAuthUser()` in any server component or API route
 * to refresh the session and get the authenticated user.
 *
 * Call `requireAuth()` to redirect unauthenticated users to /login.
 */

export async function getAuthUser() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore errors from Server Components
          }
        },
      },
    }
  );

  // Refresh the session — this is the key operation that middleware would do
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return { user, error, supabase };
}

export async function requireAuth() {
  const { user, supabase } = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  return { user, supabase };
}
