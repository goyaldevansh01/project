
// api/chat.js
// Vercel serverless function. Keeps your ANTHROPIC_API_KEY secret on the
// server — the widget in the browser only ever talks to this endpoint.
//
// Setup:
//   1. In your Vercel project settings -> Environment Variables, add:
//        ANTHROPIC_API_KEY = sk-ant-...   (get one at console.anthropic.com)
//   2. Put this file at /api/chat.js in your project root (Vercel picks
//      up anything under /api automatically, no extra config needed).
//   3. Redeploy.
//
// Model: using claude-haiku-4-5-20251001 by default because it's fast and
// cheap, which matters since every visitor's question is a paid API call.
// Swap to 'claude-sonnet-5' if you want stronger answers and don't mind
// the extra cost per message.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server missing ANTHROPIC_API_KEY' });
    return;
  }

  const { topic, messages } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  // Keep only role/content, cap history length to control cost/context size.
  const trimmed = messages.slice(-12).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 4000)
  }));

  const systemPrompt =
    'You are a friendly, concise tutor embedded on the DevPath website, on the page about: "' +
    String(topic || 'software development').slice(0, 200) +
    '". Answer questions about this topic clearly, with short explanations ' +
    'and concrete examples. If asked something unrelated to programming, ' +
    'tech careers, or this specific roadmap topic, gently steer back. Keep ' +
    'replies under ~150 words unless the user asks for more detail.';

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: systemPrompt,
        messages: trimmed
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.status(upstream.status).json({ error: 'Anthropic API error', detail: errText });
      return;
    }

    const data = await upstream.json();
    const reply = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    res.status(200).json({ reply: reply || "I didn't get a text response." });
  } catch (err) {
    res.status(500).json({ error: 'Server error', detail: String(err.message || err) });
  }
}
