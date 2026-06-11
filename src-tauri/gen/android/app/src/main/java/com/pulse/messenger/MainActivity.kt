package com.pulse.messenger

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // ember window chrome: bars must match the app background
    window.statusBarColor = android.graphics.Color.parseColor("#1B1916")
    window.navigationBarColor = android.graphics.Color.parseColor("#1B1916")
    requestNeededPermissions()
  }

  /**
   * The WebView silently denies getUserMedia (voice messages, calls,
   * QR scanning) unless the app itself holds these permissions.
   */
  private fun requestNeededPermissions() {
    val wanted = mutableListOf(
      Manifest.permission.RECORD_AUDIO,
      Manifest.permission.CAMERA,
    )
    if (Build.VERSION.SDK_INT >= 33) {
      wanted.add(Manifest.permission.POST_NOTIFICATIONS)
    }
    val missing = wanted.filter {
      ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
    }
    if (missing.isNotEmpty()) {
      ActivityCompat.requestPermissions(this, missing.toTypedArray(), 1001)
    }
  }
}
