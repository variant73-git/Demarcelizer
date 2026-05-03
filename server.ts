import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { chromium, type Browser } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

const VERBATIM_PROMPT = `Analyze the design system of this codebase with the goal of creating a DESIGN.md file in the project root and giving the user a file for easy copy & pasting.

Reference material:

  Overview : https://stitch.withgoogle.com/docs/design-md/overview/

  Format   : https://stitch.withgoogle.com/docs/design-md/format/

  Spec     : https://github.com/google-labs-code/design.md

Examples from the spec repo:

  https://github.com/google-labs-code/design.md/blob/main/examples/atmospheric-glass/DESIGN.md

  https://github.com/google-labs-code/design.md/blob/main/examples/paws-and-paths/DESIGN.md

Requirements:

- Begin with YAML frontmatter containing all structured design tokens

  (colors, typography, spacing, elevation, motion, radii, shadows, etc.)

- Follow with free-form Markdown that describes the look & feel and

  captures design intent that token values alone cannot convey

- The file must be entirely self-contained — do not reference any

  files, variables, or paths from the codebase

- All token values must use valid YAML design token format

If you have access to a running local server or screenshots of the

product, compare your DESIGN.md against the rendered UI. Revise until

both the YAML tokens and the written description faithfully capture

the product's visual identity.`;

const EXTRACT_SYSTEM = `You extract visible content from a website's HTML. Output ONLY a single JSON object — no markdown fences, no preface, no commentary, no surrounding text.`;

const INJECT_SYSTEM = `You receive STRUCTURED CONTENT (JSON) and a REFERENCE HTML chassis. Your job: emit the REFERENCE HTML with every visible text node REPLACED by values from STRUCTURED CONTENT.

MAPPING (apply slot-by-slot)
- content.brand → every brand/logo/product-name text node (nav title, hero brand mentions, footer signature, badges).
- content.tagline → small tagline element if present near the hero/badge.
- content.hero.headline → the primary hero headline (largest h1).
- content.hero.subheadline → the supporting line under the headline.
- content.hero.cta_primary → primary CTA button label.
- content.hero.cta_secondary → secondary CTA / nav action button label.
- content.nav[] → nav link labels (truncate to fit reference's nav count).
- content.features[] → feature card titles + descriptions (fill in order).
- content.stats[] → metric/stat label-value pairs.
- content.testimonials[] → testimonial cards.
- content.pricing[] → pricing tier cards.
- content.faq[] → FAQ items.
- content.sections[] → remaining section content (about/CTA/other).
- content.footer.tagline / links / copyright → footer text.

PRESERVE EXACTLY (do not modify)
- Reference's HTML structure, tag tree, classes, IDs, inline styles, attributes.
- Reference's <script> blocks (animation, canvas, GSAP, ScrollTrigger, init code) — copy verbatim.
- Reference's <style> blocks and CSS.
- Reference's section count and order.
- Reference's component shapes, colors, typography, motion.
- Reference's canvas/WebGL/SVG decorative elements.

HARD RULES (failure if violated)
- Every visible word in your output that came from the reference's original placeholder copy must be replaced by values from STRUCTURED CONTENT or by adaptations of those values.
- The reference's original brand/headline/feature copy must NOT appear in the output.
- If STRUCTURED CONTENT has a value for a slot, USE IT verbatim. Numbers, prices, proper nouns stay literal.
- If STRUCTURED CONTENT has null/missing for a slot, expand from related fields in the same brand/domain — do NOT keep the reference's placeholder.

OUTPUT
Single complete self-contained HTML5 document starting with <!DOCTYPE html>. No commentary, no markdown fences, no preface, no truncation.`;

