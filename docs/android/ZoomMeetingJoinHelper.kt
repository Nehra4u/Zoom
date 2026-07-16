/**
 * Reference implementation for Android APK — copy into your app module.
 *
 * Production interim (old backend): if top-level sdkKey is null, extract appKey/sdkKey
 * from the signed sdkJwt payload — verified on zoomcontrol.onrender.com Jul 2026.
 */
package com.zoomcontrol.app.zoom

import android.content.Context
import android.util.Base64
import org.json.JSONObject

data class MeetingJoinPayload(
    val sdkKey: String?,
    val jwtToken: String,
    val meetingId: String,
    val meetingPassword: String,
    val displayName: String,
)

object ZoomMeetingJoinHelper {

    private var cachedSdkKey: String? = null

    /** Use when API returns sdkKey=null but sdkJwt is present (current production). */
    fun resolveSdkKey(explicitSdkKey: String?, jwt: String): String? {
        if (!explicitSdkKey.isNullOrBlank()) return explicitSdkKey
        cachedSdkKey?.let { return it }
        return extractSdkKeyFromJwt(jwt)?.also { cachedSdkKey = it }
    }

    fun extractSdkKeyFromJwt(jwt: String): String? {
        val parts = jwt.split('.')
        if (parts.size < 2) return null
        return try {
            val json = String(Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING))
            val obj = JSONObject(json)
            obj.optString("sdkKey").takeIf { it.isNotBlank() }
                ?: obj.optString("appKey").takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            null
        }
    }

    fun fromApiMap(map: Map<String, Any?>, displayName: String): MeetingJoinPayload? {
        val jwt = map["jwtToken"] as? String ?: return null
        val meetingId = map["meetingId"] as? String ?: map["meetingNumber"] as? String ?: return null
        val password = map["meetingPassword"] as? String ?: map["password"] as? String ?: ""
        val sdkKey = resolveSdkKey(map["sdkKey"] as? String, jwt)
        return MeetingJoinPayload(sdkKey, jwt, meetingId, password, displayName)
    }

    fun fromZoomTokenResponse(
        sdkKey: String?,
        sdkJwt: String,
        meetingNumber: String,
        password: String,
        displayName: String,
    ): MeetingJoinPayload = MeetingJoinPayload(resolveSdkKey(sdkKey, sdkJwt), sdkJwt, meetingNumber, password, displayName)

    fun joinZoomMeeting(context: Context, payload: MeetingJoinPayload) {
        val sdkKey = resolveSdkKey(payload.sdkKey, payload.jwtToken)
            ?: error("sdkKey missing — call POST /api/token/zoom after login or wait for backend deploy.")

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
