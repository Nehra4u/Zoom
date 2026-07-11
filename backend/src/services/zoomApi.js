let cachedToken = null;
let cachedExpiresAt = 0;

function isMockMode() {
  return (
    process.env.ZOOM_MOCK === 'true' ||
    !process.env.ZOOM_ACCOUNT_ID ||
    !process.env.ZOOM_CLIENT_ID ||
    !process.env.ZOOM_CLIENT_SECRET
  );
}

export function zoomConfigured() {
  return !isMockMode() && Boolean(process.env.ZOOM_SDK_KEY && process.env.ZOOM_SDK_SECRET);
}

export async function getZoomAccessToken() {
  if (isMockMode()) {
    return 'mock-zoom-access-token';
  }

  if (cachedToken && Date.now() < cachedExpiresAt - 60_000) {
    return cachedToken;
  }

  const credentials = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');

  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zoom OAuth failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  cachedExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

function getHostUserId(overrideHostUserId) {
  const hostId = overrideHostUserId || process.env.ZOOM_HOST_USER_ID;
  if (!hostId) {
    throw new Error('ZOOM_HOST_USER_ID is not configured');
  }
  return hostId;
}

function encodeMeetingUuid(uuid) {
  if (uuid.includes('/')) {
    return encodeURIComponent(encodeURIComponent(uuid));
  }
  return encodeURIComponent(uuid);
}

export function normalizeMeetingNumber(meetingNumber) {
  const digits = String(meetingNumber ?? '').replace(/\D/g, '');
  if (!digits) {
    const err = new Error('Invalid meeting number');
    err.status = 400;
    throw err;
  }
  return digits;
}

export async function verifyMeetingExists(meetingNumber) {
  if (isMockMode()) {
    return { id: normalizeMeetingNumber(meetingNumber), mock: true };
  }

  const normalized = normalizeMeetingNumber(meetingNumber);
  const token = await getZoomAccessToken();
  const response = await fetch(`https://api.zoom.us/v2/meetings/${normalized}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zoom verify meeting failed: ${response.status} ${text}`);
  }

  return response.json();
}

export async function createInstantMeeting({ topic = 'ZoomControl Session', hostUserId = null } = {}) {
  if (isMockMode()) {
    throw new Error('createInstantMeeting called in mock mode');
  }

  const token = await getZoomAccessToken();
  const zoomHostId = getHostUserId(hostUserId);

  const response = await fetch(`https://api.zoom.us/v2/users/${zoomHostId}/meetings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic,
      type: 1,
      settings: {
        join_before_host: true,
        waiting_room: false,
        auto_recording: 'cloud',
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zoom create meeting failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const meetingNumber = normalizeMeetingNumber(data.id);
  return {
    meetingNumber,
    password: data.password ?? '',
    zoomMeetingUuid: data.uuid,
    zoomMeetingId: meetingNumber,
    topic: data.topic,
    startUrl: data.start_url ?? null,
    joinUrl: data.join_url ?? null,
  };
}

export async function endMeeting(meetingId) {
  if (isMockMode()) return;

  const token = await getZoomAccessToken();
  const encoded = encodeMeetingUuid(String(meetingId));

  const response = await fetch(`https://api.zoom.us/v2/meetings/${encoded}/status`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'end' }),
  });

  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Zoom end meeting failed: ${response.status} ${text}`);
  }
}

export async function removeLiveParticipant(meetingId, participantId) {
  if (isMockMode()) return;

  const token = await getZoomAccessToken();
  const encodedMeeting = encodeMeetingUuid(String(meetingId));

  const response = await fetch(
    `https://api.zoom.us/v2/meetings/${encodedMeeting}/participants/${participantId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Zoom remove participant failed: ${response.status} ${text}`);
  }
}

export async function muteLiveParticipant(meetingId, participantId, mute) {
  if (isMockMode()) return;

  const token = await getZoomAccessToken();
  const encodedMeeting = encodeMeetingUuid(String(meetingId));

  const response = await fetch(
    `https://api.zoom.us/v2/live_meetings/${encodedMeeting}/participants/${participantId}/status`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: mute ? 'mute' : 'unmute' }),
    }
  );

  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Zoom mute participant failed: ${response.status} ${text}`);
  }
}

export async function fetchMeetingRecordings(meetingId) {
  if (isMockMode()) {
    return {
      uuid: meetingId,
      id: meetingId,
      topic: 'Mock Meeting Recording',
      start_time: new Date().toISOString(),
      duration: 30,
      recording_play_passcode: 'mock-passcode',
      recording_files: [
        {
          id: `mock-rec-${meetingId}`,
          meeting_id: meetingId,
          recording_start: new Date().toISOString(),
          recording_end: new Date().toISOString(),
          file_type: 'MP4',
          file_size: 1024000,
          play_url: 'https://example.com/mock-recording.mp4',
          download_url: 'https://example.com/mock-recording.mp4',
          status: 'completed',
        },
      ],
    };
  }

  const token = await getZoomAccessToken();
  const encodedId = encodeMeetingUuid(String(meetingId));
  const response = await fetch(
    `https://api.zoom.us/v2/meetings/${encodedId}/recordings?include_fields=download_access_token`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zoom recordings fetch failed: ${response.status} ${text}`);
  }

  return response.json();
}

