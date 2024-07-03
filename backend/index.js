const express = require('express');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Comment = require('./models/Comment');
const chatRoutes = require('./chat');
const { createProxyMiddleware } = require('http-proxy-middleware');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3004;
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
});

const User = mongoose.model('User', userSchema);

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Error registering user' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Error logging in' });
  }
});

app.post('/api/comments', async (req, res) => {
  try {
    const { user, position, content, expiryTime } = req.body;
    const comment = new Comment({ user, position, content, expiryTime });
    await comment.save();
    res.status(201).json({ message: 'Comment saved successfully', comment });
  } catch (error) {
    console.error('Error saving comment:', error);
    res.status(500).json({ error: 'Error saving comment' });
  }
});

app.get('/api/comments', async (req, res) => {
  try {
    const comments = await Comment.find();
    res.json(comments);
  } catch (error) {
    console.error('Error retrieving comments:', error);
    res.status(500).json({ error: 'Error retrieving comments' });
  }
});

app.post('/api/generate-summary', async (req, res) => {
  try {
    const { lat, lng } = req.body;

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-3.5-turbo",
      messages: [{
        role: "user",
        content: `Provide a brief summary of the location at latitude ${lat} and longitude ${lng}. Include information about local business to the coordinates, the sectors surrounding the areas and any interesting places well known by the locals. `
      }],
      max_tokens: 4000
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const summary = response.data.choices[0].message.content;
    res.json({ summary });
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({ error: 'An error occurred while generating the summary.' });
  }
});

app.post('/api/extract-locations', async (req, res) => {
  const { text } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    const openaiResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant that extracts location names from text." },
        { role: "user", content: `Extract all location names from the following text. Respond with only a comma-separated list of locations, nothing else: "${text}"` }
      ],
      temperature: 0.3,
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const locationsString = openaiResponse.data.choices[0].message.content.trim();
    const locations = locationsString.split(',').map(loc => loc.trim()).filter(Boolean);

    res.json({ locations });
  } catch (error) {
    console.error('Error calling OpenAI API:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to extract locations', details: error.message });
  }
});

app.post('/api/find-businesses', async (req, res) => {
  const { query, lat, lng } = req.body;

  if (!query || !lat || !lng) {
    return res.status(400).json({ error: 'Query, latitude, and longitude are required' });
  }

  try {
    const googleResponse = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', {
      params: {
        key: process.env.GOOGLE_MAPS_API_KEY,
        location: `${lat},${lng}`,
        radius: 16093, // 10 miles in meters
        keyword: query
      }
    });

    const businesses = googleResponse.data.results.map(business => ({
      name: business.name,
      description: business.types.join(', '),
      lat: business.geometry.location.lat,
      lng: business.geometry.location.lng,
      address: business.vicinity,
      phone: business.formatted_phone_number || 'N/A'
    }));

    res.json({ businesses });
  } catch (error) {
    console.error('Error finding businesses:', error);
    res.status(500).json({ error: 'Failed to find businesses', details: error.message });
  }
});
app.use('/api/place', createProxyMiddleware({
  target: 'https://maps.googleapis.com',
  changeOrigin: true,
  pathRewrite: {
    '^/api/place': '/maps/api/place'
  },
  onProxyReq: (proxyReq, req, res) => {
    proxyReq.setHeader('Origin', 'https://maps.googleapis.com');
  }
}));

app.get('/api/grid-search', async (req, res) => {
  const { query, lat, lng, radius } = req.query;
  const gridPoints = generateGridPoints(parseFloat(lat), parseFloat(lng), parseFloat(radius));
  
  try {
    const allResults = await fetchGridResults(gridPoints, query);
    res.json({ results: allResults });
  } catch (error) {
    console.error('Error in grid search:', error);
    res.status(500).json({ error: 'An error occurred during the search' });
  }
});

// Helper function to generate grid points
function generateGridPoints(centerLat, centerLng, radiusKm) {
  // Implement grid generation logic here
  // For simplicity, this example creates a 3x3 grid
  const gridSize = 3;
  const stepSize = radiusKm / (gridSize - 1);
  const points = [];

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const lat = centerLat + (i - 1) * stepSize / 111.32; // 1 degree of latitude = 111.32 km
      const lng = centerLng + (j - 1) * stepSize / (111.32 * Math.cos(centerLat * Math.PI / 180));
      points.push({ lat, lng });
    }
  }

  return points;
}

// Helper function to fetch results for each grid point
async function fetchGridResults(gridPoints, query) {
  const allResults = [];
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  for (const point of gridPoints) {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${point.lat},${point.lng}&radius=1000&keyword=${query}&key=${apiKey}`;
    const response = await axios.get(url);
    allResults.push(...response.data.results);
  }

  // Remove duplicates
  const uniqueResults = Array.from(new Set(allResults.map(r => r.place_id))).map(id => allResults.find(r => r.place_id === id));
  
  return uniqueResults.slice(0, 100); // Limit to 100 results
}


// Use the chat routes
app.use('/api', chatRoutes);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
