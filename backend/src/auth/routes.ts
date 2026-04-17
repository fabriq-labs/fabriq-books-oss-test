import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { errorHandler } from '../rest/middleware/errorHandler';
import logger from '../utils/logger';

const authRouter = Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

// Login endpoint
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email
    const user = await prisma.user.findFirst({
      where: { email: email },
      include: {
        role_users: {
          include: {
            role: true
          }
        }
      }
    }) as any;

    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        sub: user.external_id,  // Use email as external ID for database lookup
        email: user.email,
        name: user.name,
        roles: user.role_users.map((ur: { role: { name: string } }) => ur.role.name)
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Return user info and token
    res.json({
      user: {
        id: user.external_id,
        name: user.name,
        email: user.email,
        roles: user.role_users.map((ur: { role: { name: string } }) => ur.role.name)
      },
      token
    });
  } catch (error) {
    logger.error('Login error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register endpoint
authRouter.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: { email: email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email: email,
        external_id: email,
        password: hashedPassword,
        auth_provider: 'local'
      }
    });

    // Generate JWT token
    const token = jwt.sign(
      { 
        sub: user.id,
        email: user.email
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Return user info and token
    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      },
      token
    });
  } catch (error) {
    logger.error('Registration error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

  // Development-only token generation endpoint
  if (process.env.NODE_ENV !== 'production') {
    authRouter.post('/generate-token', (req, res) => {
      try {
        const { userId } = req.body;
        if (!userId) {
          return res.status(400).json({ error: 'User ID is required' });
        }

        const token = jwt.sign(
          { id: userId },
          process.env.JWT_SECRET || 'test-secret-key',
          { expiresIn: '365d' }
        );

        res.json({ token });
      } catch (error) {
        logger.error('Token generation error:', error);
        res.status(500).json({ error: 'Failed to generate token' });
      }
    });
  }

/** Generate, persist (bcrypt hash), and return plaintext once for X-API-Key auth. */
async function handleGenerateApiKey(req: Request, res: Response) {
  try {
    const auth = (req as any).context?.auth;
    if (!auth?.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let targetUserId = auth.user.id;
    let targetEmail = auth.user.email;

    // If an email is provided, generate key for that user (admin action)
    if (req.body?.email) {
      const targetUser = await prisma.user.findFirst({
        where: { email: req.body.email },
        select: { id: true, email: true }
      });
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found: ' + req.body.email });
      }
      targetUserId = targetUser.id;
      targetEmail = targetUser.email;
    }

    const apiKey = crypto.randomBytes(32).toString('hex');
    const hashedKey = await bcrypt.hash(apiKey, 10);

    await prisma.user.update({
      where: { id: targetUserId },
      data: { api_key: hashedKey }
    });

    res.json({
      api_key: apiKey,
      email: targetEmail,
      message: 'API key generated for ' + targetEmail + '. Save this key — it cannot be retrieved again.'
    });
  } catch (error) {
    logger.error('API key generation error', { error });
    res.status(500).json({ error: 'Failed to generate API key' });
  }
}

authRouter.post('/generate-api-key', handleGenerateApiKey);

// Apply error handler
authRouter.use(errorHandler);

export default authRouter; 