export async function fetchUserRecordings(userId, { from, to, pageSize = 30, nextPageToken = '' } = {}) {
  if (isMockMode()) {
    return {
      from,
      to,
      page_count: 1,
      page_size: pageSize,
      total_records: 1,
      meetings: [
        {
          uuid: 'mock-meeting-uuid',
          id: 123456789,
          topic: 'Mock Synced Recording',
          start_time: new Date().toISOString(),
          duration: 120,
          recording_files: [
            {
              id: 'mock-rec-sync-1',
              meeting_id: '123456789',
              recording_start: new Date().toISOString(),
              recording_end: new Date().toISOString(),
              file_type: 'MP4',
              file_size: 2048000,
              status: 'completed',
            },
          ],
        },
      ],
    };
  }

  const token = await getZoomAccessToken();
  const params = new URLSearchParams({
    from,
    to,
    page_size: String(pageSize),
  });
  if (nextPageToken) {
    params.set('next_page_token', nextPageToken);
  }

  const response = await fetch(
    `https://api.zoom.us/v2/users/${encodeURIComponent(userId)}/recordings?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zoom user recordings fetch failed: ${response.status} ${text}`);
  }

  return response.json();
}

export async function deleteCloudRecordingFile(meetingId, recordingId) {
  if (isMockMode()) return { deleted: true, mock: true };

  const token = await getZoomAccessToken();
  const encodedMeeting = encodeMeetingUuid(String(meetingId));
  const response = await fetch(
    `https://api.zoom.us/v2/meetings/${encodedMeeting}/recordings/${encodeURIComponent(recordingId)}?action=delete`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (response.status === 404) return { deleted: false, notFound: true };

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zoom delete recording failed: ${response.status} ${text}`);
  }

  return { deleted: true };
}

export async function deleteAllCloudRecordingsForMeeting(meetingId) {
  if (isMockMode()) return { deleted: true, mock: true };

  const token = await getZoomAccessToken();
  const encodedMeeting = encodeMeetingUuid(String(meetingId));
  const response = await fetch(
    `https://api.zoom.us/v2/meetings/${encodedMeeting}/recordings?action=delete`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (response.status === 404) return { deleted: false, notFound: true };

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zoom delete meeting recordings failed: ${response.status} ${text}`);
  }

  return { deleted: true };
}

export async function getMeetingCredentials() {
  const { getLiveMeetingCredentials } = await import('./meetingService.js');
  const live = await getLiveMeetingCredentials();
  if (live.meetingNumber) {
    return live;
  }

  return {
    meetingNumber: process.env.ZOOM_MEETING_NUMBER ?? '',
    password: process.env.ZOOM_MEETING_PASSWORD ?? '',
    meetingUuid: null,
  };
}

export { isMockMode };

export async function fetchLiveMeetingParticipants(meetingId) {
  if (isMockMode()) {
    return { participants: [], notLive: false };
  }

  const token = await getZoomAccessToken();
  const encoded = encodeMeetingUuid(String(meetingId));
  const response = await fetch(
    `https://api.zoom.us/v2/metrics/meetings/${encoded}/participants`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (response.status === 404) {
    return { participants: [], notLive: true };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zoom participants fetch failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return { participants: data.participants ?? [], notLive: false };
}

export async function isMeetingLiveOnZoom(meetingId) {
  const { notLive } = await fetchLiveMeetingParticipants(meetingId);
  return !notLive;
}

export async function fetchZoomHostUserId() {
  if (isMockMode()) {
    return process.env.ZOOM_HOST_USER_ID ?? 'mock-host-user-id';
  }

  const token = await getZoomAccessToken();
  const response = await fetch('https://api.zoom.us/v2/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zoom users/me failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.id;
}

export async function listZoomAccountUsers() {
  if (isMockMode()) {
    return [
      {
        id: process.env.ZOOM_HOST_USER_ID ?? 'mock-host-user-id',
        email: 'host@zoomcontrol.local',
        displayName: 'Mock Host',
      },
    ];
  }

  const token = await getZoomAccessToken();
  const users = [];
  let nextPageToken = null;

  do {
    const params = new URLSearchParams({
      status: 'active',
      page_size: '300',
    });
    if (nextPageToken) params.set('next_page_token', nextPageToken);

    const response = await fetch(`https://api.zoom.us/v2/users?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Zoom list users failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    for (const user of data.users ?? []) {
      users.push({
        id: user.id,
        email: user.email ?? null,
        displayName: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || user.id,
      });
    }
    nextPageToken = data.next_page_token ?? null;
  } while (nextPageToken);

  return users;
}

export async function fetchHostZakToken(hostUserId = null) {
  if (isMockMode()) {
    return 'mock-zak-token';
  }

  const token = await getZoomAccessToken();
  const zoomHostId = getHostUserId(hostUserId);
  const response = await fetch(
    `https://api.zoom.us/v2/users/${zoomHostId}/token?type=zak`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zoom ZAK fetch failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.token;
}
