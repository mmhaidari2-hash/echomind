"use client";

import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export default function AuthStatus() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <span className="rounded-full border border-amber-400/30 px-2.5 py-1.5 text-[11px] font-semibold text-amber-200">
        Auth setup
      </span>
    );
  }

  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <button
            type="button"
            className="min-h-11 rounded-full border border-sky-500/30 bg-sky-400/10 px-3 text-xs font-semibold text-sky-100"
          >
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </>
  );
}
