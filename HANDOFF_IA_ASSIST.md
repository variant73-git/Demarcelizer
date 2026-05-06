# IA Assist — Handoff Técnico

> Contexto pra próxima sessão Claude Code. Lê este arquivo antes de mexer em qualquer coisa relacionada à aba IA Assist.

## O que é

Terceira aba do **Demarcelizer 2.0** ("IA Assist"), ao lado de URL e "Usar template". Em vez do fluxo de 2 painéis lado-a-lado + botão central DEMARCELIZAR, é uma **conversa única** onde um agente Claude conduz o usuário pelas stages: `extract → briefing → tema → reescrita → final`. O agente usa tools pra extrair conteúdo da URL, buscar templates da biblioteca local, opcionalmente reescrever copy, e injetar o template escolhido reusando a pipeline do `/api/demarcelize`.

A UI conversacional foi prototipada no **Demarcelizer 3.0** (codebase separada em `~/Desktop/IA/Demarcelizer 3.0`) e portada pra cá. **3.0 está arquivado** — todo trabalho daqui pra frente é em 2.0.

## Stack

- **Backend**: Bun + Hono + Anthropic SDK + Google GenAI + Playwright (chromium). Single-file `server.ts`.
- **Frontend**: vanilla JS (sem framework), Tailwind via CDN, Inter + Instrument Serif. Single-file `index.html` com `<style>` e `<script>` inline.
- **Storage**: servidor stateless. Histórico vive em browser localStorage (`demarcelizer.aiAssist.v1`).
- **API key**: BYO (cliente fornece Anthropic key, stored em `demarcelizer.byok.v1`).

## Branches & deploy

- **Branch ativa**: `ia-assist-tab` (não mergeada ainda em main).
- **Demarcelizer 2.0 público no Vercel**: já existe (projeto linkado). Pra subir esta branch: merge → main → `vercel --prod`.
- **Vercel CLI local**: 50.41.0 (defasada — última 53.2.0). Atualizar com `npm i -g vercel@latest`.
- **Vercel knowledge updates relevantes** (2026-02-27):
  - Default function timeout agora 300s (era 60-90s).
  - Vercel KV/Postgres descontinuados — usar Vercel Marketplace (Neon, Upstash) ou Blob se precisar persistir.
  - Fluid Compute é default; Edge functions não são mais recomendadas.
  - **Playwright em serverless ainda é problema** — confirmar runtime ao deployar.

## Arquitetura

### Frontend (`index.html`)

