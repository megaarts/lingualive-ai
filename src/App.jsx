import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, Volume2, VolumeX, Globe, Award, MessageSquare, 
  Sparkles, RefreshCw, Square, CheckCircle2, AlertCircle, 
  Settings, Send, Languages, BookOpen, Compass, Clock, ArrowRight, Trash2, History
} from 'lucide-react';

// --- CONFIGURAÇÕES E CONSTANTES ---
const LANGUAGES = [
  { id: 'english', name: 'Inglês', native: 'English', flag: '🇺🇸', code: 'en-US' },
  { id: 'spanish', name: 'Espanhol', native: 'Español', flag: '🇪🇸', code: 'es-ES' },
  { id: 'italian', name: 'Italiano', native: 'Italiano', flag: '🇮🇹', code: 'it-IT' },
  { id: 'german', name: 'Alemão', native: 'Deutsch', flag: '🇩🇪', code: 'de-DE' }
];

const LEVELS = [
  { id: 'beginner', label: 'Iniciante (A1-A2)', desc: 'Frases simples, vocabulário básico e fala mais pausada.', rate: 0.9 },
  { id: 'intermediate', label: 'Intermediário (B1-B2)', desc: 'Conversação fluida, tempos verbais variados e expressões comuns.', rate: 1.0 },
  { id: 'advanced', label: 'Avançado (C1-C2)', desc: 'Nuances idiomáticas, debates complexos e naturalidade nativa.', rate: 1.08 }
];

const CONTEXTS = [
  { id: 'daily', label: 'Dia a dia', icon: '☕', prompt: 'Conversa casual sobre rotina, hobbies, clima e novidades.' },
  { id: 'travel', label: 'Viagem e Turismo', icon: '✈️', prompt: 'Aeroporto, hotel, pedir direções, pontos turísticos e imprevistos.' },
  { id: 'restaurant', label: 'Restaurante e Café', icon: '🍝', prompt: 'Fazer reservas, pedir pratos, tirar dúvidas sobre o menu e pedir a conta.' },
  { id: 'work', label: 'Trabalho e Negócios', icon: '💼', prompt: 'Entrevista de emprego, reuniões, apresentações e networking profissional.' }
];

const PAUSE_OPTIONS = [
  { value: 1500, label: '1.5s (Rápido)' },
  { value: 3000, label: '3.0s (Normal)' },
  { value: 4500, label: '4.5s (Pensando)' },
  { value: 6000, label: '6.0s (Calmo)' }
];

const STORAGE_KEY_MESSAGES = 'lingualive_saved_messages_v1';
const STORAGE_KEY_PREFS = 'lingualive_saved_prefs_v1';

