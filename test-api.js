const fetch = require('node-fetch');

async function testCreateProject() {
  try {
    const response = await fetch('http://localhost:3004/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Acme Corp',
        websiteUrl: 'https://acme.com',
        category: 'SaaS',
        region: 'North America',
        notes: 'Test notes',
      }),
    });

    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log('\nProject created successfully!');
      console.log('Project ID:', data.id);
    } else {
      console.error('Error:', data.error);
    }
  } catch (error) {
    console.error('Fetch error:', error);
  }
}

testCreateProject();