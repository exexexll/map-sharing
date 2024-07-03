const express = require('express');
const axios = require('axios');
const router = express.Router();

router.post('/openai-chat', async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-3.5-turbo",
      messages: [
        ...history.map((msg, index) => ({
          role: index % 2 === 0 ? 'user' : 'assistant',
          content: msg
        })),
        { role: 'user', content: message }
      ],
      max_tokens: 1000,
      temperature: 0.9,
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const aiMessage = response.data.choices[0].message.content.trim();
    res.json({ message: aiMessage });
  } catch (error) {
    console.error('Error calling OpenAI API:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to communicate with AI', details: error.message });
  }
});
router.post('/extract-locations', async (req, res) => {
    const { text } = req.body;
    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a helpful assistant that extracts location names from text." },
          { role: "user", content: `Extract all location names from the following text: "${text}"` }
        ],
        temperature: 0.3,
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
  
      const locations = response.data.choices[0].message.content.split(',').map(loc => loc.trim());
      res.json({ locations });
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      res.status(500).json({ error: 'Failed to extract locations' });
    }
  });

module.exports = router;