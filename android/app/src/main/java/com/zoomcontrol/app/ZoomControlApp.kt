package com.zoomcontrol.app

import android.app.Application

class ZoomControlApp : Application() {
    lateinit var sessionManager: SessionManager
        private set

    override fun onCreate() {
        super.onCreate()
        sessionManager = SessionManager(this)
    }
}
