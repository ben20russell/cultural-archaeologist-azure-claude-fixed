// src/api/submitFeedbackToSupabase.ts
export async function submitFeedbackToSupabase({ message, pageUrl }: { message: string; pageUrl: string }) {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
  const response = await fetch(`${API_BASE_URL}/api/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, pageUrl }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to submit feedback.');
  }
  return response.json();
}
