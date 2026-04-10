// src/api/submitFeedbackToGoogleSheets.ts
// This function posts feedback to a Google Sheets endpoint via a Google Apps Script web app

export async function submitFeedbackToGoogleSheets({ message, pageUrl }: { message: string; pageUrl: string }) {
  const GOOGLE_SHEETS_WEBAPP_URL = import.meta.env.VITE_GOOGLE_SHEETS_WEBAPP_URL;
  if (!GOOGLE_SHEETS_WEBAPP_URL) {
    throw new Error('Google Sheets Web App URL is not configured.');
  }
  const response = await fetch(GOOGLE_SHEETS_WEBAPP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, pageUrl }),
  });
  if (!response.ok) {
    throw new Error('Failed to submit feedback to Google Sheets.');
  }
  return response.json();
}
