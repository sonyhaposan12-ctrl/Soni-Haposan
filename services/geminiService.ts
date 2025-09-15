import { GoogleGenAI, Chat, GenerateContentResponse, Type } from "@google/genai";
import { ConversationItem, Role, AppMode } from "../types";

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Copilot Mode ---

const createCopilotSystemInstruction = (jobTitle: string, companyName: string, cvContent: string): string => {
    let instruction = `You are an expert career coach and AI assistant. The user is currently in a live job interview for the "${jobTitle}" position${companyName ? ` at "${companyName}"` : ''}. Your role is to provide real-time, high-quality assistance to help them answer the interviewer's questions effectively. You can be asked to provide either concise talking points or a complete, example answer.`;

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
1.  **JSON Response Format:** You MUST respond with a single, valid JSON object. Do not add any text or formatting outside this JSON object. The object can contain "talkingPoints" or "exampleAnswer", depending on the user's request.
2.  **Talking Points:** If asked for talking points, the "talkingPoints" value should be a string containing 3-4 concise, actionable bullet points. Use markdown for the bullet points (e.g., "- First point...").
3.  **Example Answer:** If asked for an example answer, the "exampleAnswer" value should be a complete, well-structured paragraph. This answer should sound natural, confident, and professional.
4.  **Personalization (CV & Company):** You MUST tailor all responses to the user's CV AND the company${companyName ? `, "${companyName}"` : ''}. Directly reference their skills, experiences, and projects from the CV. Connect these experiences to the company's needs, products, or values. For example, instead of "I have experience in X", say "In my role at [Previous Company], I spearheaded the project on Y, which demonstrates my expertise in X. I'm excited to apply this skill to ${companyName || 'your company'}'s work on [Company Project/Product]".
5.  **HR Questions:** Be prepared to handle common questions from HR, such as "Tell me about yourself," "What are your weaknesses?", or "Why do you want to work here?". Your answer to "Why this company?" MUST be specific to "${companyName || 'this company'}".
6.  **Structure:** For behavioral questions, structure your responses implicitly following the STAR method (Situation, Task, Action, Result) to create a compelling narrative.`;
    
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
                        description: "Bulleted list of talking points for the user to answer the interview question. Provide this ONLY when asked for talking points."
                    },
                    exampleAnswer: {
                        type: Type.STRING,
                        description: "A complete, well-structured example answer to the interview question. Provide this ONLY when asked for an example answer."
                    }
                }
            },
            thinkingConfig: { thinkingBudget: 0 } // Optimize for low latency
        },
    });
};

export interface CopilotResponse {
    talkingPoints: string;
}

export interface ExampleAnswerResponse {
    exampleAnswer: string;
}

const parseGeminiResponse = (response: GenerateContentResponse): any => {
    const jsonText = response.text.trim();
    const cleanedJson = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(cleanedJson);
};

export const getTalkingPoints = async (chat: Chat, question: string): Promise<CopilotResponse> => {
    try {
        const message = `The interviewer asked: "${question}". Please generate talking points based on my CV.`;
        const response: GenerateContentResponse = await chat.sendMessage({ message });
        const parsedResponse = parseGeminiResponse(response);
        return { talkingPoints: parsedResponse.talkingPoints || "Could not generate talking points." };
    } catch (error) {
        console.error("Error processing Gemini response for talking points:", error);
        return { talkingPoints: "I encountered an issue generating suggestions. Please try again." };
    }
};

export const getExampleAnswer = async (chat: Chat, question: string): Promise<ExampleAnswerResponse> => {
    try {
        const message = `The interviewer asked: "${question}". Please generate a complete, example answer based on my CV.`;
        const response: GenerateContentResponse = await chat.sendMessage({ message });
        const parsedResponse = parseGeminiResponse(response);
        return { exampleAnswer: parsedResponse.exampleAnswer || "Could not generate an example answer." };
    } catch (error) {
        console.error("Error processing Gemini response for example answer:", error);
        return { exampleAnswer: "I encountered an issue generating an answer. Please try again." };
    }
};


// --- Practice Mode ---

const createPracticeSystemInstruction = (jobTitle: string, companyName: string, cvContent: string): string => {
    let instruction = `You are an expert career coach and AI interviewer. Your role is to conduct a realistic practice interview for a candidate applying for the "${jobTitle}" position${companyName ? ` at "${companyName}"` : ''}.`;

    if (companyName) {
        instruction += `\n\n**Company Context:** You are interviewing them for a role at "${companyName}". Use your knowledge of this company to ask relevant questions and provide specific feedback. For example, you can ask how their experience relates to one of the company's core values or products.`;
    }
    
    instruction += `\n\nYour behavior as an interviewer:
- Ask one question at a time. Start with a common opening question like "Tell me about yourself."
- Your questions should cover a range of topics: behavioral, situational, technical (if applicable to the role), and questions about their experience from their CV.
- Ask questions that are tailored to "${companyName || 'the company'}" if possible (e.g., "How do you see your skills contributing to our work on [Product X]?").

Your behavior as a coach (providing feedback):
- After the user provides an answer, give them brief, constructive, and highly specific feedback.
- **Analyze the Answer:** Critically analyze the user's last answer based on the question you asked, the user's CV, and the context of interviewing for "${companyName || 'this company'}".
- **Provide Actionable Advice:** Your feedback must be actionable. Instead of "Good answer," explain *why* it was good and how it could be even better. For example: "That was a strong example of teamwork. To elevate it, try to quantify the result. Your CV mentions you increased efficiency by 15% on that project—adding that number would make your answer more impactful."
- **CV & Company Integration:** Point out missed opportunities. If the user gives a generic answer, guide them to use a specific, more powerful example from their CV or to connect their answer more directly to "${companyName || 'the company'}". For example: "Your answer about leadership is good. You could make it even stronger by mentioning how your leadership style aligns with ${companyName || 'the company'}'s stated value of [Company Value]."
- Your feedback should be concise (2-4 sentences). Then, ask the next relevant question.`;

    if (cvContent) {
        instruction += `\n\nYou have the user's CV for context. Tailor some of your questions and all of your feedback to their specific experiences listed in the CV:\n--- CV START ---\n${cvContent}\n--- CV END ---`;
    }

    instruction += `\n\nInteraction Flow:
1.  Your first response should contain only your opening question.
2.  On subsequent turns, the user will provide their answer to your previous question. You will respond with your detailed feedback on that answer, followed by your next question.

JSON Response Format:
You MUST respond with a single, valid JSON object.
- On the first turn: \`{ "question": "Your opening question." }\`
- On all subsequent turns: \`{ "feedback": "Your specific, actionable feedback on the user's answer.", "question": "Your next question." }\``;

    return instruction;
};

export const startPracticeSession = (jobTitle: string, companyName: string, cvContent: string): Chat => {
    const systemInstruction = createPracticeSystemInstruction(jobTitle, companyName, cvContent);
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
        const parsed = parseGeminiResponse(response);
        
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

export const getInterviewSummary = async (conversation: ConversationItem[], jobTitle: string, companyName: string, mode: AppMode): Promise<string> => {
    const isPractice = mode === 'practice';
    
    const transcript = conversation
        .map(item => {
            if (isPractice) {
                 return item.role === Role.MODEL ? `AI Interviewer: ${item.text}` : `Your Answer: ${item.text}`;
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
        console.error("Error generating interview summary:", error);
        return "Sorry, I encountered an error while generating your interview summary. Please try again.";
    }
};