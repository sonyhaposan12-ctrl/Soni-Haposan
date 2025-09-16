import { GoogleGenAI, Chat, GenerateContentResponse, Type, Content } from "@google/genai";
import { ConversationItem, Role, AppMode, CompanyBriefing, GroundingSource } from "../types";

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const parseApiError = (error: any, lang: 'en' | 'id' = 'en'): string => {
    console.error("Gemini API Error:", error);
    const isIndonesian = lang === 'id';

    if (error.message) {
        if (error.message.includes('API key not valid')) {
            return isIndonesian
                ? "Kesalahan: Layanan AI tidak terkonfigurasi dengan benar (Kunci API Tidak Valid). Silakan hubungi dukungan."
                : "Error: The AI service is not configured correctly (Invalid API Key). Please contact support.";
        }
        if (error.message.includes('429')) { // Quota exceeded
            return isIndonesian
                ? "Kesalahan: Terlalu banyak permintaan. Mohon tunggu beberapa detik sebelum mencoba lagi. Ini membantu kami menjaga stabilitas layanan untuk semua orang."
                : "Error: Too many requests. Please wait a few seconds before trying again. This helps us keep the service stable for everyone.";
        }
    }
    // Check for network error
    if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
         return isIndonesian
            ? "Kesalahan: Masalah koneksi jaringan. Silakan periksa koneksi internet Anda dan coba lagi."
            : "Error: Network connection issue. Please check your internet connection and try again.";
    }
    return isIndonesian
        ? "Kesalahan: Terjadi masalah tak terduga dengan layanan AI. Silakan coba lagi."
        : "Error: An unexpected issue occurred with the AI service. Please try again.";
};


// --- Copilot Mode ---