const RESKIN_SYSTEM = `You receive two HTML documents:

A) TARGET COPY — the SOURCE OF CONTENT. Extract every visible string from it (brand name, hero headline, sub-headline, button labels, nav links, section titles, paragraph copy, list items, footer text, badge text, pricing, CTAs). These strings are the ONLY copy allowed in your output.

B) REFERENCE TEMPLATE — an empty visual chassis. Treat its current copy as PLACEHOLDER LOREM IPSUM. Discard ALL its words. Keep its layout, sections, components, classes, inline styles, scripts, CSS, motion, canvas/WebGL/SVG, hero composition, and every visual decision.

YOUR JOB
Emit the REFERENCE TEMPLATE with every visible text node REPLACED by content from TARGET COPY.

PROCESS (do this internally before writing)
1. Read TARGET COPY. Mentally list its strings:
   - Brand / product name = ?
   - Main hero headline = ?
   - Sub-headline / tagline = ?
   - Primary CTA label = ?
   - Secondary CTAs / nav links = ?
   - Top 3–8 features / value props (title + 1-line desc each) = ?
   - Footer / contact / pricing / testimonials = ?
2. Walk the REFERENCE TEMPLATE top to bottom. For each visible text node, decide which TARGET string belongs there.
3. Substitute. Repeat until no reference placeholder copy remains visible.

HARD RULES (failure if violated)
- Output MUST contain target's exact brand/product name in the brand slot (logo text, nav title, footer signature).
- Output MUST contain target's main headline in the hero — not the reference's hero copy.
- Output MUST contain target's CTA wording on primary/secondary buttons.
- Output MUST contain target's feature titles and descriptions on the reference's feature cards.
- Output MUST contain target's nav link labels — not the reference's.
- NO placeholder phrase from the reference may survive in visible text. If you would emit a string that exists in the reference but not in the target, replace it.

PRESERVE EXACTLY FROM REFERENCE
- Section count, order, hierarchy, hero composition, grid density.
- Component shapes: cards, buttons, pills, badges, inputs, navs, radii, shadows.
- Color tokens, typography (display + body + label fonts + sizes), spacing rhythm.
- Motion: GSAP timelines, ScrollTrigger, hover lifts, masked reveals.
- Canvas/WebGL/dither effects, decorative SVGs, gradient meshes.
- ALL <script> blocks (animation logic, canvas draw loops, init code) — copy verbatim.

ADAPTATION (when shapes don't match)
- Target has MORE content than reference slots: pick the highest-impact items. Don't add new sections.
- Target has FEWER items than reference slots: expand inline using target's tone, domain, and existing copy. Never invent unrelated facts.
- Numbers, prices, dates, proper nouns from target stay literal.

OUTPUT
Single complete self-contained HTML5 document starting with <!DOCTYPE html>. No commentary, no markdown fences, no preface, no truncation.`;

type Mirror = { html: string; css: string; screenshot: string; finalUrl: string; title: string };

async function mirrorSite(url: string, browser: Browser, send: (event: string, data: any) => Promise<void>): Promise<Mirror> {
  await send('progress', { msg: `Loading ${url}…` });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    extraHTTPHeaders: {
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // @ts-ignore
    Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en'] });
    // @ts-ignore
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(45_000);
  page.setDefaultTimeout(30_000);

  try {
    await page.goto(url, { waitUntil: 'networkidle' });
  } catch {
    await send('progress', { msg: `Network didn't idle, continuing with what loaded…` });
  }
  await page.waitForTimeout(1500);

  // Cloudflare challenge detection + wait
  let html = await page.content();
  let title = await page.title();
  const isCfChallenge = /just a moment|verifying you are human|attention required.*cloudflare/i.test(title)
    || (/cloudflare/i.test(html) && /verifies you are not a bot|verifying you are human|just a moment/i.test(html));
  if (isCfChallenge) {
    await send('progress', { msg: 'Cloudflare challenge detected, waiting up to 25s for it to clear…' });
    try {
      await page.waitForFunction(
        () => !/just a moment|verifying you are human/i.test(document.title),
        { timeout: 25_000 }
      );
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      html = await page.content();
      title = await page.title();
    } catch {
      await page.close();
      await ctx.close();
      throw new Error(`${url} is protected by Cloudflare bot-check and didn't clear automatically. Open it in your real browser, view source (⌘⌥U), copy the HTML, then click "Or paste HTML manually" on the target card.`);
    }
  }

  await send('progress', { msg: 'Capturing rendered HTML…' });
  const finalUrl = page.url();

  await send('progress', { msg: 'Resolving stylesheets after JS execution…' });
  const sheets: string[] = await page.evaluate(() => {
    const out: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = Array.from(sheet.cssRules || []).map((r: any) => r.cssText).join('\n');
        if (rules) out.push(`/* === ${sheet.href || 'inline'} === */\n${rules}`);
      } catch {
        if (sheet.href) out.push(`/* === ${sheet.href} (CORS-blocked, skipped) === */`);
      }
    }
    return out;
  });
  const css = sheets.join('\n\n');

  await send('progress', { msg: 'Capturing screenshot…' });
  const shot = await page.screenshot({ type: 'png', fullPage: false });

  await page.close();
  await ctx.close();
  return { html, css, screenshot: shot.toString('base64'), finalUrl, title };
}

