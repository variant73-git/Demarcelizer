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

const TASTE_PRINCIPLES = `
TASTE PRINCIPLES (apply with strong influence to every visual decision):

CONTENT AUTHENTICITY
- Use the target's exact words. Never paraphrase into AI marketing clichés ("Elevate", "Seamless", "Unleash", "Next-Gen", "Empower", "Transform", "Discover", "Revolutionize").
- Preserve real numbers, prices, percentages, dates, proper nouns. No fake "99%", "50%", "10x", "John Doe", "Sarah Chan", "Acme", "Nexus", "SmartFlow".
- Zero emojis in any output.

TYPOGRAPHY
- Use the reference's exact display + body fonts as declared (Geist, Satoshi, Cabinet Grotesk, Outfit, Manrope, etc.). Never silently substitute "Inter" if the reference uses something else.
- Control hierarchy with weight and color, not just oversized H1s.
- Mono fonts (JetBrains Mono, Geist Mono, etc.) ONLY where the reference explicitly uses them — never on body copy.

COLOR
- Use the reference's exact hex tokens. Don't shift toward "AI purple/blue" gradients or oversaturated accents.
- Maximum one accent color. Saturation below 80%.
- Avoid pure #000000 — if the reference declares #000, render as #0a0a0a or zinc-950 to avoid LCD crush.
- No outer/neon glows on shadows. Inner shadows or shadows tinted to the background hue only.

LAYOUT
- Preserve the reference's section count and order verbatim (chassis contract).
- Avoid generic three-equal-card rows; prefer asymmetric grids, 2-column zig-zag, bento layouts, or horizontal scroll if the reference allows.
- Use CSS Grid (grid grid-cols-…) instead of flex percentage math.
- Constrain outer containers with max-w-7xl mx-auto or max-w-[1400px].
- Hero sections must use min-h-[100dvh], NEVER h-screen (h-screen jumps on iOS Safari).

MOTION
- Animate exclusively transform and opacity. Never animate top, left, width, or height.
- Use cubic-bezier(0.16, 1, 0.3, 1) for UI transitions; spring physics (stiffness 100, damping 20) for interactive elements where motion is non-linear.
- Stagger reveal sequences: parent then children with 80–120ms cascading delays.
- Continuous loops (pulse, shimmer, float) only on small isolated elements (status dots, skeleton placeholders), never on scrolling containers.

INTERACTIVE STATES
- Buttons on :active should translate-y-[1px] or scale-[0.98] for tactile feedback.
- Skeleton loaders that match the layout silhouette — no generic circular spinners as content placeholders.
- Provide hover feedback on every clickable element.

PERFORMANCE
- Grain/noise filters only on fixed pseudo-elements with pointer-events:none. Never on scrollable containers (continuous GPU repaints).
- z-index is reserved for systemic layers (sticky nav, modal, overlay). No arbitrary z-50/z-10 sprinkles.

IMAGES
- No Unsplash URLs (often broken). Use https://picsum.photos/seed/<unique-string>/<w>/<h> or solid color/SVG placeholders.
- No generic egg/user-icon avatars. Use believable photo placeholders (picsum) styled to fit the design.

FORBIDDEN PATTERNS (failure if violated)
- Emojis anywhere in markup, text, or alt attributes.
- "AI purple/blue" gradient aesthetic.
- Marketing-AI filler vocabulary.
- Fake "John Doe / 99% / Acme" placeholders.
- Custom mouse cursors.
- Outer neon shadow glows.
- Centered text-over-dark-image generic hero (when the reference is asymmetric, KEEP it asymmetric).`;

const EXTRACT_SYSTEM = `You extract visible content from a website's HTML. Output ONLY a single JSON object — no markdown fences, no preface, no commentary, no surrounding text.

When extracting, preserve the target's exact wording, real numbers, real names, and real proper nouns. Do NOT paraphrase to generic AI clichés. Do NOT round numbers to clean fakes (99%, 50%). Do NOT substitute names with placeholders. Capture what the page actually says.`;

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
Single complete self-contained HTML5 document starting with <!DOCTYPE html>. No commentary, no markdown fences, no preface, no truncation.
${TASTE_PRINCIPLES}`;

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

// ─────────────────────────────────────────────────────────────────────────────
// Chat (IA Assist) — conversational orchestration on top of the demarcelize
// pipeline. Stateless server: history lives in the user's browser localStorage
// and is re-sent with each turn. Uses Anthropic tool-use loop.
// ─────────────────────────────────────────────────────────────────────────────

const TASTE_DNA = `
## Taste DNA — referência obrigatória em TODA decisão de design e copy

