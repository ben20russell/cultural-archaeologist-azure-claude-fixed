import { GoogleGenAI, Type } from "@google/genai";

// ============================================================================
// AZURE OPENAI MIGRATION GUIDE
// ============================================================================
// The user requested to prepare this code to be recreated in Azure with the OpenAI API.
// A complete, drop-in replacement file has been created at:
// `src/services/azure-openai.ts`
//
// To switch your application from Gemini to Azure OpenAI:
// 1. Open `src/App.tsx`
// 2. Change the import path on line 9 from:
//    `import { ... } from './services/ai';`
//    to:
//    `import { ... } from './services/azure-openai';`
// 3. Set your Azure OpenAI environment variables (see `azure-openai.ts` for details).
// ============================================================================

function getAI() {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("No API_KEY found. Please ensure you have connected your Gemini account.");
  }
  return new GoogleGenAI({ apiKey: apiKey as string });
}

export interface MatrixItem {
  text: string;
  isHighlyUnique: boolean;
  isFromDocument?: boolean;
  sourceType?: string;
  deepDive?: DeepDiveReport;
}

export interface UploadedFile {
  name: string;
  mimeType: string;
  data: string; // base64 encoded data
}

export interface Source {
  title: string;
  url: string;
}

export interface Demographics {
  age: string;
  race: string;
  gender: string;
}

export interface CulturalMatrix {
  demographics: Demographics;
  moments: MatrixItem[];
  beliefs: MatrixItem[];
  tone: MatrixItem[];
  language: MatrixItem[];
  behaviors: MatrixItem[];
  contradictions: MatrixItem[];
  community: MatrixItem[];
  influencers: MatrixItem[];
  sources: Source[];
}

export interface DeepDiveReport {
  originationDate: string;
  relevance: string;
  expandedContext: string;
  strategicImplications: string[];
  realWorldExamples: string[];
  sources: Source[];
}

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
  
  Please provide a deep dive into this specific insight to help me build strategies.
  Return the response in JSON format with the following structure:
  - originationDate: The month and year when this insight first originated (e.g., "October 2023").
  - relevance: A brief statement on whether this insight is still relevant today and why.
  - expandedContext: A detailed explanation of why this insight is happening now and its deeper cultural roots.
  - strategicImplications: 3-5 bullet points on what this means for brands and marketers.
  - realWorldExamples: 2-3 examples of this insight manifesting in the real world (culture, media, or brand campaigns).
  - sources: A list of sources (URLs and titles) that inform this deep dive.`;

  const response = await getAI().models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          originationDate: { type: Type.STRING },
          relevance: { type: Type.STRING },
          expandedContext: { type: Type.STRING },
          strategicImplications: { type: Type.ARRAY, items: { type: Type.STRING } },
          realWorldExamples: { type: Type.ARRAY, items: { type: Type.STRING } },
          sources: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                url: { type: Type.STRING }
              },
              required: ["title", "url"]
            }
          }
        },
        required: ["originationDate", "relevance", "expandedContext", "strategicImplications", "realWorldExamples", "sources"]
      }
    }
  });

  const text = response.text || "";
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
  
  Please provide a deep dive into EACH of these specific insights to help me build strategies.
  Return the response in JSON format as an array of objects, where each object corresponds to the insight in the exact same order.
  Each object must have the following structure:
  - originationDate: The month and year when this insight first originated (e.g., "October 2023").
  - relevance: A brief statement on whether this insight is still relevant today and why.
  - expandedContext: A detailed explanation of why this insight is happening now and its deeper cultural roots.
  - strategicImplications: 3-5 bullet points on what this means for brands and marketers.
  - realWorldExamples: 2-3 examples of this insight manifesting in the real world (culture, media, or brand campaigns).
  - sources: A list of sources (URLs and titles) that inform this deep dive.`;

  const response = await getAI().models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            originationDate: { type: Type.STRING },
            relevance: { type: Type.STRING },
            expandedContext: { type: Type.STRING },
            strategicImplications: { type: Type.ARRAY, items: { type: Type.STRING } },
            realWorldExamples: { type: Type.ARRAY, items: { type: Type.STRING } },
            sources: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  url: { type: Type.STRING }
                },
                required: ["title", "url"]
              }
            }
          },
          required: ["originationDate", "relevance", "expandedContext", "strategicImplications", "realWorldExamples", "sources"]
        }
      }
    }
  });

  const text = response.text || "[]";
  return JSON.parse(text) as DeepDiveReport[];
}

