# Adaptiq

A self-improving AI runtime. Give it tasks, watch it learn.
```bash
npm install @adaptiq/task-engine @adaptiq/skill-graph
```

---

## What it does

Adaptiq runs an autonomous inner loop — it generates tasks, attempts them using an LLM, verifies the output with real code execution, tracks what it knows and doesn't know in a persistent skill graph, and automatically targets its weakest skills next.

No human labels. No fine-tuning. No external scoring pipeline.
```
task generated → attempted → code executed → result verified
      ↑                                             ↓
skill graph ← confidence updated ← failure classified
```

---

## Why it's different

Most "self-improving" AI systems are just RLHF loops with a human in the middle. Adaptiq's inner loop requires zero human feedback for verifiable tasks — code either passes its test cases or it doesn't.

| | Adaptiq | LangChain | AutoGen | CrewAI |
|---|---|---|---|---|
| Self-verifying execution | ✓ | ✗ | ✗ | ✗ |
| Persistent skill graph | ✓ | ✗ | ✗ | ✗ |
| Autonomous difficulty escalation | ✓ | ✗ | ✗ | ✗ |
| Zero human labels for code tasks | ✓ | ✗ | ✗ | ✗ |
| Failure taxonomy | ✓ | ✗ | ✗ | ✗ |

---

## Quick start

### 1. Get a free Groq API key

Go to [console.groq.com](https://console.groq.com) — sign in with GitHub, create a key. Free tier: 14,400 requests/day.

### 2. Install
```bash
npm install @adaptiq/task-engine @adaptiq/skill-graph
```

### 3. Run your first inner loop
```typescript
import { InnerLoop, GroqAdapter } from '@adaptiq/task-engine'
import { SkillGraphStore } from '@adaptiq/skill-graph'
import { verifyCode } from '@adaptiq/task-engine/verifiers'

const adapter = new GroqAdapter() // reads GROQ_API_KEY from env
const skillGraph = new SkillGraphStore()

skillGraph.load('.skill-graph.json') // load previous state if exists

const loop = new InnerLoop({
  adapter,
  generator: {
    async generate(domain, difficulty) {
      return {
        id: crypto.randomUUID(),
        domain,
        difficulty,
        prompt: 'const reverseString=(s:string)=>... // "hello"->"olleh"',
        verifiable: true,
        verifierType: 'code',
        metadata: {
          functionName: 'reverseString',
          testCases: [
            { args: ['hello'], expected: 'olleh' },
            { args: ['abcd'], expected: 'dcba' }
          ]
        }
      }
    }
  },
  evaluator: {
    async evaluate(task, attempt) {
      const result = verifyCode(
        attempt.output,
        task.metadata.functionName,
        task.metadata.testCases
      )
      return {
        passed: result.passed,
        score: result.score,
        explanation: result.explanation,
        verifierUsed: 'code'
      }
    }
  },
  domain: 'typescript',
  targetDifficulty: 0.5,
  maxRuns: 10,
  onEvent: (e) => {
    skillGraph.update({
      nodeId: `${e.task.domain}::general`,
      domain: e.task.domain,
      subskill: 'general',
      passed: e.evaluation.passed,
      score: e.evaluation.score
    })
  }
})

await loop.run()
skillGraph.summary()
skillGraph.save('.skill-graph.json')
```

---

## How it works

### Inner loop

The core engine. Runs tasks autonomously, self-evaluates, and emits structured events.
```typescript
import { InnerLoop, GroqAdapter } from '@adaptiq/task-engine'

const loop = new InnerLoop({
  adapter,      // any LLMAdapter
  generator,    // generates tasks at the right difficulty
  evaluator,    // verifies output — code, math, logic, or custom
  domain: 'typescript',
  targetDifficulty: 0.5,
  maxRuns: 20,
  onEvent: (event) => {
    // InnerLoopEvent: task + attempt + evaluation + timestamp
    console.log(event.evaluation.passed, event.evaluation.score)
  }
})

const history = await loop.run()
```

### Skill graph

Tracks what the system knows. Confidence rises on pass, falls on failure. Identifies gaps automatically.
```typescript
import { SkillGraphStore } from '@adaptiq/skill-graph'

const graph = new SkillGraphStore()

graph.load('.skill-graph.json')   // restore from previous session

graph.update({
  nodeId: 'typescript::algorithms',
  domain: 'typescript',
  subskill: 'algorithms',
  passed: true,
  score: 0.9
})

graph.weakest('typescript')       // returns lowest confidence skill
graph.gaps(0.7)                   // returns skills below 70% confidence
graph.summary()                   // prints confidence bars to terminal
graph.save('.skill-graph.json')   // persist for next session
```

### Code verifier

Runs TypeScript functions against real test cases inside an isolated sandbox.
```typescript
import { verifyCode } from '@adaptiq/task-engine/verifiers'

const result = verifyCode(
  `const add = (a, b) => a + b`,
  'add',
  [
    { args: [1, 2], expected: 3 },
    { args: [0, 0], expected: 0 }
  ]
)

console.log(result.passed)       // true
console.log(result.score)        // 1.0
console.log(result.explanation)  // "All 2 test cases passed"
```

### LLM adapters

Adaptiq uses a simple `LLMAdapter` interface — swap providers with one line.
```typescript
// Groq (free, fast — recommended)
const adapter = new GroqAdapter()               // llama-3.3-70b-versatile
const adapter = new GroqAdapter(key, 'llama-3.1-8b-instant')  // faster, higher limits
```

Implement your own:
```typescript
import type { LLMAdapter } from '@adaptiq/task-engine'

const myAdapter: LLMAdapter = {
  async complete(prompt, systemPrompt) {
    // call any LLM API
    return { content: '...', model: 'my-model', tokensUsed: 100 }
  }
}
```

---

## Architecture
```
adaptiq/
├── packages/
│   ├── task-engine/     @adaptiq/task-engine
│   │   ├── InnerLoop    autonomous task runner
│   │   ├── GroqAdapter  Groq LLM adapter
│   │   └── verifiers/   code execution sandbox
│   └── skill-graph/     @adaptiq/skill-graph
│       └── SkillGraph   persistent confidence map
└── examples/
    └── first-run.ts     full working example
```

---

## Packages

| Package | Description | Version |
|---|---|---|
| `@adaptiq/task-engine` | Inner loop, adapters, verifiers | 0.0.1 |
| `@adaptiq/skill-graph` | Persistent skill graph | 0.0.1 |

---

## Roadmap

- [ ] `@adaptiq/verifier` — standalone verifier package (math, logic, custom)
- [ ] `@adaptiq/outer-loop` — human feedback intake with label deprecation
- [ ] `@adaptiq/cli` — `adaptiq run`, `adaptiq inspect`, live dashboard
- [ ] Difficulty auto-escalation based on skill graph confidence
- [ ] Plugin registry for custom task generators and evaluators
- [ ] Support for Python, SQL, and reasoning domains

---

## Contributing
```bash
git clone https://github.com/hackersfun369/adaptiq
cd adaptiq
pnpm install
pnpm build
pnpm test
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## License

MIT © 2025 hackersfun369