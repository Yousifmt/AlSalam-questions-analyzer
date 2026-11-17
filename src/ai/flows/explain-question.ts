'use server';

/**
 * @fileOverview An AI agent that explains exam questions.
 *
 * - explainQuestion - A function that handles the question explanation process.
 * - ExplainQuestionInput - The input type for the explainQuestion function.
 * - ExplainQuestionOutput - The return type for the explainQuestion function.
 *
 * ⚡ Speed notes:
 * - Thinking is turned off (gemini-3.8-flash thinks at "medium" by default, which adds seconds).
 * - The model scans the question and explains each acronym found in it ("shortcutMeanings").
 * - The prompt defines exactly how long "short" and "full" are, so fewer tokens are generated.
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
  shortcut: z.string().describe('The acronym/shortcut exactly as it appears in the question (e.g., CPU, IPsec, WPA3).'),
  meaning: z.string().describe('The full name/expansion of the shortcut, in the target language.'),
  explanation: z.string().optional().describe('A brief explanation (one short sentence) of what it is, in the target language.'),
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
  shortcutMeanings: z.array(ShortcutMeaningSchema).optional().describe('Acronyms found in the question, each with its meaning and a brief explanation.'),
});
export type ExplainQuestionOutput = z.infer<typeof ExplainQuestionOutputSchema>;

// Extra fields prepared by the flow (not sent by the client)
const PromptInputSchema = ExplainQuestionInputSchema.extend({
  optionsText: z.string(),
  correctAnswerText: z.string(),
  candidates: z.string(),
});

/* =========================
 * Local scan (safety net so no acronym is skipped)
 * ========================= */

const STOP_WORDS = new Set([
  'AND', 'OR', 'NOT', 'THE', 'ALL', 'ANY', 'NONE', 'YES', 'NO', 'TRUE', 'FALSE', 'NOTE',
  'EXCEPT', 'ONLY', 'BOTH', 'NEITHER', 'OF', 'IN', 'ON', 'TO', 'IS', 'ARE', 'IT', 'AS', 'AT',
  'BY', 'IF', 'SO', 'WHICH', 'WHAT', 'WHEN', 'WHERE', 'WHY', 'HOW', 'THIS', 'THAT', 'WITH',
  'FROM', 'LEAST', 'MOST', 'BEST', 'NEXT',
]);

