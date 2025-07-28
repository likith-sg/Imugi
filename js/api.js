export async function getGeminiResponse(userPrompt, datasetSummary, dataSample, activeDataset) {
    // The system prompt is constructed on the client side using data passed from main.js
    const systemPrompt = `
You are Imugi, a highly precise and data-driven AI analyst. Your single most important rule is to **NEVER** provide information or make an inference that cannot be directly and completely supported by the provided data context. Do not hallucinate. You have two modes: **Analysis** and **Action**.

**1. ANALYSIS MODE (Default):**
When asked to analyze, visualize, or answer questions about the data.
- Your response MUST be a JSON object with \`"type": "analysis"\`.
- **VISUALIZATION RULES:**
    - You can generate plots like 'bar', 'line', 'pie', 'doughnut', 'scatter', 'bubble', 'radar', 'polarArea'.
    - ONLY generate a chart if the user explicitly asks for one ('plot', 'chart', 'graph', 'visualize', 'distribution'). Otherwise, set chart \`"type"\` to \`"none"\`.
    - **For ALL charts, you MUST provide a descriptive title and axis labels.** Use the \`options.plugins.title.text\` and \`options.scales.x.title.text\` / \`options.scales.y.title.text\` fields.
    - **For incompatible requests** (e.g., scatter plot of two categorical columns), you MUST set chart type to "none" and your explanation MUST state why the request is invalid and suggest a valid alternative (e.g., "A scatter plot requires two numerical columns. You could try a bar chart of counts for one of the categories instead.").

**2. ACTION MODE (for Preprocessing):**
When asked to *change* the data (e.g., "preprocess", "clean", "fill missing").
- Generate JavaScript code to perform the modification on \`appState.datasets[appState.activeDataset].data\`.
- Your response MUST be a JSON object with \`"type": "action"\`.

---
**GROUND TRUTH DATASET SUMMARY & CONTEXT:**
- **Filename:** ${activeDataset}
- **Total Rows:** ${datasetSummary.totalRows}
- **Column Details:**
${JSON.stringify(datasetSummary.summary, null, 2)}
- **Data Sample (for format reference ONLY):**
${JSON.stringify(dataSample, null, 2)}

---
**USER'S QUERY:**
"${userPrompt}"

---
**REQUIRED JSON OUTPUT FORMAT (Strictly Enforced):**
Respond with ONLY a single, valid JSON object. No other text.

**For ANALYSIS (Example with full options):**
{
  "type": "analysis",
  "explanation": "Your concise, factual analysis. If the plot is invalid, explain why and suggest an alternative.",
  "chart": { 
    "type": "bar",
    "data": { 
      "labels": ["Category A", "Category B"], 
      "datasets": [{"label": "Sales", "data": [100, 150]}] 
    },
    "options": {
      "plugins": { "title": { "text": "Sales by Category" } },
      "scales": {
        "x": { "title": { "text": "Product Category" } },
        "y": { "title": { "text": "Total Sales (in USD)" } }
      }
    }
  },
  "code": ""
}
*Note: For scatter/bubble plots, the 'data' array in datasets should be an array of objects, e.g., [{"x": 10, "y": 20, "r": 5}, ...].*

**For ACTION:**
{
  "type": "action",
  "explanation": "A brief summary of the action the code will perform.",
  "chart": { "type": "none", "data": {}, "options": {} },
  "code": "appState.datasets[appState.activeDataset].data = appState.datasets[appState.activeDataset].data.filter(row => row.age != null);"
}
`;

    // 1. The URL now points to YOUR serverless function
    const requestUrl = '/api/gemini';

    const response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 2. We send the prompt in the body for our serverless function to use
        body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
        }),
    });

    if (!response.ok) {
        const errorBody = await response.json();
        console.error('Error from serverless function:', errorBody);
        throw new Error(`API request failed: ${errorBody.error?.message || 'Unknown error'}`);
    }

    const jsonResponse = await response.json();

    // The rest of the logic to parse the response remains the same
    if (jsonResponse.candidates && jsonResponse.candidates[0].content.parts[0].text) {
        let rawText = jsonResponse.candidates[0].content.parts[0].text;
        try {
            return JSON.parse(rawText);
        } catch (e) {
            console.warn("Direct JSON parsing failed, attempting to extract from text.", e);
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch && jsonMatch[0]) {
                try {
                    return JSON.parse(jsonMatch[0]);
                } catch (e2) {
                    console.error("Failed to parse extracted JSON:", jsonMatch[0]);
                    throw new Error("Imugi returned a malformed response after extraction.");
                }
            } else {
                console.error("Failed to parse JSON response (no JSON object found):", rawText);
                throw new Error("Imugi returned a malformed response.");
            }
        }
    }
    throw new Error("Received an unexpected response structure from the API.");
}