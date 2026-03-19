import 'dotenv/config'
import { InnerLoop, GroqAdapter } from '../packages/task-engine/src/index.js'
import { SkillGraphStore } from '../packages/skill-graph/src/index.js'
import { verifyCode } from '../packages/task-engine/src/verifiers/code.js'

const GRAPH_PATH = '.skill-graph.json'

const adapter = new GroqAdapter()
const skillGraph = new SkillGraphStore()

skillGraph.load(GRAPH_PATH)

interface TaskDef {
  prompt: string
  functionName: string
  testCases: Array<{ args: unknown[]; expected: unknown }>
}

const TASKS: Record<string, TaskDef[]> = {
  'string-manipulation': [
    {
      prompt: 'const reverseString=(s:string)=>... // "hello"->"olleh"',
      functionName: 'reverseString',
      testCases: [
        { args: ['hello'], expected: 'olleh' },
        { args: ['abcd'], expected: 'dcba' },
        { args: [''], expected: '' }
      ]
    },
    {
      prompt: 'const isPalindrome=(s:string)=>... // "racecar"->true "hello"->false',
      functionName: 'isPalindrome',
      testCases: [
        { args: ['racecar'], expected: true },
        { args: ['hello'], expected: false },
        { args: ['amanaplanacanalpanama'], expected: true }
      ]
    },
    {
      prompt: 'const countVowels=(s:string)=>... // "hello"->2 "xyz"->0',
      functionName: 'countVowels',
      testCases: [
        { args: ['hello'], expected: 2 },
        { args: ['aeiou'], expected: 5 },
        { args: ['xyz'], expected: 0 }
      ]
    }
  ],
  'array-methods': [
    {
      prompt: 'const removeDuplicates=(a:number[])=>... // [1,2,2,3]->[1,2,3]',
      functionName: 'removeDuplicates',
      testCases: [
        { args: [[1, 2, 2, 3]], expected: [1, 2, 3] },
        { args: [[1, 1, 1]], expected: [1] },
        { args: [[]], expected: [] }
      ]
    },
    {
      prompt: 'const arrayIntersection=(a:number[],b:number[])=>... // [1,2,3],[2,3,4]->[2,3]',
      functionName: 'arrayIntersection',
      testCases: [
        { args: [[1, 2, 3], [2, 3, 4]], expected: [2, 3] },
        { args: [[1, 2], [3, 4]], expected: [] },
        { args: [[1], [1]], expected: [1] }
      ]
    },
    {
      prompt: 'const flattenOnce=(a:any[][])=>... // [[1,2],[3,4]]->[1,2,3,4]',
      functionName: 'flattenOnce',
      testCases: [
        { args: [[[1, 2], [3, 4]]], expected: [1, 2, 3, 4] },
        { args: [[[1], [2], [3]]], expected: [1, 2, 3] },
        { args: [[[]]], expected: [] }
      ]
    }
  ],
  'algorithms': [
    {
      prompt: 'const isPrime=(n:number)=>... // 2->true 9->false 1->false',
      functionName: 'isPrime',
      testCases: [
        { args: [2], expected: true },
        { args: [9], expected: false },
        { args: [17], expected: true },
        { args: [1], expected: false }
      ]
    },
    {
      prompt: 'const fibonacci=(n:number)=>... // 0->0 1->1 10->55 memoized',
      functionName: 'fibonacci',
      testCases: [
        { args: [0], expected: 0 },
        { args: [1], expected: 1 },
        { args: [10], expected: 55 }
      ]
    },
    {
      prompt: 'const binarySearch=(a:number[],t:number)=>... // [1,3,5,7,9],5->2 miss->-1',
      functionName: 'binarySearch',
      testCases: [
        { args: [[1, 3, 5, 7, 9], 5], expected: 2 },
        { args: [[1, 3, 5, 7, 9], 6], expected: -1 },
        { args: [[1], 1], expected: 0 }
      ]
    }
  ]
}

const subskills = Object.keys(TASKS)

// seed subskills that don't exist yet in the loaded graph
for (const subskill of subskills) {
  const existing = skillGraph.getBySubskill('typescript', subskill)
  if (!existing) {
    skillGraph.update({
      nodeId: `typescript::${subskill}`,
      domain: 'typescript',
      subskill,
      passed: false,
      score: 0,
      failureCategory: undefined
    })
  }
}

const generator = {
  async generate(domain: string, difficulty: number) {
    const weak = skillGraph.weakest(domain)
    const subskill = weak?.subskill ?? subskills[0]
    const list = TASKS[subskill] ?? []
    const task = list[Math.floor(Math.random() * list.length)]

    return {
      id: crypto.randomUUID(),
      domain,
      difficulty,
      prompt: task.prompt,
      verifiable: true,
      verifierType: 'code' as const,
      metadata: {
        subskill,
        functionName: task.functionName,
        testCases: task.testCases
      }
    }
  }
}

const evaluator = {
  async evaluate(task: any, attempt: any) {
    const { functionName, testCases } = task.metadata
    const result = verifyCode(attempt.output, functionName, testCases)
    return {
      passed: result.passed,
      score: result.score,
      failureCategory: result.passed ? undefined : 'execution' as const,
      explanation: result.explanation,
      verifierUsed: 'code' as const
    }
  }
}

console.log('\nStarting adaptiq — persistent skill graph\n')

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
      console.log(`  ↳ ${e.evaluation.explanation}`)
      const gap = e.attempt.confidence - e.evaluation.score
      if (gap > 0.3) {
        console.log(
          `  ↳ calibration gap: ` +
          `thinks ${(e.attempt.confidence * 100).toFixed(0)}% ` +
          `actual ${(e.evaluation.score * 100).toFixed(0)}%`
        )
      }
    }
  }
})

await loop.run()

skillGraph.summary()
skillGraph.save(GRAPH_PATH)