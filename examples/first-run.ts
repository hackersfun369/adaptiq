import 'dotenv/config'
import { InnerLoop, GroqAdapter } from '../packages/task-engine/src/index.js'
import { SkillGraphStore } from '../packages/skill-graph/src/index.js'
import { verifyCode } from '../packages/task-engine/src/verifiers/code.js'

const adapter = new GroqAdapter()
const skillGraph = new SkillGraphStore()

interface TaskDef {
  prompt: string
  functionName: string
  testCases: Array<{ args: unknown[]; expected: unknown }>
}

const EXAMPLE = `
Example of correct output format:
const add = (a: number, b: number): number => {
  return a + b
}
`

const RULES = [
  `Rules:`,
  `- Write ONLY the function body, nothing else`,
  `- No export keyword`,
  `- No import statements`,
  `- No markdown, no explanation`,
  `- The function must return a single value, not an array`
].join('\n')

const TASKS: Record<string, TaskDef[]> = {
  'string-manipulation': [
    {
      prompt: 'Write a TypeScript function called `reverseString` that reverses a string. reverseString("hello") returns "olleh".',
      functionName: 'reverseString',
      testCases: [
        { args: ['hello'], expected: 'olleh' },
        { args: ['abcd'], expected: 'dcba' },
        { args: [''], expected: '' }
      ]
    },
    {
      prompt: 'Write a TypeScript function called `isPalindrome` that returns true if a string is a palindrome, false otherwise. Ignore spaces and casing. isPalindrome("racecar") returns true. isPalindrome("hello") returns false.',
      functionName: 'isPalindrome',
      testCases: [
        { args: ['racecar'], expected: true },
        { args: ['hello'], expected: false },
        { args: ['AmanaplanacanalpanaMa'.toLowerCase()], expected: true }
      ]
    },
    {
      prompt: 'Write a TypeScript function called `countVowels` that counts the number of vowels (a,e,i,o,u) in a string. countVowels("hello") returns 2. countVowels("xyz") returns 0.',
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
      prompt: 'Write a TypeScript function called `removeDuplicates` that removes duplicates from a number array and returns the unique values. removeDuplicates([1,2,2,3]) returns [1,2,3].',
      functionName: 'removeDuplicates',
      testCases: [
        { args: [[1, 2, 2, 3]], expected: [1, 2, 3] },
        { args: [[1, 1, 1]], expected: [1] },
        { args: [[]], expected: [] }
      ]
    },
    {
      prompt: 'Write a TypeScript function called `arrayIntersection` that returns a new array of items present in both input arrays. arrayIntersection([1,2,3],[2,3,4]) returns [2,3].',
      functionName: 'arrayIntersection',
      testCases: [
        { args: [[1, 2, 3], [2, 3, 4]], expected: [2, 3] },
        { args: [[1, 2], [3, 4]], expected: [] },
        { args: [[1], [1]], expected: [1] }
      ]
    },
    {
      prompt: 'Write a TypeScript function called `flattenOnce` that flattens a nested array exactly one level deep. flattenOnce([[1,2],[3,4]]) returns [1,2,3,4].',
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
      prompt: 'Write a TypeScript function called `isPrime` that returns true if a number is prime, false otherwise. isPrime(2) returns true. isPrime(9) returns false. isPrime(1) returns false. isPrime(17) returns true.',
      functionName: 'isPrime',
      testCases: [
        { args: [2], expected: true },
        { args: [9], expected: false },
        { args: [17], expected: true },
        { args: [1], expected: false }
      ]
    },
    {
      prompt: 'Write a TypeScript function called `fibonacci` that returns the nth Fibonacci number as a single integer. fibonacci(0) returns 0. fibonacci(1) returns 1. fibonacci(10) returns 55. Use memoization for efficiency.',
      functionName: 'fibonacci',
      testCases: [
        { args: [0], expected: 0 },
        { args: [1], expected: 1 },
        { args: [10], expected: 55 }
      ]
    },
    {
      prompt: 'Write a TypeScript function called `binarySearch` that returns the index of target in a sorted number array, or -1 if not found. binarySearch([1,3,5,7,9], 5) returns 2. binarySearch([1,3,5,7,9], 6) returns -1.',
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

// seed all subskills at low confidence so gaps exist from the start
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

    // build gap hint from failure history
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
      ? `\nPrevious attempts at this skill failed on: ${topFailures.join(', ')}. Fix these specifically.`
      : ''

    return {
      id: crypto.randomUUID(),
      domain,
      difficulty,
      prompt: [task.prompt, gapHint, EXAMPLE, RULES].join('\n'),
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

console.log('Starting adaptiq — real code execution verifier\n')

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