
import { GoogleGenAI, Chat, GenerateContentResponse, Type } from "@google/genai";
import { ConversationItem, Role, AppMode } from "../types";

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Copilot Mode ---

const createCopilotSystemInstruction = (jobTitle: string, cvContent: string): string => {
    let instruction = `You are an expert career coach and AI assistant. The user is currently in a live job interview for the "${jobTitle}" position. Your role is to provide real-time, high-quality talking points to help them answer the interviewer's questions effectively.`;

    if (cvContent) {
        instruction += `\n\nYou have the user's CV for context:\n--- CV START ---\n${cvContent}\n--- CV END ---`;
    } else {
        instruction += `\n\nNo CV was provided. Base your suggestions on general best practices for the "${jobTitle}" role.`;
    }

    instruction += `\n\nThe user will provide you with a transcribed question from the interviewer. Based on this question, the job title, and the user's CV, you must generate a set of talking points.

Follow these rules strictly:
1.  **JSON Response Format:** You MUST respond with a single, valid JSON object with one key: "talkingPoints". Do not add any text or formatting outside this JSON object.
2.  **Content:** The "talkingPoints" value should be a string containing 3-4 concise, actionable bullet points. Use markdown for the bullet points (e.g., "- First point...").
3.  **Tailored Advice:** Directly reference skills or experiences from the CV when relevant to create personalized and impactful suggestions.
4.  **Structure:** The points should help the user structure their answer, for example, by implicitly following the STAR (Situation, Task, Action, Result) method for behavioral questions.
5.  **Tone:** The tone should be professional, confident, and encouraging.`;
    
    return instruction;
};


export const startCopilotSession = (jobTitle: string, cvContent: string): Chat => {
    const systemInstruction = createCopilotSystemInstruction(jobTitle, cvContent);
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
                    }
                }
            }
        },
    });
};

export interface CopilotResponse {
    talkingPoints: string;
}

export const getTalkingPoints = async (chat: Chat, question: string): Promise<CopilotResponse> => {
    try {
        const response: GenerateContentResponse = await chat.sendMessage({ message: question });
        const jsonText = response.text.trim();
        const cleanedJson = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        const parsedResponse: CopilotResponse = JSON.parse(cleanedJson);
        return parsedResponse;
    } catch (error) {
        console.error("Error processing Gemini response:", error);
        return { talkingPoints: "I encountered an issue generating suggestions. Please try again." };
    }
};


// --- Practice Mode ---

const createPracticeSystemInstruction = (jobTitle: string, cvContent: string): string => {
    let instruction = `You are an expert career coach and AI interviewer. Your role is to conduct a realistic practice interview for a candidate applying for the "${jobTitle}" position.

Your behavior:
- Ask one question at a time. Start with a common opening question like "Tell me about yourself."
- After the user provides an answer, give them brief, constructive feedback (2-3 sentences). Then, ask the next relevant question.
- Your questions should cover a range of topics: behavioral, situational, technical (if applicable to the role), and questions about their experience from their CV.
- Maintain a professional and encouraging tone.`;

    if (cvContent) {
        instruction += `\n\nYou have the user's CV for context. Tailor some of your questions to their specific experiences listed in the CV:\n--- CV START ---\n${cvContent}\n--- CV END ---`;
    }

    instruction += `\n\nInteraction Flow:
1.  Your first response should contain only your opening question.
2.  On subsequent turns, the user will provide their answer to your previous question. You will respond with feedback on that answer, followed by your next question.

JSON Response Format:
You MUST respond with a single, valid JSON object.
- On the first turn: \`{ "question": "Your opening question." }\`
- On all subsequent turns: \`{ "feedback": "Your feedback on the user's answer.", "question": "Your next question." }\``;

    return instruction;
};

export const startPracticeSession = (jobTitle: string, cvContent: string): Chat => {
    const systemInstruction = createPracticeSystemInstruction(jobTitle, cvContent);
    return ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    feedback: {
                        type: Type.STRING,
                        description: "Feedback on the user's previous answer. Omit for the first question."
                    },
                    question: {
                        type: Type.STRING,
                        description: "The next interview question to ask the user."
                    }
                }
            }
        },
    });
};

export interface PracticeResponse {
    question: string;
    feedback: string | null;
}

export const getPracticeResponse = async (chat: Chat, latestAnswer?: string): Promise<PracticeResponse> => {
    try {
        const message = latestAnswer 
            ? `Here is my answer: "${latestAnswer}". Please provide feedback and the next question.` 
            : "Please ask me the first question.";

        const response: GenerateContentResponse = await chat.sendMessage({ message });
        const jsonText = response.text.trim();
        const cleanedJson = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        const parsed = JSON.parse(cleanedJson);
        
        return {
            question: parsed.question || "I'm ready for the next question.",
            feedback: parsed.feedback || null,
        };
    } catch (error) {
        console.error("Error getting practice response:", error);
        return {
            question: "Sorry, I encountered an error. Would you like to try again or end the session?",
            feedback: "There was an issue processing my response.",
        };
    }
};

// --- Summary ---

export const getInterviewSummary = async (conversation: ConversationItem[], jobTitle: string, mode: AppMode): Promise<string> => {
    const isPractice = mode === 'practice';
    
    const transcript = conversation
        .map(item => {
            if (isPractice) {
                 return item.role === Role.MODEL ? `AI Interviewer: ${item.text}` : `Your Answer: ${item.text}`;
            } else {
                 return item.role === Role.MODEL ? `Interviewer asked: ${item.text}` : `AI suggested talking points:\n${item.text}`;
            }
        })
        .join('\n\n');
    
    const summaryPrompt = `You are an expert interview coach providing a final summary for a candidate who just completed a session for the "${jobTitle}" position.

The session mode was: ${isPractice ? 'Practice Interview' : 'Live Copilot Assistance'}.

Based on the following transcript, provide a comprehensive performance review.

Transcript:
---
${transcript}
---

Your summary MUST include:
1.  **Overall Performance Reflection:** A brief, high-level summary of the key themes from the session.
2.  **Key Strengths Analysis:** Based on the transcript, identify 2-3 key strengths or positive areas.
3.  **Potential Areas for Improvement:** Identify 2-3 actionable areas for the candidate to work on.
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
        
        const jsonText = response.text.trim();
        const cleanedJson = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        const parsedResponse = JSON.parse(cleanedJson);
        return parsedResponse.summary || "Could not generate a summary.";
    } catch (error) {
        console.error("Error generating interview summary:", error);
        return "Sorry, I encountered an error while generating your interview summary. Please try again.";
    }
};
