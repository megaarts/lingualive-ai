export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'A variável de ambiente GEMINI_API_KEY não está configurada na Vercel.'
    });
  }

  const { systemInstruction, contents } = req.body;
  const models = [
    'gemini-flash-latest',
    'gemini-2.5-flash-lite',
    'gemini-3.8-flash'
  ];

  let lastError = 'Os servidores do Gemini estão temporariamente congestionados. Tente novamente em instantes.';

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': apiKey.trim()
        },
        body: JSON.stringify({
          systemInstruction,
          contents,
          generationConfig: {
            temperature: 0.7
          }
        }),
        signal: AbortSignal.timeout(8000)
      });

      const data = await response.json();

      if (response.ok) {
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const reply = parts.map(p => p.text || '').join('').trim();
        if (reply) {
          return res.status(200).json({ reply, modelUsed: model });
        }
      }

      lastError = data.error?.message || `Erro ${response.status} no modelo ${model}`;

      if ([400, 401, 403].includes(response.status)) {
        return res.status(response.status).json({ error: lastError });
      }
    } catch (err) {
      lastError = err.name === 'TimeoutError'
        ? `Tempo esgotado no modelo ${model}`
        : err.message;
    }
  }

  return res.status(503).json({ error: lastError });
}