/** يدوّر في السؤال والخيارات والإجابة والشرح على أي كلمة شكلها اختصار (حرفين كبار أو أكثر) */
function detectCandidates(input: ExplainQuestionInput): string[] {
  const text = [
    input.questionText,
    ...(input.options ?? []),
    Array.isArray(input.correctAnswer) ? input.correctAnswer.join(' ') : input.correctAnswer ?? '',
    input.explanation ?? '',
  ].join(' \n ');

  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9]{1,9}/g)) {
    const t = m[0];
    if ((t.match(/[A-Z]/g) ?? []).length < 2) continue; // لازم حرفين كبار على الأقل
    const allCaps = t === t.toUpperCase();
    if (allCaps && STOP_WORDS.has(t)) continue;
    if (allCaps && /^[A-Z]+$/.test(t) && t.length > 7) continue; // كلمة عادية مكتوبة بحروف كبيرة
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 20) break;
  }
  return out;
}

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
  input: { schema: PromptInputSchema },
  output: { schema: ExplainQuestionOutputSchema },
  config: {
    temperature: 0.3,
    // ⚡ أهم سطر للسرعة: يوقف "التفكير" الداخلي للموديل.
    // لو طلع لك خطأ 400 بخصوص thinking، بدّله بـ: thinkingConfig: { thinkingLevel: 'LOW' }
    thinkingConfig: { thinkingBudget: 0 },
  },
  prompt: `You explain exam questions for students.
Output only the requested JSON object (no prose, no markdown).
Be concise, accurate, and didactic.
Do not reveal internal reasoning or chain-of-thought.

LANGUAGE RULE:
- Respect LANGUAGE={{{language}}} ("ar" or "en") for all free-text fields.
- In Arabic, keep technical terms and acronyms in English letters (e.g., TLS, CRL, firewall).

SHORTCUTS RULE (scan the question):
- Scan EACH of these sources separately, one after the other: (1) the Question, (2) EVERY option, (3) the Correct Answer, (4) the Existing Explanation. Acronyms that appear only in an option or only in the answer count too.
- Look for acronyms/abbreviations in any letter case (e.g., TLS, CRL, IPsec, WPA3, SaaS, IoT).
- A local scan found these candidates: {{{candidates}}}
  Cover EVERY candidate that is a real acronym/abbreviation/technical short name. Skip only plain words, product names, or people names. Also add any acronym the scan missed.
- Do NOT include acronyms that only appear in your own answer.
- Return each acronym once in "shortcutMeanings": { "shortcut", "meaning", "explanation" }.
  - shortcut: exactly as written in the question.
  - meaning: the full name, written in LANGUAGE={{{language}}} (keep the English name in Latin letters if there is no common translation).
  - explanation: ONE short sentence in LANGUAGE={{{language}}} saying what it is or does in this context.
- Maximum 12 items, in order of appearance. Return [] only if there truly are none.
- In "generalExplanation" and "correctAnswerExplanation" write acronyms plainly (e.g., "CRL") without expanding them; the app adds the meaning automatically.

MCQ RULE:
- If the question is MCQ, "whyOthersWrong" must cover EVERY incorrect option, one item per option; otherwise return [].

LENGTH RULE (follow strictly):
- LEVEL=short: generalExplanation = 2–3 sentences; correctAnswerExplanation = 2–3 sentences; each "reason" = ONE short sentence.
- LEVEL=full: generalExplanation = 4–6 sentences with background; correctAnswerExplanation = detailed, with a brief example; each "reason" = 1–2 sentences.

Return EXACTLY this JSON shape (no extra fields):
{
  "language": "ar" | "en",
  "generalExplanation": string,
  "correctAnswerExplanation": string,
  "whyOthersWrong": [ { "option": string, "reason": string } ],   // [] if not MCQ
  "shortcutMeanings": [ { "shortcut": string, "meaning": string, "explanation": string } ]   // [] if none
}

Explain the following question at LEVEL={{{level}}} in LANGUAGE={{{language}}}.

Question: {{{questionText}}}
Options:
{{{optionsText}}}
Correct Answer: {{{correctAnswerText}}}
Existing Explanation (if any): {{#if explanation}}{{{explanation}}}{{else}}N/A{{/if}}`,
});

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
    const optionsText =
      input.options && input.options.length > 0
        ? input.options.map((o) => `- ${o}`).join('\n')
        : 'N/A';
    const correctAnswerText = Array.isArray(input.correctAnswer)
      ? input.correctAnswer.join('; ')
      : input.correctAnswer || 'N/A';
    const candidates = detectCandidates(input).join(', ') || 'none';

    const { output } = await prompt({ ...input, optionsText, correctAnswerText, candidates });

    // رد فاضي = خطأ حقيقي، نخلي الواجهة تعرض "Try again" بدل ما تحفظ شرح فاضي في الكاش
    if (!output || !output.generalExplanation?.trim() || !output.correctAnswerExplanation?.trim()) {
      throw new Error('The AI returned an empty explanation. Please try again.');
    }

    const isMCQ = Array.isArray(input.options) && input.options.length > 0;

    // تنظيف الاختصارات: بدون تكرار، وبدون عناصر فاضية
    const seen = new Set<string>();
    const shortcutMeanings = (output.shortcutMeanings ?? [])
      .map((s) => ({
        shortcut: s.shortcut?.trim() ?? '',
        meaning: s.meaning?.trim() ?? '',
        explanation: s.explanation?.trim() || undefined,
      }))
      .filter((s) => {
        const k = s.shortcut.toUpperCase();
        if (!s.shortcut || !s.meaning || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 12);

    const normalized: ExplainQuestionOutput = {
      language: output.language ?? input.language,
      generalExplanation: output.generalExplanation.trim(),
      correctAnswerExplanation: output.correctAnswerExplanation.trim(),
      whyOthersWrong: isMCQ ? (output.whyOthersWrong ?? []) : [],
      shortcutMeanings,
    };

    return normalized;
  },
);