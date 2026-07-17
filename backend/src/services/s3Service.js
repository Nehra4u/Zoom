import crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const MIME_EXTENSIONS = {
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
};

let s3Client = null;

function getS3Config() {
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET;
  if (!region || !bucket) {
    const err = new Error('AWS S3 is not configured');
    err.status = 503;
    throw err;
  }
  return {
    region,
    bucket,
    prefix: (process.env.AWS_S3_VOICE_PREFIX || 'user-voice/').replace(/\/?$/, '/'),
  };
}

function getS3Client() {
  if (!s3Client) {
    const { region } = getS3Config();
    s3Client = new S3Client({
      region,
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }
  return s3Client;
}

export function isAllowedAudioMimeType(mimeType) {
  if (!mimeType || typeof mimeType !== 'string') return false;
  const normalized = mimeType.toLowerCase().split(';')[0].trim();
  return normalized.startsWith('audio/') && (MIME_EXTENSIONS[normalized] || normalized.startsWith('audio/'));
}

export function extensionForMimeType(mimeType) {
  const normalized = mimeType.toLowerCase().split(';')[0].trim();
  return MIME_EXTENSIONS[normalized] || 'bin';
}

export function buildVoiceRecordingKey(userId, mimeType) {
  const { prefix } = getS3Config();
  const ext = extensionForMimeType(mimeType);
  const id = crypto.randomUUID();
  return `${prefix}${userId}/${id}.${ext}`;
}

export async function uploadVoiceRecording({ key, body, mimeType }) {
  const { bucket } = getS3Config();
  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: mimeType,
    })
  );

  return { bucket, key };
}

export async function getVoiceRecordingPlayUrl({ bucket, key, expiresInSeconds = 900 }) {
  const client = getS3Client();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}
