# Brand Archaeologist

Brand Archaeologist is a Vite + React research app with two primary workflows:

- Cultural Archaeologist: generate audience and culture insights.
- Visual Design Deep Dive: compare brand identity systems and visual signals.

The workspace also includes a small Express server used for persisted searches.

## Prerequisites

- Node.js 20+
- An Azure OpenAI deployment with the required credentials

## Environment Setup

Copy `.env.example` to `.env` and fill in these values:

- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_VERSION`
- `AZURE_OPENAI_DEPLOYMENT_NAME`

For the feedback chat widget (bottom-right popup), configure:

- `VITE_API_BASE_URL` (default: `http://localhost:3001`)
- `FEEDBACK_TO_EMAIL` (recipient mailbox for feedback notifications)
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE` (`true` for SMTPS, typically port 465)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM` (optional sender address)

## Local Development

1. Install dependencies with `npm install`.
2. Start the API server with `npm run server`.
3. In a separate terminal, start the Vite app with `npm run dev`.

The frontend runs on `http://localhost:3000` and the Express server runs on `http://localhost:3001`.

## Validation

- Run tests with `npm test`.
- Run type checks with `npm run lint`.
- Build the client with `npm run build`.

## Notes

- `.env` is ignored by git; keep credentials there and out of committed files.
- The current frontend still imports the Azure service layer directly, so Azure credentials should only be used in trusted local environments until that service is fully moved behind the server.

## LLM And Results Accuracy Log

This section tracks prompt, retrieval, schema, and result-quality upgrades made to improve factuality, specificity, and output consistency.

### 2026-04-05 (Current)

- Added lightweight grounding utility in `lib/grounding.ts`:
	- `fetchAudienceContext(audience)` calls Azure Bing Web Search using `BING_SEARCH_KEY`.
	- Query pattern: `"${audience} culture trends behaviors"`.
	- Collects top 5 web snippets and concatenates into a context block.
- Added `app/api/generate/route.ts` and injected grounding into system guidance:
	- Model instruction emphasizes grounding in real-time cultural data when available.
	- Falls back to explicit uncertainty language when grounding is unavailable.
- Enforced strict structured outputs for `/api/generate`:
	- Introduced strict `CulturalArchetype` schema (`category`, `title`, `description`).
	- Added OpenAI `response_format` with `type: "json_schema"` and `strict: true`.
	- Converted Zod schema to JSON Schema via `zod-to-json-schema`.
	- Added runtime safe-parse validation before returning to frontend.
- Added multi-shot prompting in `/api/generate`:
	- Injected 3 system/user teaching pairs before live user prompt.
	- Each pair contrasts a generic bad psychographic example vs. a strong culturally nuanced example.
- Added typed frontend consume helper in `src/services/generate-api.ts`:
	- Strong response schema parsing and safe error handling for `/api/generate`.

### 2026-04-05 (Cultural Matrix Accuracy)

- Added required `sociological_analysis` field to `CulturalMatrix` (`src/services/azure-openai.ts`).
- Updated cultural generation instructions to require a concise two-paragraph sociological synthesis before final category artifacts.
- Added UI presentation control in `src/App.tsx`:
	- `sociological_analysis` is shown in a collapsed `AI Reasoning` accordion for cleaner UX.

### 2026-04-05 (Visual Result Accuracy)

- Improved website logo extraction (`server/brand-images.ts`):
	- Candidate-based logo ranking instead of first-match extraction.
	- Strong penalties for favicon/icon-like assets and low-fidelity logo candidates.
	- Kept safe fallback behavior when confidence is low.
- Updated Brand Deep Dive visual sourcing (`src/components/BrandDeepDivePage.tsx`):
	- Prefer server-extracted `logoUrl` from `/api/brand-images` for result cards.
	- Reduced incorrect `/logo.svg`-style defaulting behavior.

### Environment Variables Added For Accuracy Features

- `BING_SEARCH_KEY`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_VERSION`
- `AZURE_OPENAI_DEPLOYMENT_NAME`
