import { NextRequest, NextResponse } from "next/server";

// Update feed for LEGACY app versions (v1.2.x - v1.4.x).
// Those clients query the generic electron-updater feed:
//   GET {ADMIN_URL}/api/release/electron/latest.yml?noCache=...
//   GET {ADMIN_URL}/api/release/electron/<asset-name> (installer download)
// Releases now live in the public GitHub repo:
//   https://github.com/Itsnishant4/ayuvitacrm/releases
// This route bridges old clients to GitHub. New versions (>=1.5.0)
// never hit this route — they use the GitHub provider directly.

const REPO = "Itsnishant4/ayuvitacrm";
const GH_API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const FALLBACK_DOWNLOAD = `https://github.com/${REPO}/releases/latest/download`;

const RELEASE_CACHE_TTL_MS = 5 * 60 * 1000;

type GitHubAsset = {
  name: string;
  browser_download_url: string;
};

type GitHubRelease = {
  tag_name?: string;
  assets?: GitHubAsset[];
};

type Globals = typeof globalThis & {
  __crmReleaseCache?: { release: GitHubRelease; at: number } | null;
};

async function getLatestRelease(): Promise<GitHubRelease | null> {
  const g = globalThis as Globals;
  const cached = g.__crmReleaseCache;
  if (cached && Date.now() - cached.at < RELEASE_CACHE_TTL_MS) {
    return cached.release;
  }

  try {
    const res = await fetch(GH_API_LATEST, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "ayuvitacrm-admin-release-bridge",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[release-bridge] GitHub releases/latest failed: ${res.status}`);
      return cached ? cached.release : null;
    }
    const release = (await res.json()) as GitHubRelease;
    g.__crmReleaseCache = { release, at: Date.now() };
    return release;
  } catch (e) {
    console.error("[release-bridge] GitHub fetch error:", e);
    return cached ? cached.release : null;
  }
}

function findAsset(release: GitHubRelease | null, fileName: string): GitHubAsset | null {
  if (!release?.assets) return null;
  const target = fileName.toLowerCase();
  return (
    release.assets.find((a) => a.name.toLowerCase() === target) ?? null
  );
}

const TEXT_EXT = /\.(yml|yaml)$/i;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ file?: string[] }> }
) {
  const params = await ctx.params;
  const segments = params.file ?? [];
  const fileName = (segments.length ? segments[segments.length - 1] : "latest.yml").trim();
  if (!fileName) {
    return NextResponse.json({ error: "Missing file name" }, { status: 400 });
  }
  // The feed root (/api/release/electron/) is the channel "latest.yml"
  if (fileName.toLowerCase().includes("/")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const release = await getLatestRelease();
  const asset = findAsset(release, fileName);

  if (!asset) {
    return NextResponse.json(
      { error: `Asset ${fileName} not found in the latest release` },
      { status: 404 }
    );
  }

  if (TEXT_EXT.test(fileName)) {
    // latest.yml / latest-mac.yml — stream the raw content so old
    // generic-provider clients keep working.
    try {
      const res = await fetch(asset.browser_download_url, { cache: "no-store" });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Failed to fetch ${fileName} from GitHub: ${res.status}` },
          { status: 502 }
        );
      }
      const body = await res.text();
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store, must-revalidate",
        },
      });
    } catch (e) {
      console.error("[release-bridge] asset fetch error:", e);
      return NextResponse.json(
        { error: "Upstream fetch failed" },
        { status: 502 }
      );
    }
  }

  // Installer / blockmap — the old client resolves these URLs relative to
  // the feed base, so a 302 to the GitHub asset is enough.
  return NextResponse.redirect(asset.browser_download_url, 302);
}

export async function HEAD(
  req: NextRequest,
  ctx: { params: Promise<{ file?: string[] }> }
) {
  const res = await GET(req, ctx);
  return new NextResponse(null, { status: res.status, headers: res.headers });
}
