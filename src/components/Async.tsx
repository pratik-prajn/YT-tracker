"use client";
import { useEffect, useState, type ReactNode } from "react";

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "The request could not be completed.";
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let live = true;
    set({ loading: true });
    fn().then((data) => live && set({ data, loading: false })).catch((e: unknown) => live && set({ error: errorMessage(e), loading: false }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function Loading({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 rounded-full bg-tan-tint" style={{ width: `${90 - i * 18}%` }} />
      ))}
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-tile border border-dashed border-line px-6 py-10 text-center">
      <p className="display text-2xl text-tan-ink">{title}</p>
      {hint && <p className="mt-2 text-muted max-w-md mx-auto">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-tile bg-tan-tint px-5 py-4 text-tan-ink">
      <p className="font-medium">Couldn't load this section.</p>
      <p className="mt-1 text-sm text-muted break-words">{message}</p>
    </div>
  );
}
