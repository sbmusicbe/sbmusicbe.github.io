import Anthropic from '@anthropic-ai/sdk';
import { getGarminContext } from './lib/garmin.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const PASSPHRASE = process.env.CHAT_PASSPHRASE || '';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Chat-Passphrase');
}

function sanitizeHistoryItem(item) {
  if (!item || (item.role !== 'user' && item.role !== 'assistant')) return null;
  if (typeof item.content !== 'string' || !item.content.trim()) return null;
  return { role: item.role, content: item.content.slice(0, 4000) };
}

function buildSystemPrompt(garminContext) {
  return `You are a friendly, knowledgeable training and nutrition coach embedded on the user's personal website. You have direct, read-only access to the user's real Garmin Connect data, provided below as JSON.

Rules:
- Answer questions about training (activities, effort, heart rate, recovery) and food/nutrition using this data plus sound general sports-nutrition and exercise-science knowledge.
- Never invent numbers that aren't in the data. If something needed to answer isn't present (an "unavailable" field, or food-log data that Garmin simply doesn't have), say so plainly instead of guessing.
- Be concise, specific with real numbers when you have them, and encouraging in tone.
- This is not medical advice; suggest seeing a professional for anything that sounds like an injury or medical concern.

GARMIN DATA SNAPSHOT (JSON):
${JSON.stringify(garminContext, null, 2)}`;
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (PASSPHRASE && req.headers['x-chat-passphrase'] !== PASSPHRASE) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = req.body || {};
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!message || message.length > 2000) {
    res.status(400).json({ error: 'Send a non-empty message (max 2000 characters).' });
    return;
  }

  let garminContext;
  try {
    garminContext = await getGarminContext();
  } catch (err) {
    console.error('Garmin fetch failed:', err);
    garminContext = { unavailable: true, reason: 'Could not reach Garmin Connect right now.' };
  }

  const history = Array.isArray(body.history)
    ? body.history.slice(-10).map(sanitizeHistoryItem).filter(Boolean)
    : [];

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(garminContext),
      messages: [...history, { role: 'user', content: message }],
    });

    const reply = response.content.find((block) => block.type === 'text')?.text || '';
    res.status(200).json({ reply });
  } catch (err) {
    console.error('Anthropic call failed:', err);
    res.status(502).json({ error: 'The coach is temporarily unavailable. Try again in a moment.' });
  }
}