const createCopilotSystemInstruction = (jobTitle: string, companyName: string, cvContent: string, lang: 'en' | 'id'): string => {
    const isIndonesian = lang === 'id';
    
    let instruction = `You are an expert career coach and AI assistant. The user is currently in a live job interview for the "${jobTitle}" position${companyName ? ` at "${companyName}"` : ''}. Your role is to provide real-time, high-quality assistance to help them answer the interviewer's questions effectively. You will provide both concise talking points and a complete example answer.`;

    if (isIndonesian) {
        instruction = `Anda adalah seorang career coach dan asisten AI yang ahli. Pengguna saat ini sedang dalam wawancara kerja langsung untuk posisi "${jobTitle}"${companyName ? ` di "${companyName}"` : ''}. Peran Anda adalah memberikan bantuan real-time berkualitas tinggi untuk membantu mereka menjawab pertanyaan pewawancara secara efektif. Anda akan memberikan poin-poin pembicaraan yang ringkas dan contoh jawaban yang lengkap. Seluruh respons Anda HARUS dalam Bahasa Indonesia.`;
    }

    if (companyName) {
        instruction += isIndonesian
            ? `\n\n**Konteks Perusahaan:** Perusahaan target adalah "${companyName}". Gunakan pengetahuan Anda tentang perusahaan ini (produk, budaya, nilai, berita terbaru) untuk membuat saran Anda sangat relevan. Misalnya, selaraskan jawaban dengan nilai atau misi yang dinyatakan perusahaan.`
            : `\n\n**Company Context:** The target company is "${companyName}". Use your knowledge about this company (its products, culture, values, recent news) to make your suggestions highly relevant. For example, align answers with the company's stated values or mission.`;
    }

    if (cvContent) {
        instruction += isIndonesian
            ? `\n\nAnda memiliki CV pengguna sebagai konteks:\n--- CV MULAI ---\n${cvContent}\n--- CV SELESAI ---`
            : `\n\nYou have the user's CV for context:\n--- CV START ---\n${cvContent}\n--- CV END ---`;
    } else {
        instruction += isIndonesian
            ? `\n\nTidak ada CV yang diberikan. Dasarkan saran Anda pada praktik terbaik umum untuk peran "${jobTitle}".`
            : `\n\nNo CV was provided. Base your suggestions on general best practices for the "${jobTitle}" role.`;
    }

    instruction += isIndonesian
        ? `\n\nPengguna akan memberikan Anda transkrip pertanyaan dari pewawancara. Berdasarkan pertanyaan ini, Anda akan menghasilkan respons.

Ikuti aturan ini dengan ketat:
1.  **Format Respons Markdown:** Anda HARUS merespons dengan string berformat markdown.
2.  **Judul:** Respons HARUS berisi tepat dua judul: \`### Talking Points\` dan \`### Example Answer\`.
3.  **Konten:** Di bawah \`### Talking Points\`, berikan daftar berpoin. Di bawah \`### Example Answer\`, berikan respons paragraf lengkap.
4.  **Menyoroti dari CV:** Di "Talking Points" dan "Example Answer", Anda HARUS menggunakan markdown tebal (\`**teks**\`) untuk menyorot kata kunci, keterampilan, nama proyek, atau metrik spesifik yang diambil langsung dari CV pengguna yang sangat relevan dengan pertanyaan pewawancara. Ini adalah aturan terpenting.
5.  **Personalisasi (CV & Perusahaan):** Anda HARUS menyesuaikan semua respons dengan CV pengguna DAN perusahaan${companyName ? `, "${companyName}"` : ''}. Rujuk langsung ke keterampilan, pengalaman, dan proyek mereka dari CV. Hubungkan pengalaman ini dengan kebutuhan, produk, atau nilai perusahaan.
6.  **Pertanyaan HR & Struktur:** Tangani pertanyaan umum dari HR dan susun jawaban perilaku secara implisit mengikuti metode STAR (Situasi, Tugas, Aksi, Hasil).`
        : `\n\nThe user will provide you with a transcribed question from the interviewer. Based on this question, you will generate a response.

Follow these rules strictly:
1.  **Markdown Response Format:** You MUST respond with a markdown formatted string.
2.  **Headings:** The response MUST contain exactly two headings: \`### Talking Points\` and \`### Example Answer\`.
3.  **Content:** Under \`### Talking Points\`, provide a bulleted list. Under \`### Example Answer\`, provide the full paragraph response.
4.  **Highlighting from CV:** In both "Talking Points" and "Example Answer", you MUST use markdown bolding (\`**text**\`) to highlight specific keywords, skills, project names, or metrics taken directly from the user's CV that are highly relevant to the interviewer's question. This is the most important rule.
5.  **Personalization (CV & Company):** You MUST tailor all responses to the user's CV AND the company${companyName ? `, "${companyName}"` : ''}. Directly reference their skills, experiences, and projects from the CV. Connect these experiences to the company's needs, products, or values.
6.  **HR Questions & Structure:** Be prepared to handle common questions from HR and structure behavioral responses implicitly following the STAR method (Situation, Task, Action, Result).`;
    
    return instruction;
};


export const startCopilotSession = (jobTitle: string, companyName: string, cvContent: string, lang: 'en' | 'id'): Chat => {
    const systemInstruction = createCopilotSystemInstruction(jobTitle, companyName, cvContent, lang);
    return ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction,
            thinkingConfig: { thinkingBudget: 0 } // Optimize for low latency
        },
    });
};

export async function* getCopilotResponseStream(chat: Chat, question: string, lang: 'en' | 'id'): AsyncGenerator<string, void, unknown> {
    try {
        const message = lang === 'id'
            ? `Pewawancara bertanya: "${question}". Tolong hasilkan poin-poin pembicaraan DAN contoh jawaban lengkap berdasarkan CV saya.`
            : `The interviewer asked: "${question}". Please generate talking points AND a complete example answer based on my CV.`;
        
        const responseStream = await chat.sendMessageStream({ message });

        for await (const chunk of responseStream) {
            if (chunk.text) {
                yield chunk.text;
            }
        }
    } catch (error) {
        const errorMessage = parseApiError(error, lang);
        yield errorMessage;
    }
}


