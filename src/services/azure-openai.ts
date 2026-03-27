import { AzureOpenAI } from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { CulturalMatrix, MatrixItem, UploadedFile, DeepDiveReport } from "./ai";

// ============================================================================
// AZURE OPENAI MIGRATION GUIDE
// ============================================================================
// To switch from Gemini to Azure OpenAI:
// 1. In `src/App.tsx`, change the import path from `./services/ai` to `./services/azure-openai`
// 2. Set the following environment variables in your Azure environment or .env file:
//    - AZURE_OPENAI_API_KEY
//    - AZURE_OPENAI_ENDPOINT (e.g., https://your-resource-name.openai.azure.com/)
//    - AZURE_OPENAI_API_VERSION (e.g., 2024-02-15-preview)
//    - AZURE_OPENAI_DEPLOYMENT_NAME (e.g., gpt-4o)
// ============================================================================

function getAzureAI() {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-02-15-preview";
  
  if (!apiKey || !endpoint) {
    console.warn("Missing Azure OpenAI credentials. Please set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT.");
  }

  return new AzureOpenAI({
    apiKey: apiKey || "dummy-key",
    endpoint: endpoint || "https://dummy-endpoint.openai.azure.com/",
    apiVersion: apiVersion,
    dangerouslyAllowBrowser: true // Required if calling directly from the browser
  });
}

// Helper to get the deployment name
const getDeploymentName = () => process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-4o";

// Zod schemas for structured outputs
const DeepDiveReportSchema = z.object({
  originationDate: z.string(),
  relevance: z.string(),
  expandedContext: z.string(),
  strategicImplications: z.array(z.string()),
  realWorldExamples: z.array(z.string()),
  sources: z.array(z.object({
    title: z.string(),
    url: z.string()
  }))
});

export async function generateDeepDive(
  insight: MatrixItem,
  context: { audience: string; brand: string; generations: string[]; topicFocus?: string }
): Promise<DeepDiveReport> {
  const prompt = `You are an expert Cultural Archeologist and Brand Strategist.
  I am providing you with a specific cultural insight about the following audience:
  Audience: ${context.audience}
  Brand Context: ${context.brand}
  Generations: ${context.generations.join(', ')}
  ${context.topicFocus ? `Topic Focus: ${context.topicFocus}` : ''}
  
  Insight: "${insight.text}"
  
  Please provide a deep dive into this specific insight to help me build strategies.`;

  const response = await getAzureAI().chat.completions.create({
    model: getDeploymentName(),
    messages: [{ role: "user", content: prompt }],
    response_format: zodResponseFormat(DeepDiveReportSchema, "deep_dive_report"),
  });

  const text = response.choices[0].message.content || "{}";
  return JSON.parse(text) as DeepDiveReport;
}

export async function generateDeepDivesBatch(
  insights: MatrixItem[],
  context: { audience: string; brand: string; generations: string[]; topicFocus?: string }
): Promise<DeepDiveReport[]> {
  const prompt = `You are an expert Cultural Archeologist and Brand Strategist.
  I am providing you with a list of specific cultural insights about the following audience:
  Audience: ${context.audience}
  Brand Context: ${context.brand}
  Generations: ${context.generations.join(', ')}
  ${context.topicFocus ? `Topic Focus: ${context.topicFocus}` : ''}
  
  Insights:
  ${insights.map((insight, index) => `${index + 1}. "${insight.text}"`).join('\n')}
  
  Please provide a deep dive into EACH of these specific insights to help me build strategies.`;

  const response = await getAzureAI().chat.completions.create({
    model: getDeploymentName(),
    messages: [{ role: "user", content: prompt }],
    response_format: zodResponseFormat(z.object({ reports: z.array(DeepDiveReportSchema) }), "deep_dive_reports"),
  });

  const text = response.choices[0].message.content || "{}";
  const parsed = JSON.parse(text);
  return parsed.reports || [];
}

const MatrixAnswerSchema = z.object({
  answer: z.string(),
  relevantInsights: z.array(z.string())
});

export async function askMatrixQuestion(matrix: CulturalMatrix, question: string): Promise<{ answer: string, relevantInsights: string[] }> {
  const response = await getAzureAI().chat.completions.create({
    model: getDeploymentName(),
    messages: [
      { role: "system", content: "You are an expert analyst. Answer the user's question based on the provided cultural archeologist data. Provide a clear answer, and also list the exact 'text' of any insights from the data that are relevant to your answer." },
      { role: "user", content: `Data:\n\n${JSON.stringify(matrix)}\n\nQuestion: "${question}"` }
    ],
    response_format: zodResponseFormat(MatrixAnswerSchema, "matrix_answer"),
  });
  
  const text = response.choices[0].message.content || "{}";
  return JSON.parse(text);
}

