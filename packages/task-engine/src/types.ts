export type FailureCategory =
  | 'reasoning'
  | 'knowledge'
  | 'planning'
  | 'execution'
  | 'calibration'

export type VerifierType = 'code' | 'math' | 'logic' | 'custom'

export interface Task {
  id: string
  domain: string
  difficulty: number
  prompt: string
  expectedOutput?: string
  verifiable: boolean
  verifierType?: VerifierType
  metadata?: Record<string, unknown>
}

export interface Attempt {
  taskId: string
  output: string
  confidence: number
  reasoning: string
  durationMs: number
  timestamp: Date
  model: string
}

export interface EvaluationResult {
  passed: boolean
  score: number
  failureCategory?: FailureCategory
  explanation: string
  verifierUsed: VerifierType | 'self'
}

export interface InnerLoopEvent {
  task: Task
  attempt: Attempt
  evaluation: EvaluationResult
  timestamp: Date
}

export interface LLMAdapter {
  complete(
    prompt: string,
    systemPrompt?: string
  ): Promise<{
    content: string
    model: string
    tokensUsed: number
  }>
}

export interface TaskGenerator {
  generate(domain: string, difficulty: number): Promise<Task>
}

export interface SelfEvaluator {
  evaluate(task: Task, attempt: Attempt): Promise<EvaluationResult>
}