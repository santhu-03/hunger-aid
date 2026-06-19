export const analyzeFoodQuality = async ({ base64Images, inputValues }) => {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_GEMINI_API_KEY is not set in environment variables.');
  }

  // Construct the prompt
  const promptText = `
You are an expert AI Food Quality Assessment system.
Your task is to analyze the provided food images and structured input data to determine if the food is Safe, Caution, or Spoiled.

Food Details provided by the user:
- Food Name: ${inputValues.foodName || 'N/A'}
- Preparation Date & Time: ${inputValues.prepDateTime ? new Date(inputValues.prepDateTime).toLocaleString() : 'N/A'}
- User Reported Smell Issue: ${inputValues.smellIssue ? 'YES' : 'NO'}
- User Reported Texture Issue: ${inputValues.textureIssue ? 'YES' : 'NO'}

Please infer the Food Category (Cooked, Raw, Dairy, Fruits/Veg, Bakery, Packaged) from the images and food name.
If "Smell Issue" or "Texture Issue" is YES, strongly consider marking as "Spoiled" or "Caution" depending on severity.

Rules:
- Cooked rice/pasta left at room temp for > 2 hours is HIGH risk (Spoiled or Caution).
- Dairy left un-refrigerated for > 2 hours is HIGH risk (Spoiled).
- Meat un-refrigerated for > 2 hours is Spoiled.
- Assess visual spoilage indicators: Mold, Discoloration, Drying/staleness, Surface contamination, Leaks, Texture degradation, Browning/rotting, Packaging damage.
- If the image is unclear or not of food, flag uncertainty and request better images (Confidence Score < 50).
- DO NOT claim medical certainty. Use phrases like "appears likely", "visible signs suggest".

Respond ONLY with a valid JSON object matching this structure exactly (no markdown formatting, no \`\`\`json wrappers):
{
 "qualityStatus": "Safe" | "Caution" | "Spoiled",
 "confidenceScore": number (0-100),
 "spoilageIndicators": [string],
 "riskLevel": "Low" | "Medium" | "High",
 "shortDescription": string (2-3 lines, e.g. "Food appears visually acceptable with no obvious spoilage..."),
 "recommendation": "Approve Donation" | "Recheck Before Donating" | "Reject Donation",
 "estimatedSafeUseWindow": string
}
  `;

  const inlineDataParts = base64Images.map(base64 => ({
    inlineData: {
      mimeType: 'image/jpeg', // Assumption, can also be image/png
      data: base64,
    }
  }));

  const requestBody = {
    contents: [
      {
        parts: [
          { text: promptText },
          ...inlineDataParts
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    }
  };

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error:', errorText);
      throw new Error('Failed to analyze food quality via Gemini API.');
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate || !candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      throw new Error('No valid response from Gemini API.');
    }

    const jsonText = candidate.content.parts[0].text;
    
    // Attempt to parse JSON
    try {
      const parsed = JSON.parse(jsonText);
      return parsed;
    } catch (parseError) {
      console.error('JSON Parse Error. Raw response:', jsonText);
      throw new Error('Gemini API returned invalid JSON.');
    }

  } catch (error) {
    throw error;
  }
};
