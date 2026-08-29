import { VercelRequest, VercelResponse } from '@vercel/node';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import crypto from 'crypto';

type TokenRequest = {
  participant_name: string;
  room_name?: string;
  participant_identity?: string;
  participant_metadata?: string;
};

// Функция для создания комнаты через Server API
async function ensureRoomExists(roomName: string) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const host = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !host) {
    throw new Error('LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL must be set');
  }

  // Убираем 'wss://' из URL для создания клиента RoomServiceClient
  const hostUrl = host.replace('wss://', 'https://');
  
  const roomService = new RoomServiceClient(hostUrl, apiKey, apiSecret);

  try {
    // Пытаемся создать комнату. Если она уже существует, API вернет ошибку, которую мы проглотим.
    await roomService.createRoom({
      name: roomName,
      emptyTimeout: 10 * 60, // Комната будет жить 10 минут после ухода последнего участника
      maxParticipants: 20,
    });
    console.log(`✅ Комната ${roomName} успешно создана или уже существует.`);
  } catch (error: any) {
    // Если ошибка говорит о том, что комната уже есть, это нормально.
    if (error.message && error.message.includes('already exists')) {
      console.log(`ℹ️ Комната ${roomName} уже существует.`);
    } else {
      console.error(`❌ Ошибка при создании комнаты ${roomName}:`, error);
      // Пробрасываем ошибку дальше, чтобы клиент получил понятный ответ.
      throw new Error(`Failed to create room: ${error.message}`);
    }
  }
}

async function createToken(request: TokenRequest) {
  // Используем имя комнаты из запроса или генерируем новое, если его нет.
  // Для теста можно использовать фиксированное имя: const roomName = "test-room-2026";
  const roomName = request.room_name ?? `room-${crypto.randomUUID()}`;
  const participantIdentity = request.participant_identity ?? request.participant_name;

  // 1. Убеждаемся, что комната существует
  await ensureRoomExists(roomName);

  // 2. Генерируем токен для участника
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

  return at.toJwt();
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Настройки CORS
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
  } catch (error: any) {
    console.error('Error generating token:', error);
    return res.status(500).json({ error: 'Failed to generate token', details: error.message });
  }
}
