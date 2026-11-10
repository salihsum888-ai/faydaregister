"use server"

import { 
  aiAssistedStatusSuggestion, 
  AiAssistedStatusSuggestionInput, 
  AiAssistedStatusSuggestionOutput 
} from '@/ai/flows/ai-assisted-status-suggestion';

const FALLBACK_REASONS: Record<string, string> = {
  en: 'Automated assessment based on completed fields.',
  am: 'በተሞሉት መረጃዎች ላይ የተመሠረተ ራስ-ሰር ግምገማ።',
  om: 'Odeeffannoo guutame irratti hundaa’uun madaallii taasifame.',
  so: 'Qiimeyn toos ah oo ku salaysan xogta la buuxiyay.',
};

export async function getStatusSuggestion(input: AiAssistedStatusSuggestionInput): Promise<AiAssistedStatusSuggestionOutput> {
  try {
    const result = await aiAssistedStatusSuggestion(input);
    return result;
  } catch (error) {
    console.error("AI Suggestion failed:", error);
    const locale = input.locale || 'en';
    return {
      suggestedStatus: input.requiredFieldsFilled ? 'processing' : 'pending review',
      reason: FALLBACK_REASONS[locale] || FALLBACK_REASONS.en,
    };
  }
}
