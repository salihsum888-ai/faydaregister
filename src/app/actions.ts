"use server"

import { 
  aiAssistedStatusSuggestion, 
  AiAssistedStatusSuggestionInput, 
  AiAssistedStatusSuggestionOutput 
} from '@/ai/flows/ai-assisted-status-suggestion';

export async function getStatusSuggestion(input: AiAssistedStatusSuggestionInput): Promise<AiAssistedStatusSuggestionOutput> {
  try {
    const result = await aiAssistedStatusSuggestion(input);
    return result;
  } catch (error) {
    console.error("AI Suggestion failed:", error);
    return {
      suggestedStatus: input.requiredFieldsFilled ? 'processing' : 'pending review',
      reason: 'AI service unavailable. Automated assessment based on completed fields.'
    };
  }
}
