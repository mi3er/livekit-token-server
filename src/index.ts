import { VercelRequest, VercelResponse } from '@vercel/node';
import { AccessToken } from 'livekit-server-sdk';
import crypto from 'crypto';

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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body as TokenRequest;

    if (!body.participant_name) {
      return res.status(400).json({ error: 'participant_name is required' });
    }

    const token = await createToken(body);

    return res.status(200).json({
      server_url: process.env.LIVEKIT_URL,
      participant_token: token,
    });
  } catch (error) {
    console.error('Error generating token:', error);
    return res.status(500).json({ error: 'Failed to generate token' });
  }
}
