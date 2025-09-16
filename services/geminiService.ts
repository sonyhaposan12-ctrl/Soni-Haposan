import { GoogleGenAI, Chat, GenerateContentResponse, Type, Content } from "@google/genai";
import { ConversationItem, Role, AppMode, CompanyBriefing, GroundingSource } from "../types";

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const parseApiError = (error: any): string => {
    console.error("Gemini API Error:", error);
    if (error.message) {
        if (error.message.includes('API key not valid')) {
            return "Error: The AI service is not configured correctly (Invalid API Key). Please contact support.";
        }
        if (error.message.includes('429')) { // Quota exceeded
            return "Error: Too many requests. Please wait a few seconds before trying again. This helps us keep the service stable for everyone.";
        }
    }
    // Check for network error
    if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
         return "Error: Network connection issue. Please check your internet connection and try again.";
    }
    return "Error: An unexpected issue occurred with the AI service. Please try again.";
};


// --- Copilot Mode ---

const createCopilotSystemInstruction = (jobTitle: string, companyName: string, cvContent: string): string => {
    let instruction = `You are an expert career coach and AI assistant. The user is currently in a live job interview for the "${jobTitle}" position${companyName ? ` at "${companyName}"` : ''}. Your role is to provide real-time, high-quality assistance to help them answer the interviewer's questions effectively. You will provide both concise talking points and a complete example answer.`;

    if (companyName) {
        instruction += `\n\n**Company Context:** The target company is "${companyName}". Use your knowledge about this company (its products, culture, values, recent news) to make your suggestions highly relevant. For example, align answers with the company's stated values or mission.`;
    }

    if (cvContent) {
        instruction += `\n\nYou have the user's CV for context:\n--- CV START ---\n${cvContent}\n--- CV END ---`;
    } else {
        instruction += `\n\nNo CV was provided. Base your suggestions on general best practices for the "${jobTitle}" role.`;
    }

    instruction += `\n\nThe user will provide you with a transcribed question from the interviewer. Based on this question, you will generate a response.

Follow these rules strictly:
1.  **JSON Response Format:** You MUST respond with a single, valid JSON object. Do not add any text or formatting outside this JSON object. The object MUST contain both "talkingPoints" and "exampleAnswer".
2.  **Highlighting from CV:** In both "talkingPoints" and "exampleAnswer", you MUST use markdown bolding (\`**text**\`) to highlight specific keywords, skills, project names, or metrics taken directly from the user's CV that are highly relevant to the interviewer's question. This is the most important rule. The user needs to see these highlights to quickly connect their experience to the question.
3.  **Talking Points:** The "talkingPoints" value should be a string containing 3-4 concise, actionable bullet points (using markdown like "- Point..."). Each point should suggest a key theme for the user's answer.
4.  **Example Answer:** The "exampleAnswer" value should be a complete, well-structured paragraph. Use markdown for formatting and break up longer answers into smaller paragraphs for readability.
5.  **Personalization (CV & Company):** You MUST tailor all responses to the user's CV AND the company${companyName ? `, "${companyName}"` : ''}. Directly reference their skills, experiences, and projects from the CV. Connect these experiences to the company's needs, products, or values. For example, instead of "I have experience in X", say "In my role at [Previous Company], I spearheaded the project on Y, which demonstrates my expertise in X. I'm excited to apply this skill to ${companyName || 'your company'}'s work on [Company Project/Product]".
6.  **HR Questions:** Be prepared to handle common questions from HR, such as "Tell me about yourself," "What are your weaknesses?", or "Why do you want to work here?". Your answer to "Why this company?" MUST be specific to "${companyName || 'this company'}".
7.  **Structure:** For behavioral questions, structure your responses implicitly following the STAR method (Situation, Task, Action, Result) to create a compelling narrative.`;
    
    return instruction;
};


