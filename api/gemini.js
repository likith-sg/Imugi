export default async function handler(request, response) {
  // 1. Check for the POST method
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Only POST method is allowed' });
  }

  // 2. Get the API key from Vercel's Environment Variables
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return response.status(500).json({ error: 'API key is not configured.' });
  }

  // 3. Forward the user's prompt to the Gemini API
  try {
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request.body), // Forward the request body from the client
    });

    if (!geminiResponse.ok) {
      const error = await geminiResponse.json();
      return response.status(geminiResponse.status).json({ error: error });
    }

    const data = await geminiResponse.json();
    return response.status(200).json(data);

  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}
