import { User } from '../models/User.js';
import { UserVoiceRecording } from '../models/UserVoiceRecording.js';
import { assertRegularAdmin, userScopeQuery } from './adminScope.js';
import {
  buildVoiceRecordingKey,
  extensionForMimeType,
  getVoiceRecordingPlayUrl,
  isAllowedAudioMimeType,
  uploadVoiceRecording,
} from './s3Service.js';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

function toPublicRecording(doc) {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    recordedAt: doc.recordedAt,
    durationMs: doc.durationMs,
    fileSizeBytes: doc.fileSizeBytes,
    mimeType: doc.mimeType,
    deviceId: doc.deviceId ?? null,
    createdAt: doc.createdAt,
  };
}

function toPublicUser(user) {
  return {
    id: user._id.toString(),
    username: user.username,
    name: user.name,
    email: user.email ?? null,
    phone: user.phone ?? null,
  };
}

function parseOptionalDate(value, fieldName) {
  if (value == null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const err = new Error(`Invalid ${fieldName}`);
    err.status = 400;
    throw err;
  }
  return date;
}

function parseDurationMs(value) {
  if (value == null || value === '') return 0;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    const err = new Error('Invalid durationMs');
    err.status = 400;
    throw err;
  }
  return Math.round(num);
}

function utcDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatDayLabel(dateKey) {
  const today = utcDateKey(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterday = utcDateKey(yesterdayDate);

  if (dateKey === today) return 'Today';
  if (dateKey === yesterday) return 'Yesterday';

  const [year, month, day] = dateKey.split('-').map(Number);
  const labelDate = new Date(Date.UTC(year, month - 1, day));
  return labelDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function buildUserSearchQuery(q) {
  if (!q) return null;
  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return {
    $or: [{ name: regex }, { email: regex }, { phone: regex }, { username: regex }],
  };
}

function groupRecordingsByUserAndDay(users, recordings) {
  const userById = new Map(users.map((user) => [user._id.toString(), user]));
  const groupedByUser = new Map();

  for (const recording of recordings) {
    const userId = recording.userId.toString();
    if (!userById.has(userId)) continue;

    if (!groupedByUser.has(userId)) {
      groupedByUser.set(userId, new Map());
    }

    const dayKey = utcDateKey(recording.recordedAt);
    const userDays = groupedByUser.get(userId);
    if (!userDays.has(dayKey)) {
      userDays.set(dayKey, []);
    }
    userDays.get(dayKey).push(toPublicRecording(recording));
  }

  const groups = [];

  for (const user of users) {
    const userId = user._id.toString();
    const userDays = groupedByUser.get(userId);
    if (!userDays || userDays.size === 0) continue;

    const days = [...userDays.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, dayRecordings]) => ({
        date,
        label: formatDayLabel(date),
        recordings: dayRecordings.sort(
          (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
        ),
      }));

    const totalRecordings = days.reduce((sum, day) => sum + day.recordings.length, 0);

    groups.push({
      user: toPublicUser(user),
      days,
      totalRecordings,
    });
  }

  groups.sort((a, b) => {
    const aLatest = a.days[0]?.recordings[0]?.recordedAt ?? '';
    const bLatest = b.days[0]?.recordings[0]?.recordedAt ?? '';
    return new Date(bLatest).getTime() - new Date(aLatest).getTime();
  });

  const totalRecordings = groups.reduce((sum, group) => sum + group.totalRecordings, 0);

  return {
    groups,
    totalUsers: groups.length,
    totalRecordings,
  };
}

export async function uploadUserVoiceRecording(client, file, fields = {}) {
  if (!file) {
    const err = new Error('Audio file is required');
    err.status = 400;
    throw err;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const err = new Error('File exceeds maximum size of 25 MB');
    err.status = 413;
    throw err;
  }

  const mimeType = (file.mimetype || 'application/octet-stream').toLowerCase();
  if (!isAllowedAudioMimeType(mimeType)) {
    const err = new Error('Unsupported audio file type');
    err.status = 400;
    throw err;
  }

  const user = await User.findOne({ _id: client.sub, status: { $ne: 'deleted' } });
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  if (user.status !== 'active') {
    const err = new Error('User account is not active');
    err.status = 403;
    throw err;
  }

  const recordedAt = parseOptionalDate(fields.recordedAt, 'recordedAt') ?? new Date();
  const durationMs = parseDurationMs(fields.durationMs);
  const deviceId = fields.deviceId ? String(fields.deviceId).trim().slice(0, 128) : null;
  const key = buildVoiceRecordingKey(user._id.toString(), mimeType);

  const { bucket } = await uploadVoiceRecording({
    key,
    body: file.buffer,
    mimeType,
  });

  const doc = await UserVoiceRecording.create({
    userId: user._id,
    managedBy: user.createdBy,
    s3Key: key,
    s3Bucket: bucket,
    mimeType,
    fileSizeBytes: file.size,
    durationMs,
    recordedAt,
    deviceId,
  });

  return { recording: toPublicRecording(doc) };
}

export async function listUserVoiceRecordings(admin, { q = '', from = null, to = null, userId = null } = {}) {
  assertRegularAdmin(admin);

  const userQuery = {
    status: { $ne: 'deleted' },
    ...userScopeQuery(admin),
  };

  const searchQuery = buildUserSearchQuery(q.trim());
  if (searchQuery) {
    Object.assign(userQuery, searchQuery);
  }

  if (userId) {
    userQuery._id = userId;
  }

  const users = await User.find(userQuery).sort({ name: 1, username: 1 });
  if (users.length === 0) {
    return { groups: [], totalUsers: 0, totalRecordings: 0 };
  }

  const userIds = users.map((user) => user._id);
  const recordingQuery = {
    userId: { $in: userIds },
    managedBy: admin.sub,
  };

  const fromDate = parseOptionalDate(from, 'from');
  const toDate = parseOptionalDate(to, 'to');
  if (fromDate || toDate) {
    recordingQuery.recordedAt = {};
    if (fromDate) recordingQuery.recordedAt.$gte = fromDate;
    if (toDate) recordingQuery.recordedAt.$lte = toDate;
  }

  const recordings = await UserVoiceRecording.find(recordingQuery).sort({ recordedAt: -1 });
  return groupRecordingsByUserAndDay(users, recordings);
}

export async function getUserVoiceRecordingPlayUrl(id, admin) {
  assertRegularAdmin(admin);

  const recording = await UserVoiceRecording.findOne({ _id: id, managedBy: admin.sub });
  if (!recording) {
    const err = new Error('Recording not found');
    err.status = 404;
    throw err;
  }

  const playUrl = await getVoiceRecordingPlayUrl({
    bucket: recording.s3Bucket,
    key: recording.s3Key,
  });

  const ext = extensionForMimeType(recording.mimeType);
  const fileName = `voice-${recording._id.toString()}.${ext}`;

  return {
    playUrl,
    expiresInSeconds: 900,
    fileName,
    mimeType: recording.mimeType,
  };
}
