# Coding Agent Rules & Guidelines

## General Principles
- **Action Over Talk**: Prioritize doing work over explaining it.
- **Minimalist Aesthetic**: Follow a clean, light-themed, minimalist design language. Use ample whitespace, subtle borders, and refined typography.
- **Component-Driven**: Build modular, reusable React components.

## Dependencies & Environment
- **React**: ^19.0.0
- **Vite**: ^6.2.0
- **Tailwind CSS**: ^4.1.14 (Use for all styling)
- **Framer Motion**: ^12.23.24 (Use for smooth transitions and layout animations)
- **Lucide React**: ^0.546.0 (Use for icons)
- **openai**: ^6.33.0 (Use for Azure OpenAI API calls via AzureOpenAI client)

## AI Service Layer
- The AI service is in `src/services/azure-openai.ts`
- It uses the `openai` npm package configured for Azure (`AzureOpenAI` client)
- All structured outputs use Zod schemas + `zodResponseFormat`
- Environment variables are injected at build time via `vite.config.ts` `define` block
- Required env vars: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_VERSION`, `AZURE_OPENAI_DEPLOYMENT_NAME`

## Unit Testing Strategy

### Test-first mode
- when adding new features: write or update unit tests first, then code to green
- prefer component tests for UI state changes
- for regressions: add a failing test that reproduces the bug, then fix to green

## Code Structure
- `/src/components/`: Reusable UI components.
- `/src/services/`: API and external service integrations.
  - `azure-openai.ts` — primary AI service (Azure OpenAI)
  - `ai.ts` — legacy Gemini service (not used, kept for type exports)
