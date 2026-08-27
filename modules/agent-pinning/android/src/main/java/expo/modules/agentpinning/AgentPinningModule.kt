package expo.modules.agentpinning

import android.util.Base64
import com.facebook.react.modules.network.CustomClientBuilder
import com.facebook.react.modules.websocket.WebSocketModule
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

/**
 * Accepts the agent's certificate when its public key matches the pin handed
 * over at pairing, and refuses it otherwise.
 *
 * This is a trust manager rather than an OkHttp CertificatePinner on purpose.
 * CertificatePinner runs after the chain has been validated, so a self-signed
 * certificate is rejected during the handshake and the pin is never consulted —
 * documented OkHttp behaviour, and the most common way this goes wrong.
 *
 * The key is pinned rather than the certificate because the agent reissues its
 * certificate whenever its host changes network, while keeping the key. Pinning
 * the certificate would break on every reissue.
 */
internal class PinnedTrustManager(private val expectedPin: String) : X509TrustManager {
  override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
    val leaf = chain.firstOrNull() ?: throw CertificateException("agent presented no certificate")

    // PublicKey.getEncoded() is already SPKI DER, which is what the agent hashes.
    val digest = MessageDigest.getInstance("SHA-256").digest(leaf.publicKey.encoded)
    val pin = "sha256/" + Base64.encodeToString(digest, Base64.NO_WRAP)

    if (pin != expectedPin) {
      throw CertificateException("agent key pin mismatch")
    }
  }

  // The agent never asks the device for a certificate.
  override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = Unit

  override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
}

internal class PinningClientBuilder(private val pin: String) : CustomClientBuilder {
  override fun apply(builder: OkHttpClient.Builder) {
    val trustManager = PinnedTrustManager(pin)
    val sslContext = SSLContext.getInstance("TLS")
    sslContext.init(null, arrayOf<X509TrustManager>(trustManager), SecureRandom())

    builder.sslSocketFactory(sslContext.socketFactory, trustManager)

    // Hostname verification is deliberately left at the default. The agent's
    // certificate carries its hostnames and LAN addresses as SANs, so ordinary
    // verification passes for any address it is reached at, and a mismatch is
    // worth surfacing rather than suppressing.
  }
}

/**
 * Accepts whatever the agent presents, for a pairing that has no pin yet.
 *
 * Only reachable when the caller asked for an unpinned pairing: the PIN is what
 * authorizes the exchange in that case, and the app reports the result as
 * unverified rather than as a pairing.
 */
internal class AcceptAnyTrustManager : X509TrustManager {
  override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) = Unit
  override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = Unit
  override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
}

class AgentPinningModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AgentPinning")

    Property("isSupported") { true }

    // React Native's WebSocket does not go through OkHttpClientProvider — its
    // module builds an OkHttpClient of its own — so the client customization
    // that covers fetch does not reach a WebSocket. setCustomClientBuilder is
    // the hook that does.
    Function("setPin") { pin: String? ->
      WebSocketModule.setCustomClientBuilder(pin?.let { PinningClientBuilder(it) })
    }

    // Pairing is a one-off POST that has to be verified by the same pin the
    // socket is, and it happens before any pin is stored — so it cannot go
    // through setPin, and RN's fetch has no per-request trust hook. This builds
    // a client for this one request and throws it away.
    AsyncFunction("postPinned") { url: String, pin: String?, body: String ->
      val builder = OkHttpClient.Builder()
        .connectTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)

      // A null pin is a deliberate trust-on-first-use pairing, which still has
      // to reach an agent serving a certificate nothing here signed.
      val trustManager = if (pin != null) PinnedTrustManager(pin) else AcceptAnyTrustManager()
      val sslContext = SSLContext.getInstance("TLS")
      sslContext.init(null, arrayOf<X509TrustManager>(trustManager), SecureRandom())
      builder.sslSocketFactory(sslContext.socketFactory, trustManager)

      // The agent's certificate names its hostnames and LAN addresses, but a
      // device reaching it by an address the certificate does not carry is a
      // working setup: the key pin is the identity check here, and hostname
      // verification would refuse before it is consulted.
      builder.hostnameVerifier { _, _ -> true }

      val request = Request.Builder()
        .url(url)
        .post(body.toRequestBody(JSON_MEDIA_TYPE))
        .build()

      builder.build().newCall(request).execute().use { response ->
        mapOf(
          "status" to response.code,
          "body" to (response.body?.string() ?: ""),
        )
      }
    }
  }

  private companion object {
    const val TIMEOUT_SECONDS = 15L
    val JSON_MEDIA_TYPE = "application/json".toMediaType()
  }
}
