/**
 * Gemini Provider Driver
 * Uses Google's Generative Language API (Gemini) to convert natural language
 * goals into structured StudyFlow AI tasks / schedules. Also supports
 * multimodal input (an image or PDF attachment alongside text) for reading
 * a photographed/screenshotted timetable during onboarding.
 */

const https = require('https');

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_HOST = 'generativelanguage.googleapis.com';

/**
 * @param {string} apiKey
 * @param {string} prompt
 * @param {{ mimeType: string, base64Data: string } | null} [attachment]
 *   An image (image/png, image/jpeg, ...) or PDF (application/pdf) to
 *   include alongside the text prompt. Gemini reads it natively — no
 *   separate OCR step needed.
 * @param {boolean} [expectJSON] whether to force JSON output (default true,
 *   matches every existing caller; onboarding conversation replies pass
 *   false since they want natural free-text back)
 */
function callGemini(apiKey, prompt, attachment = null, expectJSON = true) {
  return new Promise((resolve, reject) => {
    if (!apiKey) return reject(new Error('Gemini API key not configured'));

    const parts = [{ text: prompt }];
    if (attachment && attachment.base64Data) {
      parts.push({
        inline_data: {
          mime_type: attachment.mimeType || 'image/png',
          data: attachment.base64Data
        }
      });
    }

    const generationConfig = { temperature: 0.4 };
    if (expectJSON) generationConfig.responseMimeType = 'application/json';

    const body = JSON.stringify({
      contents: [{ parts }],
      generationConfig
    });

    const options = {
      hostname: GEMINI_HOST,
      path: `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 40000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Gemini API error ${res.statusCode}: ${data.slice(0, 300)}`));
        }
        try {
          const json = JSON.parse(data);
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) return reject(new Error('Gemini returned no content'));
          resolve(text);
        } catch (err) {
          reject(new Error(`Gemini response parse error: ${err.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Gemini request timed out')));
    req.write(body);
    req.end();
  });
}

module.exports = { callGemini, name: 'gemini' };