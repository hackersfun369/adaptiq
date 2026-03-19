import fs from 'node:fs'
import type { SkillNode, SkillEdge, SkillUpdate } from './types.js'

const DECAY = 0.1
const GAIN  = 0.05

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

  weakest(domain?: string): SkillNode | undefined {
    const candidates = [...this.nodes.values()].filter(
      n => !domain || n.domain === domain
    )
    return candidates.sort((a, b) => a.confidence - b.confidence)[0]
  }

  gaps(threshold = 0.6, domain?: string): SkillNode[] {
    return [...this.nodes.values()]
      .filter(n => n.confidence < threshold)
      .filter(n => !domain || n.domain === domain)
      .sort((a, b) => a.confidence - b.confidence)
  }

  getAll() {
    return [...this.nodes.values()]
  }

  getBySubskill(domain: string, subskill: string): SkillNode | undefined {
    return this.nodes.get(this.nodeId(domain, subskill))
  }

  // ── persistence ──────────────────────────────────────────

  save(path: string): void {
    const data = {
      version: 1,
      savedAt: new Date().toISOString(),
      nodes: [...this.nodes.entries()],
      edges: this.edges
    }
    fs.writeFileSync(path, JSON.stringify(data, null, 2))
    console.log(`  💾 saved → ${path}`)
  }

  load(path: string): void {
    if (!fs.existsSync(path)) {
      console.log(`  📂 no saved graph found — starting fresh`)
      return
    }
    try {
      const raw = fs.readFileSync(path, 'utf-8')
      const data = JSON.parse(raw)
      this.nodes = new Map(
        data.nodes.map(([k, v]: [string, SkillNode]) => [
          k,
          { ...v, lastAttempted: new Date(v.lastAttempted) }
        ])
      )
      this.edges = data.edges ?? []
      console.log(`  📂 loaded ${this.nodes.size} skills from ${path}`)
    } catch (e) {
      console.log(`  ⚠️  failed to load graph — starting fresh`)
    }
  }

  // ── display ───────────────────────────────────────────────

  summary(): void {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('  Skill graph state')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━')
    for (const node of this.nodes.values()) {
      const filled = Math.round(node.confidence * 10)
      const bar = '█'.repeat(filled) + '░'.repeat(10 - filled)
      console.log(
        `  ${node.domain}::${node.subskill.padEnd(22)} ` +
        `${bar} ${(node.confidence * 100).toFixed(0).padStart(3)}% ` +
        `(${node.passes}✓ ${node.failures}✗)`
      )
    }
    const gaps = this.gaps()
    if (gaps.length > 0) {
      console.log(`\n  Gaps: ${gaps.map(g => g.subskill).join(', ')}`)
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  }
}