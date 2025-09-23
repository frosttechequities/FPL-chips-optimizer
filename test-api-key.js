// Test OpenRouter API key
const API_KEY = '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';

async function testAPIKey() {
  console.log('Testing OpenRouter API key...');

  try {
    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (response.ok) {
      const data = await response.json();
      console.log('✅ API key is valid!');
      console.log('Response data:', data);
    } else {
      const errorText = await response.text();
      console.log('❌ API key test failed');
      console.log('Error response:', errorText);
    }
  } catch (error) {
    console.error('❌ Network error testing API key:', error);
  }
}

testAPIKey();
