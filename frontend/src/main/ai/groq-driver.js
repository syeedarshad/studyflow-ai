/**
 * Groq Provider Driver
 * Uses Groq's OpenAI-compatible chat completions API as the fallback
 * provider for AI-powered task/timetable generation.
 */

const https = require('https');

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_HOST = 'api.groq.com';

function callGroq(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    if (!apiKey) return reject(new Error('Groq API key not configured'));

    const body = JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: 'You are a planning assistant. Always respond with valid JSON only, no markdown fences, no explanation.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4
    });

    const options = {
      hostname: GROQ_HOST,
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 20000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Groq API error ${res.statusCode}: ${data.slice(0, 300)}`));
        }
        try {
          const json = JSON.parse(data);
          const text = json.choices?.[0]?.message?.content;
          if (!text) return reject(new Error('Groq returned no content'));
          resolve(text);
        } catch (err) {
          reject(new Error(`Groq response parse error: ${err.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Groq request timed out')));
    req.write(body);
    req.end();
  });
}

module.exports = { callGroq, name: 'groq' };