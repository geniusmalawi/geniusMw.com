// =====================================================================
// GENIUS MALAWI - MSOFI AI EDGE FUNCTION (GOOGLE GEMINI REPLACEMENT)
// Location: supabase/functions/msofi-ai/index.ts
// Purpose: Handles secure, unified server-side communication with the
//          Google Gemini API. Maps OpenAI-style conversational payloads
//          to Gemini structures while maintaining complete backward
//          compatibility with existing frontend callers.
//          Bypasses standard HTTP 400/500 failures by routing error
//          boundaries through HTTP 200 success paths.
//          Implements a smart automatic model selector fallback chain
//          to avoid retired engine connection exceptions.
// Dependencies: None (Vanilla Deno environment dependencies)
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Standard production-grade CORS headers for preflight and API responses
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Configured fallback list of modern active Gemini models
const MODEL_FALLBACKS = [
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-pro-latest",
  "gemini-3.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-flash-lite-latest"
];

/**
 * Dispatches an HTTP request payload directly to a targeted Gemini model's API endpoint.
 */
async function tryGeminiModel(
  modelName: string, 
  contents: any[], 
  systemInstructionText: string, 
  apiKey: string
) {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  return await fetch(geminiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: contents,
      systemInstruction: {
        parts: [{ text: systemInstructionText }]
      },
      generationConfig: {
        temperature: 0.7
      }
    }),
  });
}

serve(async (req) => {
  // Handle preflight CORS (Cross-Origin Resource Sharing) OPTIONS request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      console.error("HTTP Transport Error: Method not allowed.");
      return new Response(
        JSON.stringify({ success: false, error: "Method not allowed. Use POST." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Extract the request payload
    const body = await req.json().catch(() => ({}));
    
    const prompt = body.prompt || body.message || "";
    const conversation = body.conversation || [];
    const model = body.model || ""; 

    // 2. Retrieve API key without logging sensitive values
    const apiKey = Deno.env.get("GEMINI_API_KEY");

    if (!apiKey) {
      const errMsg = "Configuration Error: GEMINI_API_KEY environment variable is not configured.";
      console.error(errMsg);
      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!prompt) {
      const errMsg = "Request payload violation: Missing prompt value.";
      console.error(errMsg);
      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map conversation array history cleanly to Gemini roles
    const contents = [];
    if (Array.isArray(conversation) && conversation.length > 0) {
      for (const msg of conversation) {
        if (msg && msg.role && msg.content) {
          const roleMapping = msg.role === "assistant" || msg.role === "model" ? "model" : "user";
          contents.push({
            role: roleMapping,
            parts: [{ text: msg.content }]
          });
        }
      }
    }

    contents.push({
      role: "user",
      parts: [{ text: prompt }]
    });

    // 3. Compile an ordered lookup list of model candidates to try
    const attemptedModels: string[] = [];
    const modelsToTry: string[] = [];

    const requestedModel = typeof model === "string" ? model.trim() : "";

    // Sanitize user-requested models (ignore legacy OpenAI names or retired Gemini models)
    if (
      requestedModel && 
      !requestedModel.toLowerCase().includes("gpt") && 
      !requestedModel.toLowerCase().includes("gemini-1.5")
    ) {
      modelsToTry.push(requestedModel);
    }

    // Build unique list with fallback configurations
    for (const fallbackModel of MODEL_FALLBACKS) {
      if (!modelsToTry.includes(fallbackModel)) {
        modelsToTry.push(fallbackModel);
      }
    }

    const systemInstructionText = "You are Msofi AI, an advanced, professional digital super-assistant designed for the Genius Malawi platform. You provide helpful, highly accurate, and objective answers. You communicate strictly in English.";

    let successResponseData = null;
    let successfulModel = null;
    let finalDetailedError = "No connection targets processed.";

    // 4. Try models sequentially until one succeeds
    for (const targetModel of modelsToTry) {
      attemptedModels.push(targetModel);

      try {
        const response = await tryGeminiModel(targetModel, contents, systemInstructionText, apiKey);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const detailedError = errorData?.error?.message || `Google Gemini API returned status: ${response.status}`;
          console.error(`Model failed: ${targetModel} - ${detailedError}`);
          finalDetailedError = detailedError;
          continue; // Move directly to the next fallback option
        }

        const data = await response.json();
        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (replyText === undefined || replyText === null) {
          console.error(`Model failed: ${targetModel} - Response contained no generation text candidates.`);
          finalDetailedError = "Response contained no generation text candidates.";
          continue; // Try next fallback
        }

        successResponseData = data;
        successfulModel = targetModel;
        break; // Success achieved: Stop looping immediately

      } catch (fetchErr) {
        const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        console.error(`Model failed: ${targetModel} - Fetch/Network Exception: ${errMsg}`);
        finalDetailedError = `Fetch/Network Exception: ${errMsg}`;
      }
    }

    // 5. Handle complete failure gracefully
    if (!successResponseData) {
      console.error("Critical Failure: All evaluated models failed connection attempts.");
      console.error("Last recorded engine message:", finalDetailedError);

      return new Response(
        JSON.stringify({
          success: false,
          error: "All supported Gemini models failed.",
          attempted_models: attemptedModels
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Map Gemini response variables to standard output schema
    const replyText = successResponseData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const usageMetadata = successResponseData.usageMetadata || {};

    const usageStats = {
      prompt_tokens: usageMetadata.promptTokenCount || 0,
      completion_tokens: usageMetadata.candidatesTokenCount || 0,
      total_tokens: usageMetadata.totalTokenCount || 0
    };

    return new Response(
      JSON.stringify({
        success: true,
        reply: replyText,
        response: replyText,
        usage: usageStats,
        model_used: successfulModel
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    // 7. Log uncaught exceptions and return HTTP 200 so the frontend can render the error
    console.error("Uncaught Edge Function Exception:", err);
    const fallbackMsg = err instanceof Error ? err.message : "An unexpected workspace engine failure occurred.";
    
    return new Response(
      JSON.stringify({ success: false, error: fallbackMsg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});