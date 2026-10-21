package com.misfinanzas.personal.a36

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.widget.RemoteViews
import kotlin.math.max

/**
 * Widget Nativo de Pantalla de Inicio para Mis Finanzas:
 * - Muestra métricas relevantes en tiempo real (Disponible Real, Compras del Mes, Fijos Pendientes).
 * - Muestra la última compra o notificación detectada con su comercio, monto, banco y tiempo.
 * - Muestra la respuesta en vivo del Agente Financiero directamente dentro del widget.
 * - Permite hablar con el Agente por texto o voz (abriendo una ventana rápida flotante sobre el inicio)
 *   o preguntar en 1 toque "¿Ya registraste mi compra?" sin siquiera abrir toda la app.
 */
class MisFinanzasAppWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        AppRepository.init(context)
        for (appWidgetId in appWidgetIds) {
            updateSingleWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        AppRepository.init(context)

        when (intent.action) {
            ACTION_CHECK_LAST_PURCHASE -> {
                // Escanea notificaciones activas en la barra de estado antes de responder
                BankNotificationListener.instance?.scanAllActiveNotifications()
                val res = ConversationalFinanceAgent.processUserMessage(
                    context = context,
                    rawInput = "¿Ya registraste mi última compra?"
                )
                AppRepository.setWidgetAgentReply(context, res.replyText)
                updateAllWidgets(context)
            }

            ACTION_REFRESH_WIDGET -> {
                BankNotificationListener.instance?.scanAllActiveNotifications()
                val lastTx = AppRepository.transactions.value.firstOrNull()
                val msg = if (lastTx != null) {
                    "Actualizado (${FinancialEngine.formatShortDate(System.currentTimeMillis())}): Última compra en ${lastTx.desc} por ${FinancialEngine.formatCop(lastTx.monto)} (${lastTx.entidad})."
                } else {
                    "Widget sincronizado en tiempo real. Aún no hay compras registradas hoy."
                }
                AppRepository.setWidgetAgentReply(context, msg)
                updateAllWidgets(context)
            }
        }
    }

    companion object {
        const val ACTION_CHECK_LAST_PURCHASE = "com.misfinanzas.personal.a36.ACTION_CHECK_LAST_PURCHASE"
        const val ACTION_REFRESH_WIDGET = "com.misfinanzas.personal.a36.ACTION_REFRESH_WIDGET"

        fun updateAllWidgets(context: Context) {
            runCatching {
                val appContext = context.applicationContext
                val manager = AppWidgetManager.getInstance(appContext)
                val component = ComponentName(appContext, MisFinanzasAppWidgetProvider::class.java)
                val ids = manager.getAppWidgetIds(component)
                if (ids != null && ids.isNotEmpty()) {
                    for (id in ids) {
                        updateSingleWidget(appContext, manager, id)
                    }
                }
            }
        }

        fun requestPinWidget(context: Context): Boolean {
            updateAllWidgets(context)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val appWidgetManager = AppWidgetManager.getInstance(context)
                val myProvider = ComponentName(context, MisFinanzasAppWidgetProvider::class.java)
                if (appWidgetManager.isRequestPinAppWidgetSupported) {
                    val pinnedWidgetCallbackIntent = Intent(context, MainActivity::class.java)
                    val successCallback = PendingIntent.getActivity(
                        context,
                        700,
                        pinnedWidgetCallbackIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                    return appWidgetManager.requestPinAppWidget(myProvider, null, successCallback)
                }
            }
            return false
        }

        private fun updateSingleWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_mis_finanzas)

            val txs = AppRepository.transactions.value
            val bills = AppRepository.bills.value
            val salary = AppRepository.salaryNeto.value
            val blockedDups = AppRepository.blockedDuplicates.value
            val blockedOld = AppRepository.blockedOld.value

            val ingresosMov = txs.filter { it.tipo == TxType.GANANCIA }.sumOf { it.monto }
            val totalIngresos = max(salary, ingresosMov)
            val totalGastos = txs.filter { it.tipo == TxType.GASTO }.sumOf { it.monto }
            val fijosPend = bills.filter { !it.pagadoEsteMes }.sumOf { it.monto }
            val disponibleReal = totalIngresos - totalGastos - fijosPend

            views.setTextViewText(R.id.widget_disponible_value, FinancialEngine.formatCop(disponibleReal))
            views.setTextViewText(R.id.widget_gastos_value, FinancialEngine.formatCop(totalGastos))
            views.setTextViewText(R.id.widget_fijos_value, FinancialEngine.formatCop(fijosPend))

            views.setTextViewText(
                R.id.widget_subtitle_shield,
                "Escudo activo • $blockedDups duplicadas • $blockedOld antiguas omitidas"
            )

            val lastPurchase = txs.firstOrNull { it.tipo == TxType.GASTO } ?: txs.firstOrNull()
            if (lastPurchase != null) {
                val ago = FinancialEngine.formatTimeAgo(lastPurchase.timestamp)
                views.setTextViewText(
                    R.id.widget_last_tx_title,
                    "${lastPurchase.desc} • ${FinancialEngine.formatCop(lastPurchase.monto)}"
                )
                val dupNote = if (lastPurchase.duplicateAlertsCount > 1) {
                    "${lastPurchase.duplicateAlertsCount} avisos fusionados en 1"
                } else {
                    "Compra única verificada"
                }
                views.setTextViewText(
                    R.id.widget_last_tx_meta,
                    "${lastPurchase.entidad} • $ago • $dupNote"
                )
            } else {
                views.setTextViewText(R.id.widget_last_tx_title, "Sin compras registradas aún")
                views.setTextViewText(R.id.widget_last_tx_meta, "Las notificaciones bancarias aparecerán aquí al instante")
            }

            val rawReply = AppRepository.lastWidgetAgentReply.value.replace("\n", " ")
            views.setTextViewText(R.id.widget_agent_reply_text, "Agente: $rawReply")

            val immutableFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

            // 1. Abrir la app principal al tocar el encabezado o las tarjetas de métricas
            val openMainIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val openMainPending = PendingIntent.getActivity(context, 101, openMainIntent, immutableFlags)
            views.setOnClickPendingIntent(R.id.widget_header_container, openMainPending)
            views.setOnClickPendingIntent(R.id.widget_metric_disponible_box, openMainPending)
            views.setOnClickPendingIntent(R.id.widget_metric_gastos_box, openMainPending)
            views.setOnClickPendingIntent(R.id.widget_metric_fijos_box, openMainPending)
            views.setOnClickPendingIntent(R.id.widget_last_purchase_box, openMainPending)

            // 2. Abrir ventana flotante rápida para hablar o escribir al Agente desde el Widget
            val askAgentIntent = Intent(context, WidgetAgentDialogActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(WidgetAgentDialogActivity.EXTRA_AUTO_VOICE, false)
            }
            val askAgentPending = PendingIntent.getActivity(context, 102, askAgentIntent, immutableFlags)
            views.setOnClickPendingIntent(R.id.widget_btn_ask_agent, askAgentPending)
            views.setOnClickPendingIntent(R.id.widget_agent_reply_box, askAgentPending)

            // 3. Abrir ventana flotante activando el micrófono de voz inmediatamente
            val voiceAgentIntent = Intent(context, WidgetAgentDialogActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(WidgetAgentDialogActivity.EXTRA_AUTO_VOICE, true)
            }
            val voiceAgentPending = PendingIntent.getActivity(context, 103, voiceAgentIntent, immutableFlags)
            views.setOnClickPendingIntent(R.id.widget_btn_voice_agent, voiceAgentPending)

            // 4. Botón en 1 toque "¿Registró compra?" (ejecuta análisis directo y actualiza el widget)
            val checkPurchaseIntent = Intent(context, MisFinanzasAppWidgetProvider::class.java).apply {
                action = ACTION_CHECK_LAST_PURCHASE
            }
            val checkPurchasePending = PendingIntent.getBroadcast(context, 104, checkPurchaseIntent, immutableFlags)
            views.setOnClickPendingIntent(R.id.widget_btn_check_purchase, checkPurchasePending)

            // 5. Botón "↻ Escanear" para refrescar notificaciones activas y métricas
            val refreshIntent = Intent(context, MisFinanzasAppWidgetProvider::class.java).apply {
                action = ACTION_REFRESH_WIDGET
            }
            val refreshPending = PendingIntent.getBroadcast(context, 105, refreshIntent, immutableFlags)
            views.setOnClickPendingIntent(R.id.widget_btn_refresh, refreshPending)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
