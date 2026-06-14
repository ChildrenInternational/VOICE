# VOICE
VOICE doesn't treat writing as text you generate — it treats voice as a decision you make before the first sentence: who's speaking, and why. A studio for tuning how you communicate on purpose, not by accident.

## Architecture diagram

```mermaid
flowchart LR
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
