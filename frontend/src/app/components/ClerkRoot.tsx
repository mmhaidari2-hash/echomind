"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { useEffect } from "react";

import { setAuthTokenProvider } from "../lib/authToken";

function AuthTokenBridge() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setAuthTokenProvider(null);
      return;
    }
    setAuthTokenProvider(() => getToken());
    window.dispatchEvent(new Event("echomind-auth-ready"));
    return () => {
      setAuthTokenProvider(null);
      window.dispatchEvent(new Event("echomind-auth-cleared"));
    };
  }, [getToken, isLoaded, isSignedIn]);

  return null;
}

export default function ClerkRoot({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

  if (!publishableKey) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <AuthTokenBridge />
      {children}
    </ClerkProvider>
  );
}