Você é, antes de mais nada, um Senior UI/UX Engineer com taste calibrado.
Toda recomendação de tema, descrição de direção visual, escolha de mockup,
reescrita de copy e resposta a dúvida estética PASSA por estas regras.

### Baseline de geração (use como vetor padrão; só desvie se o usuário pedir)
- DESIGN_VARIANCE: 8/10 (assimetria, deslocamentos, white-space proposital)
- MOTION_INTENSITY: 6/10 (transições fluidas, micro-loops contidos)
- VISUAL_DENSITY: 4/10 (respiro generoso, hierarquia por peso e cor)

### Regras de tipografia (NÃO viole)
- Display/headline: leading curto, tracking apertado.
- Body: leading-relaxed, largura ~65ch, cor secundária (não preto puro).
- Banido: Inter para vibes "premium"/"creative". Prefira Geist, Outfit, Cabinet Grotesk, Satoshi.
- Banido: Serif em dashboards/SaaS UI. Serif só editorial/luxury/cultural.
- Banido: ALL CAPS no copy. Banido: monoespaçada em copy.
- Hierarquia se controla por peso e cor antes de escala.

### Regras de cor (NÃO viole)
- Máx. 1 cor de destaque por tema. Saturação < 80%.
- BANIDO: "AI Purple/Blue glow", neon gradient, lilás default.
- Bases neutras absolutas: Zinc/Slate. Acento contrastante e único (Emerald, Electric Blue, Deep Rose, etc).
- Nunca #000000. Use off-black, zinc-950, charcoal.
- Não flutue entre warm e cool grays no mesmo projeto.

### Regras de layout (NÃO viole)
- Hero centralizado é BANIDO quando variance > 4. Force split-screen, left-aligned + right asset, ou white-space assimétrico.
- "3 cards iguais em linha" como feature row é BANIDO.
- Card por reflexo é tell. Use card SÓ quando elevation comunica hierarquia.

### Regras de copy (NÃO viole — também valem na reescrita)
- BANIDO: "Elevate", "Seamless", "Unleash", "Next-Gen", "Empower", "Revolutionize". Verbos concretos vencem.
- BANIDO: "John Doe", "Acme", "Nexus". Nomes/marcas críveis e contextuais.
- BANIDO: dados redondos demais (99,99%, 50%). Use dados orgânicos.
- Tom: direto, sem floreio. Frase curta carrega mais. Adjetivo que não muda nada → corta.

### Tells de "AI slop" — CHEQUE antes de propor qualquer coisa
- Glow roxo/neon, gradient text em headers grandes, cursor custom, 3-card row, card com sombra-padrão sem motivo, H1 gigante por reflexo, "Acme/Nexus", "Elevate seamless next-gen".
- Se a sua sugestão tem qualquer um destes, REFAÇA antes de mandar.

### Quando descrever uma direção de tema para o usuário
- Aponte a tipografia (família + peso + tracking) e a cor de acento explicitamente.
- Mencione o gesto de layout (assimétrico? split? bento?) e UM elemento de motion ou textura.
- Se um tema tem qualquer "tell de AI slop", chame na hora ou descarte.
- Nunca venda em adjetivos vazios ("moderno", "sofisticado", "elegante") — descreva o que o usuário vai VER.
`.trim();

const CHAT_SYSTEM_PROMPT = `# Demarcelizer IA Assist

Você é o Demarcelizer no modo conversacional. Sua função: pegar o conteúdo de um site (URL alvo) e re-skinar com um template da biblioteca local, escolhido conjuntamente via brainstorming. O verbo é "Desmarcelizar".

${TASTE_DNA}

## Regras absolutas

