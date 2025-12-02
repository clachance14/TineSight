import { readFileSync } from 'fs'

// Parse .env.local
const envFile = readFileSync('.env.local', 'utf-8')
const env = {}
envFile.split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) {
    env[key.trim()] = value.join('=').trim().replace(/\r/g, '').replace(/^["']|["']$/g, '')
  }
})

const token = env.REPLICATE_API_TOKEN

// Check account
const response = await fetch('https://api.replicate.com/v1/account', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})

const data = await response.json()
console.log('Account status:', JSON.stringify(data, null, 2))

// Try a simple prediction to test rate limits
console.log('\nTesting prediction creation...')
const predResponse = await fetch('https://api.replicate.com/v1/predictions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    version: 'cd30d71e39a456a2b43580b03c199bb305200e7c62b0054d8c9014c4e11e7259',
    input: {
      image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Pale_Blue_Dot.png/220px-Pale_Blue_Dot.png',
      conf: 0.1
    }
  })
})

const predData = await predResponse.json()
console.log('Prediction response:', predResponse.status)
console.log('Full response:', JSON.stringify(predData, null, 2))
