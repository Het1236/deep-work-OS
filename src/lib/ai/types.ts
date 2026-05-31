export type AIRole = 'system' | 'user' | 'assistant'
export type AIMessage = { role: AIRole; content: string }

export type AICompletionOptions = {
  json?: boolean          // request strict JSON output
  temperature?: number
  maxTokens?: number
}

export interface AIProvider {
  readonly name: string
  complete(messages: AIMessage[], options?: AICompletionOptions): Promise<string>
}

// Thrown when the selected provider has no API key configured.
export class AINotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AINotConfiguredError'
  }
}
