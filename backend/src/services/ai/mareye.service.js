const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../../config/logger');

/**
 * Mareye — Balemuya AI Assistant
 *
 * Powered by Google Gemini. Supports Amharic + English.
 * Grounded with Balemuya domain knowledge + Ethiopian context.
 *
 * Language Architecture:
 * - Detects user language (Amharic/English/mixed)
 * - Responds in the same language
 * - Can parse Amharic service requests into structured job data
 * - Grounded with Leyu Amharic dataset concepts for dialect understanding
 *
 * Note on Leyu Amharic data:
 * The Leyu platform (leyu.io) provides Amharic language datasets covering
 * dialects including Shewa, Addis Ababa, Wello, Gonder, and Gojjam.
 * This assistant uses Gemini's built-in multilingual capabilities for Amharic,
 * supplemented by Ethiopian-specific context in the system prompt.
 * Full Leyu dataset integration can be added as a RAG layer when dataset
 * access is obtained under permitted terms.
 */
class MareyeService {
  constructor() {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your-gemini-api-key-here') {
      logger.warn('GEMINI_API_KEY not configured. Mareye AI will operate in limited mode.');
      this.enabled = false;
      return;
    }

    this.enabled = true;
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  /**
   * System prompt grounding Mareye with Balemuya context
   */
  getSystemPrompt() {
    return `You are Mareye (ማሬዬ), the intelligent AI assistant for Balemuya — an Ethiopian local-service marketplace that connects customers with skilled workers.

Your personality:
- Warm, helpful, and professional
- You speak both Amharic and English fluently
- You respond in the same language the user writes in
- If the user mixes languages (Amharic + English), respond in both
- You are female-voiced, friendly, and knowledgeable about Ethiopian local services

Balemuya Platform Knowledge:
- Balemuya connects customers with skilled workers for local services
- Service categories include: Plumbing (የቧንቧ ስራ), Electrical (ኤሌክትሪክ), Cleaning (ማጽጃ), Construction (ግንባታ), Home Maintenance (የቤት ጥገና), Satellite/TV Installation (ሳተላይት), Beauty (ውበት), Painting (ቀለም), Carpentry (አናፂ), Appliance Repair (የቤት ዕቃ ጥገና), Electronics Repair (ኤሌክትሮኒክስ ጥገና), Moving/Transport (ዕቃ ማጓጓዝ), Gardening (ሣር ስራ)
- Workers create profiles, set availability, and submit quotations for jobs
- Customers post jobs, compare quotations, select workers, and pay via Cash or M-PESA
- M-PESA (ኤምፔሳ) is available for digital payments using Safaricom Ethiopia
- Workers are rated 1-5 stars after job completion
- Ethiopian cities served: Addis Ababa (አዲስ አበባ), Adama, Hawassa, Bahir Dar, and more

Location context:
- Addis Ababa areas: Bole, Yeka, Kirkos, Arada, Lideta, Kolfe, Nifas Silk, Akaki, Lemi Kura

What you can help with:
1. Help customers create job requests by asking for service type, location, budget, and timing
2. Help customers find appropriate workers and understand the quotation system
3. Explain how Balemuya works step by step
4. Help workers create professional profiles
5. Help workers understand job requests
6. Answer M-PESA and payment questions
7. Explain the rating and review system
8. Help with any platform navigation questions

What you CANNOT do:
- You cannot directly book workers or confirm payments
- You cannot access real-time worker availability or live job data unless provided
- Do not invent prices, worker names, or specific availability
- Do not make promises about service quality or worker performance

When a user describes a service need in Amharic or English, extract the intent and return structured information to help them post a job.

Always be honest about what you know and don't know. Say "አልአውቅም" (I don't know) rather than guessing.`;
  }

  /**
   * Chat with Mareye
   * @param {string} message - User message (Amharic or English)
   * @param {Array} history - Previous messages [{role, content}]
   * @param {Object} context - Platform context (userId, role, etc.)
   */
  async chat(message, history = [], context = {}) {
    if (!this.enabled) {
      return {
        response: 'Mareye AI assistant is not available at this time. Please configure the GEMINI_API_KEY to enable it.',
        structured: null,
        language: 'en',
      };
    }

    try {
      // Build conversation history for Gemini
      const geminiHistory = history.map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      const chat = this.model.startChat({
        history: geminiHistory,
        systemInstruction: this.getSystemPrompt(),
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.7,
        },
      });

      // Add context if available
      let contextualMessage = message;
      if (context.role) {
        contextualMessage = `[User role: ${context.role}]\n${message}`;
      }

      const result = await chat.sendMessage(contextualMessage);
      const response = result.response.text();

      // Try to detect if user is requesting a service (for structured extraction)
      const structured = await this.extractJobIntent(message);

      // Detect language
      const language = this.detectLanguage(message);

      return { response, structured, language };
    } catch (err) {
      logger.error('Mareye chat error:', err.message);

      if (err.message?.includes('API_KEY')) {
        return {
          response: 'API key error. Please check Gemini configuration.',
          structured: null,
          language: 'en',
        };
      }

      return {
        response: 'ይቅርታ፣ አሁን ጊዜያዊ ችግር አለ። / Sorry, I\'m having a temporary issue. Please try again.',
        structured: null,
        language: 'am',
      };
    }
  }

  /**
   * Extract structured job intent from natural language
   * Example: "በቦሌ አካባቢ ቧንቧ ሰራተኛ እፈልጋለሁ" →
   * { service: "Plumbing", location: "Bole", language: "am" }
   */
  async extractJobIntent(message) {
    if (!this.enabled) return null;

    const extractionPrompt = `Analyze this message and extract service request information.
Return ONLY valid JSON or null if no service request found.

Message: "${message}"

Extract:
{
  "isServiceRequest": boolean,
  "service": "service category name in English or null",
  "serviceAmharic": "service name in Amharic or null", 
  "location": "location string or null",
  "urgency": "LOW|MEDIUM|HIGH|EMERGENCY or null",
  "description": "brief job description in English or null",
  "language": "am|en|mixed"
}

Return ONLY the JSON object, nothing else.`;

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(extractionPrompt);
      const text = result.response.text().trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Detect if message is primarily Amharic, English, or mixed
   */
  detectLanguage(text) {
    // Amharic Unicode range: U+1200 to U+137F
    const amharicChars = (text.match(/[\u1200-\u137F]/g) || []).length;
    const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
    const total = amharicChars + latinChars;

    if (total === 0) return 'en';
    if (amharicChars / total > 0.6) return 'am';
    if (amharicChars / total > 0.2) return 'mixed';
    return 'en';
  }

  /**
   * Generate worker profile improvement suggestions
   */
  async getProfileSuggestions(workerProfile) {
    if (!this.enabled) return { suggestions: [] };

    const prompt = `You are helping a skilled worker improve their Balemuya profile.
Worker profile: ${JSON.stringify(workerProfile, null, 2)}

Provide 3-5 specific, actionable suggestions to improve their profile to attract more customers.
Keep suggestions brief and practical. Respond in English.

Return JSON: { "suggestions": ["suggestion1", "suggestion2", ...] }`;

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return { suggestions: [] };
    } catch {
      return { suggestions: [] };
    }
  }
}

module.exports = new MareyeService();