const SuggestBrandsSchema = z.object({
  brands: z.array(z.string())
});

export async function suggestBrands(partialName: string): Promise<string[]> {
  if (!partialName || partialName.length < 2) return [];
  try {
    const response = await getAzureAI().chat.completions.create({
      model: getDeploymentName(),
      messages: [
        { role: "user", content: `Suggest 5 well-known brands, categories, or companies that match or start with the partial name: "${partialName}".` }
      ],
      response_format: zodResponseFormat(SuggestBrandsSchema, "suggest_brands"),
    });
    const text = response.choices[0].message.content || "{}";
    const parsed = JSON.parse(text);
    return parsed.brands || [];
  } catch (e) {
    console.error("Error suggesting brands:", e);
    return [];
  }
}

const AutoPopulateSchema = z.object({
  brand: z.string().optional(),
  audience: z.string().optional(),
  topicFocus: z.string().optional()
});

export async function autoPopulateFields(
  brand: string,
  audience: string,
  topicFocus: string
): Promise<{ brand?: string, audience?: string, topicFocus?: string }> {
  const response = await getAzureAI().chat.completions.create({
    model: getDeploymentName(),
    messages: [
      { role: "user", content: `Given the following partial information about a marketing or cultural strategy:
Brand or Category: ${brand || "(empty)"}
Primary Audience: ${audience || "(empty)"}
Topic Focus: ${topicFocus || "(empty)"}

Please infer the missing fields based on the provided fields. 
Only include the keys for the fields that were originally "(empty)".
Keep the inferred values concise (1-5 words).` }
    ],
    response_format: zodResponseFormat(AutoPopulateSchema, "auto_populate"),
  });

  const text = response.choices[0].message.content || "{}";
  return JSON.parse(text);
}

const MatrixItemSchema = z.object({
  text: z.string(),
  isHighlyUnique: z.boolean().describe("Set to true ONLY if this insight is extremely unique to this specific audience/group when compared against a baseline audience of the same average age, race/ethnicity, and gender breakdown, but OUTSIDE of the specific brand, industry, or topic being analyzed."),
  sourceType: z.string().describe("The type of source this insight was derived from (e.g., 'Mainstream', 'Fringe', 'Topic-Specific', 'Alternative Media', 'Academic', 'Social Media', etc.)"),
  isFromDocument: z.boolean().optional().describe("Set to true if this insight was derived from the attached documents.")
});

const SourceSchema = z.object({
  title: z.string(),
  url: z.string()
});

const CulturalMatrixSchema = z.object({
  demographics: z.object({
    age: z.string(),
    race: z.string(),
    gender: z.string()
  }),
  moments: z.array(MatrixItemSchema),
  beliefs: z.array(MatrixItemSchema),
  tone: z.array(MatrixItemSchema),
  language: z.array(MatrixItemSchema),
  behaviors: z.array(MatrixItemSchema),
  contradictions: z.array(MatrixItemSchema),
  community: z.array(MatrixItemSchema),
  influencers: z.array(MatrixItemSchema),
  sources: z.array(SourceSchema)
});