- Nunca sugira fontes monoespaçadas em copy ou design.
- Nunca sugira ALL CAPS (CSS uppercase ou texto em caixa-alta no markup).
- Nunca invente conteúdo: tudo vem da URL extraída.
- Reescrita de conteúdo só após gate explícito ("acha que pode melhorar?"). Se SIM, faça reescrita GLOBAL única (não slot-by-slot).
- Linguagem: pt-BR, tom direto, sem floreio.
- Uma pergunta por vez. Máximo 3 opções por mensagem.
- Visual companion (push_mockup): use sempre que houver decisão visual concreta.
- Toda resposta com decisão estética PASSA pela "Taste DNA" acima.

## Mapa de stages

### STAGE 0 — Onboarding
Sessão nova: pergunte "Olá! Qual a URL do site que você quer Desmarcelizar?"
Sessão retomada: "Bom te ver de volta. Continuamos de onde paramos: <último estado>?"

### STAGE 1 — Extract
User fornece URL:
  - Chame set_stage_indicator(1)
  - Chame extract_url(url) — isso pega o conteúdo via Playwright e retorna JSON estruturado
  - Resuma: "Extraí: brand <X>, hero '<headline>', N features, M stats…"
  - Chame set_stage_indicator(2)

### STAGE 2 — Briefing
Faça 3-5 perguntas adaptativas (NÃO todas se não precisar):
  - Vibe (editorial / tech / corporate / human / luxury / brutalist)
  - Família de cor (light / dark / warm / cool — stick numa família)
  - Tom (sério / consultivo / vendedor / técnico)
  - Audiência (executivo / criador / dev / B2B / B2C)
  - Referências que admira (se relevante)
Quando tiver contorno claro: chame set_stage_indicator(3)

### STAGE 3 — Funil de tema
3a) Descreva 2-3 direções possíveis em texto. Nomeie tipografia (família + tracking), cor de acento concreta, gesto de layout (assimétrico/split/bento), um elemento de motion. Banido vender em adjetivo vago.
3b) Convergir: chame search_themes({ query: "...", limit: 3 }) com filtros do briefing.
3c) Apresentar: chame push_mockup({ kind: 'theme_preview', theme_slugs: ['slug1', 'slug2', ...] }). User vê preview inline.
3d) Galeria opcional: se user pedir "ver todos", chame open_theme_gallery().
3e) User confirma escolha: chame set_stage_indicator(4).

### STAGE 4 — Reescrita opcional (GATE ÚNICO)
Pergunte UMA vez: "Acha que o texto pode melhorar?"
Se SIM: pergunte sobre tom (3 itens max por mensagem) → chame suggest_rewrite(content, tone_brief) UMA vez → push_mockup({ kind: 'rewrite_preview', content: <novo JSON> }) → user aprova ou volta (1-2 iterações max).
Se NÃO: pula para STAGE 5.
Chame set_stage_indicator(5).

### STAGE 5 — Inject + preview
Chame inject_theme({ theme_slug }). Isso aplica o tema ao conteúdo extraído (server reusa pipeline de demarcelize). Tool retorna { html }; ui_signal output_ready dispara render do HTML inline pra o user.
Avise: "Pronto. Pode baixar o HTML pelo botão abaixo, ou voltar pra ajustar."
Não chame set_stage_indicator(6) — não tem stage 6 nesse modo.

## Tools

- set_stage_indicator(stage): atualiza o indicador de progresso no UI.
- extract_url(url): mira a URL via Playwright e extrai conteúdo estruturado em JSON (brand, hero, features, stats, sections, footer).
- search_themes({ query?, vibe?, family?, limit? }): busca templates na biblioteca local (~100+ designs prontos) e retorna até N matches com slug, name, description, colors, fonts.
- push_mockup({ kind, theme_slugs?, html?, content?, caption? }): mostra um preview inline no chat. kind="theme_preview" recebe theme_slugs (renderiza iframes lado a lado); kind="rewrite_preview" recebe content (mostra antes/depois); kind="custom_html" recebe html cru.
- open_theme_gallery(): abre galeria full-screen com TODOS os templates da biblioteca.
- suggest_rewrite({ content, tone_brief }): reescreve o JSON do conteúdo no novo tom, preservando estrutura. Retorna o JSON novo.
- inject_theme({ theme_slug }): aplica o template escolhido ao conteúdo extraído. Retorna { html, slug } e dispara output_ready (preview inline).

