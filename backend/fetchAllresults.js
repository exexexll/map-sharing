const fetchAllResults = async (query, lat, lng) => {
    let allResults = [];
    let nextPageToken = null;
    const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
if (!apiKey) {
  console.error('Google Maps API key is not set or not accessible');
  return [];
}
  
    if (!apiKey) {
      console.error('Google Maps API key is not set');
      return allResults;
    }
  
    for (let i = 0; i < 3; i++) {
      const url = nextPageToken
        ? `http://localhost:3004/api/place/nearbysearch/json?pagetoken=${nextPageToken}&key=${apiKey}`
        : `http://localhost:3004/api/place/nearbysearch/json?location=${lat},${lng}&radius=5000&keyword=${encodeURIComponent(query)}&key=${apiKey}`;
  
      try {
        console.log('Fetching URL:', url);
        const response = await axios.get(url);
        const { results, next_page_token } = response.data;
  
        allResults = allResults.concat(results);
        nextPageToken = next_page_token;
  
        if (!nextPageToken) break;
  
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('Error fetching results:', error.response ? error.response.data : error.message);
        break;
      }
    }
  
    return allResults;
  };