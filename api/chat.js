export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'A variável de ambiente GEMINI_API_KEY não está configurada no servidor.'
    });
  }

  try {
    const { systemInstruction, contents } = req.body;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction,
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 450
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || 'Erro ao comunicar com a API do Gemini.'
      });
    }

    const aiReply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json({ reply: aiReply });
  } catch (error) {
    console.error('Erro interno no servidor:', error);
    return res.status(500).json({ error: 'Falha interna ao processar a solicitação.' });
  }
}
