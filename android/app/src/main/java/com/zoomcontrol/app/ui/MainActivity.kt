package com.zoomcontrol.app.ui

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.zoomcontrol.app.R
import com.zoomcontrol.app.ZoomControlApp
import com.zoomcontrol.app.api.ApiClient
import com.zoomcontrol.app.api.ApiException
import com.zoomcontrol.app.databinding.ActivityMainBinding
import com.zoomcontrol.app.service.ClientSocketService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private val api = ApiClient()
    private val sessionManager by lazy { (application as ZoomControlApp).sessionManager }

    private val socketReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                ClientSocketService.Broadcast.CONNECTED ->
                    binding.statusText.text = getString(R.string.socket_connected)
                ClientSocketService.Broadcast.DISCONNECTED ->
                    binding.statusText.text = getString(R.string.socket_disconnected)
                ClientSocketService.Broadcast.SESSION_STARTED ->
                    binding.meetingStateText.text = getString(R.string.waiting_for_meeting)
                ClientSocketService.Broadcast.IN_MEETING ->
                    binding.meetingStateText.text = getString(R.string.in_meeting)
                ClientSocketService.Broadcast.MEETING_ENDED ->
                    binding.meetingStateText.text = getString(R.string.meeting_ended)
                ClientSocketService.Broadcast.FORCE_LEAVE -> {
                    val reason = intent.getStringExtra(ClientSocketService.EXTRA_MESSAGE)
                    binding.meetingStateText.text = when (reason) {
                        "account_deactivated" -> getString(R.string.removed_from_call)
                        else -> getString(R.string.removed_from_call)
                    }
                }
                ClientSocketService.Broadcast.ERROR -> {
                    val msg = intent.getStringExtra(ClientSocketService.EXTRA_MESSAGE)
                    Toast.makeText(this@MainActivity, msg ?: "Error", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        sessionManager.userEmail?.let { binding.emailInput.setText(it) }

        binding.loginButton.setOnClickListener { login() }

        if (sessionManager.accessToken != null) {
            showLoggedInUi()
            startSocketService()
        }
    }

    override fun onStart() {
        super.onStart()
        val filter = IntentFilter().apply {
            addAction(ClientSocketService.Broadcast.CONNECTED)
            addAction(ClientSocketService.Broadcast.DISCONNECTED)
            addAction(ClientSocketService.Broadcast.SESSION_STARTED)
            addAction(ClientSocketService.Broadcast.IN_MEETING)
            addAction(ClientSocketService.Broadcast.MEETING_ENDED)
            addAction(ClientSocketService.Broadcast.FORCE_LEAVE)
            addAction(ClientSocketService.Broadcast.ERROR)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(socketReceiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(socketReceiver, filter)
        }
    }

    override fun onStop() {
        unregisterReceiver(socketReceiver)
        super.onStop()
    }

    private fun login() {
        val email = binding.emailInput.text?.toString()?.trim().orEmpty()
        val password = binding.passwordInput.text?.toString().orEmpty()
        if (email.isBlank() || password.isBlank()) {
            Toast.makeText(this, "Email and password required", Toast.LENGTH_SHORT).show()
            return
        }

        binding.loginButton.isEnabled = false
        lifecycleScope.launch {
            try {
                val result = withContext(Dispatchers.IO) { api.login(email, password) }
                sessionManager.accessToken = result.accessToken
                sessionManager.refreshToken = result.refreshToken
                sessionManager.userId = result.userId
                sessionManager.userEmail = email
                showLoggedInUi()
                startSocketService()
                Toast.makeText(this@MainActivity, "Signed in", Toast.LENGTH_SHORT).show()
            } catch (e: ApiException) {
                Toast.makeText(this@MainActivity, e.message, Toast.LENGTH_LONG).show()
            } finally {
                binding.loginButton.isEnabled = true
            }
        }
    }

    private fun showLoggedInUi() {
        binding.emailLayout.visibility = View.GONE
        binding.passwordLayout.visibility = View.GONE
        binding.loginButton.visibility = View.GONE
        binding.meetingStateText.text = getString(R.string.waiting_for_meeting)
    }

    private fun startSocketService() {
        val token = sessionManager.accessToken ?: return
        val userId = sessionManager.userId ?: return
        val intent = Intent(this, ClientSocketService::class.java).apply {
            putExtra(ClientSocketService.EXTRA_ACCESS_TOKEN, token)
            putExtra(ClientSocketService.EXTRA_USER_ID, userId)
        }
        ContextCompat.startForegroundService(this, intent)
    }
}
