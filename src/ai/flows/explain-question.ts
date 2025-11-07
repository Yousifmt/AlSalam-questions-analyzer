'use server';

/**
 * @fileOverview An AI agent that explains exam questions.
 *
 * - explainQuestion - A function that handles the question explanation process.
 * - ExplainQuestionInput - The input type for the explainQuestion function.
 * - ExplainQuestionOutput - The return type for the explainQuestion function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

/* =========================
 * Schemas & Types
 * ========================= */

const ExplainQuestionInputSchema = z.object({
  questionText: z.string().describe('The text of the question.'),
  options: z.array(z.string()).optional().describe('The options for the question, if it is a multiple choice question.'),
  correctAnswer: z.union([z.string(), z.array(z.string())]).optional().describe('The correct answer(s) to the question.'),
  explanation: z.string().optional().describe('An existing explanation for the question.'),
  level: z.enum(['short', 'full']).describe('The level of detail for the explanation.'),
  language: z.enum(['ar', 'en']).describe('The language for the explanation.'),
});
export type ExplainQuestionInput = z.infer<typeof ExplainQuestionInputSchema>;

const ShortcutMeaningSchema = z.object({
  shortcut: z.string().describe('The acronym/shortcut as it appears (e.g., CPU, ECG).'),
  meaning: z.string().describe('The meaning/expansion of the shortcut in the target language.'),
});

const ExplainQuestionOutputSchema = z.object({
  language: z.enum(['ar', 'en']).describe('The language of the explanation.'),
  generalExplanation: z.string().describe('A general explanation of the question and its context.'),
  correctAnswerExplanation: z.string().describe('A specific explanation of why the correct answer is right.'),
  whyOthersWrong: z
    .array(
      z.object({
        option: z.string().describe('The incorrect option.'),
        reason: z.string().describe('The reason why this option is incorrect.'),
      }),
    )
    .optional()
    .describe('Reasons why other options are wrong, if the question is multiple choice.'),
  shortcutMeanings: z.array(ShortcutMeaningSchema).optional().describe('Meanings of any shortcuts/acronyms mentioned.'),
});
export type ExplainQuestionOutput = z.infer<typeof ExplainQuestionOutputSchema>;

/* =========================
 * Public API
 * ========================= */

export async function explainQuestion(input: ExplainQuestionInput): Promise<ExplainQuestionOutput> {
  return explainQuestionFlow(input);
}

/* =========================
 * Prompt
 * ========================= */

const prompt = ai.definePrompt({
  name: 'explainQuestionPrompt',
  input: { schema: ExplainQuestionInputSchema },
  output: { schema: ExplainQuestionOutputSchema },
  prompt: `You explain exam questions for students.
Output only the requested JSON object (no prose, no markdown).
Be concise, accurate, and didactic.
Do not reveal internal reasoning or chain-of-thought.

LANGUAGE RULE:
- Respect LANGUAGE={{{language}}} ("ar" or "en") for all free-text fields.

MCQ RULE:
- If the question is MCQ, include detailed "whyOthersWrong"; otherwise return [].

SHORTCUTS RULES (INLINE ALLOWED):
- You MAY mention shortcuts/acronyms and their expansions inline inside "generalExplanation" and "correctAnswerExplanation" when it improves clarity.
  Example (en): "... use CRL (Certificate Revocation List) to publish revoked certs ..."
  Example (ar): "... تُستخدم CRL (قائمة إبطال الشهادات) لنشر الشهادات المُبطلة ..."
- ALSO build "shortcutMeanings" by scanning Question/Options/Existing Explanation for any 2–6 uppercase tokens (e.g., SSL, TLS, OCSP, CRL, CA, CSR, PKI, TPM, CPU, RAM).
- For each detected shortcut, add one item to "shortcutMeanings": { "shortcut": string, "meaning": string }.
- The "meaning" MUST be written in LANGUAGE={{{language}}}.
- If the meaning is unknown, set "meaning" to a clear placeholder ("غير مذكور" in ar, "not provided" in en).
- Do not duplicate shortcuts; return each shortcut at most once.

Return EXACTLY this JSON shape (no extra fields):
{
  "language": "ar" | "en",
  "generalExplanation": string,
  "correctAnswerExplanation": string,
  "whyOthersWrong": array,   // [] if not MCQ
  "shortcutMeanings": array  // [] if none detected
}

Explain the following question at LEVEL={{{level}}} in LANGUAGE={{{language}}}.
The explanation should have three parts:
1) generalExplanation: high-level concept (you MAY include inline acronym expansions).
2) correctAnswerExplanation: why the correct answer is correct (you MAY include inline acronym expansions).
3) whyOthersWrong: for MCQs, analyze every incorrect option; otherwise return [].

Question: {{{questionText}}}
Options: {{#if options}}{{{options}}}{{else}}N/A{{/if}}
Correct Answer: {{#if correctAnswer}}{{{correctAnswer}}}{{else}}N/A{{/if}}
Existing Explanation (if any): {{#if explanation}}{{{explanation}}}{{else}}N/A{{/if}}`,
});


