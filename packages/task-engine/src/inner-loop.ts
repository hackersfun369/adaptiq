import type {
  Task,
  Attempt,
  InnerLoopEvent,
  LLMAdapter,
  TaskGenerator,
  SelfEvaluator
} from './types.js'

export interface InnerLoopOptions {
  adapter: LLMAdapter
  generator: TaskGenerator
  evaluator: SelfEvaluator
  domain: string
  targetDifficulty: number
  maxRuns?: number
  onEvent?: (event: InnerLoopEvent) => void
}

export class InnerLoop {
  constructor(private opts: InnerLoopOptions) {}

  async run(): Promise<InnerLoopEvent[]> {
    const {
      generator,
      evaluator,
      domain,
      targetDifficulty,
      maxRuns = 10,
      onEvent
    } = this.opts

    const history: InnerLoopEvent[] = []

    for (let i = 0; i < maxRuns; i++) {
      const task = await generator.generate(domain, targetDifficulty)
      const attempt = await this.attempt(task)
      const evaluation = await evaluator.evaluate(task, attempt)

      const event: InnerLoopEvent = {
        task,
        attempt,
        evaluation,
        timestamp: new Date()
      }

      history.push(event)
      onEvent?.(event)

      const status = evaluation.passed ? '✓' : '✗'
      const failure = evaluation.failureCategory
        ? ` | failure=${evaluation.failureCategory}`
        : ''

      console.log(
        `${status} [${i + 1}/${maxRuns}] ` +
        `domain=${task.domain} | ` +
        `difficulty=${task.difficulty.toFixed(2)} | ` +
        `score=${evaluation.score.toFixed(2)} | ` +
        `confidence=${attempt.confidence.toFixed(2)}` +
        failure
      )
    }

    return history
  }

  private async attempt(task: Task): Promise<Attempt> {
    const start = Date.now()

    const prompt = [
      `Task: ${task.prompt}`,
      ``,
      `Think step by step. Then respond in exactly this format:`,
      ``,
      `REASONING: <your chain of thought>`,
      `ANSWER: <your final answer>`,
      `CONFIDENCE: <a number from 0.0 to 1.0>`
    ].join('\n')

    const result = await this.opts.adapter.complete(prompt)
    const parsed = this.parseOutput(result.content)

    return {
      taskId: task.id,
      output: parsed.answer,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      durationMs: Date.now() - start,
      timestamp: new Date(),
      model: result.model
    }
  }

  private parseOutput(raw: string) {
    const reasoning =
      raw.match(/REASONING:\s*([\s\S]*?)(?=ANSWER:)/i)?.[1]?.trim() ?? ''
    const answer =
      raw.match(/ANSWER:\s*([\s\S]*?)(?=CONFIDENCE:)/i)?.[1]?.trim() ?? raw
    const confidenceRaw =
      raw.match(/CONFIDENCE:\s*([0-9.]+)/i)?.[1] ?? '0.5'
    const confidence = Math.min(1, Math.max(0, parseFloat(confidenceRaw)))

    return { reasoning, answer, confidence }
  }
}