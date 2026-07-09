/** Backend origin. Empty in local dev so Vite proxy (`/api`, `/socket.io`) is used. */
export const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export const API_PREFIX = API_BASE_URL ? `${API_BASE_URL}/api` : '/api'
