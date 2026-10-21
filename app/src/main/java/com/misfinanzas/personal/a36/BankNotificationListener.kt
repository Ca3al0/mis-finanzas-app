package com.misfinanzas.personal.a36

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.Locale

class BankNotificationListener : NotificationListenerService() {

    companion object {
        var instance: BankNotificationListener? = null
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        instance = this
        AppRepository.init(applicationContext)
        scanAllActiveNotifications()
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        if (instance === this) {
            instance = null
        }
    }

    fun scanAllActiveNotifications() {
        runCatching {
            val active = activeNotifications ?: return
            for (sbn in active) {
                processStatusBarNotification(sbn)
            }
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn != null) {
            processStatusBarNotification(sbn)
        }
    }

    private fun processStatusBarNotification(sbn: StatusBarNotification) {
        runCatching {
            val notif = sbn.notification ?: return
            if ((notif.flags and Notification.FLAG_ONGOING_EVENT) != 0) return
            if ((notif.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return

            val pkg = sbn.packageName ?: ""
            if (pkg == packageName || pkg.contains("systemui") || pkg.contains("providers.downloads")) return

            val postTime = if (sbn.postTime > 0L) sbn.postTime else System.currentTimeMillis()
            val extras = notif.extras ?: return

            val title = (extras.getCharSequence(Notification.EXTRA_TITLE_BIG)
                ?: extras.getCharSequence(Notification.EXTRA_TITLE))?.toString()?.trim().orEmpty()
            val body = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
                ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()?.trim().orEmpty()
            val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()?.trim().orEmpty()

            val fullBody = listOf(body, subText).filter { it.isNotEmpty() }.joinToString(" ").trim()
            if (fullBody.isEmpty()) return

            val fullText = if (title.isEmpty()) fullBody else "$title: $fullBody"
            val low = "$pkg $fullText".lowercase(Locale.ROOT)

            val isFinancial = low.contains("$") || low.contains("cop") || low.contains("compra") ||
                low.contains("recibiste") || low.contains("pagaste") || low.contains("enviaste") ||
                low.contains("nequi") || low.contains("bancolombia") || low.contains("daviplata") ||
                low.contains("nu") || low.contains("nubank") || low.contains("transferencia") ||
                low.contains("abono") || low.contains("davivienda") || low.contains("bbva") ||
                low.contains("lulo") || low.contains("dale") || low.contains("movii") ||
                low.contains("retiro") || low.contains("factura") || low.contains("aprobada") ||
                low.contains("exitosa") || low.contains("consumo") || low.contains("pse")

            if (isFinancial) {
                AppRepository.processIncomingNotification(
                    context = applicationContext,
                    appName = title.ifEmpty { pkg },
                    rawText = fullText,
                    eventTimeMs = postTime
                )
            }
        }
    }
}
