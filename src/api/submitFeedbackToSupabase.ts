// src/api/submitFeedbackToSupabase.ts
import { supabase } from '../services/supabase-client';

export async function submitFeedbackToSupabase({ message, pageUrl }: { message: string; pageUrl: string }) {
  // You can expand this to include name/email if needed
  const { error } = await supabase.from('feedback_messages').insert([
    {
      message,
      page_url: pageUrl,
      // Add more fields if your table expects them
    },
  ]);
  if (error) throw new Error(error.message || 'Failed to submit feedback.');
  return { success: true };
}
