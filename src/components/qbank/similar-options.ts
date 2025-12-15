// src/components/qbank/similar-options.ts
export type SimilarOptionsMode = "off" | "group";

export type SimilarOptionsMeta = {
  hasSimilar: boolean;
  maxSimilarity: number;
  clusterKey: string | null;
  bestPair: [string, string] | null;
};

type Config = {
  threshold: number;
  minLen: number;
};

const DEFAULTS: Config = {
  threshold: 0.88,
  minLen: 6,
};

export function normalizeText(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ");
}

function bigrams(s: string): string[] {
  const t = normalizeText(s);
  if (t.length < 2) return [];
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

export function diceSimilarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return 0;

  const freq = new Map<string, number>();
  for (const x of A) freq.set(x, (freq.get(x) ?? 0) + 1);

  let matches = 0;
  for (const y of B) {
    const c = freq.get(y) ?? 0;
    if (c > 0) {
      matches++;
      freq.set(y, c - 1);
    }
  }
  return (2 * matches) / (A.length + B.length);
}

function isWorthComparing(a: string, b: string, minLen: number): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na.length < minLen || nb.length < minLen) return false;
  if (/^[a-d]$/.test(na) || /^[a-d]$/.test(nb)) return false;
  return true;
}

export function extractOptions(q: any): string[] {
  const raw =
    q?.options ??
    q?.choices ??
    q?.answerOptions ??
    q?.answers ??
    q?.answersList ??
    q?.optionsText;

  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x === "object") return String(x.text ?? x.label ?? x.value ?? "");
        return "";
      })
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (raw && typeof raw === "object") {
    return Object.values(raw)
      .map((x: any) => (typeof x === "string" ? x : String(x?.text ?? x?.label ?? x ?? "")))
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return [];
}

export function getSimilarOptionsMeta(q: any, cfg?: Partial<Config>): SimilarOptionsMeta {
  const { threshold, minLen } = { ...DEFAULTS, ...(cfg ?? {}) };
  const options = extractOptions(q);

  let best: { score: number; pair: [string, string] | null } = { score: 0, pair: null };

  for (let i = 0; i < options.length; i++) {
    for (let j = i + 1; j < options.length; j++) {
      const a = options[i];
      const b = options[j];
      if (!isWorthComparing(a, b, minLen)) continue;

      const na = normalizeText(a);
      const nb = normalizeText(b);

      if (na === nb) {
        best = { score: 1, pair: [a, b] };
        continue;
      }

      const containment =
        na.length > 10 && nb.length > 10 && (na.includes(nb) || nb.includes(na)) ? 0.92 : 0;

      const score = Math.max(diceSimilarity(a, b), containment);
      if (score > best.score) best = { score, pair: [a, b] };
    }
  }

  const hasSimilar = best.score >= threshold;

  let clusterKey: string | null = null;
  if (hasSimilar && best.pair) {
    const [a, b] = best.pair;
    clusterKey = [normalizeText(a), normalizeText(b)].sort().join("|");
  }

  return {
    hasSimilar,
    maxSimilarity: best.score,
    clusterKey,
    bestPair: best.pair,
  };
}
