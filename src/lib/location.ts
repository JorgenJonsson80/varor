import type { PlatsklassConfig, PlatsklassResult } from './types'

/**
 * Character at `pos` counted from the end of `plats`, 1 = last character.
 * JD Edwards location strings vary in length (e.g. "P1010-05--A-2-" vs
 * "P1015-58--E---"), but the class/level indicators sit at a fixed distance
 * from the end. Counting from the front breaks silently on shorter strings —
 * this is the only way positions should be read.
 */
export function charAtPos(plats: string, pos: number): string {
  if (pos < 1) return ''
  const index = plats.length - pos
  if (index < 0 || index >= plats.length) return ''
  return plats[index]
}

/** Station is counted from the front, 1-indexed inclusive, default characters 4-5. */
export function getStation(plats: string, start = 4, end = 5): string {
  return plats.slice(start - 1, end)
}

/**
 * Resolves a location's platsklass in priority order: manual tag beats
 * exception rule beats base class. Rules are evaluated top to bottom;
 * the first one whose position/value matches wins.
 */
export function determinePlatsklass(plats: string, config: PlatsklassConfig): PlatsklassResult {
  const manualKlass = config.manual[plats]
  if (manualKlass) {
    return { klass: manualKlass, source: 'manual' }
  }

  for (let i = 0; i < config.rules.length; i++) {
    const rule = config.rules[i]
    const char = charAtPos(plats, rule.position)
    if (rule.values.includes(char)) {
      return { klass: rule.klass, source: 'rule', ruleIndex: i }
    }
  }

  return { klass: config.baseKlass, source: 'base' }
}
