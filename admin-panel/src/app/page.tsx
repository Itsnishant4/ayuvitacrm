import React from "react"
import { Github, Activity, ShieldCheck, Rocket, ExternalLink } from "lucide-react"

const REPO_URL = "https://github.com/Itsnishant4/ayuvitacrm/releases"

export default async function AdminDashboard() {
  let latest = null;
  try {
    const res = await fetch("https://api.github.com/repos/Itsnishant4/ayuvitacrm/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 300 },
    });
    latest = await res.json();
  } catch {
    latest = null;
  }

  const cards = [
    { label: "Update Channel", value: "GitHub Releases", icon: <Github className="w-6 h-6 text-blue-600" />, color: "bg-blue-100" },
    { label: "Latest Version", value: latest ? `v${latest.tag_name}` : "N/A", icon: <ShieldCheck className="w-6 h-6 text-emerald-600" />, color: "bg-emerald-100" },
    { label: "Live Status", value: "Feed Active", icon: <Activity className="w-6 h-6 text-violet-600" />, color: "bg-violet-100" },
    { label: "Published", value: latest?.published_at ? new Date(latest.published_at).toLocaleDateString() : "N/A", icon: <Rocket className="w-6 h-6 text-amber-600" />, color: "bg-amber-100" },
  ];

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Admin Overview</h1>
        <p className="text-slate-500 text-sm mt-1">
          Updates are published by GitHub Actions on <code className="text-[12px]">v*</code> tags — this panel monitors the feed.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2 ${card.color} rounded-lg group-hover:scale-110 transition-transform`}>
                {card.icon}
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Live</span>
            </div>
            <p className="text-sm font-medium text-slate-500">{card.label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="font-bold text-slate-900 mb-3">Release Checklist</h2>
        <ol className="text-sm text-slate-600 list-decimal list-inside space-y-1">
          <li>Bump <code className="text-[12px]">package.json</code> version</li>
          <li>Commit and tag: <code className="text-[12px]">git tag v1.5.2 && git push origin v1.5.2</code></li>
          <li>Watch <span className="font-semibold">Release</span> workflow on GitHub Actions</li>
          <li>Clients pick the banner on the next app start (checks on boot + every 6h)</li>
        </ol>
        <a href={REPO_URL} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 mt-4 text-blue-600 hover:text-blue-700 text-sm font-bold">
          <Github className="w-4 h-4" /> Open GitHub Releases <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}
