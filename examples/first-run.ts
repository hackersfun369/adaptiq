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

const DIFFICULTY_LEVELS: Record<number, Record<string, TaskDef[]>> = {
  0.3: {
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
        prompt: 'const binarySearch=(a:number[],t:number)=>... // [1,3,5,7,9],5->2 miss->-1',
        functionName: 'binarySearch',
        testCases: [
          { args: [[1, 3, 5, 7, 9], 5], expected: 2 },
          { args: [[1, 3, 5, 7, 9], 6], expected: -1 },
          { args: [[1], 1], expected: 0 }
        ]
      }
    ]
  },
  0.6: {
    'string-manipulation': [
      {
        prompt: 'const longestWord=(s:string)=>... // "the quick brown fox"->"quick"',
        functionName: 'longestWord',
        testCases: [
          { args: ['the quick brown fox'], expected: 'quick' },
          { args: ['hello'], expected: 'hello' },
          { args: ['a bb ccc'], expected: 'ccc' }
        ]
      },
      {
        prompt: 'const titleCase=(s:string)=>... // "hello world"->"Hello World"',
        functionName: 'titleCase',
        testCases: [
          { args: ['hello world'], expected: 'Hello World' },
          { args: ['the quick brown'], expected: 'The Quick Brown' },
          { args: ['a'], expected: 'A' }
        ]
      }
    ],
    'array-methods': [
      {
        prompt: 'const chunkArray=(a:number[],size:number)=>... // [1,2,3,4,5],2->[[1,2],[3,4],[5]]',
        functionName: 'chunkArray',
        testCases: [
          { args: [[1, 2, 3, 4, 5], 2], expected: [[1, 2], [3, 4], [5]] },
          { args: [[1, 2, 3], 3], expected: [[1, 2, 3]] },
          { args: [[], 2], expected: [] }
        ]
      },
      {
        prompt: 'const groupBy=(a:{id:number,type:string}[],key:string)=>... // groups by key',
        functionName: 'groupBy',
        testCases: [
          {
            args: [[{id:1,type:'a'},{id:2,type:'b'},{id:3,type:'a'}], 'type'],
            expected: { a: [{id:1,type:'a'},{id:3,type:'a'}], b: [{id:2,type:'b'}] }
          }
        ]
      }
    ],
    'algorithms': [
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
        prompt: 'const mergeSort=(a:number[])=>... // [3,1,4,1,5]->[1,1,3,4,5]',
        functionName: 'mergeSort',
        testCases: [
          { args: [[3, 1, 4, 1, 5]], expected: [1, 1, 3, 4, 5] },
          { args: [[5, 4, 3, 2, 1]], expected: [1, 2, 3, 4, 5] },
          { args: [[1]], expected: [1] }
        ]
      }
    ]
  },
  0.9: {
    'string-manipulation': [
      {
        prompt: 'const compressString=(s:string)=>... // "aabcccdddd"->"a2bc3d4" no compress if longer',
        functionName: 'compressString',
        testCases: [
          { args: ['aabcccdddd'], expected: 'a2bc3d4' },
          { args: ['abc'], expected: 'abc' },
          { args: ['aabb'], expected: 'a2b2' }
        ]
      },
      {
        prompt: 'const anagramGroups=(words:string[])=>... // ["eat","tea","tan","ate","nat","bat"]->[[eat,tea,ate],[tan,nat],[bat]]',
        functionName: 'anagramGroups',
        testCases: [
          {
            args: [['eat', 'tea', 'tan', 'ate', 'nat', 'bat']],
            expected: [['eat','tea','ate'],['tan','nat'],['bat']]
          }
        ]
      }
    ],
    'array-methods': [
      {
        prompt: 'const deepFlatten=(a:any[])=>... // [1,[2,[3,[4]]]]->[1,2,3,4]',
        functionName: 'deepFlatten',
        testCases: [
          { args: [[1, [2, [3, [4]]]]], expected: [1, 2, 3, 4] },
          { args: [[1, 2, 3]], expected: [1, 2, 3] },
          { args: [[[]]], expected: [] }
        ]
      },
      {
        prompt: 'const zipWith=(a:number[],b:number[],fn:(a:number,b:number)=>number)=>... // [1,2],[3,4],add->[4,6]',
        functionName: 'zipWith',
        testCases: [
          { args: [[1, 2], [3, 4], (a: number, b: number) => a + b], expected: [4, 6] },
          { args: [[1, 2], [3, 4], (a: number, b: number) => a * b], expected: [3, 8] }
        ]
      }
    ],
    'algorithms': [
      {
        prompt: 'const longestCommonSubsequence=(a:string,b:string)=>... // "abcde","ace"->3',
        functionName: 'longestCommonSubsequence',
        testCases: [
          { args: ['abcde', 'ace'], expected: 3 },
          { args: ['abc', 'abc'], expected: 3 },
          { args: ['abc', 'def'], expected: 0 }
        ]
      },
      {
        prompt: 'const coinChange=(coins:number[],amount:number)=>... // [1,5,11],15->3 impossible->-1',
        functionName: 'coinChange',
        testCases: [
          { args: [[1, 5, 11], 15], expected: 3 },
          { args: [[2], 3], expected: -1 },
          { args: [[1], 0], expected: 0 }
        ]
      }
    ]
  }
}

// pick difficulty level based on current weakest skill confidence
function pickDifficulty(domain: string): number {
  const weak = skillGraph.weakest(domain)
  const confidence = weak?.confidence ?? 0
  if (confidence >= 0.95) return 0.9
  if (confidence >= 0.7)  return 0.6
  return 0.3
}

const generator = {
  async generate(domain: string, _difficulty: number) {
    const difficulty = pickDifficulty(domain)
    const levelTasks = DIFFICULTY_LEVELS[difficulty]
    const weak = skillGraph.weakest(domain)
    const subskill = weak?.subskill ?? subskills[0]
    const list = levelTasks[subskill] ?? levelTasks[subskills[0]]
    const task = list[Math.floor(Math.random() * list.length)]

    console.log(`  🎯 targeting: ${subskill} @ difficulty=${difficulty}`)

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