import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export const GENERATE_MULTI_SHOT_EXAMPLES: ChatCompletionMessageParam[] = [
  {
    role: 'system',
    content: 'Example pair 1. Learn to reject generic psychographics and mirror the excellent culturally nuanced style.',
  },
  {
    role: 'user',
    content: `Bad generic profile (reject):
{"archetypes":[{"category":"Belief","title":"Values authenticity","description":"They value authenticity and meaningful experiences in their lifestyle choices."}]}

Excellent culturally nuanced profile (target style):
{"archetypes":[{"category":"Belief","title":"Status Through Quiet Mastery","description":"In this subculture, visible luxury signals are often replaced by mastery cues like niche technical vocabulary, archival references, and process knowledge that marks insiders from trend followers."}]}`,
  },
  {
    role: 'system',
    content: 'Example pair 2. Keep titles concise and make descriptions specific to rituals, constraints, and social context.',
  },
  {
    role: 'user',
    content: `Bad generic profile (reject):
{"archetypes":[{"category":"Fear","title":"Fear of missing out","description":"They fear missing out and want to stay connected with trends."}]}

Excellent culturally nuanced profile (target style):
{"archetypes":[{"category":"Fear","title":"Algorithmic Erasure Anxiety","description":"Members fear that platform ranking shifts can erase years of community-built credibility overnight, so they hedge with parallel channels, private groups, and direct-list ownership."}]}`,
  },
  {
    role: 'system',
    content: 'Example pair 3. Prefer concrete subcultural behaviors over broad marketing language.',
  },
  {
    role: 'user',
    content: `Bad generic profile (reject):
{"archetypes":[{"category":"Interest","title":"Interested in innovation","description":"They are interested in innovative products and future-forward ideas."}]}

Excellent culturally nuanced profile (target style):
{"archetypes":[{"category":"Interest","title":"DIY Signal Hacking","description":"They actively remix mainstream products into identity markers, documenting modifications, sourcing hacks, and before/after proof to earn peer recognition inside the subculture."}]}`,
  },
];