/* =========================
 * Helpers (Post-process)
 * ========================= */

/**
 * Extracts patterns like:
 *   CPU (Central Processing Unit)
 *   ECG (electrocardiogram)
 * and removes the parenthetical expansion from the text.
 */
function extractFromText(
  text: string,
): { cleaned: string; pairs: Array<{ shortcut: string; meaning: string }> } {
  if (!text) return { cleaned: text ?? '', pairs: [] };

  const pairs: Array<{ shortcut: string; meaning: string }> = [];
  let cleaned = text;

  // Pattern 1: ABCD (Meaning ...)
  const parenRe = /\b([A-Z]{2,6})\b\s*\(([^)]+)\)/g;
  cleaned = cleaned.replace(parenRe, (_m, sc, meaning) => {
    pairs.push({ shortcut: String(sc), meaning: String(meaning).trim() });
    return sc; // keep acronym only
  });

  // Pattern 2 (optional): ABCD = Meaning / ABCD: Meaning
  const assignRe = /\b([A-Z]{2,6})\b\s*(?:=|:)\s*([A-Za-z][^.;,\n]+)/g;
  cleaned = cleaned.replace(assignRe, (_m, sc, meaning) => {
    pairs.push({ shortcut: String(sc), meaning: String(meaning).trim() });
    return sc; // keep acronym only
  });

  return { cleaned, pairs };
}

/** Deduplicate by shortcut (last one wins) */
function dedupePairs(pairs: Array<{ shortcut: string; meaning: string }>) {
  const map = new Map<string, string>();
  for (const p of pairs) map.set(p.shortcut.toUpperCase(), p.meaning);
  return Array.from(map.entries()).map(([shortcut, meaning]) => ({ shortcut, meaning }));
}

/* =========================
 * Flow
 * ========================= */

const explainQuestionFlow = ai.defineFlow(
  {
    name: 'explainQuestionFlow',
    inputSchema: ExplainQuestionInputSchema,
    outputSchema: ExplainQuestionOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);

    // Ensure base fields exist
    let language = output?.language ?? input.language;
    let generalExplanation = output?.generalExplanation ?? '';
    let correctAnswerExplanation = output?.correctAnswerExplanation ?? '';
    const isMCQ = Array.isArray(input.options) && input.options.length > 0;

    // Gather model-provided shortcuts (preferred path)
    let shortcutMeanings: Array<{ shortcut: string; meaning: string }> =
      (output?.shortcutMeanings ?? []).slice();

    // Post-process: capture any inline expansions the model might still include
    // from generalExplanation and correctAnswerExplanation, and strip them.
    const g = extractFromText(generalExplanation);
    generalExplanation = g.cleaned;
    const c = extractFromText(correctAnswerExplanation);
    correctAnswerExplanation = c.cleaned;

    shortcutMeanings = dedupePairs([...shortcutMeanings, ...g.pairs, ...c.pairs]);

    // NOTE: ترجمة المعاني للعربية تُطلب من الموديل عبر الـprompt أعلاه.
    // في حال خالفت المخرجات ذلك (وقد يحدث أحيانًا)، يمكنك لاحقًا إضافة طبقة ترجمة هنا.

    const normalized: ExplainQuestionOutput = {
      language,
      generalExplanation,
      correctAnswerExplanation,
      whyOthersWrong: isMCQ ? (output?.whyOthersWrong ?? []) : [],
      shortcutMeanings,
    };

    return normalized;
  },
);