// --- Practice Mode ---

const createPracticeSystemInstruction = (jobTitle: string, companyName: string, cvContent: string, lang: 'en' | 'id'): string => {
    const isIndonesian = lang === 'id';
    
    let instruction = `You are an expert career coach and AI interviewer. Your role is to conduct a realistic and comprehensive practice interview for a candidate applying for the "${jobTitle}" position${companyName ? ` at "${companyName}"` : ''}.`;

    if (isIndonesian) {
        instruction = `Anda adalah seorang career coach dan pewawancara AI yang ahli. Peran Anda adalah melakukan wawancara latihan yang realistis dan komprehensif untuk seorang kandidat yang melamar posisi "${jobTitle}"${companyName ? ` di "${companyName}"` : ''}. Seluruh interaksi Anda (pertanyaan, umpan balik) HARUS dalam Bahasa Indonesia.`;
    }

    if (companyName) {
        instruction += isIndonesian
            ? `\n\n**Konteks Perusahaan:** Anda mewawancarai mereka untuk sebuah peran di "${companyName}". Gunakan pengetahuan Anda tentang perusahaan ini untuk mengajukan pertanyaan yang relevan dan spesifik perusahaan serta memberikan umpan balik yang selaras dengan budaya dan nilai-nilai mereka.`
            : `\n\n**Company Context:** You are interviewing them for a role at "${companyName}". Use your knowledge of this company to ask relevant, company-specific questions and provide feedback that aligns with their culture and values.`;
    }

    instruction += isIndonesian
        ? `\n\n**Persona Pewawancara:**
- Anda akan mengajukan satu pertanyaan pada satu waktu.
- Anda harus membuat alur wawancara yang beragam dan realistis dengan mengambil pertanyaan dari kategori berikut. Jangan mengajukan lebih dari dua pertanyaan dari kategori yang sama secara berurutan.
- Mulailah dengan pertanyaan pembuka klasik seperti "Ceritakan tentang diri Anda."

**Kategori Pertanyaan:**
1.  **Pertanyaan Perilaku:** Minta pengguna untuk berbagi pengalaman masa lalu. Mulailah dengan frasa seperti "Ceritakan tentang saat ketika...", "Gambarkan situasi di mana...", "Beri saya contoh...".
2.  **Pertanyaan Situasional:** Ajukan skenario hipotetis untuk menilai keterampilan pemecahan masalah. Mulailah dengan frasa seperti "Apa yang akan Anda lakukan jika...", "Bayangkan Anda berada dalam situasi di mana...".
3.  **Pertanyaan Teknis:** Ajukan pertanyaan yang relevan dengan keterampilan inti yang diperlukan untuk peran "${jobTitle}". Jika perannya non-teknis, Anda bisa bertanya tentang alat/perangkat lunak yang relevan.
4.  **Pertanyaan Berbasis CV:** Ajukan pertanyaan spesifik tentang proyek, peran, atau keterampilan yang disebutkan dalam CV pengguna. Contoh: "Saya lihat di CV Anda bahwa Anda mengerjakan [Nama Proyek]. Bisakah Anda ceritakan lebih banyak tentang peran Anda dan tantangan yang Anda hadapi?".
5.  **Pertanyaan Kecocokan Perusahaan:** Ajukan pertanyaan untuk mengukur minat dan keselarasan mereka dengan "${companyName || 'perusahaan'}". Contoh: "Mengapa Anda tertarik bekerja di ${companyName || 'perusahaan kami'}?" atau "Apa yang Anda ketahui tentang produk/nilai kami?".

**Persona Pelatih (Umpan Balik):**
- Setelah pengguna memberikan jawaban, berikan mereka umpan balik yang singkat, konstruktif, dan sangat spesifik, beserta peringkat.
- **Analisis Jawaban:** Analisis secara kritis jawaban terakhir pengguna berdasarkan pertanyaan yang Anda ajukan, CV pengguna, dan konteks wawancara untuk "${companyName || 'perusahaan ini'}".
- **Berikan Peringkat:** Anda HARUS memberikan peringkat untuk jawaban tersebut. Peringkat yang valid adalah: 'Perlu Peningkatan', 'Baik', 'Luar Biasa'.
    - 'Luar Biasa': Jawabannya terstruktur dengan baik (seperti STAR), percaya diri, relevan langsung, dan menggunakan contoh/metrik spesifik dari CV mereka.
    - 'Baik': Jawabannya solid tetapi bisa ditingkatkan, mis., dengan menambahkan detail yang lebih spesifik, lebih ringkas, atau menghubungkan lebih baik ke perusahaan.
    - 'Perlu Peningkatan': Jawabannya lemah, umum, tidak terstruktur, atau gagal menjawab pertanyaan secara efektif.
- **Berikan Saran yang Dapat Ditindaklanjuti:** Umpan balik Anda harus dapat ditindaklanjuti. Gunakan markdown untuk menyusun umpan balik Anda (mis., **teks tebal** untuk penekanan, poin-poin untuk daftar). Alih-alih "Jawaban bagus," jelaskan *mengapa* itu bagus dan bagaimana bisa menjadi lebih baik. Contoh: "Itu adalah **contoh kerja tim yang kuat**. Untuk meningkatkannya, coba kuantifikasi hasilnya. CV Anda menyebutkan Anda **meningkatkan efisiensi sebesar 15%** pada proyek itu—menambahkan angka itu akan membuat jawaban Anda lebih berdampak."
- **Integrasi CV & Perusahaan:** Tunjukkan peluang yang terlewatkan. Jika pengguna memberikan jawaban umum, arahkan mereka untuk menggunakan contoh spesifik yang lebih kuat dari CV mereka atau untuk menghubungkan jawaban mereka lebih langsung ke "${companyName || 'perusahaan'}".
- Umpan balik Anda harus ringkas (2-4 kalimat). Kemudian, ajukan pertanyaan relevan berikutnya dari kategori yang berbeda.`
        : `\n\n**Interviewer Persona:**
- You will ask one question at a time.
- You must create a diverse and realistic interview flow by drawing questions from the following categories. Do not ask more than two questions from the same category in a row.
- Start with a classic opening question like "Tell me about yourself."

**Question Categories:**
1.  **Behavioral Questions:** Ask the user to share past experiences. Start with phrases like "Tell me about a time when...", "Describe a situation where...", "Give me an example of...".
2.  **Situational Questions:** Pose hypothetical scenarios to assess problem-solving skills. Start with phrases like "What would you do if...", "Imagine you were in a situation where...".
3.  **Technical Questions:** Ask questions relevant to the core skills required for the "${jobTitle}" role. If the role is non-technical, you can ask about relevant tools/software instead.
4.  **CV-Based Questions:** Ask specific questions about projects, roles, or skills mentioned in the user's CV. For example: "I see on your CV that you worked on [Project Name]. Can you tell me more about your role and the challenges you faced?".
5.  **Company-Fit Questions:** Ask questions to gauge their interest and alignment with "${companyName || 'the company'}". For example: "Why are you interested in working at ${companyName || 'our company'}?" or "What do you know about our products/values?".

**Coach Persona (Feedback):**
- After the user provides an answer, give them brief, constructive, and highly specific feedback, along with a rating.
- **Analyze the Answer:** Critically analyze the user's last answer based on the question you asked, the user's CV, and the context of interviewing for "${companyName || 'this company'}".
- **Provide a Rating:** You MUST provide a rating for the answer. The valid ratings are: 'Needs Improvement', 'Good', 'Excellent'. In Indonesian, use: 'Perlu Peningkatan', 'Baik', 'Luar Biasa'.
    - 'Excellent' / 'Luar Biasa': The answer is well-structured (like STAR), confident, directly relevant, and uses specific examples/metrics from their CV.
    - 'Good' / 'Baik': The answer is solid but could be improved, e.g., by adding more specific details, being more concise, or better connecting to the company.
    - 'Needs Improvement' / 'Perlu Peningkatan': The answer is weak, generic, unstructured, or fails to answer the question effectively.
- **Provide Actionable Advice:** Your feedback must be actionable. Use markdown to structure your feedback (e.g., **bold text** for emphasis, bullet points for lists). Instead of "Good answer," explain *why* it was good and how it could be even better. For example: "That was a **strong example** of teamwork. To elevate it, try to quantify the result. Your CV mentions you **increased efficiency by 15%** on that project—adding that number would make your answer more impactful."
- **CV & Company Integration:** Point out missed opportunities. If the user gives a generic answer, guide them to use a specific, more powerful example from their CV or to connect their answer more directly to "${companyName || 'the company'}".
- Your feedback should be concise (2-4 sentences). Then, ask the next relevant question from a different category.`;

    if (cvContent) {
        instruction += isIndonesian
            ? `\n\nAnda memiliki CV pengguna sebagai konteks. Gunakan untuk mengajukan **Pertanyaan Berbasis CV** yang ditargetkan dan sesuaikan umpan balik Anda:\n--- CV MULAI ---\n${cvContent}\n--- CV SELESAI ---`
            : `\n\nYou have the user's CV for context. Use it to ask targeted **CV-Based Questions** and tailor your feedback:\n--- CV START ---\n${cvContent}\n--- CV END ---`;
    } else {
        instruction += isIndonesian
            ? `\n\nTidak ada CV yang diberikan. Anda tidak dapat mengajukan **Pertanyaan Berbasis CV** dan harus mengandalkan kategori lain.`
            : `\n\nNo CV was provided. You cannot ask **CV-Based Questions** and should rely on the other categories.`;
    }

    instruction += `\n\n**Interaction Flow:**
1.  Your first response must contain only your opening question.
2.  On subsequent turns, the user will provide their answer to your previous question. You will respond with your detailed feedback, rating, and next question.

**JSON Response Format:**
You MUST respond with a single, valid JSON object.
- On the first turn: \`{ "question": "Your opening question." }\`
- On all subsequent turns: \`{ "feedback": "Your specific, actionable feedback.", "rating": "${isIndonesian ? "'Perlu Peningkatan', 'Baik', or 'Luar Biasa'" : "'Needs Improvement', 'Good', or 'Excellent'\""}", "question": "Your next question." }\``;

    return instruction;
};

