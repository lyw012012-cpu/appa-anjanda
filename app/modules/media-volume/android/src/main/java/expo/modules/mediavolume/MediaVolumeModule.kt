package expo.modules.mediavolume

import android.content.Context
import android.media.AudioManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.ceil

// 앱 알람 소리(expo-audio)는 미디어 볼륨으로 나온다. 미디어 볼륨이 0이면 단계 소리가 무음이라
// 울리는 동안 바닥값까지 올리고 끝나면 되돌린다(I-1 확인 4, 2026-11-20).
class MediaVolumeModule : Module() {
  private fun audio(): AudioManager? =
    appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  override fun definition() = ModuleDefinition {
    Name("MediaVolume")

    // 미디어 볼륨이 최대의 minFraction보다 낮으면 올리고 원래 단계를 돌려준다. 이미 충분하면 -1, 못 바꾸면(AudioManager 없음·예외) -2
    Function("raiseTo") { minFraction: Double ->
      val a = audio()
      if (a == null) {
        -2
      } else {
        val max = a.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val current = a.getStreamVolume(AudioManager.STREAM_MUSIC)
        val target = ceil(max * minFraction).toInt().coerceIn(0, max)
        if (current >= target) {
          -1
        } else {
          runCatching { a.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0) }
            .fold(onSuccess = { current }, onFailure = { -2 })
        }
      }
    }

    Function("restore") { index: Int ->
      runCatching { audio()?.setStreamVolume(AudioManager.STREAM_MUSIC, index, 0) }
      Unit
    }
  }
}
