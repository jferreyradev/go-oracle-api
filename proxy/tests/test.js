// Test simple del proxy
// node test.js

const PROXY_URL = 'http://localhost:8000';

async function test() {
  console.log(' Testing proxy...\n');

  try {
    // Login
    console.log('1. Login...');
    const loginRes = await fetch(`/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    const { token } = await loginRes.json();
    console.log(' Token:', token.substring(0, 20) + '...\n');

    // API call
    console.log('2. API call...');
    const apiRes = await fetch(`/api/procedures`, {
      headers: { Authorization: `Bearer ` },
    });
    const data = await apiRes.json();
    console.log(' Status:', apiRes.status);
    console.log(' Data:', JSON.stringify(data).substring(0, 100) + '...\n');

    console.log(' All tests passed');
  } catch (error) {
    console.error(' Error:', error.message);
    process.exit(1);
  }
}

test();