import type { LLMAdapter } from '../types.js'

interface GroqResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
  model: string
  usage: {
    prompt_tokens: number
    completion_tokens: number
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export class GroqAdapter implements LLMAdapter {
  private apiKey: string
  private model: string

  constructor(apiKey?: string, model = 'llama-3.3-70b-versatile') {
    this.apiKey = apiKey ?? process.env.GROQ_API_KEY ?? ''
    this.model = model
    if (!this.apiKey) {
      throw new Error('GROQ_API_KEY is not set')
    }
  }

  async complete(
  prompt: string,
  systemPrompt = 'You are a TypeScript code assistant. Always reply with valid JSON only. No markdown. No prose.'
) {
    const maxRetries = 4
    let attempt = 0

    while (attempt < maxRetries) {
      const res = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
  model: this.model,
  max_tokens: 200,
  temperature: 0.3,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt }
  ]
})
        }
      )

      // rate limited — wait and retry
      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after')
        const waitMs = retryAfter
          ? parseFloat(retryAfter) * 1000
          : 2000 * (attempt + 1)
        console.log(`  ⏳ rate limit — waiting ${(waitMs / 1000).toFixed(1)}s...`)
        await sleep(waitMs)
        attempt++
        continue
      }

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Groq API error ${res.status}: ${err}`)
      }

      const data = (await res.json()) as GroqResponse

      return {
        content: data.choices[0]?.message?.content ?? '',
        model: data.model,
        tokensUsed:
          (data.usage?.prompt_tokens ?? 0) +
          (data.usage?.completion_tokens ?? 0)
      }
    }

    throw new Error(`Groq rate limit exceeded after ${maxRetries} retries`)
  }
}