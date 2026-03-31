/// <reference types="vite/client" />

import { GoogleGenerativeAI } from "@google/generative-ai";
import { Message } from "../types";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

export const getGeminiResponse = async (prompt: string, history: Message[] = []) => {
  if (!API_KEY) {
    return "Error de configuración: Contacta al administrador.";
  }

  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: "Eres el asistente de IA experto de Econexo. Ayudas a empresas a gestionar residuos industriales, cumplir con normativas ambientales (como la Ley REP en Chile y normas internacionales) y optimizar métricas de sustentabilidad. Tus respuestas deben ser profesionales, técnicamente precisas, bien estructuradas (usa markdown si es necesario) y completas. Responde siempre en español."
    });

    // Gemini requires history to start with user. Strip initial model greeting if present.
    const apiHistory = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: msg.parts.map(p => ({ text: p.text }))
    })).filter((msg, index, arr) => {
      // Keep if it's user, or if it's a model message that isn't the first one (greeting)
      return msg.role === 'user' || index > 0;
    });

    const chat = model.startChat({
      history: apiHistory,
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.7,
      },
    });

    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    const text = response.text();
    return text;
  } catch (e: any) {
    return `Error: ${e.message || "Problema de conexión con IA"}`;
  }
};

export const analyzeImage = async (base64Image: string, prompt: string) => {
  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      prompt || "Analiza esta imagen y dime su impacto ambiental o cómo debería reciclarse según la normativa chilena.",
      {
        inlineData: {
          data: base64Image.split(',')[1] || base64Image,
          mimeType: "image/jpeg",
        },
      },
    ]);

    return result.response.text();
  } catch (e: any) {
    return `Error al analizar imagen: ${e.message}`;
  }
};
