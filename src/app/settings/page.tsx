"use client";
import { useEffect, useState } from "react";
import { useAsync, Loading, ErrorBox } from "@/components/Async";
import { Section } from "@/components/Section";
import { q } from "@/lib/queries";
import { currentPeriod, monthLabel, fmtFull } from "@/lib/format";
import type { Channel, ChannelLatest, Target } from "@/lib/types";

const METRICS = [
  { key: "views", label: "Views" },
  { key: "subs", label: "New subscribers" },
  { key: "watch_time", label: "Watch time (minutes)" },
] as const;

function nextPeriod(p: string) {
  const d = new Date(`${p}-01T00:00:00`); d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 7);
}

const inputCls = "w-full rounded-full border border-line px-4 py-2 outline-none focus:border-tan sm:w-80";

// ---------- Your channels ----------
function OwnChannels({ channels, refresh }: { channels: Channel[]; refresh: () => void }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    if (!input.trim()) return;
    setBusy(true); setErr(null);
    try { await q.addChannel("own", input); setInput(""); refresh(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Section title="Your channels" aside={`${channels.length} tracked`}>
      <p className="mb-4 max-w-2xl text-muted">
        Paste a channel link to start tracking its public numbers (views, subscribers, uploads). For private metrics — watch time, retention, CTR — run <code>npm run connect-channel</code> once with that channel's owner signed in.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="youtube.com/@yourchannel" className={inputCls} />
        <button onClick={add} disabled={busy} className="rounded-full bg-tan px-5 py-2 text-cream hover:bg-tan-deep disabled:opacity-50">Add channel</button>
      </div>
      {err && <p className="mt-2 text-sm text-bad">{err}</p>}
      <ul className="mt-5 divide-y divide-line">
        {channels.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="min-w-0">
              <p className="display text-[20px] text-tan-ink">{c.name}</p>
              <p className="text-sm text-muted">
                {c.handle ?? c.yt_channel_id ?? ""}
                {!c.yt_channel_id && " · resolving on next sync"}
                {c.needs_reconnect && <span className="ml-2 rounded-full bg-warn/15 px-2 py-0.5 text-xs text-tan-ink">private analytics paused — reconnect</span>}
              </p>
            </div>
            <button
              onClick={async () => { if (confirm(`Stop tracking ${c.name}? Its history will be deleted.`)) { await q.removeChannel(c.id); refresh(); } }}
              className="text-sm text-muted hover:text-bad"
            >
              Remove
            </button>
          </li>
        ))}
        {channels.length === 0 && <li className="py-3 text-muted">No channels yet. Paste the first link above.</li>}
      </ul>
    </Section>
  );
}

