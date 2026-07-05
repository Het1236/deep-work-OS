import type { AIProvider } from './types'
import { createGeminiProvider } from './gemini'
import { createGroqProvider } from './groq'

export * from './types'

// Selects the provider from AI_PROVIDER env (default: gemini).
export function getAIProvider(): AIProvider {
  const choice = (process.env.AI_PROVIDER || 'gemini').toLowerCase()
  switch (choice) {
    case 'groq':
      return createGroqProvider()
    case 'gemini':
    default:
      return createGeminiProvider()
  }
}

// True when the selected provider has a key set (for UI to show/hide AI features).
export function isAIConfigured(): boolean {
  const choice = (process.env.AI_PROVIDER || 'gemini').toLowerCase()
  return choice === 'groq' ? !!process.env.GROQ_API_KEY : !!process.env.GEMINI_API_KEY
}

// Vision always routes to Gemini regardless of AI_PROVIDER (Groq has no vision models).
export function getVisionProvider(): AIProvider {
  return createGeminiProvider()
}

export function isVisionConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY
}
