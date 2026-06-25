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
- Tailor output by delivery channel at submit time.
  - Users can choose a primary channel before transforming: email, mail, website, or social.
  - If social is selected, users can choose a social sub-channel: LinkedIn, TikTok, Instagram, or Facebook.
  - VOICE keeps facts intact while adapting structure, pacing, and style for the selected channel.
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

### Optional: Work IQ integration

VOICE supports two Work IQ integration patterns:

#### Pattern 1: Simple gateway (node server talks directly to Work IQ)
Use this if your server is calling a Work IQ gateway endpoint:
- `WORK_IQ_ENDPOINT`: HTTPS endpoint for a tenant-approved Work IQ or Foundry-backed context gateway.
- `WORK_IQ_API_KEY`: bearer token sent to the Work IQ gateway.
- `WORK_IQ_FORWARD_ACCESS_TOKEN=true`: opt-in; forwards Easy Auth's delegated `x-ms-token-aad-access-token` header to the gateway.

#### Pattern 2: Foundry agents with Work IQ (agents consume Work IQ via A2A)
Use this if agents running in Foundry need to call Work IQ as a tool. Configuration is done in **Foundry portal**, not here:
1. Create an app registration in Microsoft Entra with `WorkIQAgent.Ask` permission (see [Work IQ Foundry setup guide](#work-iq-foundry-setup)).
2. In Foundry → **Settings** > **Connections** > **Work IQ**: Enter the app's client ID, secret, tenant ID, and OAuth URLs.
3. In your agent code, reference the Foundry connection ID when adding the Work IQ tool.
Credentials are stored in Foundry, not in `.env`.

#### Pattern 3: Agent-backed work context picker (VOICE calls your Foundry agent)
Use this if you want VOICE to search references through a Foundry agent, let users pick a reference, load content into the VOICE editor, then stylize with the selected voice.

Required app settings for this pattern:
- `WORK_IQ_AGENT_ENDPOINT`: Foundry project endpoint (for example `https://<resource>.services.ai.azure.com/api/projects/<project>`)
- `WORK_IQ_AGENT_API_KEY`: API key for the Foundry project endpoint
- `WORK_IQ_AGENT_NAME`: Agent name/alias to invoke
- Optional: `WORK_IQ_AGENT_VERSION`: specific agent version

How it behaves in the VOICE studio:
1. User enables **Use my work context**
2. User enters a work-context query
3. User clicks **Find references**
4. User selects a reference from the list
5. VOICE loads retrieved content into **Your content**
6. User clicks **Transform** to stylize text with the selected VOICE persona

The Work IQ gateway must accept a `POST` body with `query`, `content`, `voiceName`, and `user`, and should return JSON with `summary` plus optional `references`, `sources`, or `citations`. VOICE does not store Work IQ context; it uses the response only for the current draft.

## Work IQ Foundry setup

If agents in Foundry need to consume Work IQ data (emails, meetings, files, Teams messages) on behalf of your users, follow these steps:

### Prerequisites
- Microsoft Entra **Global Administrator** role (or delegated app admin)
- An active Microsoft Foundry project at ai.azure.com
- App registration: "Work IQ A2A" already created in Entra with `WorkIQAgent.Ask` permission and admin consent granted

### Complete Foundry configuration (steps 6+)

1. **Create a client secret** in your app registration:
   - Go to [Microsoft Entra admin center](https://entra.microsoft.com/)
   - Select your app registration → **Certificates & secrets** → **New client secret**
   - Add a description (e.g., "Foundry Work IQ") and set expiration
   - Click **Add**, then **immediately copy the secret Value** (only shown once)

2. **Get your tenant ID**:
   - In Entra, go to **Entra ID** → **Overview**
   - Copy **Directory (tenant) ID**

3. **Create a Work IQ connection in Foundry**:
  - Go to [Microsoft Foundry portal](https://ai.azure.com/nextgen)
  - Open your project, then navigate:
    - **Operate** → **Admin**
    - Select your project
    - **Connected resources**
    - **Add connection** (choose **Work IQ**)
   - Fill in these fields:
     - **Client ID**: Your app registration's Application (client) ID
     - **Client secret**: Paste the secret from step 1
     - **Authorization URL**: `https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/authorize`
     - **Token URL**: `https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token`
     - **Refresh URL**: `https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token`
     - **Scopes**: `api://workiq.svc.cloud.microsoft/WorkIQAgent.Ask,offline_access`
   - Replace `{tenant-id}` with your Directory (tenant) ID
   - Click **Save**

4. **Add the redirect URI to your app registration**:
   - Foundry displays an OAuth redirect URL after saving the connection
   - Copy that URL
   - In Entra, go to your app → **Authentication** → **Add a platform** → **Web**
   - Paste the redirect URL under **Redirect URIs**
   - Click **Configure**

5. **Use the connection in agents**:
   - In agent code, reference the Foundry connection ID when creating a Work IQ tool
   - See [Connect agents to Microsoft 365 with Work IQ - Microsoft Learn](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/work-iq) for code examples (Python, C#, JavaScript, REST API)

**Reference**: [Work IQ Foundry authentication and security setup](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/work-iq#authentication-and-security)

### Troubleshooting: Work IQ connection not available in Foundry

If you navigate to **Operate** → **Admin** → **Connected resources** → **Add connection** but **Work IQ is not in the list**, the form in step 3 never appears. Check these in order:

**Prerequisite: Is Work IQ feature available?**
   - If **Work IQ doesn't appear anywhere in your Foundry Admin panel** (not even in Connected resources), the feature is **not enabled for your project**
   - This is a **feature gate** that Microsoft controls—it's not a configuration issue
   - **To fix**: Contact [Azure Foundry support](https://learn.microsoft.com/en-us/azure/foundry/concepts/support#get-support) and request: *"Please enable Work IQ feature for our Foundry project (region: [your-region])"*
   - Note: Work IQ app registration setup, service principal provisioning, and API permissions are all independent of this feature gate. Configure those first, then request the feature gate enablement

Then check these in order:

1. **Work IQ service principal not provisioned (most common if you're past the feature gate)**
   - In Entra admin center, go to **Enterprise applications**
   - Search for app ID: `fdcc1f02-fc51-4226-8753-f668596af7f7`
   - If not found, you must provision it:
     - Go to [Work IQ API quickstart - Step 1](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq-api-quickstart?tabs=entra-admin#step-1-create-the-work-iq-service-principal-graph-explorer)
     - Use Graph Explorer to create the service principal
     - Expected response: `201 Created` (or `409 Conflict` if already exists—that is fine)

2. **App registration missing WorkIQAgent.Ask permission**
   - In Entra, go to your app registration → **API permissions**
   - Verify `WorkIQAgent.Ask` is listed with a green checkmark ✓ (admin consent granted)
   - If missing, add it: **Add a permission** → **APIs my organization uses** → search `fdcc1f02-fc51-4226-8753-f668596af7f7` → **Delegated permissions** → `WorkIQAgent.Ask` → **Grant admin consent**

3. **User lacks Foundry Project Manager role**
   - You need `Foundry Project Manager` role at the Foundry project scope to create connections
   - Also ensure you have `Foundry User` role
   - Ask your Foundry admin to assign these roles in Azure RBAC

4. **Foundry project uses network restrictions**
   - Work IQ preview does not support VNet-restricted endpoints
   - If your Foundry project has network restrictions, Work IQ will not appear in Add connection
   - Contact Microsoft support for alternatives

5. **Region or SKU does not support Work IQ preview**
   - Work IQ is in preview; some regions or SKUs may not have it enabled yet
   - Check [Work IQ prerequisites](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/work-iq#prerequisites) for availability in your region

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
- Channel-aware transform targeting, including social sub-channel selection and prompt shaping.
- Mobile VOICE and Sponsor Thinking layouts: no horizontal overflow, stacked panes, and usable sponsor modal controls.

## Agent skills

- Entra auth implementation guardrails: `.github/skills/entra-auth-best-practices/SKILL.md`
  - Purpose: gives agents a repeatable workflow for stable Microsoft Entra integration, including loop-trap prevention and release validation checks.
  - Example invocation: `/entra-auth-best-practices Node/Express with Easy Auth, callback loops on login`.
