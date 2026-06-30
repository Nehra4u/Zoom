package com.zoomcontrol.app.zoom

import android.content.Context
import android.util.Log
import com.zoomcontrol.app.api.ZoomCredentials

/**
 * Wraps Zoom Meeting SDK join/leave.
 *
 * After adding mobilertc.aar to app/libs/, implement join using:
 *   JoinMeetingParams params = new JoinMeetingParams();
 *   params.meetingNo = meetingNumber;
 *   params.password = password;
 *   params.customerKey = userId;  // required for admin dashboard webhook mapping
 *   ZoomSDK.getInstance().getMeetingService().joinMeetingWithParams(context, params, options);
 */
class MeetingManager(private val context: Context) {
    private var inMeeting = false

    fun join(credentials: ZoomCredentials, userId: String) {
        Log.i(TAG, "Join meeting ${credentials.meetingNumber} as user $userId (customerKey)")
        // TODO: Uncomment when Zoom Meeting SDK AAR is added — see README.md
        //
        // val sdk = ZoomSDK.getInstance()
        // if (!sdk.isInitialized) throw IllegalStateException("Zoom SDK not initialized")
        // val params = JoinMeetingParams().apply {
        //     meetingNo = credentials.meetingNumber
        //     password = credentials.password
        //     displayName = "Participant"
        //     customerKey = userId
        // }
        // sdk.meetingService.joinMeetingWithParams(context, params, JoinMeetingOptions())
        inMeeting = true
    }

    fun leave() {
        if (!inMeeting) return
        Log.i(TAG, "Leave meeting")
        // ZoomSDK.getInstance().meetingService.leaveCurrentMeeting(false)
        inMeeting = false
    }

    fun isInMeeting(): Boolean = inMeeting

    companion object {
        private const val TAG = "MeetingManager"
    }
}
