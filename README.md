# VOICE

**VOICE Optimizes Intent, Clarity, and Expression** is a writing-voice and thinking-persona studio for exploring, tuning, and applying distinct communication styles.

## What this app does

- Explore 13 built-in writing personas across 33 voice/tone/structure levers.
- Tune live sliders in Voice Lab, blend personas, and transform text through server-side Azure AI.
- Create, tag, save, edit, redesign, and delete custom personas.
- Use owner-restricted hyper-personalization (style fingerprint) with terms-of-use enforcement.
- Use owner tools to package personas as M365 Copilot agent bundles.
- Use a responsive layout with mobile-specific stacking, full-width actions, and overflow-safe modals for phones and tablets.
- Use all-member Work IQ context-aware drafting controls in the Studio.
  - Members can opt into "Use my work context" and describe what VOICE should look for in Microsoft 365 context.
  - The server sends the user's query and draft to a configured Work IQ gateway, then grounds the Azure AI rewrite in returned context and citations.
  - If Work IQ is not configured, the control remains visible but disabled with a clear deployment message.
- Use marketing-gated Sponsor Thinking Lab workflows for sponsor archetype strategy.
  - Marketing users switch between a separate VOICE workspace and Sponsor Thinking workspace instead of seeing both workflows stacked together.
  - Sponsor Thinking uses a three-step metaphor: build the cast of sponsor archetypes, match voices to the selected archetype, then rehearse a message against that same archetype.
  - Built-in sponsor personas use distinct sponsor archetypes so the sponsor grid spans multiple thinking patterns.
  - Sponsor persona names are enforced as descriptive archetypes (not human names).
  - Original sponsor persona description text is persisted with each custom sponsor persona.
  - AI-derived sponsor profile fields are normalized to valid dropdown values for consistent demographic/behavioral/psychographic selections.
  - Voice resonance matching ranks all saved voices against a selected sponsor archetype and returns lever-level tuning guidance for a chosen voice.
  - Message rehearsal sends the selected sponsor archetype plus editable profile levers to AI, then renders the likely reaction without replacing the selected archetype with a new persona.

## Access model

- **Anonymous users**: receive standard unauthorized HTTP response.
- **Authenticated non-members**: redirected to the welcome/request-access page.
- **AI Advancement Committee Tools members**: full VOICE access.
- **Work IQ drafting**: available to all authenticated VOICE members when a Work IQ gateway is configured.
- **Owners** (`OWNER_EMAILS`): hyper-personalization + elevated edit/publish controls.
- **Marketing users** (`MARKETING_EMAILS`): sponsor-thinking workspace access.

## Local run

```powershell
npm install
npm start
```

App runs at `http://localhost:8080`.

## Required environment variables

- `AI_ENDPOINT`
- `AI_API_KEY`
- `AI_MODEL`
- Optional: `AI_API_FORMAT`, `AI_API_VERSION`
- Optional access control: `ALLOWED_GROUP_IDS`, `OWNER_EMAILS`, `MARKETING_EMAILS`
- Optional Work IQ integration:
  - `WORK_IQ_ENDPOINT`: HTTPS endpoint for a tenant-approved Work IQ or Foundry-backed context gateway.
  - `WORK_IQ_API_KEY`: optional bearer token sent to the Work IQ gateway.
  - `WORK_IQ_FORWARD_ACCESS_TOKEN=true`: opt-in only; forwards Easy Auth's delegated `x-ms-token-aad-access-token` to the configured gateway.

The Work IQ gateway must accept a `POST` body with `query`, `content`, `voiceName`, and `user`, and should return JSON with `summary` plus optional `references`, `sources`, or `citations`. VOICE does not store Work IQ context; it uses the response only for the current draft.

## Architecture diagram

