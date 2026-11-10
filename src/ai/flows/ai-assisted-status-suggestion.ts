'use server';
/**
 * @fileOverview A Genkit flow for suggesting an initial processing status for registration details.
 *
 * - aiAssistedStatusSuggestion - A function that suggests an initial processing status for registration details.
 * - AiAssistedStatusSuggestionInput - The input type for the aiAssistedStatusSuggestion function.
 * - AiAssistedStatusSuggestionOutput - The return type for the aiAssistedStatusSuggestion function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  am: 'Amharic (አማርኛ)',
  om: 'Afaan Oromo (Afaan Oromoo)',
  so: 'Somali (Af-Soomaali)',
};

// Input Schema
const AiAssistedStatusSuggestionInputSchema = z.object({
  submissionContent: z.string().describe('The full content of the registration submission, including all text fields.'),
  requiredFieldsFilled: z.boolean().describe('True if all required fields in the registration form were filled, false otherwise.'),
  submissionDate: z.string().optional().describe('Optional: The date and time of the registration submission.'),
  applicantName: z.string().optional().describe('Optional: The name of the applicant.'),
  attachmentsIncluded: z.boolean().optional().describe('Optional: True if any attachments were included with the submission, false otherwise.'),
  locale: z.enum(['en', 'am', 'om', 'so']).optional().describe("Optional: The user's selected UI language ('en', 'am', 'om', or 'so')."),
  languageName: z.string().optional().describe('Resolved language name for the prompt.'),
});
export type AiAssistedStatusSuggestionInput = z.infer<typeof AiAssistedStatusSuggestionInputSchema>;

// Output Schema
const AiAssistedStatusEnum = z.enum(['pending review', 'processing', 'rejected']);
const AiAssistedStatusSuggestionOutputSchema = z.object({
  suggestedStatus: AiAssistedStatusEnum.describe("The suggested initial processing status. Can be 'pending review', 'processing', or 'rejected'."),
  reason: z.string().describe("A brief explanation for the suggested status written in the user's selected language."),
});
export type AiAssistedStatusSuggestionOutput = z.infer<typeof AiAssistedStatusSuggestionOutputSchema>;

// Wrapper function
export async function aiAssistedStatusSuggestion(input: AiAssistedStatusSuggestionInput): Promise<AiAssistedStatusSuggestionOutput> {
  const resolvedLang = LANGUAGE_NAMES[input.locale || 'en'] || 'English';
  return aiAssistedStatusSuggestionFlow({
    ...input,
    languageName: resolvedLang,
  });
}

// Define the prompt
const aiAssistedStatusSuggestionPrompt = ai.definePrompt({
  name: 'aiAssistedStatusSuggestionPrompt',
  input: { schema: AiAssistedStatusSuggestionInputSchema },
  output: { schema: AiAssistedStatusSuggestionOutputSchema },
  prompt: `You are an AI assistant for a registration tracking system called FaydaTrack. Your task is to analyze incoming registration details and suggest an initial processing status.
The possible statuses are:
- 'pending review': Use this if the registration seems to require manual human intervention, such as complex content, potential issues, or if attachments are present and need checking.
- 'processing': Use this if the registration appears complete, straightforward, and can proceed with automated or standard internal processing.
- 'rejected': Use this if the registration is clearly invalid, spam, or fundamentally incomplete despite 'requiredFieldsFilled' possibly being true (e.g., gibberish in fields).

IMPORTANT LANGUAGE REQUIREMENT:
You MUST write the 'reason' field in natural, everyday {{{languageName}}}. Keep 'suggestedStatus' strictly as one of the enum values ('pending review', 'processing', or 'rejected').

Analyze the following registration submission:

Submission Content:
{{{submissionContent}}}

Required Fields Filled: {{{requiredFieldsFilled}}}
{{#if submissionDate}}Submission Date: {{{submissionDate}}}{{/if}}
{{#if applicantName}}Applicant Name: {{{applicantName}}}{{/if}}
{{#if attachmentsIncluded}}Attachments Included: {{{attachmentsIncluded}}}{{/if}}

Based on the details above, suggest the most appropriate initial processing status and provide a concise reason in {{{languageName}}}.
`,
});

// Define the flow
const aiAssistedStatusSuggestionFlow = ai.defineFlow(
  {
    name: 'aiAssistedStatusSuggestionFlow',
    inputSchema: AiAssistedStatusSuggestionInputSchema,
    outputSchema: AiAssistedStatusSuggestionOutputSchema,
  },
  async (input) => {
    const { output } = await aiAssistedStatusSuggestionPrompt(input);
    return output!;
  }
);
