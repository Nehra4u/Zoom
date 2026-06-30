package com.zoomcontrol.app.api

import com.zoomcontrol.app.Config
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

data class LoginResult(val accessToken: String, val refreshToken: String, val userId: String)

data class ZoomCredentials(
    val sdkJwt: String,
    val meetingNumber: String,
    val password: String,
)

class ApiClient {
    private val client = OkHttpClient()
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    fun login(email: String, password: String): LoginResult {
        val body = JSONObject().apply {
            put("email", email)
            put("password", password)
        }.toString().toRequestBody(jsonType)

        val request = Request.Builder()
            .url("${Config.API_BASE}/auth/login")
            .post(body)
            .build()

        client.newCall(request).execute().use { response ->
            val text = response.body?.string() ?: throw ApiException("Empty response")
            if (!response.isSuccessful) {
                val err = JSONObject(text).optString("error", "Login failed")
                throw ApiException(err)
            }
            val json = JSONObject(text)
            return LoginResult(
                accessToken = json.getString("accessToken"),
                refreshToken = json.getString("refreshToken"),
                userId = json.getJSONObject("user").getString("id"),
            )
        }
    }

    fun fetchZoomToken(accessToken: String): ZoomCredentials {
        val request = Request.Builder()
            .url("${Config.API_BASE}/token/zoom")
            .post("".toRequestBody(jsonType))
            .header("Authorization", "Bearer $accessToken")
            .build()

        client.newCall(request).execute().use { response ->
            val text = response.body?.string() ?: throw ApiException("Empty response")
            if (!response.isSuccessful) {
                val err = JSONObject(text).optString("error", "Token request failed")
                throw ApiException(err)
            }
            val json = JSONObject(text)
            return ZoomCredentials(
                sdkJwt = json.getString("sdkJwt"),
                meetingNumber = json.getString("meetingNumber"),
                password = json.optString("password", ""),
            )
        }
    }
}

class ApiException(message: String) : Exception(message)
