const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { WebSocketServer } = require('ws');
require('dotenv').config();

const { GoogleGenAI, Type } = require("@google/genai");
const {
    createCopilotSystemInstruction,
    createPracticeSystemInstruction,
    createPracticeExampleAnswerSystemInstruction,
    createCompanyBriefingPrompt,
    createInterviewSummaryPrompt,
} = require('./prompts.js');

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    console.error("API_KEY environment variable is not set");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });
const app = express();
app.use(cors());
app.use(bodyParser.json());

const parseApiError = (error, lang = 'en') => {
    console.error("Gemini API Error:", error);
    const isIndonesian = lang === 'id';
    // Simplified error parsing for backend
    if (error.message) {
        if (error.message.includes('API key not valid')) {
            return isIndonesian ? "Kesalahan Konfigurasi Server: Kunci API tidak valid." : "Server Configuration Error: The API Key is not valid.";
        }
        if (error.message.includes('429')) {
            return isIndonesian ? "Batas permintaan tercapai. Silakan coba lagi nanti." : "Rate limit exceeded. Please try again later.";
        }
    }
    return isIndonesian ? "Terjadi kesalahan tak terduga di server." : "An unexpected error occurred on the server.";
};

// --- HTTP Streaming Endpoints ---

const handleStreamRequest = async (res, lang, createStream) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
        const responseStream = await createStream();
        for await (const chunk of responseStream) {
            if (chunk.text) {
                res.write(`data: ${JSON.stringify(chunk.text)}\n\n`);
            }
        }
    } catch (error) {
        const errorMessage = parseApiError(error, lang);
        res.write(`data: ${JSON.stringify(errorMessage)}\n\n`);
    } finally {
        res.end();
    }
};

app.post('/api/copilot-stream', async (req, res) => {
    const { jobTitle, companyName, cvContent, question, lang } = req.body;
    handleStreamRequest(res, lang, async () => {
        const systemInstruction = createCopilotSystemInstruction(jobTitle, companyName, cvContent, lang);
        const chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: { systemInstruction, thinkingConfig: { thinkingBudget: 0 } },
        });
        const message = lang === 'id'
            ? `Pewawancara bertanya: "${question}". Tolong hasilkan poin-poin pembicaraan DAN contoh jawaban lengkap berdasarkan CV saya.`
            : `The interviewer asked: "${question}". Please generate talking points AND a complete example answer based on my CV.`;
        return chat.sendMessageStream({ message });
    });
});

app.post('/api/practice-stream', async (req, res) => {
    const { jobTitle, companyName, cvContent, history, latestAnswer, lang } = req.body;
    handleStreamRequest(res, lang, async () => {
        const systemInstruction = createPracticeSystemInstruction(jobTitle, companyName, cvContent, lang);
        const chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            history,
            config: { systemInstruction, thinkingConfig: { thinkingBudget: 0 } },
        });
        const message = latestAnswer
            ? (lang === 'id'
                ? `Ini jawaban saya: "${latestAnswer}". Mohon berikan umpan balik, peringkat, dan pertanyaan berikutnya dalam format yang ditentukan.`
                : `Here is my answer: "${latestAnswer}". Please provide feedback, a rating, and the next question in the specified format.`)
            : (lang === 'id' ? "Tolong ajukan pertanyaan pertama." : "Please ask me the first question.");
        return chat.sendMessageStream({ message });
    });
});

app.post('/api/practice-example-stream', (req, res) => {
    const { jobTitle, companyName, cvContent, question, lang } = req.body;
    handleStreamRequest(res, lang, async () => {
        const systemInstruction = createPracticeExampleAnswerSystemInstruction(jobTitle, companyName, cvContent, lang);
        const userMessage = lang === 'id'
            ? `Tolong berikan contoh jawaban yang sangat baik untuk pertanyaan wawancara berikut: "${question}"`
            : `Please provide an excellent example answer for the following interview question: "${question}"`;
        
        return ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: userMessage }] }],
            config: { systemInstruction, thinkingConfig: { thinkingBudget: 0 } }
        });
    });
});


// --- Standard JSON Endpoints ---

app.post('/api/briefing', async (req, res) => {
    const { companyName, lang } = req.body;
    try {
        const prompt = createCompanyBriefingPrompt(companyName, lang);
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: { tools: [{googleSearch: {}}] },
        });

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        let sources = [];
        if (groundingChunks) {
            const mappedSources = groundingChunks
                .map(chunk => ({ uri: chunk.web?.uri, title: chunk.web?.title }))
                .filter(source => source.uri && source.title);
            sources = Array.from(new Map(mappedSources.map(item => [item.uri, item])).values());
        }
        res.json({ briefing: response.text, sources: sources });
    } catch(error) {
        const errorMessage = parseApiError(error, lang);
        res.status(500).json({ briefing: errorMessage, sources: [] });
    }
});

app.post('/api/summary', async (req, res) => {
    const { conversation, jobTitle, companyName, mode, lang } = req.body;
    try {
        const prompt = createInterviewSummaryPrompt(conversation, jobTitle, companyName, mode, lang);
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: { summary: { type: Type.STRING } }
                }
            }
        });
        const jsonText = response.text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
        const parsedResponse = JSON.parse(jsonText);
        res.json(parsedResponse);
    } catch (error) {
        const errorMessage = parseApiError(error, lang);
        res.status(500).json({ summary: errorMessage });
    }
});


// --- Server and WebSocket Setup ---
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const liveSessions = new Map(); // Store Gemini session per WebSocket client

wss.on('connection', (ws) => {
    console.log('Client connected via WebSocket');

    const geminiSessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
            onopen: () => {
                ws.send(JSON.stringify({ type: 'live_open' }));
            },
            onmessage: (message) => {
                ws.send(JSON.stringify({ type: 'live_message', payload: message }));
            },
            onerror: (e) => {
                console.error('Gemini Live Error:', e);
                ws.send(JSON.stringify({ type: 'live_error', payload: e.message }));
            },
            onclose: () => {
                ws.send(JSON.stringify({ type: 'live_close' }));
            },
        },
        config: {
            inputAudioTranscription: {},
        },
    });

    liveSessions.set(ws, geminiSessionPromise);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'audio_input' && data.payload) {
                const session = await liveSessions.get(ws);
                if (session) {
                    session.sendRealtimeInput({ media: data.payload });
                }
            }
        } catch (e) {
            console.error('Failed to process WebSocket message:', e);
        }
    });

    ws.on('close', async () => {
        console.log('Client disconnected');
        const sessionPromise = liveSessions.get(ws);
        if (sessionPromise) {
            try {
                const session = await sessionPromise;
                session.close();
            } catch (e) {
                 console.error('Error closing Gemini session on disconnect:', e);
            }
            liveSessions.delete(ws);
        }
    });
});


server.on('upgrade', (request, socket, head) => {
    const pathname = request.url;
    if (pathname === '/api/live') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});