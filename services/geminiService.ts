// This file now contains the centralized markdown parsing logic.

declare global {
  interface Window {
    marked: any;
    hljs: any;
  }
}

let isMarkedConfigured = false;

const configureMarked = () => {
    if (typeof window.marked === 'undefined' || typeof window.hljs === 'undefined') {
        console.warn("marked or highlight.js not loaded, markdown parsing will be basic.");
        return;
    }

    window.marked.setOptions({
        gfm: true,
        breaks: true,
        highlight: (code: string, lang: string) => {
            const language = window.hljs.getLanguage(lang) ? lang : 'plaintext';
            return window.hljs.highlight(code, { language, ignoreIllegals: true }).value;
        },
    });
    isMarkedConfigured = true;
};


export const parseMarkdown = (text: string | null): string => {
    if (!text) return '';

    if (!isMarkedConfigured) {
        configureMarked();
    }
    
    if (window.marked) {
        try {
            return window.marked.parse(text);
        } catch (e) {
            console.error("Error parsing markdown:", e);
        }
    }

    // Simple and safe fallback for when marked or hljs fails
    const escapedText = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    return escapedText.replace(/\n/g, '<br />');
};