export const startCopilotSession = (jobTitle: string, companyName: string, cvContent: string): Chat => {
    const systemInstruction = createCopilotSystemInstruction(jobTitle, companyName, cvContent);
    return ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    talkingPoints: {
                        type: Type.STRING,
                        description: "Bulleted list of talking points for the user to answer the interview question."
                    },
                    exampleAnswer: {
                        type: Type.STRING,
                        description: "A complete, well-structured example answer to the interview question."
                    }
                },
                required: ["talkingPoints", "exampleAnswer"]
            },
            thinkingConfig: { thinkingBudget: 0 } // Optimize for low latency
        },
    });
};

export interface CopilotSuggestions {
    talkingPoints: string;
    exampleAnswer: string;
}

const parseGeminiResponse = (response: GenerateContentResponse): any => {
    const jsonText = response.text.trim();
    const cleanedJson = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(cleanedJson);
};

export const getCopilotResponse = async (chat: Chat, question: string): Promise<CopilotSuggestions> => {
    try {
        const message = `The interviewer asked: "${question}". Please generate talking points AND a complete example answer based on my CV.`;
        const response: GenerateContentResponse = await chat.sendMessage({ message });
        const parsedResponse = parseGeminiResponse(response);
        return { 
            talkingPoints: parsedResponse.talkingPoints || "Could not generate talking points.",
            exampleAnswer: parsedResponse.exampleAnswer || "Could not generate an example answer."
        };
    } catch (error) {
        const errorMessage = parseApiError(error);
        return { 
            talkingPoints: errorMessage,
            exampleAnswer: errorMessage
        };
    }
};


// --- Practice Mode ---

const createPracticeSystemInstruction = (jobTitle: string, companyName: string, cvContent: string): string => {
    let instruction = `You are an expert career coach and AI interviewer. Your role is to conduct a realistic and comprehensive practice interview for a candidate applying for the "${jobTitle}" position${companyName ? ` at "${companyName}"` : ''}.`;

    if (companyName) {
        instruction += `\n\n**Company Context:** You are interviewing them for a role at "${companyName}". Use your knowledge of this company to ask relevant, company-specific questions and provide feedback that aligns with their culture and values.`;
    }

    instruction += `\n\n**Interviewer Persona:**
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
- **Provide a Rating:** You MUST provide a rating for the answer. The valid ratings are: 'Needs Improvement', 'Good', 'Excellent'.
    - 'Excellent': The answer is well-structured (like STAR), confident, directly relevant, and uses specific examples/metrics from their CV.
    - 'Good': The answer is solid but could be improved, e.g., by adding more specific details, being more concise, or better connecting to the company.
    - 'Needs Improvement': The answer is weak, generic, unstructured, or fails to answer the question effectively.
- **Provide Actionable Advice:** Your feedback must be actionable. Use markdown to structure your feedback (e.g., **bold text** for emphasis, bullet points for lists). Instead of "Good answer," explain *why* it was good and how it could be even better. For example: "That was a **strong example** of teamwork. To elevate it, try to quantify the result. Your CV mentions you **increased efficiency by 15%** on that project—adding that number would make your answer more impactful."
- **CV & Company Integration:** Point out missed opportunities. If the user gives a generic answer, guide them to use a specific, more powerful example from their CV or to connect their answer more directly to "${companyName || 'the company'}".
- Your feedback should be concise (2-4 sentences). Then, ask the next relevant question from a different category.`;

    if (cvContent) {
        instruction += `\n\nYou have the user's CV for context. Use it to ask targeted **CV-Based Questions** and tailor your feedback:\n--- CV START ---\n${cvContent}\n--- CV END ---`;
    } else {
        instruction += `\n\nNo CV was provided. You cannot ask **CV-Based Questions** and should rely on the other categories.`;
    }

    instruction += `\n\n**Interaction Flow:**
1.  Your first response must contain only your opening question.
2.  On subsequent turns, the user will provide their answer to your previous question. You will respond with your detailed feedback, rating, and next question.

**JSON Response Format:**
You MUST respond with a single, valid JSON object.
- On the first turn: \`{ "question": "Your opening question." }\`
- On all subsequent turns: \`{ "feedback": "Your specific, actionable feedback.", "rating": "Your rating: 'Needs Improvement', 'Good', or 'Excellent'.", "question": "Your next question." }\``;

    return instruction;
};

