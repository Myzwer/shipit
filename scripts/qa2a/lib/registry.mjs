/** In-memory QA-2A test registry + serializers. */
export function createRegistry() {
  /** @type {Array<Record<string, unknown>>} */
  const cases = []
  /** @type {Array<Record<string, unknown>>} */
  const defects = []

  function record(entry) {
    const row = {
      id: entry.id,
      journey: entry.journey ?? entry.id,
      preconditions: entry.preconditions ?? [],
      expected: entry.expected ?? '',
      actual: entry.actual ?? '',
      method: entry.method ?? 'browser+disposable',
      backend_integration: entry.backend_integration ?? 'real_disposable',
      outcome: entry.outcome, // passed | failed | blocked | not_run
      evidence: entry.evidence ?? [],
      notes: entry.notes ?? '',
      links: entry.links ?? [],
      viewport: entry.viewport ?? null,
    }
    cases.push(row)
    const tag =
      row.outcome === 'passed' ? 'PASS' : row.outcome === 'failed' ? 'FAIL' : row.outcome.toUpperCase()
    console.log(`${tag} ${row.id}${row.actual && row.outcome !== 'passed' ? ` — ${row.actual}` : ''}`)
    return row
  }

  function defect(entry) {
    defects.push(entry)
    console.error(`DEFECT ${entry.id} [${entry.severity}] ${entry.title}`)
    return entry
  }

  function totals() {
    const t = { total: cases.length, passed: 0, failed: 0, blocked: 0, not_run: 0 }
    for (const c of cases) {
      if (c.outcome === 'passed') t.passed++
      else if (c.outcome === 'failed') t.failed++
      else if (c.outcome === 'blocked') t.blocked++
      else t.not_run++
    }
    return t
  }

  return { cases, defects, record, defect, totals }
}
