export interface SkillNode {
  id: string
  domain: string
  subskill: string
  confidence: number        // 0.0–1.0, starts at 0.5
  attempts: number
  passes: number
  failures: number
  lastAttempted: Date
  failureBreakdown: Record<string, number>
}

export interface SkillEdge {
  from: string              // SkillNode id
  to: string                // SkillNode id
  relation: 'requires' | 'related'
}

export interface SkillGraph {
  nodes: Map<string, SkillNode>
  edges: SkillEdge[]
}

export interface SkillUpdate {
  nodeId: string
  domain: string
  subskill: string
  passed: boolean
  score: number
  failureCategory?: string
}