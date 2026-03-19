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

  // TOON format — everything on one line, minimal tokens
  const prompt = `T:${task.prompt} R:? A:? C:?`

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
  const r = raw.match(/R:(.*?)(?=A:|$)/s)?.[1]?.trim() ?? ''
  const a = raw.match(/A:(.*?)(?=C:|$)/s)?.[1]?.trim() ?? raw.trim()
  const c = parseFloat(raw.match(/C:([0-9.]+)/)?.[1] ?? '0.5')
  return {
    reasoning: r,
    answer: a,
    confidence: Math.min(1, Math.max(0, c))
  }
}
}