// ---------- Targets ----------
function Targets({ channels }: { channels: Channel[] }) {
  const [period, setPeriod] = useState(currentPeriod());
  const [targets, setTargets] = useState<Target[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  useEffect(() => { q.targets(period).then((t) => { setTargets(t); setDraft({}); }).catch(() => { setTargets([]); setDraft({}); }); }, [period]);

  const value = (cid: string, metric: string) => draft[`${cid}:${metric}`] ?? String(targets.find((t) => t.channel_id === cid && t.metric === metric)?.target_value ?? "");

  async function save(cid: string, metric: string) {
    const raw = draft[`${cid}:${metric}`];
    if (raw === undefined) return;
    const n = Number(raw.replace(/[^\d]/g, ""));
    if (!n) return;
    await q.upsertTarget({ channel_id: cid, period, metric, target_value: n, set_by: email });
    setTargets(await q.targets(period));
    setSaved(`${cid}:${metric}`); setTimeout(() => setSaved(null), 1500);
  }

  return (
    <Section title="Monthly targets" aside={
      <span className="flex items-center gap-3">
        <button onClick={() => setPeriod(currentPeriod())} className={period === currentPeriod() ? "text-tan-deep" : "hover:text-ink"}>{monthLabel(currentPeriod())}</button>
        <button onClick={() => setPeriod(nextPeriod(currentPeriod()))} className={period !== currentPeriod() ? "text-tan-deep" : "hover:text-ink"}>{monthLabel(nextPeriod(currentPeriod()))}</button>
      </span>
    }>
      <p className="mb-4 text-muted">Type a number and press Enter or click away. Pace on every channel page is computed against these.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[14px]">
          <thead className="border-b border-line text-sm text-muted">
            <tr><th className="py-2 text-left font-normal">Channel</th>{METRICS.map((m) => <th key={m.key} className="py-2 text-left font-normal">{m.label}</th>)}</tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.id} className="border-b border-line/60">
                <td className="display py-3 pr-4 text-[20px] text-tan-ink">{c.name}</td>
                {METRICS.map((m) => {
                  const k = `${c.id}:${m.key}`;
                  return (
                    <td key={m.key} className="py-2 pr-4">
                      <input
                        inputMode="numeric"
                        value={value(c.id, m.key)}
                        onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                        onBlur={() => save(c.id, m.key)}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        placeholder="—"
                        className={`tnum w-36 rounded-full border px-4 py-1.5 outline-none transition-colors focus:border-tan ${saved === k ? "border-ok bg-ok/10" : "border-line"}`}
                      />
                      {value(c.id, m.key) && <span className="ml-2 text-xs text-muted">{fmtFull(Number(value(c.id, m.key).replace(/[^\d]/g, "")))}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ---------- Competitors ----------
function Competitors({ channels }: { channels: Channel[] }) {
  const [own, setOwn] = useState(channels[0]?.id ?? "");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const list = useAsync(() => (own ? q.competitorsOf(own) : Promise.resolve([] as ChannelLatest[])), [own, tick]);

  useEffect(() => { if (!own && channels[0]) setOwn(channels[0].id); }, [channels, own]);

  async function add() {
    if (!input.trim() || !own) return;
    setBusy(true); setErr(null);
    try { await q.addChannel("competitor", input, own); setInput(""); setTick((t) => t + 1); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Section title="Competitors" aside="tracked per channel">
      <p className="mb-4 max-w-2xl text-muted">Each of your channels has its own competitor set. Public numbers only — retention and CTR are never visible for channels you don't own.</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <select value={own} onChange={(e) => setOwn(e.target.value)} className="rounded-full border border-line px-4 py-2">
          {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="youtube.com/@competitor" className={inputCls} />
        <button onClick={add} disabled={busy || !own} className="rounded-full bg-tan px-5 py-2 text-cream hover:bg-tan-deep disabled:opacity-50">Add competitor</button>
      </div>
      {err && <p className="mt-2 text-sm text-bad">{err}</p>}
      <p className="mt-2 text-sm text-muted">Details and numbers fill in on the next public sync (within six hours).</p>
      <div className="mt-5">
        {list.loading && <Loading />}
        {list.error && <ErrorBox message={list.error} />}
        {list.data && (list.data.length ? (
          <ul className="divide-y divide-line">
            {list.data.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 truncate">{c.name} <span className="text-muted">{c.handle}</span>{!c.yt_channel_id && <span className="ml-2 rounded-full bg-tan-tint px-2 py-0.5 text-xs text-tan-ink">resolving…</span>}</span>
                <button onClick={async () => { await q.removeCompetitor(own, c.id); setTick((t) => t + 1); }} className="shrink-0 text-sm text-muted hover:text-bad">Remove</button>
              </li>
            ))}
          </ul>
        ) : <p className="text-muted">None yet for this channel.</p>)}
      </div>
    </Section>
  );
}

// ---------- Topics ----------
function Topics() {
  const [name, setName] = useState("");
  const [tick, setTick] = useState(0);
  const topics = useAsync(() => q.topics(), [tick]);
  return (
    <Section title="Topic taxonomy" aside="used by the nightly classifier">
      <div className="flex flex-wrap gap-2">
        {topics.data?.map((t) => <span key={t.id} className="rounded-full bg-tan-tint px-3 py-1 text-sm text-tan-ink">{t.name}</span>)}
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New topic" className="w-full rounded-full border border-line px-4 py-2 outline-none focus:border-tan sm:w-64" />
        <button onClick={async () => { if (name.trim()) { await q.addTopic(name.trim()); setName(""); setTick((t) => t + 1); } }} className="rounded-full border border-tan px-5 py-2 text-tan-deep hover:bg-tan-tint">Add topic</button>
      </div>
      <p className="mt-2 text-sm text-muted">New topics apply to videos tagged from tomorrow. To re-tag history, clear the video_topics table and re-run the classify job.</p>
    </Section>
  );
}

export default function Settings() {
  return (
    <>
      <header>
        <h1 className="display display-tight text-[40px] text-ink sm:text-[56px]">Channels, targets &amp; settings</h1>
        <p className="mt-2 text-muted">Dashboard settings are managed by the owner and are not available to public viewers.</p>
      </header>
      <Section title="Public dashboard" aside="read-only">
        <p className="text-muted">Channels, targets, competitors, and topics are synced by the owner through the backend. Anonymous visitors can view dashboard data but cannot change it.</p>
      </Section>
    </>
  );
}
