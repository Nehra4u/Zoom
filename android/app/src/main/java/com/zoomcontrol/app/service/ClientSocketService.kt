package com.zoomcontrol.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.zoomcontrol.app.Config
import com.zoomcontrol.app.R
import com.zoomcontrol.app.api.ApiClient
import com.zoomcontrol.app.api.ZoomCredentials
import com.zoomcontrol.app.ui.MainActivity
import com.zoomcontrol.app.zoom.MeetingManager
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.net.URI

class ClientSocketService : Service() {
    private var socket: Socket? = null
    private val api = ApiClient()
    private lateinit var meetingManager: MeetingManager

    private var accessToken: String? = null
    private var userId: String? = null

    override fun onCreate() {
        super.onCreate()
        meetingManager = MeetingManager(this)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        accessToken = intent?.getStringExtra(EXTRA_ACCESS_TOKEN)
        userId = intent?.getStringExtra(EXTRA_USER_ID)

        if (accessToken.isNullOrBlank() || userId.isNullOrBlank()) {
            stopSelf()
            return START_NOT_STICKY
        }

        startForeground(NOTIFICATION_ID, buildNotification(getString(R.string.socket_disconnected)))
        connectSocket(accessToken!!)
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        meetingManager.leave()
        socket?.disconnect()
        socket?.off()
        super.onDestroy()
    }

    private fun connectSocket(token: String) {
        socket?.disconnect()
        socket?.off()

        val options = IO.Options.builder()
            .setAuth(mapOf("token" to token))
            .setTransports(arrayOf("websocket"))
            .build()

        socket = IO.socket(URI.create("${Config.WS_BASE}/client"), options).apply {
            on(Socket.EVENT_CONNECT) {
                Log.i(TAG, "Socket connected")
                updateNotification(getString(R.string.socket_connected))
                broadcastState(Broadcast.CONNECTED, null)
            }
            on(Socket.EVENT_DISCONNECT) {
                Log.i(TAG, "Socket disconnected")
                updateNotification(getString(R.string.socket_disconnected))
                broadcastState(Broadcast.DISCONNECTED, null)
            }
            on("SESSION_STARTED") { args ->
                val payload = args.firstOrNull() as? JSONObject
                Log.i(TAG, "SESSION_STARTED $payload")
                broadcastState(Broadcast.SESSION_STARTED, payload?.optString("meetingNumber"))
                joinMeeting()
            }
            on("REJOIN_ALLOWED") { _ ->
                joinMeeting()
            }
            on("FORCE_LEAVE") { args ->
                val payload = args.firstOrNull() as? JSONObject
                val reason = payload?.optString("reason") ?: "removed"
                Log.i(TAG, "FORCE_LEAVE reason=$reason")
                meetingManager.leave()
                broadcastState(Broadcast.FORCE_LEAVE, reason)
            }
            on("session:ended") { _ ->
                Log.i(TAG, "session:ended")
                meetingManager.leave()
                broadcastState(Broadcast.MEETING_ENDED, null)
            }
            on("STATUS_SYNC") { args ->
                val payload = args.firstOrNull() as? JSONObject
                val isActive = payload?.optBoolean("isActive") ?: true
                if (!isActive && meetingManager.isInMeeting()) {
                    meetingManager.leave()
                    broadcastState(Broadcast.FORCE_LEAVE, "account_deactivated")
                }
            }
            connect()
        }
    }

    private fun joinMeeting() {
        val token = accessToken ?: return
        val uid = userId ?: return
        try {
            val credentials: ZoomCredentials = api.fetchZoomToken(token)
            meetingManager.join(credentials, uid)
            broadcastState(Broadcast.IN_MEETING, credentials.meetingNumber)
        } catch (e: Exception) {
            Log.e(TAG, "Join failed", e)
            broadcastState(Broadcast.ERROR, e.message)
        }
    }

    private fun broadcastState(action: String, extra: String?) {
        val intent = Intent(action).apply {
            setPackage(packageName)
            if (extra != null) putExtra(EXTRA_MESSAGE, extra)
        }
        sendBroadcast(intent)
    }

    private fun buildNotification(text: String): Notification {
        val pending = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setContentIntent(pending)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(text))
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "ZoomControl connection",
                NotificationManager.IMPORTANCE_LOW,
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    object Broadcast {
        const val CONNECTED = "com.zoomcontrol.CONNECTED"
        const val DISCONNECTED = "com.zoomcontrol.DISCONNECTED"
        const val SESSION_STARTED = "com.zoomcontrol.SESSION_STARTED"
        const val IN_MEETING = "com.zoomcontrol.IN_MEETING"
        const val MEETING_ENDED = "com.zoomcontrol.MEETING_ENDED"
        const val FORCE_LEAVE = "com.zoomcontrol.FORCE_LEAVE"
        const val ERROR = "com.zoomcontrol.ERROR"
    }

    companion object {
        private const val TAG = "ClientSocketService"
        private const val CHANNEL_ID = "zoomcontrol_socket"
        private const val NOTIFICATION_ID = 1001
        const val EXTRA_ACCESS_TOKEN = "access_token"
        const val EXTRA_USER_ID = "user_id"
        const val EXTRA_MESSAGE = "message"
    }
}
