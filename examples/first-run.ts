import 'dotenv/config'
import { InnerLoop, GroqAdapter } from '../packages/task-engine/src/index.js'
import { SkillGraphStore } from '../packages/skill-graph/src/index.js'

const adapter = new GroqAdapter()
const skillGraph = new SkillGraphStore()

const TASKS: Record<string, { prompt: string; mustContain: string[][] }[]> = {
  'string-manipulation': [
    {
      prompt: 'Write a TypeScript function that reverses a string.',
      mustContain: [['split', 'reverse', 'join'], ['reduce'], ['for']]
    },
    {
      prompt: 'Write a TypeScript function that checks if a string is a palindrome. Handle spaces and casing.',
      mustContain: [['toLowerCase'], ['split', 'reverse', 'join']]
    },
    {
      prompt: 'Write a TypeScript function that truncates a string to N chars and adds "..." if truncated.',
      mustContain: [['slice', 'substring', 'length']]
    }
  ],
  'array-methods': [
    {
      prompt: 'Write a TypeScript function that removes duplicates from an array.',
      mustContain: [['Set'], ['filter', 'indexOf', 'includes']]
    },
    {
      prompt: 'Write a TypeScript function that groups an array of objects by a given key.',
      mustContain: [['reduce', 'forEach']]
    },
    {
      prompt: 'Write a TypeScript function that returns items present in both arrays (intersection).',
      mustContain: [['filter'], ['includes', 'has', 'indexOf']]
    }
  ],
  'algorithms': [
    {
      prompt: 'Write a TypeScript function that checks if a number is prime.',
      mustContain: [['Math.sqrt', 'for', 'while']]
    },
    {
      prompt: 'Write a TypeScript function that returns the nth Fibonacci number using memoization.',
      mustContain: [['Map', 'cache', 'memo', 'Record', '{}']]
    },
    {
      prompt: 'Write a TypeScript binary search function returning the index of target in a sorted array or -1.',
      mustContain: [['Math.floor', 'Math.ceil'], ['while', 'for'], ['mid', 'middle', 'pivot']]
    }
  ]
}

const subskills = Object.keys(TASKS)

// seed all subskills into graph at low confidence so gaps exist from the start
for (const subskill of subskills) {
  skillGraph.update({
    nodeId: `typescript::${subskill}`,
    domain: 'typescript',
    subskill,
    passed: false,
    score: 0,
    failureCategory: undefined
  })
}

const generator = {
  async generate(domain: string, difficulty: number) {
    // always target the weakest subskill
    const weak = skillGraph.weakest(domain)
    const subskill = weak?.subskill ?? subskills[0]
    const list = TASKS[subskill] ?? []
    const task = list[Math.floor(Math.random() * list.length)]

    // build gap context — tell the model what it's been missing
    const node = skillGraph.getAll().find(
      n => n.domain === domain && n.subskill === subskill
    )
    const topFailures = node
      ? Object.entries(node.failureBreakdown)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([k]) => k)
      : []

    const gapHint = topFailures.length > 0
      ? `\n\nNote: previous attempts at this skill failed on: ${topFailures.join(', ')}. Pay special attention to these.`
      : ''

    return {
      id: crypto.randomUUID(),
      domain,
      difficulty,
      prompt: task.prompt + gapHint,
      verifiable: true,
      verifierType: 'code' as const,
      metadata: { subskill, mustContain: task.mustContain }
    }
  }
}

const evaluator = {
  async evaluate(task: any, attempt: any) {
    const mustContain: string[][] = task.metadata?.mustContain ?? []

    // each group passes if ANY keyword in the group is present
    const failedGroups = mustContain.filter(
      (group: string[]) => !group.some((kw: string) => attempt.output.includes(kw))
    )

    const passed = failedGroups.length === 0
    const score = passed
      ? attempt.confidence
      : Math.max(0, (mustContain.length - failedGroups.length) / mustContain.length) * 0.5

    return {
      passed,
      score,
      failureCategory: passed ? undefined : 'execution' as const,
      explanation: passed
        ? 'All required patterns found'
        : `Missing any of: ${failedGroups.map((g: string[]) => g.join('|')).join(', ')}`,
      verifierUsed: 'self' as const
    }
  }
}

console.log('Starting adaptiq inner loop with skill graph...\n')

const loop = new InnerLoop({
  adapter,
  generator,
  evaluator,
  domain: 'typescript',
  targetDifficulty: 0.5,
  maxRuns: 20,
  onEvent: (e) => {
  const subskill = e.task.metadata?.subskill as string ?? 'general'

  skillGraph.update({
    nodeId: `typescript::${subskill}`,
    domain: 'typescript',
    subskill,
    passed: e.evaluation.passed,
    score: e.evaluation.score,
    failureCategory: e.evaluation.failureCategory
  })

  if (!e.evaluation.passed) {
    const calibrationGap = e.attempt.confidence - e.evaluation.score
    console.log(`  ↳ ${e.evaluation.explanation}`)
    if (calibrationGap > 0.3) {
      console.log(
        `  ↳ calibration gap: model thinks ${(e.attempt.confidence * 100).toFixed(0)}% ` +
        `but actual score ${(e.evaluation.score * 100).toFixed(0)}%`
      )
    }
  }
}
})

await loop.run()
skillGraph.summary()