import { Resvg } from "@cf-wasm/resvg";
import type { Context } from "hono";

import type { AppBindings } from "../../types";
import { escapeHtml } from "../../services/featured-domain";

interface OgDomainRow {
  domain: string;
}

let fontPromise: Promise<[Uint8Array, Uint8Array]> | null = null;

async function loadFont(response: Response): Promise<Uint8Array> {
  if (!response.ok) throw new Error(`OG font asset unavailable (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

async function loadOgFonts(c: Context<AppBindings>): Promise<[Uint8Array, Uint8Array]> {
  if (!fontPromise) {
    const origin = new URL(c.req.url).origin;
    fontPromise = Promise.all([
      c.env.ASSETS.fetch(new Request(`${origin}/fonts/CormorantGaramond-Regular.ttf`)).then(loadFont),
      c.env.ASSETS.fetch(new Request(`${origin}/fonts/NotoSansSC-WanMi.ttf`)).then(loadFont),
    ]).catch((error: unknown) => {
      fontPromise = null;
      throw error;
    });
  }
  return fontPromise;
}

function domainFontSize(domain: string): number {
  const length = Array.from(domain).length;
  if (length <= 8) return 184;
  if (length <= 12) return 146;
  if (length <= 18) return 112;
  return Math.max(70, Math.floor(1_020 / (length * .58)));
}

export async function renderFeaturedDomainOg(c: Context<AppBindings>): Promise<Response> {
  let name: string;
  try {
    name = decodeURIComponent(c.req.param("domain") ?? "").trim().toLowerCase();
  } catch {
    return c.json({ success: false, data: null, error: { code: "OG_NOT_FOUND", message: "精品域名不存在" } }, 404);
  }
  if (!/^[a-z0-9.-]{3,253}$/.test(name)) {
    return c.json({ success: false, data: null, error: { code: "OG_NOT_FOUND", message: "精品域名不存在" } }, 404);
  }

  const domain = await c.env.DB.prepare(
    `SELECT full_domain AS domain FROM domains
     WHERE normalized_domain = ? AND is_listed = 1 AND is_featured = 1 LIMIT 1`,
  ).bind(name).first<OgDomainRow>();
  if (!domain) {
    return c.json({ success: false, data: null, error: { code: "OG_NOT_FOUND", message: "精品域名不存在" } }, 404);
  }

  const [instrumentSerif, notoSansSc] = await loadOgFonts(c);
  const fontSize = domainFontSize(domain.domain);
  const safeDomain = escapeHtml(domain.domain);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#133429"/>
    <rect x="42" y="42" width="1116" height="546" rx="22" fill="none" stroke="#2d4f40" stroke-width="2"/>
    <circle cx="82" cy="82" r="4" fill="#c89848"/>
    <text x="600" y="326" text-anchor="middle" dominant-baseline="middle" fill="#d8b66f" font-family="Cormorant Garamond" font-size="${fontSize}" font-weight="400" letter-spacing="-2">${safeDomain}</text>
    <line x1="516" y1="444" x2="684" y2="444" stroke="#3d6152" stroke-width="2"/>
    <text x="600" y="508" text-anchor="middle" fill="#cfd9d3" font-family="Noto Sans SC" font-size="24" font-weight="600" letter-spacing="4">玩米 · 精选域名资产</text>
  </svg>`;
  const resvg = await Resvg.async(svg, {
    fitTo: { mode: "width", value: 1200 },
    font: {
      fontBuffers: [instrumentSerif, notoSansSc],
      defaultFontFamily: "Noto Sans SC",
      serifFamily: "Cormorant Garamond",
      sansSerifFamily: "Noto Sans SC",
    },
  });
  const png = resvg.render().asPng();
  const body = new Uint8Array(png.byteLength);
  body.set(png);

  return new Response(body.buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
      "Content-Length": String(png.byteLength),
    },
  });
}