const practiceSessionConfig = (lang: 'en' | 'id') => ({
    responseMimeType: "application/json",
    responseSchema: {
        type: Type.OBJECT,
        properties: {
            feedback: {
                type: Type.STRING,
                description: "Feedback on the user's previous answer. Omit for the first question."
            },
            rating: {
                type: Type.STRING,
                description: `A rating for the user's answer: ${lang === 'id' ? "'Perlu Peningkatan', 'Baik', 'Luar Biasa'" : "'Needs Improvement', 'Good', or 'Excellent'\""}.`
            },
            question: {
                type: Type.STRING,
                description: "The next interview question to ask the user."
            }
        }
    },
    thinkingConfig: { thinkingBudget: 0 } // Optimize for low latency
});

export const startPracticeSession = (jobTitle: string, companyName: string, cvContent: string, lang: 'en' | 'id'): Chat => {
    const systemInstruction = createPracticeSystemInstruction(jobTitle, companyName, cvContent, lang);
    return ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction,
            ...practiceSessionConfig(lang)
        },
    });
};

export const restorePracticeSession = (jobTitle: string, companyName: string, cvContent: string, history: Content[], lang: 'en' | 'id'): Chat => {
    const systemInstruction = createPracticeSystemInstruction(jobTitle, companyName, cvContent, lang);
    return ai.chats.create({
        model: 'gemini-2.5-flash',
        history,
        config: {
            systemInstruction,
            ...practiceSessionConfig(lang)
        },
    });
};