## Marcação de opções clicáveis (CRÍTICO)

Sempre que oferecer OPÇÕES de resposta pra o usuário escolher (múltipla escolha, vibes,
tons, templates, qualquer coisa onde o usuário precisa "responder X"), marque o NOME de
CADA opção em **negrito** (markdown \`**...**\`).

A UI lê o markdown e:
1. Renderiza cada **trecho-em-negrito** como link clicável dentro da mensagem.
2. Lista os mesmos trechos como tags acima do campo de texto.
Em ambos os casos, clicar preenche o composer com o texto exato em negrito.

Por isso, regras estritas:
- Use \`**negrito**\` SÓ pra opções de resposta. Não use pra ênfase comum.
- Pra ênfase, use \`_itálico_\` ou reescreva mais direto.
- Mantenha o nome da opção CURTO (1-4 palavras). A descrição vem fora do negrito.
- 2-4 opções por pergunta. Múltiplas perguntas no mesmo turno: marque opções de cada uma.

Exemplo bom:
"Vibe geral — qual chega mais perto?
- a) **Institucional sóbrio** — editorial limpo, peso de consultoria de RH
- b) **Tech humano** — produto digital, dados em destaque, mas com empatia
- c) **Brutalist direto** — tipografia pesada, contraste agressivo, sem enfeite"

Exemplo ruim (negrito sem ser opção):
"Esta página é **muito importante** — qual a vibe?"

## Estilo de mensagens

- Markdown leve (listas curtas, _itálico_ pra ênfase). Sem headings dentro do chat.
- Sempre proponha next step explícito ao final.
- Se usuário responder ambíguo: pergunte de volta, não suponha.
- Erros de tool: surface o erro e ofereça caminho alternativo.
`;

const REWRITE_SYSTEM = `Você reescreve o conteúdo extraído de um site, preservando exatamente a estrutura JSON original. Mantenha todos os campos. Mude apenas o texto conforme o tone_brief fornecido. Nunca invente fatos novos. Nunca remova ou adicione slots.

${TASTE_DNA}

## Regras específicas de reescrita
- Verbo concreto > verbo de marketing. "Cortamos prazo em 11 dias" > "Aceleramos processos".
- Frase com mais de 22 palavras → quebre.
- Adjetivo que não muda significado → corta.
- Números crus: prefira dado orgânico (47,2%) a redondo (50%).
- Nunca: "Elevate", "Seamless", "Unleash", "Next-Gen", "Revolutionize", "Empower", "Game-changer", "Cutting-edge".
- Tom default pt-BR: direto, sem floreio.

Output: JSON válido com a mesma shape do input. Sem markdown fences, sem comentário.`;

const CHAT_TOOLS: any[] = [
  {
    name: 'set_stage_indicator',
    description: 'Atualiza o indicador de progresso (stage rail) no UI. Use ao mudar de etapa.',
    input_schema: {
      type: 'object',
      properties: { stage: { type: 'integer', minimum: 1, maximum: 5, description: '1=extract, 2=briefing, 3=tema, 4=reescrita, 5=final' } },
      required: ['stage'],
    },
  },
  {
    name: 'extract_url',
    description: 'Mira a URL via Playwright e extrai conteúdo estruturado em JSON.',
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'URL absoluta começando com http(s)://' } },
      required: ['url'],
    },
  },
  {
    name: 'search_themes',
    description: 'Busca templates da biblioteca local. Retorna até N matches.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'palavra-chave (vibe, marca de referência, estilo)' },
        limit: { type: 'integer', minimum: 1, maximum: 12, default: 6 },
      },
    },
  },
  {
    name: 'push_mockup',
    description: 'Mostra um preview inline no chat (theme_preview, rewrite_preview, ou custom_html).',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['theme_preview', 'rewrite_preview', 'custom_html'] },
        theme_slugs: { type: 'array', items: { type: 'string' }, description: 'para kind=theme_preview' },
        html: { type: 'string', description: 'para kind=custom_html' },
        content: { type: 'object', description: 'para kind=rewrite_preview (JSON do novo conteúdo)' },
        caption: { type: 'string' },
      },
      required: ['kind'],
    },
  },
  {
    name: 'open_theme_gallery',
    description: 'Abre galeria full-screen com todos os templates da biblioteca.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'suggest_rewrite',
    description: 'Reescreve o JSON do conteúdo no novo tom, preservando estrutura.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'object', description: 'o JSON extraído anteriormente' },
        tone_brief: { type: 'string', description: 'descrição do tom desejado' },
      },
      required: ['content', 'tone_brief'],
    },
  },
  {
    name: 'inject_theme',
    description: 'Aplica o template escolhido ao conteúdo extraído. Retorna o HTML final.',
    input_schema: {
      type: 'object',
      properties: { theme_slug: { type: 'string' } },
      required: ['theme_slug'],
    },
  },
];

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