export async function askMatrixQuestion(matrix: CulturalMatrix, question: string): Promise<{ answer: string, relevantInsights: string[] }> {
  const response = await getAI().models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Given the following cultural archeologist data:\n\n${JSON.stringify(matrix)}\n\nAnswer the user's question: "${question}"\n\nProvide a clear answer, and also list the exact 'text' of any insights from the data that are relevant to your answer.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          answer: { type: Type.STRING },
          relevantInsights: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["answer", "relevantInsights"]
      }
    }
  });
  
  const text = response.text;
  if (!text) {
    throw new Error("No response from Gemini");
  }
  return JSON.parse(text);
}

export async function suggestBrands(partialName: string): Promise<string[]> {
  if (!partialName || partialName.length < 2) return [];
  try {
    const response = await getAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Suggest 5 well-known brands, categories, or companies that match or start with the partial name: "${partialName}". Return ONLY a JSON array of strings.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    const text = response.text;
    if (!text) return [];
    return JSON.parse(text);
  } catch (e) {
    console.error("Error suggesting brands:", e);
    return [];
  }
}

export async function autoPopulateFields(
  brand: string,
  audience: string,
  topicFocus: string
): Promise<{ brand?: string, audience?: string, topicFocus?: string }> {
  const response = await getAI().models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Given the following partial information about a marketing or cultural strategy:
Brand or Category: ${brand || "(empty)"}
Primary Audience: ${audience || "(empty)"}
Topic Focus: ${topicFocus || "(empty)"}

Please infer the missing fields based on the provided fields. 
Return a JSON object with the keys "brand", "audience", and "topicFocus". 
Only include the keys for the fields that were originally "(empty)".
Keep the inferred values concise (1-5 words).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          brand: { type: Type.STRING },
          audience: { type: Type.STRING },
          topicFocus: { type: Type.STRING }
        }
      }
    }
  });

  const text = response.text;
  if (!text) return {};
  return JSON.parse(text);
}