export default function App() {
  // Carrega preferências salvas permanentemente
  const loadSavedPrefs = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PREFS);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  };

  const savedPrefs = loadSavedPrefs();

  // Estados de Configuração
  const [selectedLang, setSelectedLang] = useState(
    LANGUAGES.find(l => l.id === savedPrefs?.langId) || LANGUAGES[0]
  );
  const [selectedLevel, setSelectedLevel] = useState(
    LEVELS.find(l => l.id === savedPrefs?.levelId) || LEVELS[1]
  );
  const [selectedContext, setSelectedContext] = useState(
    CONTEXTS.find(c => c.id === savedPrefs?.contextId) || CONTEXTS[0]
  );
  const [pauseToleranceMs, setPauseToleranceMs] = useState(savedPrefs?.pauseMs || 3000);

  // Estados da Sessão Ao Vivo
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isWaitingPause, setIsWaitingPause] = useState(false);
  const [userVolume, setUserVolume] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);

  // Estados de Transcrição e Histórico Permanente (salvo no navegador)
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MESSAGES);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [liveUserText, setLiveUserText] = useState('');
  const [textInput, setTextInput] = useState('');

  // Refs para controle de Áudio, Reconhecimento de Voz, Acúmulo de Fala e Histórico API
  const recognitionRef = useRef(null);
  const conversationHistoryRef = useRef([]);
  const isConnectedRef = useRef(false);
  const isMicMutedRef = useRef(false);
  const isSpeakerMutedRef = useRef(false);
  const aiSpeakingRef = useRef(false);
  const isThinkingRef = useRef(false);
  const pauseToleranceRef = useRef(pauseToleranceMs);

  const accumulatedTranscriptRef = useRef('');
  const currentInterimRef = useRef('');
  const silenceTimerRef = useRef(null);

  const audioCtxRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const animFrameRef = useRef(null);
  const chatEndRef = useRef(null);

  // Salva mensagens automaticamente no localStorage sempre que atualizadas
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
    } catch (e) {
      console.warn('Não foi possível salvar o histórico localmente:', e);
    }
  }, [messages]);

  // Salva preferências automaticamente
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY_PREFS,
        JSON.stringify({
          langId: selectedLang.id,
          levelId: selectedLevel.id,
          contextId: selectedContext.id,
          pauseMs: pauseToleranceMs
        })
      );
    } catch (e) {}
  }, [selectedLang, selectedLevel, selectedContext, pauseToleranceMs]);

  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    pauseToleranceRef.current = pauseToleranceMs;
  }, [pauseToleranceMs]);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
    if (isConnected) {
      if (isMicMuted) {
        clearSilenceTimer();
        stopRecognition();
        setUserVolume(0);
      } else if (!aiSpeakingRef.current && !isThinkingRef.current) {
        startRecognition();
      }
    }
  }, [isMicMuted, isConnected]);

  useEffect(() => {
    isSpeakerMutedRef.current = isSpeakerMuted;
    if (isSpeakerMuted) {
      stopSpeech();
    }
  }, [isSpeakerMuted]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveUserText, isThinking]);

  useEffect(() => {
    return () => {
      disconnectSession();
    };
  }, []);

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setIsWaitingPause(false);
  };

  const handleClearHistory = () => {
    if (window.confirm('Deseja apagar todo o histórico salvo de conversas, traduções e correções?')) {
      setMessages([]);
      conversationHistoryRef.current = [];
      localStorage.removeItem(STORAGE_KEY_MESSAGES);
    }
  };

  // --- CONTROLE DE SÍNTESE DE VOZ (TTS NATIVO) ---
  const stopSpeech = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    aiSpeakingRef.current = false;
    setAiSpeaking(false);
  };

  const speakResponse = (rawText) => {
    if (isSpeakerMutedRef.current || !('speechSynthesis' in window)) {
      if (isConnectedRef.current && !isMicMutedRef.current) {
        startRecognition();
      }
      return;
    }

    stopSpeech();
    stopRecognition();

    const cleanForSpeech = rawText
      .replace(/\[CORREÇÃO:\s*"?([^"->]+)"?\s*->\s*"?([^"|]+)"?\s*(?:\|\s*Explicação:\s*([^\]]+))?\]/gi, (_, wrong, right) => {
        return `. ${right}. `;
      })
      .replace(/\[TRADUÇÃO:\s*"?([^"->]+)"?\s*->\s*"?([^"|]+)"?\s*(?:\|\s*Uso:\s*([^\]]+))?\]/gi, (_, ptTerm, targetTerm) => {
        return `. ${targetTerm}. `;
      })
      .replace(/[*#_]/g, '')
      .trim();

    if (!cleanForSpeech) {
      if (isConnectedRef.current && !isMicMutedRef.current) {
        startRecognition();
      }
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanForSpeech);
    utterance.lang = selectedLang.code;
    utterance.rate = selectedLevel.rate;

    const voices = window.speechSynthesis.getVoices();
    const matchingVoices = voices.filter(v => v.lang.toLowerCase().startsWith(selectedLang.code.slice(0, 2).toLowerCase()));
    const preferredVoice = matchingVoices.find(v => v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Premium')) || matchingVoices[0];
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => {
      aiSpeakingRef.current = true;
      setAiSpeaking(true);
    };

    utterance.onend = () => {
      aiSpeakingRef.current = false;
      setAiSpeaking(false);
      if (isConnectedRef.current && !isMicMutedRef.current) {
        startRecognition();
      }
    };

    utterance.onerror = () => {
      aiSpeakingRef.current = false;
      setAiSpeaking(false);
      if (isConnectedRef.current && !isMicMutedRef.current) {
        startRecognition();
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  // --- ENVIO DA FALA ACUMULADA APÓS PAUSA OU CLIQUE MANUAL ---
  const flushAccumulatedSpeech = () => {
    clearSilenceTimer();
    const fullText = `${accumulatedTranscriptRef.current} ${currentInterimRef.current}`.trim();
    accumulatedTranscriptRef.current = '';
    currentInterimRef.current = '';
    setLiveUserText('');

    if (fullText && isConnectedRef.current && !isThinkingRef.current) {
      processUserTurn(fullText);
    }
  };

  const resetSilenceTimer = () => {
    clearSilenceTimer();
    const hasContent = (accumulatedTranscriptRef.current + currentInterimRef.current).trim().length > 0;
    if (!hasContent) return;

    setIsWaitingPause(true);
    silenceTimerRef.current = setTimeout(() => {
      flushAccumulatedSpeech();
    }, pauseToleranceRef.current);
  };

  // --- CONTROLE DE RECONHECIMENTO DE VOZ (STT CONTÍNUO COM TOLERÂNCIA A PAUSAS) ---
  const stopRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch (e) {}
    }
  };

const startRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    stopRecognition();

    try {
      const recognition = new SpeechRecognition();
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      recognition.lang = selectedLang.code;
      recognition.continuous = !isMobile;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        let finalChunk = '';
        let interim = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcriptChunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalChunk += ` ${transcriptChunk}`;
          } else {
            interim += transcriptChunk;
          }
        }

        if (finalChunk.trim()) {
          accumulatedTranscriptRef.current = `${accumulatedTranscriptRef.current} ${finalChunk}`.trim();
        }
        currentInterimRef.current = interim;

        const combined = `${accumulatedTranscriptRef.current} ${interim}`.trim();
        setLiveUserText(combined);

        if (combined) {
          resetSilenceTimer();
        }
      };

      recognition.onend = () => {
        // Se no celular sobrou texto parcial quando o reconhecimento fechou, consolida
        if (currentInterimRef.current.trim()) {
          accumulatedTranscriptRef.current = `${accumulatedTranscriptRef.current} ${currentInterimRef.current}`.trim();
          currentInterimRef.current = '';
          setLiveUserText(accumulatedTranscriptRef.current);
        }

        const hasPendingText = accumulatedTranscriptRef.current.trim().length > 0;

        if (isConnectedRef.current && !isMicMutedRef.current && !aiSpeakingRef.current && !isThinkingRef.current) {
          if (hasPendingText && !silenceTimerRef.current) {
            resetSilenceTimer();
          }
          setTimeout(() => {
            if (isConnectedRef.current && !isMicMutedRef.current && !aiSpeakingRef.current && !isThinkingRef.current) {
              startRecognition();
            }
          }, 200);
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
          setErrorMsg('Permissão de microfone negada. Habilite o microfone nas configurações do navegador.');
          disconnectSession();
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.warn('Erro ao iniciar o reconhecimento:', e);
    }
  };

  // --- VISUALIZADOR DE VOLUME DO MICROFONE ---
  const startVolumeMeter = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        if (!isConnectedRef.current) return;
        if (isMicMutedRef.current || aiSpeakingRef.current) {
          setUserVolume(0);
        } else {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setUserVolume(Math.min(100, Math.round(avg * 2.2)));
        }
        animFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();
    } catch (err) {
      console.warn('Medidor de volume indisponível:', err);
    }
  };

  // --- DETECÇÃO DE PALAVRAS-CHAVE (EX: "TRADUÇÃO ...") ---
  const detectKeywordCommand = (text) => {
    const translationRegex = /^(?:por favor\s+)?(?:tradu[çc][ãa]o|traduzir|traducao|traducci[óo]n|traduzione|translation|übersetzung)\s*[:,-]?\s*(.+)$/i;
    const match = text.trim().match(translationRegex);
    if (match && match[1]) {
      return {
        type: 'TRANSLATION',
        query: match[1].trim()
      };
    }
    return null;
  };

  // --- COMUNICAÇÃO SEGURA COM O BACKEND (/api/chat) COM FALLBACK LOCAL ---
  const callGeminiAPI = async (userMessage, isInitial = false, keywordCommand = null) => {
    const systemInstruction = `
Você é um professor de idiomas nativo, paciente, encorajador e altamente eficaz, ensinando ${selectedLang.name} (${selectedLang.native}) para um aluno brasileiro (falante de português).

CONFIGURAÇÕES DA SESSÃO:
- Idioma alvo: ${selectedLang.name} (${selectedLang.native})
- Nível do aluno: ${selectedLevel.label} (${selectedLevel.desc})
- Contexto da conversa: ${selectedContext.label} (${selectedContext.prompt})

REGRAS DE INTERAÇÃO, CORREÇÃO E PALAVRAS-CHAVE:
1. Converse naturalmente em ${selectedLang.name}, adequando a complexidade do seu vocabulário ao nível ${selectedLevel.label}. Mantenha suas respostas concisas (2 a 4 frases) para que a conversa por voz seja dinâmica.
2. COMANDO DE PALAVRA-CHAVE "TRADUÇÃO":
   - Se o aluno usar a palavra-chave TRADUÇÃO pedindo como se diz algo em português no idioma ${selectedLang.name}:
   - Inclua OBRIGATORIAMENTE no início da resposta o marcador visual exato:
     [TRADUÇÃO: "termo em português" -> "tradução em ${selectedLang.name}" | Uso: exemplo curto ou dica rápida em português]
   - Em seguida, pronuncie a palavra/expressão em ${selectedLang.name} e incentive o aluno a retomar a frase ou responder à pergunta anterior da conversa.
3. CORREÇÃO GRAMATICAL E NATURALIDADE:
   - Analise atentamente a frase do aluno (quando não for um pedido de tradução). Se o aluno cometer algum erro gramatical, de escolha de vocabulário, conjugação ou soar pouco natural em ${selectedLang.name}:
   - Inclua na sua resposta um marcador visual exato neste formato para que a interface destaque:
     [CORREÇÃO: "o que o aluno disse errado" -> "forma correta e natural" | Explicação: motivo breve em português]
   - Logo após o marcador de correção, responda ao conteúdo do que o aluno disse em ${selectedLang.name} e faça uma pergunta aberta para manter a conversa fluindo no contexto "${selectedContext.label}".
4. Se o aluno falar corretamente e de forma natural, NÃO invente erros: continue o diálogo naturalmente em ${selectedLang.name}.
5. Não use emojis na sua resposta para que a leitura por voz funcione perfeitamente.
`;

    if (isInitial) {
      conversationHistoryRef.current = [
        {
          role: 'user',
          parts: [{ text: `Olá! Estou pronto para praticar ${selectedLang.name} no nível ${selectedLevel.label}, no contexto: ${selectedContext.label}. Cumprimente-me em ${selectedLang.name} e faça a primeira pergunta do cenário.` }]
        }
      ];
    } else if (keywordCommand?.type === 'TRANSLATION') {
      conversationHistoryRef.current.push({
        role: 'user',
        parts: [{ text: `[COMANDO PALAVRA-CHAVE TRADUÇÃO] O aluno pausou a fala e pediu a tradução do termo/frase em português: "${keywordCommand.query}" para ${selectedLang.name}. Forneça o bloco [TRADUÇÃO: ...] e convide-o a continuar a conversa anterior.` }]
      });
    } else {
      conversationHistoryRef.current.push({
        role: 'user',
        parts: [{ text: userMessage }]
      });
    }

    const payload = {
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: conversationHistoryRef.current
    };

    // 1. Tenta chamar a rota segura da Vercel (/api/chat) onde a chave fica oculta
   

    const serverRes = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
  });

  const serverData = await serverRes.json().catch(() => ({}));

  if (!serverRes.ok) {
    throw new Error(serverData.error || `Erro no servidor (${serverRes.status})`);
  }

  const aiReply = serverData.reply || '';



    if (aiReply) {
      conversationHistoryRef.current.push({
        role: 'model',
        parts: [{ text: aiReply }]
      });
    }

    return aiReply;
  };

  const processUserTurn = async (text) => {
    clearSilenceTimer();
    stopRecognition();
    isThinkingRef.current = true;
    setIsThinking(true);

    const keywordCommand = detectKeywordCommand(text);

    setMessages(prev => [
      ...prev,
      {
        id: Date.now() + '-user',
        role: 'user',
        text,
        langFlag: selectedLang.flag,
        isKeyword: Boolean(keywordCommand),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);

    try {
      const aiReply = await callGeminiAPI(text, false, keywordCommand);
      isThinkingRef.current = false;
      setIsThinking(false);

      if (aiReply && isConnectedRef.current) {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + '-ai',
            role: 'ai',
            text: aiReply,
            langName: selectedLang.name,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        speakResponse(aiReply);
      }
    } catch (err) {
      console.error('Erro ao obter resposta do tutor:', err);
      isThinkingRef.current = false;
      setIsThinking(false);
      setErrorMsg(err.message || 'Não foi possível obter resposta do tutor.');
      if (isConnectedRef.current && !isMicMutedRef.current) {
        startRecognition();
      }
    }
  };

  // --- INICIAR E ENCERRAR SESSÃO ---
  const connectSession = async () => {
    if ('speechSynthesis' in window) {
  window.speechSynthesis.cancel();
  const unlockUtterance = new SpeechSynthesisUtterance('');
  unlockUtterance.volume = 0;
  window.speechSynthesis.speak(unlockUtterance);
}
    
    setErrorMsg(null);
    setIsConnecting(true);
    setLiveUserText('');
    accumulatedTranscriptRef.current = '';
    currentInterimRef.current = '';
    conversationHistoryRef.current = [];

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMsg('Seu navegador não suporta reconhecimento de voz nativo. Recomendamos usar Google Chrome ou Microsoft Edge, ou utilizar o campo de texto abaixo.');
    }

    try {
      isConnectedRef.current = true;
      setIsConnected(true);
      await startVolumeMeter();

      isThinkingRef.current = true;
      setIsThinking(true);
      const greeting = await callGeminiAPI('', true);
      isThinkingRef.current = false;
      setIsThinking(false);
      setIsConnecting(false);

      if (greeting && isConnectedRef.current) {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + '-ai-init',
            role: 'ai',
            text: greeting,
            langName: selectedLang.name,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        speakResponse(greeting);
      } else if (isConnectedRef.current && !isMicMutedRef.current) {
        startRecognition();
      }
    } catch (err) {
      console.error('Falha ao iniciar sessão:', err);
      setErrorMsg(err.message || 'Falha ao conectar com o tutor de idiomas.');
      disconnectSession();
    }
  };

  const disconnectSession = () => {
    isConnectedRef.current = false;
    isThinkingRef.current = false;
    clearSilenceTimer();
    stopSpeech();
    stopRecognition();

    accumulatedTranscriptRef.current = '';
    currentInterimRef.current = '';

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch (e) {}
      audioCtxRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    setIsThinking(false);
    setUserVolume(0);
    setLiveUserText('');
  };

  const handleSendText = (e) => {
    e.preventDefault();
    if (!textInput.trim() || !isConnected || isThinking) return;

    const msg = textInput.trim();
    setTextInput('');
    clearSilenceTimer();
    accumulatedTranscriptRef.current = '';
    currentInterimRef.current = '';
    setLiveUserText('');
    stopSpeech();
    processUserTurn(msg);
  };

  // --- PARSER DE CORREÇÕES E TRADUÇÕES NA MENSAGEM DA IA ---
  const renderFormattedMessage = (text, msgLangName) => {
    const combinedRegex = /\[(CORREÇÃO|TRADUÇÃO):\s*"?([^"->]+)"?\s*->\s*"?([^"|]+)"?\s*(?:\|\s*(?:Explicação|Uso):\s*([^\]]+))?\]/gi;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = combinedRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      parts.push({
        type: match[1].toUpperCase() === 'TRADUÇÃO' ? 'translation' : 'correction',
        source: match[2].trim(),
        target: match[3].trim(),
        note: match[4] ? match[4].trim() : null
      });
      lastIndex = combinedRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.slice(lastIndex) });
    }

    if (parts.length === 0) {
      return <p className="whitespace-pre-wrap leading-relaxed">{text}</p>;
    }

    return (
      <div className="space-y-2.5">
        {parts.map((part, idx) => {
          if (part.type === 'text') {
            const cleanText = part.content.trim();
            if (!cleanText) return null;
            return <p key={idx} className="whitespace-pre-wrap leading-relaxed">{cleanText}</p>;
          }

          if (part.type === 'translation') {
            return (
              <div 
                key={idx} 
                className="my-2 p-3.5 rounded-xl bg-sky-50/95 border border-sky-200 text-slate-800 shadow-sm"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-700 mb-2">
                  <Languages className="w-3.5 h-3.5 text-sky-600" />
                  <span>Vocabulário • Tradução Instantânea</span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm mb-2">
                  <div className="flex-1 p-2 rounded-lg bg-white border border-sky-100 text-slate-700">
                    <span className="block text-[10px] font-semibold uppercase text-slate-400 mb-0.5">Em Português:</span>
                    <span>{part.source}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-sky-500 hidden sm:block shrink-0" />
                  <div className="flex-1 p-2 rounded-lg bg-sky-600 text-white font-semibold shadow-xs">
                    <span className="block text-[10px] font-semibold uppercase text-sky-200 mb-0.5">
                      Em {msgLangName || selectedLang.name}:
                    </span>
                    <span>{part.target}</span>
                  </div>
                </div>

                {part.note && (
                  <p className="text-xs text-slate-600 bg-white/80 p-2 rounded-lg border border-sky-100">
                    <strong className="text-sky-800">Dica de uso:</strong> {part.note}
                  </p>
                )}
              </div>
            );
          }

          return (
            <div 
              key={idx} 
              className="my-2 p-3.5 rounded-xl bg-amber-50/90 border border-amber-200/80 text-slate-800 shadow-sm"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-700 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Sugestão de Correção</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm mb-2">
                <div className="p-2 rounded-lg bg-rose-50 border border-rose-200/70 text-rose-900">
                  <span className="block text-[10px] font-semibold uppercase text-rose-500 mb-0.5">Você disse:</span>
                  <span className="line-through decoration-rose-400/80">{part.source}</span>
                </div>
                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200/70 text-emerald-950 font-medium">
                  <span className="block text-[10px] font-semibold uppercase text-emerald-600 mb-0.5">Forma natural:</span>
                  <span>{part.target}</span>
                </div>
              </div>

              {part.note && (
                <p className="text-xs text-slate-600 bg-white/70 p-2 rounded-lg border border-amber-100">
                  <strong className="text-slate-700">Por quê?</strong> {part.note}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const correctionsCount = messages.filter(m => m.role === 'ai' && m.text.includes('[CORREÇÃO:')).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 px-4 sm:px-6 py-3.5 shadow-sm">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <Languages className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                LinguaLive AI
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                  Voz Inteligente
                </span>
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                Pratique conversação com tolerância a pausas, tradução por voz e histórico salvo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {isConnected && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Conectado • {selectedLang.flag} {selectedLang.name}</span>
              </div>
            )}

            {!isConnected ? (
              <button
                onClick={connectSession}
                disabled={isConnecting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-semibold text-sm shadow-md shadow-indigo-200 transition-all disabled:opacity-60 cursor-pointer"
              >
                {isConnecting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Conectando...</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>Iniciar Conversa por Voz</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={disconnectSession}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white font-semibold text-sm shadow-md shadow-rose-200 transition-all cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Encerrar Sessão</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ALERTA DE ERRO */}
      {errorMsg && (
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 pt-4">
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button 
              onClick={() => setErrorMsg(null)} 
              className="text-xs font-semibold underline hover:text-rose-950"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* COLUNA ESQUERDA: CONFIGURAÇÕES E CONTROLES DE ÁUDIO */}
        <aside className="lg:col-span-4 space-y-5">
          
          {/* Painel de Estúdio de Voz */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Estúdio de Áudio
              </span>
              {correctionsCount > 0 && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  {correctionsCount} {correctionsCount === 1 ? 'correção' : 'correções'}
                </span>
              )}
            </div>

            <div className="flex flex-col items-center justify-center py-6 px-4 rounded-2xl bg-gradient-to-b from-slate-50 to-indigo-50/40 border border-slate-100 relative overflow-hidden">
              <div className="relative flex items-center justify-center">
                {aiSpeaking && (
                  <>
                    <span className="absolute w-24 h-24 rounded-full bg-indigo-400/20 animate-ping" />
                    <span className="absolute w-20 h-20 rounded-full bg-indigo-500/20 animate-pulse" />
                  </>
                )}
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-md transition-transform duration-300 z-10 ${
                  aiSpeaking 
                    ? 'bg-indigo-600 text-white scale-110 ring-4 ring-indigo-200' 
                    : isConnected 
                      ? 'bg-white text-slate-800 border-2 border-indigo-200' 
                      : 'bg-slate-200 text-slate-500'
                }`}>
                  {selectedLang.flag}
                </div>
              </div>

              <div className="mt-4 text-center">
                <p className="font-bold text-slate-800 text-sm">
                  Tutor de {selectedLang.name}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {!isConnected 
                    ? 'Aguardando início da sessão' 
                    : aiSpeaking 
                      ? 'Falando...' 
                      : isMicMuted 
                        ? 'Seu microfone está mudo' 
                        : isWaitingPause
                          ? `Aguardando você terminar (${(pauseToleranceMs / 1000).toFixed(1)}s)...`
                          : 'Ouvindo você falar...'}
                </p>
              </div>

              {isConnected && (
                <div className="w-full max-w-[190px] mt-4">
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                    <span>Seu Microfone</span>
                    <span>{isMicMuted ? 'Mudo' : 'Ativo'}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-75 rounded-full"
                      style={{ width: `${userVolume}%` }}
                    />
                  </div>
                </div>
              )}

              {isConnected && liveUserText && !isThinking && (
                <button
                  onClick={flushAccumulatedSpeech}
                  className="mt-4 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
                >
                  <Send className="w-3 h-3" />
                  <span>Enviar Fala Agora</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <button
                onClick={() => setIsMicMuted(!isMicMuted)}
                disabled={!isConnected}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-medium text-sm border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isMicMuted 
                    ? 'bg-rose-50 border-rose-200 text-rose-700' 
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-emerald-600" />}
                <span>{isMicMuted ? 'Ativar Mic' : 'Mutar Mic'}</span>
              </button>

              <button
                onClick={() => setIsSpeakerMuted(!isSpeakerMuted)}
                disabled={!isConnected}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-medium text-sm border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isSpeakerMuted 
                    ? 'bg-amber-50 border-amber-200 text-amber-700' 
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                {isSpeakerMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-indigo-600" />}
                <span>{isSpeakerMuted ? 'Som Mudo' : 'Áudio IA'}</span>
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  Tempo de Pausa para Pensar
                </span>
                <span className="text-[11px] font-bold text-indigo-600">
                  {(pauseToleranceMs / 1000).toFixed(1)}s
                </span>
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {PAUSE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setPauseToleranceMs(opt.value)}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                      pauseToleranceMs === opt.value
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-800 font-semibold'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">
                A IA espera esse tempo em silêncio antes de responder, permitindo que você pense na frase.
              </p>
            </div>
          </div>

          {/* Configurações da Prática */}
          <div className={`bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-5 transition-opacity ${isConnected ? 'opacity-70' : ''}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Settings className="w-4 h-4 text-indigo-600" />
                Configurar Prática
              </h2>
              {isConnected && (
                <span className="text-[11px] text-slate-400">Encerre para alterar</span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-slate-400" />
                Idioma de Prática
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.id}
                    disabled={isConnected || isConnecting}
                    onClick={() => setSelectedLang(lang)}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer disabled:cursor-not-allowed ${
                      selectedLang.id === lang.id
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-sm ring-1 ring-indigo-500'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <span className="text-xl block mb-1">{lang.flag}</span>
                    <span className="text-xs font-bold block">{lang.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-slate-400" />
                Nível de Proficiência
              </label>
              <div className="space-y-2">
                {LEVELS.map(level => (
                  <button
                    key={level.id}
                    disabled={isConnected || isConnecting}
                    onClick={() => setSelectedLevel(level)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer disabled:cursor-not-allowed ${
                      selectedLevel.id === level.id
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-950 ring-1 ring-indigo-500'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold">{level.label}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{level.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-slate-400" />
                Cenário da Conversa
              </label>
              <div className="grid grid-cols-2 gap-2">
                {CONTEXTS.map(ctx => (
                  <button
                    key={ctx.id}
                    disabled={isConnected || isConnecting}
                    onClick={() => setSelectedContext(ctx)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer disabled:cursor-not-allowed ${
                      selectedContext.id === ctx.id
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-950 ring-1 ring-indigo-500'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <span className="text-base mr-1.5">{ctx.icon}</span>
                    <span className="text-xs font-semibold">{ctx.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* COLUNA DIREITA: TRANSCRIÇÃO AO VIVO E HISTÓRICO SALVO */}
        <section className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[640px] lg:h-[calc(100vh-120px)] overflow-hidden">
          
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-800">
                Transcrição & Correções
              </h2>
              {messages.length > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <History className="w-2.5 h-2.5" />
                  Salvo no dispositivo
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                💡 Diga <strong>"Tradução [palavra]"</strong>
              </span>
              {messages.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  title="Limpar histórico salvo"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.length === 0 && !liveUserText && (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto px-4">
                <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
                  <BookOpen className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-800 mb-1.5">
                  Pronto para destravar seu {selectedLang.name}?
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed mb-5">
                  Clique em <strong>"Iniciar Conversa por Voz"</strong> para falar diretamente com o tutor. Suas correções e vocabulário ficam salvos automaticamente aqui para você revisar quando voltar.
                </p>
                <div className="w-full p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-left text-xs text-slate-600 space-y-2">
                  <p className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Recursos inteligentes ativados:
                  </p>
                  <p>• <strong>Pausas para pensar:</strong> Pode respirar no meio da frase! A IA espera {(pauseToleranceMs / 1000).toFixed(1)}s antes de responder.</p>
                  <p>• <strong>Palavra-chave "TRADUÇÃO":</strong> Esqueceu uma palavra? Diga <em>"Tradução guardar-chuva"</em> e o tutor traduz na hora.</p>
                  <p>• <strong>Memória Permanente:</strong> Todo o histórico de correções fica salvo no seu navegador.</p>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <span className="text-[11px] font-semibold text-slate-500">
                    {msg.role === 'user' ? `Você ${msg.langFlag || ''}` : `Tutor (${msg.langName || selectedLang.name})`}
                  </span>
                  <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
                </div>

                <div 
                  className={`max-w-[88%] sm:max-w-[82%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                    msg.role === 'user'
                      ? msg.isKeyword 
                        ? 'bg-sky-600 text-white rounded-tr-sm'
                        : 'bg-indigo-600 text-white rounded-tr-sm'
                      : 'bg-slate-100 text-slate-800 border border-slate-200/70 rounded-tl-sm'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  ) : (
                    renderFormattedMessage(msg.text, msg.langName)
                  )}
                </div>
              </div>
            ))}

            {liveUserText && (
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-[11px] font-semibold text-indigo-600 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                    {isWaitingPause ? 'Pausa detectada — pode continuar falando...' : 'Ouvindo você...'}
                  </span>
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm bg-indigo-500/90 text-white shadow-sm">
                  <p className="italic">{liveUserText}</p>
                  <div className="mt-2 pt-1.5 border-t border-indigo-400/40 flex items-center justify-between gap-3 text-[11px] text-indigo-100">
                    <span>Enviando automaticamente em {(pauseToleranceMs / 1000).toFixed(1)}s</span>
                    <button
                      onClick={flushAccumulatedSpeech}
                      className="font-bold underline hover:text-white cursor-pointer"
                    >
                      Enviar agora
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isThinking && (
              <div className="flex flex-col items-start">
                <span className="text-[11px] font-semibold text-indigo-600 mb-1 px-1">
                  Tutor ({selectedLang.name})
                </span>
                <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm bg-slate-100 text-slate-600 border border-slate-200/70 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  <span>Analisando sua fala e preparando resposta...</span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          <form 
            onSubmit={handleSendText}
            className="p-3.5 border-t border-slate-200 bg-slate-50 flex items-center gap-2"
          >
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              disabled={!isConnected}
              placeholder={
                isConnected 
                  ? `Fale, diga "Tradução [termo]" ou digite em ${selectedLang.name}...` 
                  : 'Inicie a conversa por voz acima para habilitar o chat'
              }
              className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
            />
            <button
              type="submit"
              disabled={!isConnected || !textInput.trim()}
              className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
              title="Enviar mensagem de texto"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
