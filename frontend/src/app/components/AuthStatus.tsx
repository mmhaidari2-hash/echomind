"use client";

import { Show, SignInButton, UserButton } from "@clerk/react";

export default function AuthStatus() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <span className="echomind-chip-glass rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-gold">
        Auth setup
      </span>
    );
  }

  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button
            type="button"
            className="echomind-send-gradient min-h-11 rounded-full px-3 text-xs font-semibold"
          >
            Sign in
          </button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </>
  );
}
