import type { SkillNode, SkillEdge, SkillUpdate } from './types.js'

const DECAY = 0.1    // how much confidence drops on failure
const GAIN  = 0.05   // how much confidence rises on pass

export class SkillGraphStore {
  private nodes = new Map<string, SkillNode>()
  private edges: SkillEdge[] = []

  private nodeId(domain: string, subskill: string) {
    return `${domain}::${subskill}`
  }

  private getOrCreate(domain: string, subskill: string): SkillNode {
    const id = this.nodeId(domain, subskill)
    if (!this.nodes.has(id)) {
      this.nodes.set(id, {
        id,
        domain,
        subskill,
        confidence: 0.5,
        attempts: 0,
        passes: 0,
        failures: 0,
        lastAttempted: new Date(),
        failureBreakdown: {}
      })
    }
    return this.nodes.get(id)!
  }

  update(update: SkillUpdate): SkillNode {
    const node = this.getOrCreate(update.domain, update.subskill)

    node.attempts++
    node.lastAttempted = new Date()

    if (update.passed) {
      node.passes++
      node.confidence = Math.min(1.0, node.confidence + GAIN)
    } else {
      node.failures++
      node.confidence = Math.max(0.0, node.confidence - DECAY)

      if (update.failureCategory) {
        node.failureBreakdown[update.failureCategory] =
          (node.failureBreakdown[update.failureCategory] ?? 0) + 1
      }
    }

    return node
  }

  addEdge(edge: SkillEdge) {
    this.edges.push(edge)
  }

  // Returns the weakest skill — what to practice next
  weakest(domain?: string): SkillNode | undefined {
    const candidates = [...this.nodes.values()].filter(
      n => !domain || n.domain === domain
    )
    return candidates.sort((a, b) => a.confidence - b.confidence)[0]
  }

  // Returns skills below a confidence threshold
  gaps(threshold = 0.6, domain?: string): SkillNode[] {
    return [...this.nodes.values()]
      .filter(n => n.confidence < threshold)
      .filter(n => !domain || n.domain === domain)
      .sort((a, b) => a.confidence - b.confidence)
  }

  summary(): void {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('  Skill graph state')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━')
    for (const node of this.nodes.values()) {
      const bar = '█'.repeat(Math.round(node.confidence * 10))
                + '░'.repeat(10 - Math.round(node.confidence * 10))
      console.log(
        `  ${node.domain}::${node.subskill.padEnd(20)} ` +
        `${bar} ${(node.confidence * 100).toFixed(0).padStart(3)}% ` +
        `(${node.passes}✓ ${node.failures}✗)`
      )
    }
    const gaps = this.gaps()
    if (gaps.length > 0) {
      console.log(`\n  Gaps detected: ${gaps.map(g => g.subskill).join(', ')}`)
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  }

  getAll() {
    return [...this.nodes.values()]
  }
}