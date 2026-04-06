// generateToken.js
const jwt = require('jsonwebtoken');

// Replace with your secret key or load it from environment variables
const SECRET_KEY = process.env.JWT_SECRET || 'test-secret-key';

const generateToken = (userId) => {
  const payload = { id: userId};
  const options = { expiresIn: '365d' }; // Token expiration time

  return jwt.sign(payload, SECRET_KEY, options);
};

// Get user ID from command line arguments
const userId = process.argv[2];

if (!userId) {
  console.error('Please provide a user ID as an argument.');
  process.exit(1);
}

const token = generateToken(userId);
console.log('Generated JWT Token:', token);