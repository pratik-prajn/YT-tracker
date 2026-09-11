"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { isConfigured } from "@/lib/supabase";
import { q } from "@/lib/queries";
import type { Channel } from "@/lib/types";

function NavLink({ href, active, onClick, children }: { href: string; active: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`block rounded-full px-4 py-2 text-[15px] transition-colors ${active ? "bg-cream text-tan-ink" : "text-cream/90 hover:bg-white/10"}`}
    >
      {children}
    </Link>
  );
}

function NavItems({ channels, onNavigate }: { channels: Channel[]; onNavigate?: () => void }) {
  const path = usePathname();
  const id = useSearchParams().get("id");
  const onChannelPage = path.startsWith("/channel") || path.startsWith("/competitors") || path.startsWith("/video");
  return (
    <>
      <nav className="space-y-1">
        <NavLink href="/" active={path === "/"} onClick={onNavigate}>Overview</NavLink>
      </nav>

      <p className="mt-7 px-4 text-sm text-cream/70">Your channels</p>
      <nav className="mt-2 space-y-1">
        {channels.map((c) => (
          <NavLink key={c.id} href={`/channel/?id=${c.id}`} active={onChannelPage && id === c.id} onClick={onNavigate}>
            <span className="flex items-center justify-between gap-2">
              <span className="truncate">{c.name}</span>
              {c.needs_reconnect && <span className="h-2 w-2 shrink-0 rounded-full bg-warn" title="Needs reconnect" />}
            </span>
          </NavLink>
        ))}
        {channels.length === 0 && <p className="px-4 text-sm text-cream/60">No channels yet. Add one in settings.</p>}
      </nav>

      <div className="mt-auto space-y-1 pt-8">
        <NavLink href="/settings/" active={path.startsWith("/settings")} onClick={onNavigate}>
          Channels, targets &amp; settings
        </NavLink>
        <div className="mt-5 flex items-center gap-3 px-4 text-xs text-cream/70">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-sm text-cream">P</span>
          <span className="truncate">Public dashboard</span>
        </div>
      </div>
    </>
  );
}

function Sidebar(props: { channels: Channel[] }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col bg-tan px-4 py-6 text-cream lg:flex">
      <Link href="/" className="display display-tight px-4 text-[34px] leading-none">Channels</Link>
      <p className="px-4 pt-1 text-sm text-cream/70">Four channels, one read.</p>
      <div className="mt-8 flex flex-1 flex-col"><NavItems {...props} /></div>
    </aside>
  );
}

function MobileBar(props: { channels: Channel[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sticky top-0 z-20 bg-tan text-cream lg:hidden">
      <div className="flex items-center justify-between px-5 py-3">
        <Link href="/" className="display display-tight text-[26px] leading-none">Channels</Link>
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu" className="rounded-full px-3 py-1.5 text-sm hover:bg-white/10">
          {open ? "Close" : "Menu"}
        </button>
      </div>
      {open && (
        <div className="flex flex-col border-t border-cream/20 px-4 pb-5 pt-3">
          <NavItems {...props} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function Unconfigured() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="max-w-md rounded-tile bg-tan-tint p-8">
        <h1 className="display text-3xl text-tan-ink">Connect Supabase</h1>
        <p className="mt-3 text-muted">Copy <code>.env.example</code> to <code>.env.local</code> and fill in <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then restart the dev server.</p>
      </div>
    </main>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const configured = isConfigured();

  useEffect(() => {
    const load = () => q.channels("own").then(setChannels).catch(() => setChannels([]));
    if (!configured) return;
    load();
    window.addEventListener("channels-changed", load);
    return () => window.removeEventListener("channels-changed", load);
  }, [configured]);

  if (!configured) return <Unconfigured />;

  const nav = { channels };
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Suspense fallback={<div className="hidden w-[248px] bg-tan lg:block" />}>
        <Sidebar {...nav} />
        <MobileBar {...nav} />
      </Suspense>
      <main className="min-w-0 flex-1 px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-[1120px]">
          <Suspense fallback={null}>{children}</Suspense>
        </div>
      </main>
    </div>
  );
}