function trim(s: string, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max) + '\n/* …truncated for context */';
}

function extractHtmlBlock(text: string): string {
  if (!text) return '';
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const doc = text.match(/<!DOCTYPE[\s\S]*<\/html>\s*$/i) || text.match(/<html[\s\S]*<\/html>/i);
  if (doc) return doc[0];
  return text.trim();
}

function parseJsonLoose(text: string): any {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try { return JSON.parse(cleaned); } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  throw new Error(`Could not parse JSON. First 200 chars: ${cleaned.slice(0, 200)}`);
}

async function extractTargetContent(opts: {
  apiKey: string;
  provider: string;
  targetHtml: string;
  send: (event: string, data: any) => any;
}): Promise<any> {
  const userText = `Extract the visible content from the HTML below. Return a single JSON object with this shape (use null for missing fields, [] for empty arrays):

{
  "brand": "the product/site brand name (string)",
  "tagline": "short tagline near the brand or hero badge (string or null)",
  "hero": {
    "headline": "the largest headline (string)",
    "subheadline": "the supporting line under the headline (string or null)",
    "cta_primary": "primary CTA button label (string or null)",
    "cta_secondary": "secondary CTA label (string or null)"
  },
  "nav": ["nav link 1", "nav link 2"],
  "features": [{ "title": "feature title", "description": "1-line description" }],
  "stats": [{ "label": "metric label", "value": "metric value" }],
  "testimonials": [{ "quote": "string", "author": "string or null" }],
  "pricing": [{ "name": "tier name", "price": "price string", "features": ["..."] }],
  "faq": [{ "question": "string", "answer": "string" }],
  "sections": [{ "type": "about|cta|features|other", "title": "string", "body": "string" }],
  "footer": { "tagline": "string or null", "links": ["string"], "copyright": "string or null" }
}

HTML:
${trim(opts.targetHtml, 80_000)}`;

  await opts.send('progress', { msg: 'Step 1/3 · Extracting target content as JSON…' });

  let raw = '';
  if (opts.provider === 'anthropic') {
    raw = await callAnthropic({
      apiKey: opts.apiKey,
      model: 'claude-opus-4-7',
      system: EXTRACT_SYSTEM,
      userText,
      send: opts.send,
    });
  } else {
    raw = await callGemini({
      apiKey: opts.apiKey,
      model: 'gemini-2.5-pro',
      system: EXTRACT_SYSTEM,
      userText,
    });
  }
  return parseJsonLoose(raw);
}

async function callAnthropic(opts: {
  apiKey: string;
  model: string;
  system: string;
  userText: string;
  image?: string;
  send: (event: string, data: any) => any;
}): Promise<string> {
  const client = new Anthropic({ apiKey: opts.apiKey, timeout: 600_000, maxRetries: 1 });
  const content: any[] = [];
  if (opts.image) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: opts.image } });
  }
  content.push({ type: 'text', text: opts.userText });

  await opts.send('progress', { msg: `Awaiting ${opts.model} response (this may take 30–90s)…` });

  const result = await client.messages.create({
    model: opts.model,
    max_tokens: 32_000,
    system: opts.system,
    messages: [{ role: 'user', content }],
  });

  return (result.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text || '')
    .join('');
}