const practiceSessionConfig = {
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
                description: "A rating for the user's answer: 'Needs Improvement', 'Good', or 'Excellent'."
            },
            question: {
                type: Type.STRING,
                description: "The next interview question to ask the user."
            }
        }
    }
};

export const startPracticeSession = (jobTitle: string, companyName: string, cvContent: string): Chat => {
    const systemInstruction = createPracticeSystemInstruction(jobTitle, companyName, cvContent);
    return ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction,
            ...practiceSessionConfig
        },
    });
};

export const restorePracticeSession = (jobTitle: string, companyName: string, cvContent: string, history: Content[]): Chat => {
    const systemInstruction = createPracticeSystemInstruction(jobTitle, companyName, cvContent);
    return ai.chats.create({
        model: 'gemini-2.5-flash',
        history,
        config: {
            systemInstruction,
            ...practiceSessionConfig
        },
    });
};


export interface PracticeResponse {
    question: string;
    feedback: string | null;
    rating: 'Needs Improvement' | 'Good' | 'Excellent' | null;
}

export const getPracticeResponse = async (chat: Chat, latestAnswer?: string): Promise<PracticeResponse> => {
    try {
        const message = latestAnswer 
            ? `Here is my answer: "${latestAnswer}". Please provide feedback, a rating, and the next question.` 
            : "Please ask me the first question.";

        const response: GenerateContentResponse = await chat.sendMessage({ message });
        const parsed = parseGeminiResponse(response);
        
        return {
            question: parsed.question || "I'm ready for the next question.",
            feedback: parsed.feedback || null,
            rating: parsed.rating || null,
        };
    } catch (error) {
        const errorMessage = parseApiError(error);
        return {
            question: "Sorry, I encountered an error. Would you like to try again or end the session?",
            feedback: errorMessage,
            rating: null,
        };
    }
};

// --- Company Briefing ---
export const getCompanyBriefing = async (companyName: string): Promise<CompanyBriefing> => {
    const prompt = `You are an expert career research analyst. You are preparing a concise briefing for a candidate interviewing at "${companyName}". Your goal is to provide the most critical information to help them succeed.

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
        const errorMessage = parseApiError(error);
        return {
            briefing: `Error: Could not generate a company briefing.\n\nDetails: ${errorMessage}`,
            sources: [],
        }
    }
};


// --- Summary ---

export const getInterviewSummary = async (conversation: ConversationItem[], jobTitle: string, companyName: string, mode: AppMode): Promise<string> => {
    const isPractice = mode === 'practice';
    
    const transcript = conversation
        .map(item => {
            if (isPractice) {
                 if (item.role === Role.MODEL) {
                     let text = `AI Interviewer: ${item.text}`;
                     if (item.feedback) {
                         text = `AI Feedback (Rating: ${item.rating || 'N/A'}): ${item.feedback}\n${text}`;
                     }
                     return text;
                 } else {
                     return `Your Answer: ${item.text}`;
                 }
            } else {
                 if (item.role === Role.MODEL) {
                     return `Interviewer asked: ${item.text}`;
                 } else {
                     const label = item.type === 'exampleAnswer' ? 'AI gave an example answer:' : 'AI suggested talking points:';
                     return `${label}\n${item.text}`;
                 }
            }
        })
        .join('\n\n');
    
    const summaryPrompt = `You are an expert interview coach providing a final summary for a candidate who just completed a session for the "${jobTitle}" position${companyName ? ` at "${companyName}"` : ''}.

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
        
        const parsedResponse = parseGeminiResponse(response);
        return parsedResponse.summary || "Could not generate a summary.";
    } catch (error) {
        const errorMessage = parseApiError(error);
        return `Sorry, I encountered an error while generating your interview summary.\n\nDetails: ${errorMessage}`;
    }
};