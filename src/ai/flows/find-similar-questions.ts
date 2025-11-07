'use server';

/**
 * @fileOverview Flow to find similar questions based on similar answers (via AI).
 *
 * - findSimilarQuestions - A function that handles the process of finding similar questions.
 * - FindSimilarQuestionsInput - The input type for the findSimilarQuestions function.
 * - FindSimilarQuestionsOutput - The return type for the findSimilarQuestions function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

/* =========================
 * Schemas & Types
 * ========================= */

// ✅ أضفنا options و correctAnswer لدقة المطابقة على مستوى الإجابات
const QuestionSchema = z.object({
  id: z.string(),
  questionText: z.string(),
  options: z.array(z.string()).optional().default([]).describe('Answer options for the question (if MCQ).'),
  // يمكن أن تكون الإجابة نصًا واحدًا أو عدة نصوص (لو السؤال متعدد الإجابات)
  correctAnswer: z.union([z.string(), z.array(z.string())]).optional().describe('The correct answer(s) as text.'),
});

const FindSimilarQuestionsInputSchema = z.object({
  question: QuestionSchema.describe('The question to find similarities for.'),
  questionBank: z.array(QuestionSchema).describe('The list of all questions to search within.'),
});
export type FindSimilarQuestionsInput = z.infer<typeof FindSimilarQuestionsInputSchema>;

const FindSimilarQuestionsOutputSchema = z.array(z.object({
  id: z.string().describe('The ID of the similar question.'),
  questionText: z.string().describe('The text of the similar question.'),
  similarityScore: z.number().describe('A score in [0,1] prioritizing answer-level similarity.'),
}));
export type FindSimilarQuestionsOutput = z.infer<typeof FindSimilarQuestionsOutputSchema>;

/* =========================
 * Public API
 * ========================= */

export async function findSimilarQuestions(input: FindSimilarQuestionsInput): Promise<FindSimilarQuestionsOutput> {
  return findSimilarQuestionsFlow(input);
}

/* =========================
 * Prompt
 * ========================= */

const findSimilarQuestionsPrompt = ai.definePrompt({
  name: 'findSimilarQuestionsByAnswersPrompt',
  input: { schema: FindSimilarQuestionsInputSchema },
  output: { schema: FindSimilarQuestionsOutputSchema },
  prompt: `You are an expert in matching exam questions by the SIMILARITY OF THEIR ANSWERS.

TASK:
Given a target question and a bank of questions, return up to 3 questions whose CORRECT ANSWERS are most similar to the target's correct answer(s).
- Exclude the target question itself (matching ID).
- Prioritize answer-level similarity over surface text similarity.
- Compare by:
  1) Exact text match of correct answer(s) (highest weight).
  2) Semantic equivalence / paraphrases of correct answer(s).
  3) Overlap of multi-correct sets.
  4) If available, consider similarity of key terms in the correct options, even if the stems differ.
- Ignore distractors; focus on correct answer(s). If the target has no correctAnswer provided, infer the best you can from options/context.

SCORING (guideline, not strict):
- 1.0: Same correct answer text or clear semantic equivalence (e.g., "CRL" ≈ "Certificate Revocation List").
- ~0.7–0.9: Strong paraphrase or same concept with minor wording differences.
- ~0.4–0.6: Partial overlap for multi-answer, or related but not identical concepts.
- <0.4: Weak/tenuous relation.

RETURN: A JSON array of up to 3 items, each:
{ "id": string, "questionText": string, "similarityScore": number in [0,1] }

DATA
TARGET:
- ID: {{{question.id}}}
- Text: {{{question.questionText}}}
- Options: {{#each question.options}}{{{this}}} || {{/each}}
- Correct: {{#if question.correctAnswer}}{{{question.correctAnswer}}}{{else}}N/A{{/if}}

BANK:
{{#each questionBank}}
- ID: {{{this.id}}}
  Text: {{{this.questionText}}}
  Options: {{#each this.options}}{{{this}}} || {{/each}}
  Correct: {{#if this.correctAnswer}}{{{this.correctAnswer}}}{{else}}N/A{{/if}}
{{/each}}

CONSTRAINTS:
- Output ONLY the JSON array (no markdown, no prose).
- Do not include the target question itself.
- If fewer than 3 good matches exist, return fewer.

EXAMPLES OF EQUIVALENCE (EN/AR mixed allowed):
- "CRL" ~= "Certificate Revocation List" ~= "قائمة إبطال الشهادات"
- "TPM" ~= "Trusted Platform Module" ~= "وحدة النظام الأساسي الموثوق به"
- "PKI" ~= "Public Key Infrastructure" ~= "البنية التحتية للمفتاح العام"`,
});

/* =========================
 * Flow
 * ========================= */

const findSimilarQuestionsFlow = ai.defineFlow(
  {
    name: 'findSimilarQuestionsFlow',
    inputSchema: FindSimilarQuestionsInputSchema,
    outputSchema: FindSimilarQuestionsOutputSchema,
  },
  async (input) => {
    // استبعد السؤال الأصلي لتفادي مطابقته بنفسه
    const filteredBank = input.questionBank.filter(q => q.id !== input.question.id);
    const { output } = await findSimilarQuestionsPrompt({
      ...input,
      questionBank: filteredBank,
    });

    // تأكيد الإخراج
    return output ?? [];
  }
);