async function callGemini(opts: {
  apiKey: string;
  model: string;
  system: string;
  userText: string;
  image?: string;
}): Promise<string> {
  const client = new GoogleGenAI({ apiKey: opts.apiKey });
  const parts: any[] = [];
  if (opts.image) parts.push({ inlineData: { mimeType: 'image/png', data: opts.image } });
  parts.push({ text: opts.userText });

  const res = await client.models.generateContent({
    model: opts.model,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: opts.system,
      maxOutputTokens: 32_000,
      temperature: 0.3,
    },
  });
  return res.text || '';
}

// ---- Templates ----
type TemplateMeta = {
  slug: string;
  name: string;
  description: string;
  colors: Record<string, string>;
  fonts: { display?: string; body?: string; label?: string };
  height?: number;
  header?: {
    badge?: string;
    headline?: string;
    subheadline?: string;
    cta?: string;
    secondary_cta?: string;
    nav?: string[];
  };
};

function extractHeaderContent(html: string) {
  const stripTags = (s: string) => s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const limit = (s: string, n: number) => s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s;
  // Drop scripts/styles to avoid extracting JS/CSS content
  const clean = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '');

  // h1
  const h1 = clean.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const headline = h1 ? limit(stripTags(h1[1]), 90) : '';

  // first <p> after h1
  let subheadline = '';
  if (h1) {
    const after = clean.slice((h1.index || 0) + h1[0].length);
    const p = after.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    if (p) subheadline = limit(stripTags(p[1]), 160);
  }

  // first prominent button
  const btn = clean.match(/<button\b[^>]*>([\s\S]*?)<\/button>/i);
  let cta = btn ? limit(stripTags(btn[1]), 32) : '';
  // fallback: link with class containing "button"/"btn"/"cta"
  if (!cta) {
    const a = clean.match(/<a\b[^>]*class=["'][^"']*(?:button|\bbtn\b|cta)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    if (a) cta = limit(stripTags(a[1]), 32);
  }

  // secondary cta = next button after primary
  let secondary_cta = '';
  if (btn) {
    const after = clean.slice((btn.index || 0) + btn[0].length);
    const btn2 = after.match(/<button\b[^>]*>([\s\S]*?)<\/button>/i);
    if (btn2) secondary_cta = limit(stripTags(btn2[1]), 32);
  }

  // badge: small element near the hero with badge-like class
  let badge = '';
  const badgeMatch = clean.match(/<(?:span|div|a)\b[^>]*class=["'][^"']*(?:badge|pill|eyebrow|chip|tag)[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div|a)>/i);
  if (badgeMatch) badge = limit(stripTags(badgeMatch[1]), 32);

  // nav: take first few links inside <nav>
  let nav: string[] = [];
  const navMatch = clean.match(/<nav\b[\s\S]*?<\/nav>/i);
  if (navMatch) {
    const links = [...navMatch[0].matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)];
    nav = links
      .map(l => stripTags(l[1]))
      .filter(t => t.length > 0 && t.length < 28)
      .slice(0, 4);
  }

  return { badge, headline, subheadline, cta, secondary_cta, nav };
}

function parseDesignMd(text: string): Omit<TemplateMeta, 'slug'> | null {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const yaml = m[1];
  const lines = yaml.split('\n');

  const top = (key: string) => {
    for (const l of lines) {
      const r = new RegExp(`^${key}:\\s*(.+)$`);
      const mm = l.match(r);
      if (mm) return mm[1].trim().replace(/^["']|["']$/g, '');
    }
    return undefined;
  };

  const nested = (name: string) => {
    const out: Record<string, string> = {};
    let inSection = false;
    for (const l of lines) {
      if (l.match(new RegExp(`^${name}:\\s*$`))) { inSection = true; continue; }
      if (inSection) {
        if (!/^\s/.test(l)) break;
        const mm = l.match(/^\s+([a-zA-Z\-]+):\s*(.+)$/);
        if (mm) {
          const v = mm[2].trim().replace(/^["']|["']$/g, '');
          if (v && !v.startsWith('{')) out[mm[1]] = v;
        }
      }
    }
    return out;
  };

  const fonts: { display?: string; body?: string; label?: string } = {};
  let inTypo = false;
  let cur = '';
  for (const l of lines) {
    if (l.match(/^typography:\s*$/)) { inTypo = true; continue; }
    if (inTypo) {
      if (!/^\s/.test(l)) break;
      const sub = l.match(/^  ([a-zA-Z\-]+):\s*$/);
      if (sub) { cur = sub[1]; continue; }
      const ff = l.match(/^    fontFamily:\s*["']?([^"'\n]+?)["']?\s*$/);
      if (ff && cur) {
        const family = ff[1].trim().replace(/^\*+\s*/, ''); // strip stray "** Inter"
        if (cur.startsWith('display') && !fonts.display) fonts.display = family;
        else if (cur.startsWith('body') && !fonts.body) fonts.body = family;
        else if (cur.startsWith('label') && !fonts.label) fonts.label = family;
      }
    }
  }

  return {
    name: top('name') || '',
    description: top('description') || '',
    colors: nested('colors'),
    fonts
  };
}

let TEMPLATES_CACHE: TemplateMeta[] | null = null;

async function loadTemplates(): Promise<TemplateMeta[]> {
  if (TEMPLATES_CACHE) return TEMPLATES_CACHE;
  const dir = join(ROOT, 'temas');
  const files = await readdir(dir);
  const designs = files.filter(f => /-DESIGN\.md$/.test(f) && !/\(\d+\)/.test(f));
  const list: TemplateMeta[] = [];

  // Merge cached heights from previous manifest if it exists
  const heightCache = new Map<string, number>();
  try {
    const manifestRaw = await readFile(join(dir, 'manifest.json'), 'utf-8');
    const cached = JSON.parse(manifestRaw);
    if (Array.isArray(cached)) {
      for (const t of cached) if (typeof t.height === 'number') heightCache.set(t.slug, t.height);
    }
  } catch { /* no manifest yet */ }

  for (const file of designs) {
    const slug = file.replace(/-DESIGN\.md$/, '');
    const htmlFile = `${slug}.html`;
    if (!files.includes(htmlFile)) continue;
    try {
      const md = await readFile(join(dir, file), 'utf-8');
      const parsed = parseDesignMd(md);
      if (!parsed) continue;
      const meta: TemplateMeta = { slug, ...parsed };
      if (heightCache.has(slug)) meta.height = heightCache.get(slug);
      try {
        const html = await readFile(join(dir, htmlFile), 'utf-8');
        meta.header = extractHeaderContent(html);
      } catch {}
      list.push(meta);
    } catch {}
  }
  list.sort((a, b) => (a.name || a.slug).localeCompare(b.name || b.slug));
  TEMPLATES_CACHE = list;
  return list;
}

async function measureTemplateHeights(templates: TemplateMeta[]): Promise<void> {
  const need = templates.filter(t => typeof t.height !== 'number');
  if (!need.length) return;
  console.log(`Measuring rendered heights of ${need.length} template(s) at 1440×900…`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15_000);
  const dir = join(ROOT, 'temas');
  for (const t of need) {
    try {
      const html = await readFile(join(dir, `${t.slug}.html`), 'utf-8');
      await page.setContent(html, { waitUntil: 'load', timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(400);
      const h = await page.evaluate(() => Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight || 0
      ));
      t.height = h;
    } catch (e) {
      t.height = 0;
    }
  }
  await page.close();
  await ctx.close();
  await browser.close();
}

const app = new Hono();
app.use('*', cors({ origin: '*', allowHeaders: ['content-type'] }));

app.get('/api/health', (c) => c.json({ ok: true, version: '2.0.0' }));

app.get('/api/templates', async (c) => c.json({ templates: await loadTemplates() }));

app.get('/temas/*', async (c) => {
  const filename = decodeURIComponent(c.req.path.replace(/^\/temas\//, ''));
  if (!filename || filename.includes('..') || filename.includes('/')) return c.text('forbidden', 403);
  const file = join(ROOT, 'temas', filename);
  try {
    const content = await readFile(file);
    const ct = filename.endsWith('.md') ? 'text/markdown; charset=utf-8'
             : filename.endsWith('.html') ? 'text/html; charset=utf-8'
             : 'application/octet-stream';
    return new Response(new Uint8Array(content), { headers: { 'content-type': ct } });
  } catch { return c.text('not found', 404); }
});

app.get('/', async (c) => {
  const html = await readFile(join(ROOT, 'index.html'), 'utf-8');
  return c.html(html);
});

app.post('/api/demarcelize', async (c) => {
  const t0 = Date.now();
  console.log(`[${new Date().toISOString()}] POST /api/demarcelize — start`);

  let body: any;
  try { body = await c.req.json(); }
  catch { return c.json({ error: 'Invalid JSON body' }, 400); }

  const { referenceUrl, targetUrl, provider = 'anthropic', apiKey, pastedReference, pastedTarget, template } = body;
  if (!apiKey) return c.json({ error: 'API key required' }, 400);
  if (!targetUrl && !pastedTarget) return c.json({ error: 'Target URL or HTML required' }, 400);
  if (!template?.slug && !referenceUrl && !pastedReference) return c.json({ error: 'Reference URL, HTML, or template required' }, 400);

  console.log(`  provider=${provider}  template=${template?.slug || '-'}  target=${targetUrl || 'pasted'}`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: any) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch (e) {
          console.error('  send failed:', e);
        }
      };
      const close = () => { if (!closed) { closed = true; try { controller.close(); } catch {} } };

      // Immediate heartbeat — flushes headers + first byte to the browser
      controller.enqueue(encoder.encode(`: ping\n\n`));
      send('progress', { msg: 'Connected' });

      // Heartbeat every 15s to keep proxies/browser from timing out
      const heartbeat = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`)); } catch {}
      }, 15_000);

      let browser: Browser | null = null;
      try {
      let refHtml = pastedReference || '';
      let refCss = '';
      let refShot = '';
      let tgtHtml = pastedTarget || '';
      let templateDesignMd = '';

      // ---- Template mode: skip mirror, load files from disk ----
      if (template?.slug) {
        const slug = String(template.slug).replace(/[^a-zA-Z0-9\-_]/g, '');
        await send('progress', { msg: `Loading template ${slug}…` });
        try {
          templateDesignMd = await readFile(join(ROOT, 'temas', `${slug}-DESIGN.md`), 'utf-8');
          refHtml = await readFile(join(ROOT, 'temas', `${slug}.html`), 'utf-8');
        } catch (e: any) {
          await send('error', { message: `Template ${slug} not found on disk` });
          return;
        }
      }

      const needsBrowser = (!template?.slug && !pastedReference && referenceUrl) || (!pastedTarget && targetUrl);
      if (needsBrowser) {
        await send('progress', { msg: 'Launching headless browser…' });
        browser = await chromium.launch({ headless: true });
      }

      if (!template?.slug && !pastedReference && referenceUrl && browser) {
        const r = await mirrorSite(referenceUrl, browser, send);
        refHtml = r.html; refCss = r.css; refShot = r.screenshot;
      }

      if (!pastedTarget && targetUrl && browser) {
        const t = await mirrorSite(targetUrl, browser, send);
        tgtHtml = t.html;
      }

      if (browser) { await browser.close(); browser = null; }

      // ---- Step 0: extract target content as structured JSON ----
      const targetContent = await extractTargetContent({
        apiKey, provider, targetHtml: tgtHtml, send,
      });
      send('content', { json: targetContent });
      console.log(`  extracted target content: brand="${targetContent.brand}" headline="${(targetContent.hero?.headline || '').slice(0, 60)}"`);

      // ---- Step 1: DESIGN.md (skipped if template provided one) ----
      let designMd = templateDesignMd;
      if (!designMd) {
        await send('progress', { msg: `Step 2/3 · Generating DESIGN.md via ${provider}…` });
        const designUserText = `Reference URL: ${referenceUrl || '(pasted HTML)'}

REFERENCE HTML (rendered after JS execution):
${trim(refHtml, 80_000)}

REFERENCE CSS (resolved stylesheets, post-JS):
${trim(refCss, 200_000)}

${refShot ? 'A screenshot of the rendered reference UI is attached above. Compare your DESIGN.md to it and revise until both the YAML tokens and prose faithfully capture the visible identity.' : ''}`;

        if (provider === 'anthropic') {
          designMd = await callAnthropic({
            apiKey, model: 'claude-opus-4-7',
            system: VERBATIM_PROMPT,
            userText: designUserText,
            image: refShot || undefined,
            send,
          });
        } else {
          designMd = await callGemini({
            apiKey, model: 'gemini-2.5-pro',
            system: VERBATIM_PROMPT,
            userText: designUserText,
            image: refShot || undefined,
          });
        }
      } else {
        await send('progress', { msg: `Using template DESIGN.md (${template.slug})` });
      }
      await send('design', { md: designMd });

      // ---- Step 2: inject structured content into reference chassis ----
      await send('progress', { msg: `Step 3/3 · Injecting content into reference chassis via ${provider}…` });
      const reskinUserText = `STRUCTURED CONTENT (JSON) — these are the words that must appear in your output:
${JSON.stringify(targetContent, null, 2)}

REFERENCE DESIGN.md (visual identity tokens):
${designMd}

REFERENCE HTML to populate (preserve every tag, class, style, script, and section — replace only visible text nodes):
${trim(refHtml, 100_000)}

REFERENCE CSS (donor's actual stylesheets):
${trim(refCss, 50_000)}${refShot ? '\n\nThe attached image is the rendered REFERENCE — match its visual decisions exactly while substituting its copy with the JSON content above.' : ''}`;

      let reskinned = '';
      if (provider === 'anthropic') {
        reskinned = await callAnthropic({
          apiKey, model: 'claude-opus-4-7',
          system: INJECT_SYSTEM,
          userText: reskinUserText,
          image: refShot || undefined,
          send,
        });
      } else {
        reskinned = await callGemini({
          apiKey, model: 'gemini-2.5-pro',
          system: INJECT_SYSTEM,
          userText: reskinUserText,
          image: refShot || undefined,
        });
      }

      const html = extractHtmlBlock(reskinned);
      send('done', { html, designMd });
      console.log(`  /api/demarcelize done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (err: any) {
      console.error('  pipeline error:', err);
      send('error', { message: err?.message || String(err) });
      if (browser) try { await browser.close(); } catch {}
    } finally {
      clearInterval(heartbeat);
      close();
    }
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
});

const port = Number(process.env.PORT || 3000);

// Pre-load templates + measure heights + write static manifest.json
loadTemplates().then(async (t) => {
  try { await measureTemplateHeights(t); }
  catch (e) { console.warn('Height measurement failed:', e); }
  try {
    await writeFile(join(ROOT, 'temas', 'manifest.json'), JSON.stringify(t, null, 2));
  } catch (e) { console.warn('Could not write manifest.json:', e); }
  const tall = t.filter(x => (x.height || 0) >= 1000).length;
  console.log(`
✦ Demarcelizer 2.0 · local engine
  → http://localhost:${port}

  GET  /api/health
  GET  /api/templates       → ${t.length} loaded · ${tall} ≥ 1 viewport tall
  GET  /temas/<filename>    (manifest.json regenerated at startup)
  POST /api/demarcelize     (SSE)
`);
}).catch(e => {
  console.error('Failed to pre-load templates:', e);
  console.log(`\n✦ Demarcelizer 2.0 · local engine\n  → http://localhost:${port}\n`);
});

export default { port, fetch: app.fetch, idleTimeout: 255 };
