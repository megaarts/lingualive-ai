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

  try {
    const { systemInstruction, contents } = req.body;

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
          temperature: 0.7,
          thinkingConfig: {
            thinkingBudget: 0
          }
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || 'Erro na resposta da API do Gemini.'
      });
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const reply = parts.map(p => p.text || '').join('').trim();

    if (!reply) {
      return res.status(500).json({
        error: 'A API retornou uma resposta vazia: ' + JSON.stringify(data)
      });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
