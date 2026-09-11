import type { ReactNode } from "react";

export function Section({ title, aside, children, className = "" }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mt-12 ${className}`}>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="display text-[26px] text-ink">{title}</h2>
        {aside && <div className="text-sm text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
