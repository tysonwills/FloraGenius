
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { PlantIdentification, PlantDiagnosis, GroundingSource } from "../types";

/**
 * Utility to extract and parse JSON from the model's response.
 * Handles cases where the model wraps JSON in markdown code blocks.
 */
const extractJson = (text: string) => {
  // Find everything between the first '{' and the last '}'
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  
  if (start !== -1 && end !== -1) {
    const jsonStr = text.substring(start, end + 1);
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse extracted JSON string", e);
      throw new Error("Botanical data format error");
    }
  }
  
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse raw response as JSON", e);
    throw new Error("Could not interpret botanical analysis");
  }
};

// Helper to get location context string
const getLocationContext = (lat?: number, lng?: number) => {
  return lat && lng ? ` (The user is located at coordinates: ${lat}, ${lng}. Use Maps grounding to verify if this plant is common, native, or likely to be found at this specific location or region.)` : "";
};

// Identify plant using Gemini 2.5 Flash for combined Search and Maps reasoning
export const identifyPlant = async (
  base64Image: string, 
  lat?: number, 
  lng?: number,
  observations?: string
): Promise<{ data: PlantIdentification; sources: GroundingSource[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const observationSection = observations ? `The user also provided these observations/keywords: "${observations}". Use this info to refine the identification.` : "";
  
  const prompt = `Identify this plant from the image.${getLocationContext(lat, lng)} ${observationSection} Provide a detailed report.
  
  You MUST return the response strictly as a JSON object (no other text) with this structure:
  {
    "name": "string",
    "scientificName": "string",
    "family": "string",
    "description": "string",
    "facts": ["string"],
    "isToxic": boolean,
    "toxicityDetails": "string",
    "isWeed": boolean,
    "careGuide": {
      "watering": "string",
      "sunlight": "string",
      "soil": "string",
      "temperature": "string",
      "homeRemedies": ["string"]
    }
  }

  Use Google Search and Google Maps to ensure the facts and regional data are accurate.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: "image/jpeg" } },
        { text: prompt }
      ]
    },
    config: {
      tools: [{ googleSearch: {} }, { googleMaps: {} }],
      toolConfig: lat && lng ? {
        retrievalConfig: {
          latLng: {
            latitude: lat,
            longitude: lng
          }
        }
      } : undefined,
      // IMPORTANT: responseMimeType and responseSchema are NOT supported when using the googleMaps tool.
    }
  });

  // Extract grounding chunks from both Search and Maps
  const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => {
    if (chunk.web) return { title: chunk.web.title || "Reference", uri: chunk.web.uri || "" };
    if (chunk.maps) return { title: chunk.maps.title || "Location Context", uri: chunk.maps.uri || "" };
    return null;
  }).filter(Boolean) || [];

  const text = response.text || "{}";
  try {
    return { data: extractJson(text), sources };
  } catch (e) {
    console.error("Failed to process plant identification JSON", e);
    throw new Error("Invalid response from AI");
  }
};

// Diagnose plant diseases using Gemini 2.5 Flash
export const diagnosePlant = async (
  base64Image: string,
  lat?: number,
  lng?: number
): Promise<{ data: PlantDiagnosis; sources: GroundingSource[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `Analyze the health of the plant in this image.${getLocationContext(lat, lng)}
  Identify the species, disease/pest, symptoms, causes, recommendations, and prognosis.
  
  You MUST return the response strictly as a JSON object (no other text) with this structure:
  {
    "plantName": "string",
    "issue": "string",
    "confidence": number,
    "symptoms": ["string"],
    "causes": ["string"],
    "recommendations": ["string"],
    "prognosis": "string"
  }

  Use Google Search and Google Maps for regional accuracy and treatment safety.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: "image/jpeg" } },
        { text: prompt }
      ]
    },
    config: {
      tools: [{ googleSearch: {} }, { googleMaps: {} }],
      toolConfig: lat && lng ? {
        retrievalConfig: {
          latLng: {
            latitude: lat,
            longitude: lng
          }
        }
      } : undefined,
      // IMPORTANT: responseMimeType and responseSchema are NOT supported when using the googleMaps tool.
    }
  });

  const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => {
    if (chunk.web) return { title: chunk.web.title || "Reference", uri: chunk.web.uri || "" };
    if (chunk.maps) return { title: chunk.maps.title || "Regional Context", uri: chunk.maps.uri || "" };
    return null;
  }).filter(Boolean) || [];

  const text = response.text || "{}";
  try {
    const result = extractJson(text);
    return {
      data: {
        ...result,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      },
      sources
    };
  } catch (e) {
    console.error("Failed to process plant diagnosis JSON", e);
    throw new Error("Invalid response from AI");
  }
};

// Maps grounding for garden centers
export const getNearbyGardenCenters = async (lat: number, lng: number): Promise<{ text: string, centers: GroundingSource[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "Find the best rated garden centers, plant nurseries, and botanical stores near my current location.",
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: {
            latitude: lat,
            longitude: lng
          }
        }
      }
    }
  });

  const centers = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
    title: chunk.maps?.title || "Garden Center",
    uri: chunk.maps?.uri || ""
  })) || [];

  return { text: response.text || "", centers };
};

// Local flora identification
export const getLocalFlora = async (lat: number, lng: number): Promise<{ text: string, sources: GroundingSource[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "Identify common plants, flowers, and trees that are native or typical for this specific geographical area.",
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: {
            latitude: lat,
            longitude: lng
          }
        }
      }
    }
  });

  const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
    title: chunk.maps?.title || "Local Landmark",
    uri: chunk.maps?.uri || ""
  })) || [];

  return { text: response.text || "", sources };
};

// Generate plant image (still flash image for speed/quality)
export const generatePlantImage = async (plantName: string): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `A professional botanical photograph of a healthy ${plantName} in a natural garden setting, high resolution.`;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] },
      config: { imageConfig: { aspectRatio: "16:9" } },
    });

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (error) {
    console.error("Image generation failed", error);
  }
  return null;
};
