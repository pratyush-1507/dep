"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseRef = useRef<any>(null);

  useEffect(() => {
    // Dynamic import ensures this code NEVER runs during SSR / build-time prerendering
    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient();
      if (!supabase) {
        // Env vars missing (e.g. build environment) — treat as unauthenticated
        setLoading(false);
        return;
      }
      supabaseRef.current = supabase;

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(
        (_event: unknown, session: { user: User } | null) => {
          setUser(session?.user ?? null);
          setLoading(false);
        }
      );

      // Cleanup on unmount
      return () => subscription.unsubscribe();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    if (supabaseRef.current) {
      await supabaseRef.current.auth.signOut();
    }
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
