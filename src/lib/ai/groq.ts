import type { AIMessage, AICompletionOptions, AIProvider } from './types'
import { AINotConfiguredError } from './types'

// llama-3.3-70b-versatile was retired by Groq (404 model_not_found, 2026-09).
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

export function createGroqProvider(): AIProvider {
  const key = process.env.GROQ_API_KEY
  if (!key) {
    throw new AINotConfiguredError(
      'GROQ_API_KEY is not set. Add it to your environment to enable AI features.'
    )
  }
  return {
    name: 'Groq',
    async complete(messages: AIMessage[], options: AICompletionOptions = {}) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 2048,
          ...(options.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      })
      if (!res.ok) {
        const detail = await res.text()
        throw new Error(`Groq API error ${res.status}: ${detail.slice(0, 300)}`)
      }
      const data = await res.json()
      const text = data?.choices?.[0]?.message?.content
      if (!text) throw new Error('Groq returned an empty response')
      return text as string
    },
  }
}
