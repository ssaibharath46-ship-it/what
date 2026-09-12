"use client";

import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

/**
 * Gives the locally installed AttendIQ extension the current AttendIQ access
 * token. It never receives KLU ERP credentials. The token is sent only to the
 * extension content-script through window.postMessage on the user's own tab.
 */
export default function ExtensionAuthBridge() {
  useEffect(() => {
    const supabase = createClient();

    const publish = async () => {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) return;
      window.postMessage({ source: "klu-attendiq-dashboard", access_token: accessToken }, window.location.origin);
    };

    publish();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        window.postMessage({ source: "klu-attendiq-dashboard", access_token: session.access_token }, window.location.origin);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return null;
}
