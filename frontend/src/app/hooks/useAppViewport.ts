"use client";

import { useLayoutEffect } from "react";

/**
 * Locks the app to the visible viewport (including iOS keyboard / toolbar).
 * Sets --app-height and --app-top so the shell can fill the screen without
 * document scrolling.
 *
 * Round-2 fix: the visualViewport "scroll" event used to rewrite BOTH
 * --app-height and --app-top on every frame while the keyboard animates
 * (and while the visual viewport moves at all). Rewriting the app height
 * that often reflows the whole flex column every frame — the whole app
 * jumps while the keyboard opens or closes. The height only ever changes
 * on a resize, so "scroll" now updates only --app-top (the offset);
 * --app-height is set on resize / orientationchange only.
 */
export function useAppViewport() {
  useLayoutEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      const viewport = window.visualViewport;
      const height = Math.round(viewport?.height ?? window.innerHeight);
      const top = Math.round(viewport?.offsetTop ?? 0);
      root.style.setProperty("--app-height", `${height}px`);
      root.style.setProperty("--app-top", `${top}px`);
    };

    const applyTopOnly = () => {
      const viewport = window.visualViewport;
      const top = Math.round(viewport?.offsetTop ?? 0);
      root.style.setProperty("--app-top", `${top}px`);
    };

    apply();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", apply);
    viewport?.addEventListener("scroll", applyTopOnly);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);

    return () => {
      viewport?.removeEventListener("resize", apply);
      viewport?.removeEventListener("scroll", applyTopOnly);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);
}