export interface PracticeResponse {
    question: string;
    feedback: string | null;
    rating: 'Needs Improvement' | 'Good' | 'Excellent' | 'Perlu Peningkatan' | 'Baik' | 'Luar Biasa' | null;
}

// Map Indonesian ratings to English equivalents for consistent type handling
const mapRating = (rating: string | null): PracticeResponse['rating'] => {
    if (!rating) return null;
    switch (rating) {
        case 'Perlu Peningkatan': return 'Needs Improvement';
        case 'Baik': return 'Good';
        case 'Luar Biasa': return 'Excellent';
        case 'Needs Improvement': return 'Needs Improvement';
        case 'Good': return 'Good';
        case 'Excellent': return 'Excellent';
        default: return null;
    }
}

const parsePracticeGeminiResponse = (response: GenerateContentResponse): any => {
    const jsonText = response.text.trim();
    const cleanedJson = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(cleanedJson);
};


export const getPracticeResponse = async (chat: Chat, latestAnswer?: string, lang: 'en' | 'id' = 'en'): Promise<PracticeResponse> => {
    try {
        const message = latestAnswer 
            ? (lang === 'id' 
                ? `Ini jawaban saya: "${latestAnswer}". Mohon berikan umpan balik, peringkat, dan pertanyaan berikutnya.`
                : `Here is my answer: "${latestAnswer}". Please provide feedback, a rating, and the next question.`)
            : (lang === 'id' ? "Tolong ajukan pertanyaan pertama." : "Please ask me the first question.");

        const response: GenerateContentResponse = await chat.sendMessage({ message });
        const parsed = parsePracticeGeminiResponse(response);
        
        return {
            question: parsed.question || (lang === 'id' ? "Saya siap untuk pertanyaan berikutnya." : "I'm ready for the next question."),
            feedback: parsed.feedback || null,
            rating: mapRating(parsed.rating),
        };
    } catch (error) {
        const errorMessage = parseApiError(error, lang);
        return {
            question: lang === 'id' ? "Maaf, saya mengalami kesalahan. Apakah Anda ingin mencoba lagi atau mengakhiri sesi?" : "Sorry, I encountered an error. Would you like to try again or end the session?",
            feedback: errorMessage,
            rating: null,
        };
    }
};

