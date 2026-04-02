# Brand Archeologist

Brand Archeologist is a Vite + React research app with two primary workflows:

- Cultural Archeologist: generate audience and culture insights.
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
*** Add File: /Users/brussell/Downloads/Code/Cultural Archeologist/cultural-archaeologist-azure-claude-fixed/.env.example
AZURE_OPENAI_API_KEY=your-azure-openai-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com/
AZURE_OPENAI_API_VERSION=2024-02-15-preview
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
