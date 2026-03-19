import { InnerLoop, GroqAdapter } from '../packages/task-engine/src/index.js'
import 'dotenv/config'
const adapter = new GroqAdapter()

const TASKS = [
  'Write a TypeScript function that reverses a string.',
  'Write a TypeScript function that returns the max value in a number array.',
  'Write a TypeScript function that checks if a number is prime.',
  'Write a TypeScript function that flattens a nested array one level deep.',
  'Write a TypeScript function that counts word frequency in a string.'
]

const generator = {
  async generate(domain: string, difficulty: number) {
    const prompt = TASKS[Math.floor(Math.random() * TASKS.length)]
    return {
      id: crypto.randomUUID(),
      domain,
      difficulty,
      prompt,
      verifiable: true,
      verifierType: 'code' as const
    }
  }
}

const evaluator = {
  async evaluate(_task: any, attempt: any) {
    const hasFunction =
      attempt.output.includes('function') ||
      attempt.output.includes('=>') ||
      attempt.output.includes('const ')

    return {
      passed: hasFunction,
      score: hasFunction ? attempt.confidence : 0.0,
      explanation: hasFunction
        ? 'Output contains a valid function'
        : 'No function structure found in output',
      verifierUsed: 'self' as const
    }
  }
}

console.log('Starting adaptiq inner loop with Groq...\n')

const loop = new InnerLoop({
  adapter,
  generator,
  evaluator,
  domain: 'typescript',
  targetDifficulty: 0.3,
  maxRuns: 5,
  onEvent: (e) => {
    if (!e.evaluation.passed) {
      console.log(`  Reason: ${e.evaluation.explanation}`)
    }
  }
})

const history = await loop.run()

const passed = history.filter(e => e.evaluation.passed).length
const avgScore =
  history.reduce((s, e) => s + e.evaluation.score, 0) / history.length
const avgConfidence =
  history.reduce((s, e) => s + e.attempt.confidence, 0) / history.length
const totalTokens =
  history.reduce((s, e) => s + (e.attempt as any).tokensUsed ?? 0, 0)

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━
  Adaptiq — Groq run
━━━━━━━━━━━━━━━━━━━━━━━━━
  Model      : llama-3.3-70b-versatile
  Runs       : ${history.length}
  Passed     : ${passed}/${history.length}
  Avg score  : ${avgScore.toFixed(2)}
  Avg confid : ${avgConfidence.toFixed(2)}
━━━━━━━━━━━━━━━━━━━━━━━━━
`)