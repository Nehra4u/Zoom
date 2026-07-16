/**
 * Reference implementation for Android APK — copy into your app module.
 *
 * Wire to:
 * - POST /api/home → response.meeting
 * - WebSocket STATUS_SYNC / SESSION_STARTED / USER_ACTIVATED
 * - POST /api/token/zoom fallback when JWT expires
 *
 * See Android_APK_API_Guide.md for full API spec.
 */
package com.zoomcontrol.app.zoom

import android.content.Context

data class MeetingJoinPayload(
    val sdkKey: String?,
    val jwtToken: String,
    val meetingId: String,
    val meetingPassword: String,
    val displayName: String,
)

object ZoomMeetingJoinHelper {

    private var cachedSdkKey: String? = null

    /**
     * Parse meeting object from /api/home or WebSocket event.
     * Always use fresh jwtToken — never cache signatures.
     */
    fun fromApiMap(map: Map<String, Any?>, displayName: String): MeetingJoinPayload? {
        val jwt = map["jwtToken"] as? String ?: return null
        val meetingId = map["meetingId"] as? String ?: map["meetingNumber"] as? String ?: return null
        val password = map["meetingPassword"] as? String ?: map["password"] as? String ?: ""
        val sdkKey = map["sdkKey"] as? String
        return MeetingJoinPayload(sdkKey, jwt, meetingId, password, displayName)
    }

    fun fromZoomTokenResponse(
        sdkKey: String?,
        sdkJwt: String,
        meetingNumber: String,
        password: String,
        displayName: String,
    ): MeetingJoinPayload = MeetingJoinPayload(sdkKey, sdkJwt, meetingNumber, password, displayName)

    fun joinZoomMeeting(context: Context, payload: MeetingJoinPayload) {
        val sdkKey = payload.sdkKey ?: cachedSdkKey
            ?: error("sdkKey missing — cannot initialize Zoom SDK. Check backend ZOOM_SDK_KEY env.")

        cachedSdkKey = sdkKey

        // 1. Initialize SDK once per app session (Zoom Meeting SDK v6+)
        // val initParams = ZoomSDKInitParams().apply { appKey = sdkKey }
        // ZoomSDK.getInstance().initialize(context, initParams)

        // 2. Join with JWT signature — no Zoom account login, no sdkSecret in APK
        // val joinParams = JoinMeetingParams().apply {
        //     meetingNo = payload.meetingId
        //     password = payload.meetingPassword
        //     displayName = payload.displayName
        // }
        // ZoomSDK.getInstance().meetingService.joinMeetingWithParams(
        //     context, joinParams, JoinMeetingOptions(), payload.jwtToken
        // )
    }
}
