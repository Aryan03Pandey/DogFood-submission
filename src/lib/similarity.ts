// Text similarity analysis for duplicate detection (Anti-Abuse System)

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 2)
}

function getNGrams(words: string[], n = 2): Set<string> {
  const ngrams = new Set<string>()
  if (words.length < n) {
    if (words.length > 0) ngrams.add(words.join(' '))
    return ngrams
  }
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.add(words.slice(i, i + n).join(' '))
  }
  return ngrams
}

export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1.0
  if (setA.size === 0 || setB.size === 0) return 0.0
  let intersectionSize = 0
  for (const item of setA) {
    if (setB.has(item)) intersectionSize++
  }
  const unionSize = setA.size + setB.size - intersectionSize
  return unionSize === 0 ? 0 : intersectionSize / unionSize
}

export function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length
  const n = s2.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
  }
  return dp[m][n]
}

export function stringNormalizedSimilarity(a: string, b: string): number {
  const trimmedA = a.trim().toLowerCase()
  const trimmedB = b.trim().toLowerCase()
  if (trimmedA === trimmedB) return 1.0
  const maxLen = Math.max(trimmedA.length, trimmedB.length)
  if (maxLen === 0) return 1.0
  const dist = levenshteinDistance(trimmedA, trimmedB)
  return Math.max(0, 1 - dist / maxLen)
}

export function calculateProjectSimilarity(
  p1: { title: string; tagline?: string | null; description?: string | null },
  p2: { title: string; tagline?: string | null; description?: string | null },
): number {
  const titleSim = stringNormalizedSimilarity(p1.title, p2.title)

  const words1 = tokenize(`${p1.tagline ?? ''} ${p1.description ?? ''}`)
  const words2 = tokenize(`${p2.tagline ?? ''} ${p2.description ?? ''}`)
  const ngrams1 = getNGrams(words1, 2)
  const ngrams2 = getNGrams(words2, 2)
  const contentSim = jaccardSimilarity(ngrams1, ngrams2)

  return Number((titleSim * 0.45 + contentSim * 0.55).toFixed(4))
}