```mermaid
flowchart LR
  subgraph Client[Browser client]
    UI[index.html + welcome.html]
    JS[js/app.js]
    Data[js/voices.js]
    Style[css/styles.css]
    UI --> JS
    JS --> Data
    UI --> Style
  end

  subgraph Server[Node server]
    Srv[server.js]
    ApiHealth[GET /api/health]
    ApiMe[GET /api/me]
    ApiTransform[POST /api/transform]
    ApiWorkIq[POST /api/work-context-draft]
    ApiDescribe[POST /api/describe]
    ApiSponsor[POST /api/sponsor-reaction]
    ApiVoices[/api/voices + /api/sponsor-personas]
    ApiTerms[POST /api/terms/accept]
    ApiAccess[POST /api/access-request]
    Srv --> ApiHealth
    Srv --> ApiMe
    Srv --> ApiTransform
    Srv --> ApiWorkIq
    Srv --> ApiDescribe
    Srv --> ApiSponsor
    Srv --> ApiVoices
    Srv --> ApiTerms
    Srv --> ApiAccess
  end

  subgraph Platform[Azure App Service]
    EasyAuth[Easy Auth
x-ms-client-principal]
    Env[App Settings
AI_* WORK_IQ_* ALLOWED_GROUP_IDS
OWNER_EMAILS MARKETING_EMAILS]
  end

  subgraph External[External services]
    AzureAI[Azure AI endpoint
Anthropic or OpenAI format]
    WorkIQ[Work IQ gateway]
  end

  subgraph Storage[Local JSON storage]
    VoiceFile[data/custom-voices.json]
    SponsorFile[data/custom-sponsor-personas.json]
    TermsFile[data/terms-acceptance.json]
    AccessFile[data/access-requests.json]
  end

  subgraph Tests[Quality gates]
    PW[e2e/*.spec.js]
    Config[playwright.config.js]
    PW --> Config
    PW --> UI
  end

  JS -->|fetch /api/*| Srv
  EasyAuth --> Srv
  Env --> Srv
  ApiTransform --> AzureAI
  ApiDescribe --> AzureAI
  ApiSponsor --> AzureAI
  ApiWorkIq --> WorkIQ
  ApiVoices <--> VoiceFile
  ApiVoices <--> SponsorFile
  ApiTerms <--> TermsFile
  ApiAccess <--> AccessFile
```

## Deployment

Use the reusable script:

```powershell
.\deploy.ps1
```

Optional parameters:

```powershell
.\deploy.ps1 -SubscriptionId "<subscription-guid>" -ResourceGroupName "<rg-name>" -WebAppName "<app-name>"
```

## End-to-end tests (Playwright)

```powershell
npm run test:e2e
```

Current coverage validates:

- Core VOICE shell and built-in persona rendering.
- Owner-only fingerprint entry point visibility.
- Marketing sponsor workspace visibility for marketing-authorized identity.
- Sponsor Thinking separation between archetype building, voice resonance matching, and message rehearsal.
- AI voice-to-sponsor resonance matching payloads, ranked output, and lever tuning guidance.
- Sponsor reaction rehearsal keeps custom selected sponsor archetypes as the visible context even when AI returns a different analysis lens internally.
- Work IQ Studio controls for members, disabled-state messaging, successful endpoint usage, and context/reference rendering.
- Mobile VOICE and Sponsor Thinking layouts: no horizontal overflow, stacked panes, and usable sponsor modal controls.
	U[User Browser]

	subgraph Frontend
		Index[index.html]
		Welcome[welcome.html]
		App[js/app.js]
		Voices[js/voices.js]
		Styles[css/styles.css]
		Index --> App
		Welcome --> App
		App --> Voices
		Index --> Styles
		Welcome --> Styles
	end

	subgraph Backend
		Server[server.js]
		Health[/api/health]
		Me[/api/me]
		Transform[/api/transform]
		WorkIQ[/api/work-context-draft]
		Describe[/api/describe]
		Sponsor[/api/sponsor-reaction]
		VoiceStore[/api/voices]
		Terms[/api/terms/accept]
		Access[/api/access-request]
		Server --> Health
		Server --> Me
		Server --> Transform
		Server --> WorkIQ
		Server --> Describe
		Server --> Sponsor
		Server --> VoiceStore
		Server --> Terms
		Server --> Access
	end

	subgraph External
		EasyAuth[Azure App Service Easy Auth]
		AzureAI[Azure AI Provider]
		WorkIQSvc[Work IQ Gateway]
	end

	subgraph Tests
		Playwright[e2e/*.spec.js]
		Config[playwright.config.js]
		Playwright --> Config
	end

	U --> Index
	U --> Welcome
	App -->|fetch /api/*| Server
	EasyAuth --> Server
	Transform --> AzureAI
	Describe --> AzureAI
	Sponsor --> AzureAI
	WorkIQ --> WorkIQSvc
```