Tabs alternam por `body[data-mode="url|template|ai"]` via função `setMode()` ([index.html:1119](index.html#L1119)).

Quando `data-mode="ai"`:
- `#run` (cards URL/template + botão DEMARCELIZAR central) é escondido
- `#ai-assist-card` é mostrado, centralizado em `max-width: 760px`

Layout do `#ai-assist-card`:
```
ai-frame (grid: auto auto 1fr auto, height: min(78vh, 820px))
├── ai-frame-stamp (header inline com dot rust + "Demarcelizer · IA Assist")
├── ai-stage-rail (dots-on-line stepper: extract / briefing / tema / reescrita / final)
├── ai-thread-wrap (overflow-y:auto — único scroll)
│   └── ai-thread (max-width: 640px, gap: 36px, single column)
└── ai-composer-bar
    ├── ai-tag-row (chips de quick-reply, hidden se vazio)
    └── ai-composer (pill com input + botão enviar)
```

Tipos de turn dentro do thread:
- **AI** (`<div class="ai-turn ai">`): stamp + ai-msg (32px Inter light, em italic = Instrument Serif rust). Pode conter inline: ai-cards, ai-preview, ai-preview-grid, ai-artifacts, ai-sys-pill.
- **User** (`<div class="ai-turn user">`): stamp + ai-user-msg (pill chip rust-walnut).

Modais (galeria, fullscreen preview) abrem em cima do **shell todo** via `position:fixed; z-index:60-61` — não confinados ao painel da aba.

Renderização de Markdown leve no `inlineFmt`:
- `**foo**` → atualmente `<a class="ai-link" data-fill="foo">foo</a>` (será revertido — ver pendências)
- `*foo*` ou `_foo_` → `<em>` (Instrument Serif italic em rust)
- `` `foo` `` → `<code>`
- Bullets `- foo` → `<ul><li>` com bullet rust de 1px

### Backend (`server.ts`)

Layout do arquivo (~1300 linhas):
- **L1-9**: imports
- **L13-105**: `VERBATIM_PROMPT` (DESIGN.md gen) — usado por `/api/demarcelize`
- **L107-109**: `EXTRACT_SYSTEM` (extração JSON do conteúdo)
- **L111-190**: `INJECT_SYSTEM` (template injection) — usado por `/api/demarcelize` E pela tool `inject_theme`
- **L192-373** (NEW): `TASTE_DNA` + `CHAT_SYSTEM_PROMPT` + `REWRITE_SYSTEM` + `CHAT_TOOLS[]`
- **L380-490**: helpers — `mirrorSite`, `trim`, `extractHtmlBlock`, `parseJsonLoose`, `extractTargetContent`, `callAnthropic`, `callGemini`
- **L550-620**: `loadTemplates`, `measureTemplateHeights`, `parseDesignMd`
- **L820-940** (NEW): `filterThemes()`, `executeChatTool()` dispatcher
- **L950-1080** (NEW): `app.post('/api/chat', ...)` SSE handler
- **L1090-1280**: `/api/demarcelize` (intacto)
- bottom: bootstrap

### Tools que o agente tem (`CHAT_TOOLS`)

| Nome | Input | Efeito |
|---|---|---|
| `set_stage_indicator` | `{stage: 1-5}` | Emite `ui_signal {kind:'set_stage_indicator'}` — frontend atualiza dots-on-line. |
| `extract_url` | `{url}` | Playwright mirror + `extractTargetContent` (LLM JSON). Atualiza `ctx.target_url` e `ctx.target_content`. ~5-15s. |
| `search_themes` | `{query?, limit?}` | Token-scoring sobre name+description+colors+fonts. Retorna até 12 templates. |
| `push_mockup` | `{kind, theme_slugs? html? content? caption?}` | Emite `ui_signal {kind:'push_mockup'}`. Frontend renderiza iframes inline. |
| `open_theme_gallery` | `{}` | Emite `ui_signal {kind:'open_theme_gallery'}`. Modal full-screen com todos os templates. |
| `suggest_rewrite` | `{content, tone_brief}` | Anthropic call com `REWRITE_SYSTEM`, retorna JSON reescrito. |
| `inject_theme` | `{theme_slug}` | Lê `temas/${slug}.html` + `temas/${slug}-DESIGN.md`, chama Anthropic com `INJECT_SYSTEM` + `target_content`. Emite `ui_signal {kind:'output_ready', payload:{html, slug}}`. **30-90s**. |

### Protocolo SSE (`/api/chat`)

**Request body**:
```ts
{
  apiKey: string;          // Anthropic key (cliente fornece)
  history: AnthropicMessageParam[];  // formato Anthropic: {role, content}
  user_message: string;
  target_url?: string;     // tracked pelo cliente, reenviado a cada turno
  target_content?: any;    // último resultado do extract_url
}
```

**Eventos do servidor** (mesma ordem de chegada típica):
- `user_appended` — `{content}` server stamping da nova mensagem
- `text` — `{text}` chunk
- `tool_use` — `{id, name, input}`
- `tool_result` — `{tool_use_id, output}` (output é o que executeChatTool retornou)
- `tool_error` — `{tool_use_id, error}` (em vez de tool_result)
- `tool_progress` / `progress` — `{message}` (vem dos helpers callAnthropic/mirrorSite)
- `ui_signal` — `{kind, payload}` — kinds: `set_stage_indicator`, `push_mockup`, `output_ready`, `open_theme_gallery`, (em breve) `present_options`
- `error` — `{message}` terminal
- `done` — `{messages, target_url, target_content}` — histórico atualizado pra cliente persistir

Loop interno: até 8 iterações de tool-use por turno, depois para com erro de "limite atingido".

Modelo padrão do agente: `claude-sonnet-4-6`. Inject_theme usa `claude-opus-4-7` (custo↑ qualidade↑).

### Estado do cliente (localStorage)

Chave `demarcelizer.aiAssist.v1`:
```ts
{
  messages: AnthropicMessageParam[];  // recriado do done event
  target_url: string | null;
  target_content: any | null;
  current_stage: 0..5;
  last_html?: string;  // capturado no output_ready, usado no botão "baixar HTML"
}
```

Chave separada `demarcelizer.byok.v1` (compartilhada com o resto do 2.0):
```ts
{
  provider: 'anthropic' | 'google';
  keys: { anthropic?: string; google?: string };
}
```

A IA Assist lê apenas `state.keys.anthropic`. Se vazio, mostra pílula de aviso.

## Decisões de UX já feitas

1. **Single conversation, não split-pane** — modelo do Design Prompt Extractor.
2. **Stage rail = dots-on-a-line** (não pills): `.ai-step::after` desenha a linha conectora; done = moss, active = rust + scale 1.4 + pulsing.
3. **Cards inline (project picker / theme preview)** dentro dos turns da AI. Não há painel lateral.
4. **Final artifact card** (`.ai-artifacts`) aparece no último turn AI quando `current_stage >= 5` ou `output_ready` fired. Botões: baixar HTML, nova conversa.
5. **Modais abrem sobre o shell inteiro** (não confinados à aba).
6. **Container width**: `#ai-assist-card max-width: 760px`, frame `min(78vh, 820px)`, thread max-width 640px.
7. **Tag row acima do composer** mirrora opções de quick-reply — atualmente baseado em `**bold**` no markdown da AI, **será revisado** (ver pendências).

## ⚠️ PENDENTE — não shipped (UX já aprovada)

A última coisa que o usuário aprovou e ainda não foi implementada:

### 1. Substituir `**bold**` clicável por tool `present_options`

**Motivação**: o usuário pediu "função aplicada apenas às perguntas que a IA quer que o usuário responda" — bold pega falsos positivos (ex: AI bola um nome de marca extraído). A tool deixa explícito.

**Implementação**:

**Backend** (`server.ts`):
- Adicionar tool `present_options` em `CHAT_TOOLS`:
  ```ts
  {
    name: 'present_options',
    description: 'Apresenta opções de resposta clicáveis pro usuário escolher.',
    input_schema: {
      type: 'object',
      properties: {
        context: { type: 'string', description: 'breve descrição do que está sendo perguntado' },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'texto curto que vira a resposta clicável (1-4 palavras)' },
              description: { type: 'string', description: 'detalhe complementar' },
              theme_slug: { type: 'string', description: 'opcional — referência visual de template da biblioteca' }
            },
            required: ['label']
          }
        },
        allow_skip: { type: 'boolean', description: 'true se o usuário pode pular esta pergunta' }
      },
      required: ['context', 'options']
    }
  }
  ```
- No `executeChatTool`, case `'present_options'`: retorna `{ack:true}` e emite `ui_signal {kind:'present_options', payload: input}`.
- Atualizar `CHAT_SYSTEM_PROMPT`: remover seção "Marcação de opções clicáveis (CRÍTICO)" e substituir por instrução pra usar `present_options` exclusivamente. Bold (`**`) volta a ser ênfase comum (rara). Adicionar guidance:
  - `theme_slug` SÓ em perguntas onde o visual ajuda (vibe, layout, estilo). Pra "tom" ou "audiência", deixar sem.
  - `allow_skip:true` quando a resposta é opinativa/estética (vibe, tom). Não usar em perguntas factuais (URL, etc).
  - Se usuário responder "pula" / "sem preferência" / "você escolhe", avançar usando Taste DNA como guia.

**Frontend** (`index.html`):
- Em `inlineFmt`: reverter `\*\*([^*\n]+?)\*\*` de `<a class="ai-link" data-fill="...">` pra `<strong>` plain.
- Adicionar handler `ui_signal` `present_options` em `handleUiSignal`:
  - Renderizar inline cards (grid responsivo, max 3 por linha desktop, scroll horizontal mobile) DENTRO do turn AI atual.
  - Cada card: label (Instrument Serif italic 22px) + description (10px Inter) + (se `theme_slug`) iframe thumbnail (~160x100, transform scale como já é feito na galeria) com badge mudo "ref".
  - Mirror das labels na `.ai-tag-row` acima do composer (text-only, sem thumbnails).
  - Se `payload.allow_skip`, append chip "pular" no fim da row com classe `.ai-tag.skip` (sem ponto rust, borda cinza, hover muted).
- Click delegation já existe — só precisa lidar com novo seletor `.ai-card[data-fill]` e `.ai-tag.skip`.
- Skip chip click: dispara `trySend` direto com texto preset `"sem preferência forte, escolhe pelo seu critério"` (NÃO só preenche composer — manda).
- CSS novo:
  - `.ai-tag.skip` — sem `::before`, borda `var(--ai-very-dim)`, color `var(--ai-ink-2)`, hover não-rust.
  - `.ai-option-card` — variante de `.ai-card` com slot pra thumbnail. Aspect-ratio 16:10 ou 4:3 pro thumb.
  - `.ai-option-card .thumb-badge` — pílula `position:absolute` no canto top-right do thumb com texto "ref" em 9px letterspacing.
- O commit `db81614` (linking de bold) precisa ser revertido como parte deste trabalho. Mantém o commit `97c6309` (sizing) — esse não muda.

### 2. (já incluso acima) Skip button

Agrupado na pendência 1: chip "pular" no fim da tag row, só quando `allow_skip:true` veio com `present_options`.

### 3. Thumbnails ilustrando opções de layout

Agrupado na pendência 1: campo opcional `theme_slug` em cada option. AI escolhe o template exemplar quando faz sentido.

## Outros riscos / open issues

- **Anthropic-only chat**: chat hardcoded em `claude-sonnet-4-6`. Se BYO key tiver `provider:'google'` selecionado, IA Assist quebra com "apiKey é obrigatório". Surface uma mensagem mais útil — ou auto-switch e explicar.
- **Sem prompt caching**: cada turno reenvia 8.2k chars de system prompt. Adicionar `cache_control:{type:'ephemeral'}` no system pra economizar tokens.
- **Sem regenerate de inject**: usuário não tem como dizer "tenta de novo" sem reabrir todo o flow. Considerar botão "tentar de novo" no `.ai-artifacts`.
- **idleTimeout no Bun**: 2.0 não está com `idleTimeout` configurado no `Bun.serve` export — chats longos podem ser cortados em 10s. Verificar bottom de `server.ts` (em 3.0 setei pra 255s, copiar). Em Vercel não importa (300s default).
- **Playwright em Vercel**: `mirrorSite` chama `chromium.launch({headless:true})` — em serverless, não vai funcionar sem `@sparticuz/chromium-min` ou similar. Confirmar antes de deployar.

## Local dev

```bash
cd "/Users/adilsonporto/Desktop/IA/Demarcelizer 2.0"
bun --hot server.ts
```

Default port 3000. Hot reload pega `server.ts`. `index.html` é servido estático — hard refresh (Cmd+Shift+R) pra ver mudanças.

Pra testar IA Assist:
1. Abre `http://localhost:3000`
2. Clica no menu BYO key (canto superior direito) e cola Anthropic key
3. Clica na aba **IA Assist**
4. Cola URL no composer (ex: `https://stripe.com/payments`)
5. Conversa

Erros aparecem inline como pílulas vermelhas. Console do browser tem `[ai-assist] stream failed` quando o SSE quebra.

## Histórico de commits relevantes (branch `ia-assist-tab`)

```
db81614 feat: clickable option links + quick-reply tag chips     ← REVERTER no próximo trabalho
97c6309 style: tighten IA Assist conversation card                ← keep
c298df6 feat: add IA Assist tab — single-conversation UI          ← keep (base do frontend)
ae13a2e feat: add /api/chat SSE endpoint for IA Assist tab        ← keep (base do backend)
9dfab34 chore: ignore .vercel project link directory
```

## Ordem sugerida pra próxima sessão

1. Ler este arquivo.
2. Conferir que server boota (`bun --hot server.ts`) e UI carrega.
3. Implementar `present_options` (backend tool + system prompt update).
4. Implementar handler frontend (cards inline com thumbnails + chips + skip).
5. Reverter o linking de `**bold**` em `inlineFmt`.
6. Testar end-to-end com URL real (stripe.com/payments é leve e tem vibe clara).
7. Commitar como `feat: replace bold-link with present_options tool + thumbnails + skip`.
8. Sugerir merge → main + deploy. Confirmar Playwright runtime no Vercel antes do `--prod`.
9. Atualizar este arquivo (`HANDOFF_IA_ASSIST.md`) marcando o que foi feito e o que sobrou.