export async function generateCulturalMatrix(audience: string, brand?: string, generations?: string[], topicFocus?: string, files?: UploadedFile[], sourcesType?: string[]): Promise<CulturalMatrix> {
  const itemSchema: any = {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING },
      isHighlyUnique: { 
        type: Type.BOOLEAN, 
        description: "Set to true ONLY if this insight is extremely unique to this specific audience/group when compared against a baseline audience of the same average age, race/ethnicity, and gender breakdown, but OUTSIDE of the specific brand, industry, or topic being analyzed." 
      },
      sourceType: {
        type: Type.STRING,
        description: "The type of source this insight was derived from (e.g., 'Mainstream', 'Fringe', 'Topic-Specific', 'Alternative Media', 'Academic', 'Social Media', etc.)"
      }
    },
    required: ["text", "isHighlyUnique", "sourceType"]
  };

  if (files && files.length > 0) {
    itemSchema.properties.isFromDocument = {
      type: Type.BOOLEAN,
      description: "Set to true if this insight was derived from the attached documents."
    };
  }

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

  const parts: any[] = [];
  
  if (files && files.length > 0) {
    for (const file of files) {
      parts.push({
        inlineData: {
          mimeType: file.mimeType,
          data: file.data
        }
      });
    }
  }

  parts.push({
    text: `Generate a comprehensive cultural archeologist report for the following audience: "${audience}"${contextStr}.${topicStr}${generationStr}${filesStr}${sourcesTypeStr}
    
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
    
    Also provide a list of sources (URLs and titles) that inform these insights.`
  });

  const matrixSchema = {
    type: Type.OBJECT,
    properties: {
      demographics: {
        type: Type.OBJECT,
        properties: {
          age: { type: Type.STRING, description: "Average age or age range" },
          race: { type: Type.STRING, description: "Primary racial/ethnic demographic makeup" },
          gender: { type: Type.STRING, description: "Primary gender makeup or split" }
        },
        required: ["age", "race", "gender"]
      },
      moments: { type: Type.ARRAY, items: itemSchema, description: "Context of the time. what external forces are shaping behaviour right now? (Current events, Social climate, Trends)" },
      beliefs: { type: Type.ARRAY, items: itemSchema, description: "What they believe. what external forces are shaping behaviour right now? (Beliefs, Values, Myths, Perceptions)" },
      tone: { type: Type.ARRAY, items: itemSchema, description: "What they feel and how they feel that is unique (Attitude, Emotions, Personality, Outlook)" },
      language: { type: Type.ARRAY, items: itemSchema, description: "How they communicate (Vernacular, Symbols, Codes, Visuals)" },
      behaviors: { type: Type.ARRAY, items: itemSchema, description: "How they act/interact. What signals, symbols, or rituals carry meaning? (Actions, Customs, Rituals, Ceremonies)" },
      contradictions: { type: Type.ARRAY, items: itemSchema, description: "What tensions or shifts are emerging in values or behaviors?" },
      community: { type: Type.ARRAY, items: itemSchema, description: "Who do people look to for identity or belonging?" },
      influencers: { type: Type.ARRAY, items: itemSchema, description: "People who are shaping their beliefs & behavior" },
      sources: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            url: { type: Type.STRING }
          },
          required: ["title", "url"]
        }
      }
    },
    required: ["demographics", "moments", "beliefs", "tone", "language", "behaviors", "contradictions", "community", "influencers", "sources"],
  };

  const response = await getAI().models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: { parts },
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: matrixSchema,
      systemInstruction: "You are an expert cultural strategist and marketer. Your goal is to provide deep, accurate, and actionable cultural insights for the requested audience based on recent data. Highlight results that are extremely unique to this audience by setting isHighlyUnique to true (comparing them against demographic peers who are NOT involved in this specific brand, industry, or topic).",
    },
  });

  const draftText = response.text;
  if (!draftText) {
    throw new Error("No response from Gemini");
  }

  // Chain of Thought Verification / Self-Critique Step
  const reviewParts = [
    {
      text: `You are an expert cultural researcher and fact-checker. Review the following draft cultural archeologist report for the audience: "${audience}"${contextStr}.${topicStr}${generationStr}${sourcesTypeStr}

Draft Report:
${draftText}

Your task is to:
1. Fact-check the sources. CRITICAL: You MUST use the googleSearch tool to verify that EVERY URL is a real, currently working link. If a URL is hallucinated, dead, or returns a 404, you MUST remove it or replace it with a valid, working URL.
2. Ensure the insights are highly accurate, potent, and specific to the audience.
3. Verify that the insights and sources strongly align with the requested source type (${sourcesType && sourcesType.length > 0 ? sourcesType.join(', ') : 'any'}).
4. Refine the language to be professional and insightful.
5. Return the final, verified report in the exact same JSON format.

Do not include any commentary outside the JSON structure.`
    }
  ];

  const finalResponse = await getAI().models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: { parts: reviewParts },
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: matrixSchema,
      systemInstruction: "You are an expert cultural strategist, fact-checker, and marketer. Your goal is to review, verify, and refine cultural insights for accuracy, potency, and relevance.",
    },
  });

  const finalText = finalResponse.text;
  if (!finalText) {
    throw new Error("No final response from Gemini");
  }

  const result = JSON.parse(finalText) as CulturalMatrix;

  if (!files || files.length === 0) {
    const categories = ['moments', 'beliefs', 'tone', 'language', 'behaviors', 'contradictions', 'community', 'influencers'] as const;
    for (const category of categories) {
      if (result[category]) {
        for (const item of result[category]) {
          item.isFromDocument = false;
        }
      }
    }
  }

  return result;
}
