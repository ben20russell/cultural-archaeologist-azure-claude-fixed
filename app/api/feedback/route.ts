import { google } from 'googleapis';

type FeedbackPayload = {
  feedback: string;
  userEmail?: string;
};

const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const DEFAULT_EMAIL_LABEL = 'Anonymous';

function getRequiredEnv(name: 'GOOGLE_CLIENT_EMAIL' | 'GOOGLE_PRIVATE_KEY' | 'GOOGLE_SHEET_ID'): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseBody(input: unknown): FeedbackPayload {
  if (!input || typeof input !== 'object') {
    throw new Error('Request body must be a JSON object.');
  }

  const candidate = input as Record<string, unknown>;
  const feedback = typeof candidate.feedback === 'string' ? candidate.feedback.trim() : '';
  const userEmail = typeof candidate.userEmail === 'string' ? candidate.userEmail.trim() : undefined;

  if (!feedback) {
    throw new Error('Feedback is required.');
  }

  if (feedback.length > 5000) {
    throw new Error('Feedback is too long (max 5000 characters).');
  }

  if (userEmail && userEmail.length > 320) {
    throw new Error('userEmail is too long.');
  }

  return { feedback, userEmail };
}

function getSheetsClient() {
  const clientEmail = getRequiredEnv('GOOGLE_CLIENT_EMAIL');
  const privateKey = getRequiredEnv('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n');

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [GOOGLE_SHEETS_SCOPE],
  });

  return google.sheets({ version: 'v4', auth });
}

export async function POST(request: Request): Promise<Response> {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON payload.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    let payload: FeedbackPayload;
    try {
      payload = parseBody(rawBody);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid input.';
      return new Response(
        JSON.stringify({ success: false, error: message }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const spreadsheetId = getRequiredEnv('GOOGLE_SHEET_ID');
    const sheets = getSheetsClient();

    // Append to the first worksheet by default. Change the range if you use a named sheet.
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'A:C',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          new Date().toISOString(),
          payload.userEmail || DEFAULT_EMAIL_LABEL,
          payload.feedback,
        ]],
      },
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';

    // Avoid leaking credentials while still returning actionable diagnostics.
    const safeMessage =
      message.includes('GOOGLE_PRIVATE_KEY') || message.includes('GOOGLE_CLIENT_EMAIL')
        ? 'Google Sheets credentials are misconfigured.'
        : message;

    return new Response(
      JSON.stringify({ success: false, error: safeMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
