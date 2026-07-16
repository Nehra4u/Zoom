const BASE = process.env.PROD_API || 'https://zoomcontrol.onrender.com/api';

async function req(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

function decodeJwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

const login = (await req('POST', '/auth/login', {
  email: 'vishal@test1.com',
  password: '123456789',
  device: { deviceId: '2bae7b1d47ae944e' },
})).data;

const home = (await req('POST', '/home', { deviceId: '2bae7b1d47ae944e' }, login.accessToken)).data;
const token = (await req('POST', '/token/zoom', { deviceId: '2bae7b1d47ae944e' }, login.accessToken)).data;

const homeJwt = home.meeting?.jwtToken;
const tokenJwt = token.sdkJwt;

console.log(
  JSON.stringify(
    {
      login: { sdkKey: login.sdkKey, status: login.status },
      home: {
        currentStatus: home.currentStatus,
        meetingId: home.meeting?.meetingId,
        sdkKey: home.meeting?.sdkKey,
        hasJwt: Boolean(homeJwt),
        jwt_mn: homeJwt ? decodeJwtPayload(homeJwt)?.mn : null,
        mismatch: homeJwt
          ? String(home.meeting?.meetingId) !== String(decodeJwtPayload(homeJwt)?.mn)
          : null,
      },
      tokenZoom: {
        sdkKey: token.sdkKey,
        hasJwt: Boolean(tokenJwt),
        jwt_mn: tokenJwt ? decodeJwtPayload(tokenJwt)?.mn : null,
        code: token.code,
        error: token.error,
      },
    },
    null,
    2
  )
);