export async function generateCulturalMatrix(audience: string, brand?: string, generations?: string[], topicFocus?: string, files?: UploadedFile[], sourcesType?: string[]): Promise<CulturalMatrix> {
  const contextStr = brand ? ` in the context of the brand/category: "${brand}"` : "";
  const topicStr = topicFocus ? `\n\nCRITICAL: You MUST focus all your insights specifically on the topic of "${topicFocus}". Only show results relevant to this topic.` : "";
  const generationStr = generations && generations.length > 0
    ? `\n\nCRITICAL: You MUST restrict your research and insights ONLY to the following generations: ${generations.join(', ')}.`
    : "";
  const filesStr = files && files.length > 0
    ? `\n\nI have attached some documents. Please use the information from these documents to help generate the results, in addition to your general knowledge and internet search. If an insight is derived from the attached documents, please set isFromDocument to true.`
    : "";
  const sourcesTypeStr = sourcesType && sourcesType.length > 0
    ? `\n\nCRITICAL: You MUST restrict your sources and insights to be derived primarily from ${sourcesType.join(', ')} sources. Adjust your tone, findings, and the specific cultural signals you highlight to reflect the unique perspective, narratives, and biases of these media types.`
    : "";

  const systemInstruction = "You are an expert cultural strategist and marketer. Your goal is to provide deep, accurate, and actionable cultural insights for the requested audience based on recent data. Highlight results that are extremely unique to this audience by setting isHighlyUnique to true (comparing them against demographic peers who are NOT involved in this specific brand, industry, or topic).";

  const prompt = `Generate a comprehensive cultural archeologist report for the following audience: "${audience}"${contextStr}.${topicStr}${generationStr}${filesStr}${sourcesTypeStr}
    
    Ensure the research and context are recent (from the last couple of years, 2024-2026).
    CRITICAL: For each category, provide at least 6-10 highly detailed and specific insights to ensure a rich and comprehensive report.
    CRITICAL: Within each category, you MUST order the observations by "potency" (i.e., the frequency and strength of the cultural signal), with the most potent observations first.
    CRITICAL: You are acting as a senior marketing strategist. The ideas and insights you bring MUST be new, exciting, contrarian, and something the client has likely never heard before. Avoid mainstream consensus and obvious observations. Focus on "weak signals", emerging fringe behaviors, counter-intuitive trends, and deep psychological drivers that are not widely discussed.
    
    Categorize the insights into:
    - MOMENTS: Context of the time. What external forces are shaping behaviour right now? (Current events, Social climate, Trends)
    - BELIEFS: What they believe. What external forces are shaping behaviour right now? (Beliefs, Values, Myths, Perceptions)
    - TONE: What they feel and how they feel that is unique (Attitude, Emotions, Personality, Outlook)
    - LANGUAGE: How they communicate (Vernacular, Symbols, Codes, Visuals)
    - BEHAVIORS: How they act/interact. What signals, symbols, or rituals carry meaning? (Actions, Customs, Rituals, Ceremonies)
    - CONTRADICTIONS: What tensions or shifts are emerging in values or behaviors?
    - COMMUNITY: Who do people look to for identity or belonging?
    - INFLUENCERS: People who are shaping their beliefs & behavior.
    
    Also provide a rough demographic breakdown (age, race, gender) for this audience in the context of the brand/category.`;

  // Note: Azure OpenAI does not have a built-in "googleSearch" tool like Gemini.
  // To achieve similar web-grounding, you would need to implement an external search tool
  // (like Bing Search API) and use OpenAI's function calling to fetch results.
  // For this template, we rely on the model's internal knowledge.

  const messages: any[] = [
    { role: "system", content: systemInstruction },
    { role: "user", content: prompt }
  ];

  // Add file contents if any (Azure OpenAI supports base64 images, but for documents, 
  // you typically extract text and append it to the prompt)
  if (files && files.length > 0) {
    const fileContents = files.map(f => `File: ${f.name}\nContent: ${f.data}`).join("\n\n");
    messages.push({ role: "user", content: `Attached Documents:\n${fileContents}` });
  }

  const response = await getAzureAI().chat.completions.create({
    model: getDeploymentName(),
    messages: messages,
    response_format: zodResponseFormat(CulturalMatrixSchema, "cultural_matrix"),
  });

  const draftText = response.choices[0].message.content;
  if (!draftText) {
    throw new Error("No response from Azure OpenAI");
  }

  // Chain of Thought Verification / Self-Critique Step
  const reviewPrompt = `You are an expert cultural researcher and fact-checker. Review the following draft cultural archeologist report for the audience: "${audience}"${contextStr}.${topicStr}${generationStr}${sourcesTypeStr}

Draft Report:
${draftText}

Your task is to:
1. Fact-check the sources. Remove any dead links or hallucinated URLs.
2. Ensure the insights are highly accurate, potent, and specific to the audience.
3. Verify that the insights and sources strongly align with the requested source type (${sourcesType && sourcesType.length > 0 ? sourcesType.join(', ') : 'any'}).
4. Refine the language to be professional and insightful.
5. Return the final, verified report in the exact same JSON format.

Do not include any commentary outside the JSON structure.`;

  const finalResponse = await getAzureAI().chat.completions.create({
    model: getDeploymentName(),
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: reviewPrompt }
    ],
    response_format: zodResponseFormat(CulturalMatrixSchema, "cultural_matrix"),
  });

  const finalText = finalResponse.choices[0].message.content;
  if (!finalText) {
    throw new Error("No response from Azure OpenAI during review step");
  }

  return JSON.parse(finalText) as CulturalMatrix;
}
