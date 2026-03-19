import vm from 'node:vm'
import { transpileModule } from 'typescript'

export interface TestCase {
  args: unknown[]
  expected: unknown
}

export interface CodeVerifierResult {
  passed: boolean
  score: number
  results: Array<{
    args: unknown[]
    expected: unknown
    actual: unknown
    passed: boolean
    error?: string
  }>
  explanation: string
}

function extractCode(raw: string): string {
  return raw
    .replace(/```typescript\n?/g, '')
    .replace(/```ts\n?/g, '')
    .replace(/```\n?/g, '')
    .trim()
}

function transpile(code: string): string {
  const result = transpileModule(code, {
    compilerOptions: { target: 99, module: 1 }
  })
  return result.outputText
}

export function verifyCode(
  code: string,
  functionName: string,
  testCases: TestCase[]
): CodeVerifierResult {
  const cleaned = extractCode(code)

  let transpiled: string
  try {
    transpiled = transpile(cleaned)
  } catch (e: any) {
    return {
      passed: false,
      score: 0,
      results: [],
      explanation: `Transpile error: ${e.message}`
    }
  }

  // append explicit export so we can always find the function
  const wrapped = `
${transpiled}
if (typeof ${functionName} !== 'undefined') {
  module.exports['${functionName}'] = ${functionName};
}
`

  const results: CodeVerifierResult['results'] = []

  for (const tc of testCases) {
    try {
      // give the sandbox full access to the global context
      // so Array.from, String.prototype etc all work
      const sandbox = vm.createContext({
        ...globalThis,
        module: { exports: {} as any },
        exports: {} as any,
      })

      vm.runInContext(wrapped, sandbox)

      const fn =
        sandbox.module?.exports?.[functionName] ??
        sandbox[functionName]

      if (typeof fn !== 'function') {
        results.push({
          args: tc.args,
          expected: tc.expected,
          actual: undefined,
          passed: false,
          error: `Function "${functionName}" not found`
        })
        continue
      }

      const actual = fn(...(tc.args as any[]))
      const passed = JSON.stringify(actual) === JSON.stringify(tc.expected)
      results.push({ args: tc.args, expected: tc.expected, actual, passed })

    } catch (e: any) {
      results.push({
        args: tc.args,
        expected: tc.expected,
        actual: undefined,
        passed: false,
        error: e.message
      })
    }
  }

  const passedCount = results.filter(r => r.passed).length
  const score = passedCount / testCases.length
  const passed = score === 1.0

  const explanation = passed
    ? `All ${testCases.length} test cases passed`
    : results
        .filter(r => !r.passed)
        .map(r =>
          r.error
            ? `Error: ${r.error}`
            : `f(${JSON.stringify(r.args)}) → got ${JSON.stringify(r.actual)}, expected ${JSON.stringify(r.expected)}`
        )
        .slice(0, 2)
        .join(' | ')

  return { passed, score, results, explanation }
}