// --- Company Briefing ---
export const getCompanyBriefing = async (companyName: string, lang: 'en' | 'id'): Promise<CompanyBriefing> => {
    const isIndonesian = lang === 'id';
    
    const prompt = isIndonesian
        ? `Anda adalah seorang analis riset karir yang ahli. Anda sedang menyiapkan ringkasan singkat untuk seorang kandidat yang akan wawancara di "${companyName}". Tujuan Anda adalah memberikan informasi paling penting untuk membantu mereka sukses.

Berdasarkan informasi terkini dari web, hasilkan laporan dalam format markdown dan dalam Bahasa Indonesia.

Laporan HARUS mencakup bagian-bagian berikut dengan judul yang persis seperti yang ditentukan:
### Tinjauan Perusahaan
Ringkasan singkat satu paragraf tentang apa yang dilakukan perusahaan.

### Misi & Nilai
Pernyataan misi resmi atau yang dapat disimpulkan dari perusahaan dan nilai-nilai inti, disajikan sebagai daftar singkat.

### Berita & Perkembangan Terkini
2-3 poin tentang peristiwa penting, peluncuran produk, atau berita terbaru (dalam 6-12 bulan terakhir).

### Contoh Pertanyaan Wawancara
3 pertanyaan perilaku atau kecocokan perusahaan yang mungkin diajukan oleh pewawancara di "${companyName}", berdasarkan nilai-nilai dan kegiatan terbaru mereka. Untuk setiap pertanyaan, berikan alasan singkat (1-2 kalimat) dalam format miring mengapa mereka mungkin menanyakannya.`
        : `You are an expert career research analyst. You are preparing a concise briefing for a candidate interviewing at "${companyName}". Your goal is to provide the most critical information to help them succeed.

Based on up-to-date information from the web, generate a report in markdown format.

The report MUST include the following sections with the exact headings as specified:
### Company Overview
A brief, one-paragraph summary of what the company does.

### Mission & Values
The company's official or inferred mission statement and core values, presented as a short list.

### Recent News & Developments
2-3 bullet points on significant recent events, product launches, or news (within the last 6-12 months).

### Potential Interview Questions
3 behavioral or company-fit questions an interviewer at "${companyName}" might ask, based on their values and recent activities. For each question, provide a brief (1-2 sentence) rationale in italics for why they might ask it.`;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                tools: [{googleSearch: {}}],
            },
        });

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        let sources: GroundingSource[] = [];
        if (groundingChunks) {
            const mappedSources = groundingChunks
                .map(chunk => ({
                    uri: chunk.web?.uri,
                    title: chunk.web?.title,
                }))
                .filter(source => source.uri && source.title) as GroundingSource[];
            // De-duplicate sources
            sources = Array.from(new Map(mappedSources.map(item => [item.uri, item])).values());
        }

        return {
            briefing: response.text,
            sources: sources
        };
    } catch(error) {
        const errorMessage = parseApiError(error, lang);
        return {
            briefing: `${isIndonesian ? 'Kesalahan: Tidak dapat membuat ringkasan perusahaan.' : 'Error: Could not generate a company briefing.'}\n\n${isIndonesian ? 'Detail' : 'Details'}: ${errorMessage}`,
            sources: [],
        }
    }
};