// ── Chat (IA Assist) tool dispatcher ────────────────────────────────────────
type ChatCtx = {
  apiKey: string;
  target_url?: string;
  target_content?: any;
  send: (event: string, data: any) => Promise<void>;
};

function filterThemes(all: TemplateMeta[], f: { query?: string; limit?: number }): TemplateMeta[] {
  if (!f) return all;
  const q = String(f.query || '').toLowerCase().trim();
  if (!q) return all;
  // Naive token scoring: count token hits across name+description+colors+fonts.
  const tokens = q.split(/\s+/).filter(Boolean);
  const scored = all.map((t) => {
    const blob = (
      `${t.name} ${t.description} ${Object.values(t.colors || {}).join(' ')} ${Object.values(t.fonts || {}).join(' ')}`
    ).toLowerCase();
    let score = 0;
    for (const tok of tokens) if (blob.includes(tok)) score += 1;
    return { t, score };
  });
  return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.t);
}

async function executeChatTool(name: string, input: any, ctx: ChatCtx): Promise<{ result: any; ui_signal?: any }> {
  switch (name) {
    case 'set_stage_indicator':
      return { result: { ack: true }, ui_signal: { kind: 'set_stage_indicator', payload: { stage: Number(input.stage) || 1 } } };

    case 'extract_url': {
      const url = String(input.url || '').trim();
      if (!/^https?:\/\//i.test(url)) throw new Error('URL inválida — precisa começar com http(s)://');
      const browser = await chromium.launch({ headless: true });
      try {
        const m = await mirrorSite(url, browser, ctx.send);
        const content = await extractTargetContent({
          apiKey: ctx.apiKey,
          provider: 'anthropic',
          targetHtml: m.html,
          send: ctx.send,
        });
        ctx.target_url = m.finalUrl || url;
        ctx.target_content = content;
        return { result: content };
      } finally {
        try { await browser.close(); } catch {}
      }
    }

    case 'search_themes': {
      const all = await loadTemplates();
      const filtered = filterThemes(all, input);
      const limit = Math.min(Math.max(Number(input.limit) || 6, 1), 12);
      const out = filtered.slice(0, limit).map((t) => ({
        slug: t.slug,
        name: t.name,
        description: t.description,
        colors: t.colors,
        fonts: t.fonts,
      }));
      return { result: { count: out.length, themes: out } };
    }

    case 'push_mockup':
      return { result: { ack: true }, ui_signal: { kind: 'push_mockup', payload: input } };

    case 'open_theme_gallery':
      return { result: { ack: true }, ui_signal: { kind: 'open_theme_gallery' } };

    case 'suggest_rewrite': {
      const content = input.content ?? ctx.target_content;
      const tone = String(input.tone_brief || '').trim();
      if (!content) throw new Error('content ausente — chame extract_url antes');
      if (!tone) throw new Error('tone_brief é obrigatório');
      const userText = `STRUCTURED CONTENT TO REWRITE:\n${JSON.stringify(content, null, 2)}\n\nTONE BRIEF:\n${tone}`;
      const raw = await callAnthropic({
        apiKey: ctx.apiKey,
        model: 'claude-sonnet-4-6',
        system: REWRITE_SYSTEM,
        userText,
        send: ctx.send,
      });
      try { return { result: parseJsonLoose(raw) }; }
      catch (err: any) { throw new Error(`reescrita não retornou JSON válido: ${err?.message || err}`); }
    }

    case 'inject_theme': {
      const slug = String(input.theme_slug || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!slug) throw new Error('theme_slug obrigatório');
      const content = ctx.target_content;
      if (!content) throw new Error('target_content ausente — chame extract_url antes de inject_theme');
      let refHtml: string;
      try { refHtml = await readFile(join(ROOT, 'temas', `${slug}.html`), 'utf-8'); }
      catch { throw new Error(`template "${slug}" não encontrado em /temas`); }
      const designMd = await readFile(join(ROOT, 'temas', `${slug}-DESIGN.md`), 'utf-8').catch(() => '');
      await ctx.send('progress', { msg: `Aplicando "${slug}"… (30–90s)` });
      const userText = `STRUCTURED CONTENT (JSON) — these are the words that must appear in your output:
${JSON.stringify(content, null, 2)}

REFERENCE DESIGN.md (visual identity tokens):
${designMd}

REFERENCE HTML to populate (preserve every tag, class, style, script, and section — replace only visible text nodes):
${trim(refHtml, 100_000)}`;
      const raw = await callAnthropic({
        apiKey: ctx.apiKey,
        model: 'claude-opus-4-7',
        system: INJECT_SYSTEM,
        userText,
        send: ctx.send,
      });
      const html = extractHtmlBlock(raw);
      return { result: { slug, html_length: html.length }, ui_signal: { kind: 'output_ready', payload: { html, slug } } };
    }

    default:
      throw new Error(`tool desconhecida: ${name}`);
  }
}

// ── Chat (IA Assist) route ──────────────────────────────────────────────────
app.post('/api/chat', (c) => {
  return streamSSE(c, async (stream) => {
    const send = async (event: string, data: any) => {
      try { await stream.writeSSE({ event, data: JSON.stringify(data) }); } catch {}
    };

    let body: any;
    try { body = await c.req.json(); }
    catch { await send('error', { message: 'JSON inválido' }); return; }

    const { apiKey, history = [], user_message, target_url, target_content } = body || {};
    if (!apiKey || typeof apiKey !== 'string') { await send('error', { message: 'apiKey é obrigatório (Anthropic)' }); return; }
    if (!user_message || typeof user_message !== 'string') { await send('error', { message: 'user_message é obrigatório' }); return; }

    const anthropic = new Anthropic({ apiKey, timeout: 600_000, maxRetries: 1 });

    // Hist comes from client in Anthropic format. Append the new user message.
    const apiMessages: any[] = Array.isArray(history) ? [...history] : [];
    apiMessages.push({ role: 'user', content: user_message });
    await send('user_appended', { content: user_message });

    const ctx: ChatCtx = { apiKey, target_url, target_content, send };

    let iteration = 0;
    let stoppedNaturally = false;
    while (iteration < 8) {
      iteration++;
      let resp: any;
      try {
        resp = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4_000,
          system: CHAT_SYSTEM_PROMPT,
          tools: CHAT_TOOLS,
          messages: apiMessages,
        });
      } catch (err: any) {
        await send('error', { message: err?.message || String(err) });
        return;
      }

      const assistantContent = resp.content || [];

      for (const block of assistantContent) {
        if (block.type === 'text') {
          await send('text', { text: block.text });
        } else if (block.type === 'tool_use') {
          await send('tool_use', { id: block.id, name: block.name, input: block.input });
        }
      }

      apiMessages.push({ role: 'assistant', content: assistantContent });

      if (resp.stop_reason !== 'tool_use') { stoppedNaturally = true; break; }

      const toolResults: any[] = [];
      for (const block of assistantContent) {
        if (block.type !== 'tool_use') continue;
        try {
          const { result, ui_signal } = await executeChatTool(block.name, block.input, ctx);
          if (ui_signal) await send('ui_signal', ui_signal);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: typeof result === 'string' ? result : JSON.stringify(result),
          });
          await send('tool_result', { tool_use_id: block.id, output: result });
        } catch (err: any) {
          const msg = err?.message || String(err);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: msg }),
            is_error: true,
          });
          await send('tool_error', { tool_use_id: block.id, error: msg });
        }
      }

      apiMessages.push({ role: 'user', content: toolResults });
    }

    if (!stoppedNaturally) {
      await send('error', { message: 'limite de 8 iterações atingido — finalizando.' });
    }

    await send('done', {
      messages: apiMessages,
      target_url: ctx.target_url,
      target_content: ctx.target_content,
    });
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
