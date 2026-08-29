import { AccessToken } from 'livekit-server-sdk';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config({ path: '.env.local' });

type TokenRequest = {
  participant_name: string;
  room_name?: string;
  participant_identity?: string;
  participant_metadata?: string;
  participant_attributes?: Record<string, string>;
};

async function createToken(request: TokenRequest) {
  const roomName = request.room_name ?? `room-${crypto.randomUUID()}`;
  const participantIdentity = request.participant_identity ?? request.participant_name;

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set');
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    ttl: '24h',
    metadata: request.participant_metadata,
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  });

  if (request.participant_attributes) {
    at.attributes = request.participant_attributes;
  }

  return at.toJwt();
}

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/createToken', async (req, res) => {
  try {
    const body = req.body as TokenRequest;

    if (!body.participant_name) {
      return res.status(400).json({ error: 'participant_name is required' });
    }

    const token = await createToken(body);

    res.status(200).json({
      server_url: process.env.LIVEKIT_URL,
      participant_token: token,
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`📋 POST http://localhost:${port}/createToken`);
});
