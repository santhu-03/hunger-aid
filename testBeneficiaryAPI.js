// Test script to verify the getNearestBeneficiaries API is working
// Run with: node testBeneficiaryAPI.js

const https = require('https');

// Test coordinates (adjust as needed)
const testLat = 28.6139; // Example: New Delhi
const testLng = 77.2090;

const url = `https://us-central1-hungeraid-60fb6.cloudfunctions.net/getNearestBeneficiaries?latitude=${testLat}&longitude=${testLng}`;

console.log('Testing API:', url);
console.log('---');

https.get(url, (resp) => {
  let data = '';

  resp.on('data', (chunk) => {
    data += chunk;
  });

  resp.on('end', () => {
    console.log('Status Code:', resp.statusCode);
    console.log('Response:');
    try {
      const jsonData = JSON.parse(data);
      console.log(JSON.stringify(jsonData, null, 2));
      
      if (jsonData.beneficiaries && jsonData.beneficiaries.length > 0) {
        console.log('\n✅ SUCCESS: Found', jsonData.beneficiaries.length, 'beneficiaries');
        jsonData.beneficiaries.forEach((b, idx) => {
          console.log(`  ${idx + 1}. ${b.name || 'Unnamed'} - ${b.address || 'No address'} (${b.distance.toFixed(2)} km)`);
          console.log(`     Location: ${b.location ? `${b.location.latitude}, ${b.location.longitude}` : 'No location'}`);
        });
      } else if (jsonData.error) {
        console.log('\n❌ ERROR:', jsonData.error);
      } else {
        console.log('\n⚠️  No beneficiaries found');
      }
    } catch (e) {
      console.log('Raw data:', data);
      console.log('\n❌ Failed to parse JSON:', e.message);
    }
  });

}).on('error', (err) => {
  console.log('❌ Error:', err.message);
});
