/**
 * Calls the AI with the prompt and returns a parsed draft object.
 * Throws AiError on transport failure or unparseable output.
 *
 * Works with EITHER provider — it picks based on which key is in your .env:
 *
 *   GOOGLE_API_KEY=...      -> Google Gemini   (free: aistudio.google.com/apikey)
 *   ANTHROPIC_API_KEY=...   -> Anthropic Claude (paid)
 *
 * Gemini needs NO npm install — Node 18+ has fetch built in.
 * Anthropic needs: npm i @anthropic-ai/sdk
 */

const { SYSTEM_PROMPT, buildUserPrompt } = require('./prompt');

class AiError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'AiError';
    this.details = details;
  }
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

/** Which provider are we using? */
function activeProvider() {
  if (process.env.GOOGLE_API_KEY) return { name: 'gemini', model: GEMINI_MODEL };
  if (process.env.ANTHROPIC_API_KEY) return { name: 'anthropic', model: ANTHROPIC_MODEL };
  return null;
}

/** Pull a JSON object out of a model reply, tolerating code fences or stray text. */
function extractJson(text) {
  let s = (text || '').trim();

  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  if (!s.startsWith('{')) {
    const first = s.indexOf('{');
    const last = s.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) {
      throw new AiError('AI did not return JSON', { raw: (text || '').slice(0, 2000) });
    }
    s = s.slice(first, last + 1);
  }

  try {
    return JSON.parse(s);
  } catch (err) {
    throw new AiError('AI returned malformed JSON', { reason: err.message, raw: s.slice(0, 2000) });
  }
}

// ---------------------------------------------------------------- Gemini ----
async function callGemini(systemPrompt, userPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': process.env.GOOGLE_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 16384,
          responseMimeType: 'application/json', // forces pure JSON, no prose
        },
      }),
    });
  } catch (err) {
    throw new AiError('Could not reach the AI service', { reason: err.message });
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = body?.error?.message || res.statusText;
    throw new AiError(`AI service error (${res.status})`, { reason: msg });
  }

  const cand = body?.candidates?.[0];
  if (!cand) throw new AiError('AI returned no result', { reason: body?.promptFeedback?.blockReason || 'empty response' });
  if (cand.finishReason === 'MAX_TOKENS') {
    throw new AiError('AI reply was cut off before finishing the JSON. Raise maxOutputTokens.', { finishReason: cand.finishReason });
  }

  const text = (cand.content?.parts || []).map((p) => p.text || '').join('');
  if (!text.trim()) throw new AiError('AI returned an empty reply', { finishReason: cand.finishReason });

  return { text, usage: body.usageMetadata };
}

// ------------------------------------------------------------- Anthropic ----
async function callAnthropic(systemPrompt, userPrompt) {
  let Anthropic;
  try {
    Anthropic = require('@anthropic-ai/sdk');
  } catch {
    throw new AiError('Anthropic SDK is not installed. Run: npm.cmd i @anthropic-ai/sdk');
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let response;
  try {
    response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 8000,
      temperature: 0,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: '{' }, // prefill: forces a JSON-only reply
      ],
    });
  } catch (err) {
    throw new AiError('AI service call failed', { reason: err.message, status: err.status });
  }

  const body = (response.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { text: '{' + body, usage: response.usage };
}

// ------------------------------------------------------------------ main ----
/**
 * @param {object} args
 * @param {string} args.transcript
 * @param {Array}  args.directory
 * @param {string} [args.meetingDate]
 * @returns {Promise<{draft:object, raw:string, usage:object, provider:string}>}
 */
async function extractProjects({ transcript, directory, meetingDate }) {
  const provider = activeProvider();
  if (!provider) {
    throw new AiError('No AI key found. Put GOOGLE_API_KEY (free) or ANTHROPIC_API_KEY in your .env');
  }

  const userPrompt = buildUserPrompt({ transcript, directory, meetingDate });

  const { text, usage } =
    provider.name === 'gemini'
      ? await callGemini(SYSTEM_PROMPT, userPrompt)
      : await callAnthropic(SYSTEM_PROMPT, userPrompt);

  return { draft: extractJson(text), raw: text, usage, provider: `${provider.name}/${provider.model}` };
}

module.exports = { extractProjects, extractJson, activeProvider, AiError };
