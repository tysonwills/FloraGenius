
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { PlantIdentification, PlantDiagnosis, GroundingSource } from "../types";

// Helper to get location context string
const getLocationContext = (lat?: number, lng?: number) => {
  return lat && lng ? ` (The user is located at coordinates: ${lat}, ${lng}. Please consider local flora and regional conditions.)` : "";
};

// Identify plant using Gemini 3 Pro for advanced botanical reasoning
export const identifyPlant = async (
  base64Image: string, 
  lat?: number, 
  lng?: number
): Promise<{ data: PlantIdentification; sources: GroundingSource[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `Identify this plant from the image.${getLocationContext(lat, lng)} Provide a detailed report including:
  1. Common Name and Scientific Name.
  2. Family.
  3. A short description.
  4. 3-5 interesting facts.
  5. Comprehensive Care Guide (Watering, Sunlight, Soil, Temperature).
  6. Home remedies for common issues for this specific plant.
  7. Toxicity check (Is it toxic to pets/humans?).
  8. Weed check (Is it considered an invasive weed?).
  
  Return the information in JSON format. Use Google Search to ensure the facts are accurate and up-to-date.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: "image/jpeg" } },
        { text: prompt }
      ]
    },
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          scientificName: { type: Type.STRING },
          family: { type: Type.STRING },
          description: { type: Type.STRING },
          facts: { type: Type.ARRAY, items: { type: Type.STRING } },
          isToxic: { type: Type.BOOLEAN },
          toxicityDetails: { type: Type.STRING },
          isWeed: { type: Type.BOOLEAN },
          careGuide: {
            type: Type.OBJECT,
            properties: {
              watering: { type: Type.STRING },
              sunlight: { type: Type.STRING },
              soil: { type: Type.STRING },
              temperature: { type: Type.STRING },
              homeRemedies: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["watering", "sunlight", "soil", "temperature", "homeRemedies"]
          }
        },
        required: ["name", "scientificName", "family", "description", "facts", "careGuide", "isToxic", "isWeed"]
      }
    }
  });

  // Extract grounding chunks from Google Search metadata
  const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
    title: chunk.web?.title || "Reference",
    uri: chunk.web?.uri || ""
  })) || [];

  const text = response.text || "{}";
  try {
    return { data: JSON.parse(text), sources };
  } catch (e) {
    console.error("Failed to parse plant identification JSON", e);
    throw new Error("Invalid response from AI");
  }
};

// Generate botanical imagery using gemini-2.5-flash-image
export const generatePlantImage = async (plantName: string): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `A high-quality, professional botanical photograph of a healthy ${plantName} in a natural garden setting, soft natural lighting, high resolution.`;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9"
        }
      },
    });

    // Manually iterate through response parts to find the inline image data
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
  } catch (error) {
    console.error("Image generation failed", error);
  }
  return null;
};

// Diagnose plant diseases using Gemini 3 Pro
export const diagnosePlant = async (
  base64Image: string,
  lat?: number,
  lng?: number
): Promise<{ data: PlantDiagnosis; sources: GroundingSource[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `Analyze the health of the plant in this image.${getLocationContext(lat, lng)}
  1. Identify the plant species.
  2. Identify the specific disease, pest, or deficiency affecting it.
  3. List visual symptoms detected.
  4. List likely causes.
  5. Provide professional recommendations and actions to take to bring it back to optimum health.
  6. Provide a prognosis.
  
  Return the analysis in JSON format. Use Google Search to provide accurate, real-world diagnostic information.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: "image/jpeg" } },
        { text: prompt }
      ]
    },
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          plantName: { type: Type.STRING },
          issue: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          symptoms: { type: Type.ARRAY, items: { type: Type.STRING } },
          causes: { type: Type.ARRAY, items: { type: Type.STRING } },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
          prognosis: { type: Type.STRING }
        },
        required: ["plantName", "issue", "confidence", "symptoms", "causes", "recommendations", "prognosis"]
      }
    }
  });

  const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
    title: chunk.web?.title || "Reference",
    uri: chunk.web?.uri || ""
  })) || [];

  const text = response.text || "{}";
  try {
    const result = JSON.parse(text);
    return {
      data: {
        ...result,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      },
      sources
    };
  } catch (e) {
    console.error("Failed to parse plant diagnosis JSON", e);
    throw new Error("Invalid response from AI");
  }
};

// Maps grounding requires Gemini 2.5 series models
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

  // Extract mandatory maps URLs and titles from grounding chunks
  const centers = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
    title: chunk.maps?.title || "Garden Center",
    uri: chunk.maps?.uri || ""
  })) || [];

  return { text: response.text || "", centers };
};

// Identify local flora using Google Maps grounding
export const getLocalFlora = async (lat: number, lng: number): Promise<{ text: string, sources: GroundingSource[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "Identify the most common or interesting plants, flowers, and trees that are native or typical for this specific geographical area. Provide names and a brief reason why they thrive here.",
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