// --- Summary ---

export const getInterviewSummary = async (conversation: ConversationItem[], jobTitle: string, companyName: string, mode: AppMode, lang: 'en' | 'id'): Promise<string> => {
    const isPractice = mode === 'practice';
    const isIndonesian = lang === 'id';
    
    const transcript = conversation
        .map(item => {
            if (isPractice) {
                 if (item.role === Role.MODEL) {
                     let text = `${isIndonesian ? 'Pewawancara AI' : 'AI Interviewer'}: ${item.text}`;
                     if (item.feedback) {
                         text = `${isIndonesian ? 'Umpan Balik AI' : 'AI Feedback'} (${isIndonesian ? 'Peringkat' : 'Rating'}: ${item.rating || 'N/A'}): ${item.feedback}\n${text}`;
                     }
                     return text;
                 } else {
                     return `${isIndonesian ? 'Jawaban Anda' : 'Your Answer'}: ${item.text}`;
                 }
            } else {
                 if (item.role === Role.MODEL) {
                     return `${isIndonesian ? 'Pewawancara bertanya' : 'Interviewer asked'}: ${item.text}`;
                 } else {
                     const label = item.type === 'exampleAnswer' 
                        ? (isIndonesian ? 'AI memberikan contoh jawaban:' : 'AI gave an example answer:') 
                        : (isIndonesian ? 'AI menyarankan poin pembicaraan:' : 'AI suggested talking points:');
                     return `${label}\n${item.text}`;
                 }
            }
        })
        .join('\n\n');
    
    const summaryPrompt = isIndonesian
        ? `Anda adalah seorang pelatih wawancara ahli yang memberikan ringkasan akhir untuk seorang kandidat yang baru saja menyelesaikan sesi untuk posisi "${jobTitle}"${companyName ? ` di "${companyName}"` : ''}.

Mode sesi adalah: ${isPractice ? 'Wawancara Latihan' : 'Bantuan Copilot Langsung'}.
${companyName ? `Perusahaan target adalah: "${companyName}".\n` : ''}
Berdasarkan transkrip berikut, berikan tinjauan kinerja yang komprehensif. Seluruh ringkasan harus dalam Bahasa Indonesia.${companyName ? ` Saat memberikan umpan balik, pertimbangkan seberapa baik jawaban kandidat akan selaras dengan budaya dan nilai yang diketahui dari "${companyName}".` : ''}
${isPractice ? ` Transkrip ini mencakup umpan balik dan peringkat AI—gunakan peringkat ini untuk menginformasikan ringkasan Anda.` : ''}

Transkrip:
---
${transcript}
---

Ringkasan Anda HARUS mencakup:
1.  **Refleksi Kinerja Keseluruhan:** Ringkasan tingkat tinggi yang singkat tentang tema-tema kunci dari sesi tersebut.
2.  **Analisis Kekuatan Utama:** Berdasarkan transkrip, identifikasi 2-3 kekuatan utama atau area positif. Jika memungkinkan, catat bagaimana kekuatan ini selaras dengan peran atau perusahaan.
3.  **Area Potensial untuk Peningkatan:** Identifikasi 2-3 area yang dapat ditindaklanjuti untuk dikerjakan oleh kandidat.${companyName ? ` Sampaikan saran ini dalam konteks untuk berhasil di perusahaan seperti "${companyName}".` : ''}
4.  **Komentar Penutup:** Kalimat penyemangat terakhir untuk memotivasi kandidat.

Respons dengan satu objek JSON yang valid dengan satu kunci: "summary". Nilainya harus berupa satu string yang berisi laporan lengkap yang diformat. Gunakan markdown untuk pemformatan (mis., judul, teks tebal, poin-poin).`
        : `You are an expert interview coach providing a final summary for a candidate who just completed a session for the "${jobTitle}" position${companyName ? ` at "${companyName}"` : ''}.

The session mode was: ${isPractice ? 'Practice Interview' : 'Live Copilot Assistance'}.
${companyName ? `The target company was: "${companyName}".\n` : ''}
Based on the following transcript, provide a comprehensive performance review.${companyName ? ` When providing feedback, consider how well the candidate's answers would align with the known culture and values of "${companyName}".` : ''}
${isPractice ? ` The transcript includes AI feedback and ratings—use these ratings to inform your summary.` : ''}

Transcript:
---
${transcript}
---

Your summary MUST include:
1.  **Overall Performance Reflection:** A brief, high-level summary of the key themes from the session.
2.  **Key Strengths Analysis:** Based on the transcript, identify 2-3 key strengths or positive areas. If possible, note how these strengths align with the role or company.
3.  **Potential Areas for Improvement:** Identify 2-3 actionable areas for the candidate to work on.${companyName ? ` Frame this advice in the context of succeeding at a company like "${companyName}".` : ''}
4.  **Closing Remarks:** A final encouraging sentence to motivate the candidate.

Respond with a single, valid JSON object with one key: "summary". The value should be a single string containing the full, formatted report. Use markdown for formatting (e.g., headings, bold text, bullet points).`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: summaryPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        summary: {
                            type: Type.STRING,
                            description: "The full interview summary report formatted in markdown."
                        }
                    }
                }
            }
        });
        
        const parsedResponse = parsePracticeGeminiResponse(response);
        return parsedResponse.summary || (isIndonesian ? "Tidak dapat menghasilkan ringkasan." : "Could not generate a summary.");
    } catch (error) {
        const errorMessage = parseApiError(error, lang);
        return isIndonesian
            ? `Maaf, saya mengalami kesalahan saat membuat ringkasan wawancara Anda.\n\nDetail: ${errorMessage}`
            : `Sorry, I encountered an error while generating your interview summary.\n\nDetails: ${errorMessage}`;
    }
};