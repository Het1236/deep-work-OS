import type { AIMessage, AICompletionOptions, AIProvider, AIImagePart } from './types'
import { AINotConfiguredError } from './types'

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

async function callGemini(key: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  )
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${detail.slice(0, 300)}`)
  }
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned an empty response')
  return text as string
}

export function createGeminiProvider(): AIProvider {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    throw new AINotConfiguredError(
      'GEMINI_API_KEY is not set. Add it to your environment to enable AI features.'
    )
  }
  return {
    name: 'Gemini',
    async complete(messages: AIMessage[], options: AICompletionOptions = {}) {
      // Gemini has no dedicated system role — fold system text into the first user turn.
      const systemText = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
      const turns = messages.filter((m) => m.role !== 'system')
      const contents = turns.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))
      if (systemText && contents.length > 0) {
        contents[0].parts[0].text = `${systemText}\n\n${contents[0].parts[0].text}`
      }

      return callGemini(key, {
        contents,
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 2048,
          ...(options.json ? { responseMimeType: 'application/json' } : {}),
        },
      })
    },

    // Multimodal: images + a text prompt in a single user turn.
    async completeVision(prompt: string, images: AIImagePart[], options: AICompletionOptions = {}) {
      return callGemini(key, {
        contents: [{
          role: 'user',
          parts: [
            ...images.map(img => ({ inline_data: { mime_type: img.mimeType, data: img.dataBase64 } })),
            { text: prompt },
          ],
        }],
        generationConfig: {
          temperature: options.temperature ?? 0.3,
          maxOutputTokens: options.maxTokens ?? 2048,
          ...(options.json ? { responseMimeType: 'application/json' } : {}),
        },
      })
    },
  }
}
