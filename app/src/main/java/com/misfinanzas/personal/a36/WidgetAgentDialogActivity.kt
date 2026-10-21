package com.misfinanzas.personal.a36

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.speech.RecognizerIntent
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale
import kotlin.math.max

/**
 * Actividad Flotante Rápida que se abre directamente sobre la Pantalla de Inicio
 * cuando el usuario toca "💬 Hablar con Agente" o "🎤 Voz" desde el Widget.
 * Permite preguntar "¿Ya registraste la compra?", dictar por voz, registrar gastos
 * o eliminar movimientos viendo los datos relevantes en vivo.
 */
class WidgetAgentDialogActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppRepository.init(applicationContext)
        BankNotificationListener.instance?.scanAllActiveNotifications()

        val autoVoice = intent?.getBooleanExtra(EXTRA_AUTO_VOICE, false) ?: false
        val initialPrompt = intent?.getStringExtra(EXTRA_INITIAL_PROMPT)

        setContent {
            val useLight by AppRepository.useLightTheme.collectAsState()
            MisFinanzasTheme(useLightTheme = useLight) {
                WidgetQuickAgentOverlay(
                    autoStartVoice = autoVoice,
                    initialPrompt = initialPrompt,
                    onClose = {
                        MisFinanzasAppWidgetProvider.updateAllWidgets(applicationContext)
                        finish()
                    },
                    onOpenFullApp = {
                        MisFinanzasAppWidgetProvider.updateAllWidgets(applicationContext)
                        startActivity(
                            Intent(this, MainActivity::class.java).apply {
                                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                            }
                        )
                        finish()
                    }
                )
            }
        }
    }

    companion object {
        const val EXTRA_AUTO_VOICE = "extra_auto_voice"
        const val EXTRA_INITIAL_PROMPT = "extra_initial_prompt"
    }
}

@Composable
fun WidgetQuickAgentOverlay(
    autoStartVoice: Boolean,
    initialPrompt: String?,
    onClose: () -> Unit,
    onOpenFullApp: () -> Unit
) {
    val context = LocalContext.current
    val palette = LocalAppPalette.current

    val transactions by AppRepository.transactions.collectAsState()
    val bills by AppRepository.bills.collectAsState()
    val salaryNeto by AppRepository.salaryNeto.collectAsState()
    val blockedDups by AppRepository.blockedDuplicates.collectAsState()

    val ingresosMov = transactions.filter { it.tipo == TxType.GANANCIA }.sumOf { it.monto }
    val totalIngresos = max(salaryNeto, ingresosMov)
    val totalGastos = transactions.filter { it.tipo == TxType.GASTO }.sumOf { it.monto }
    val fijosPend = bills.filter { !it.pagadoEsteMes }.sumOf { it.monto }
    val disponibleReal = totalIngresos - totalGastos - fijosPend
    val lastPurchase = transactions.firstOrNull { it.tipo == TxType.GASTO } ?: transactions.firstOrNull()

    var inputMessage by remember { mutableStateOf("") }
    var voiceStatusHint by remember { mutableStateOf<String?>(null) }

    val messages = remember {
        mutableStateListOf(
            ChatMessageItem(
                id = "w-init",
                sender = "Asesor",
                text = if (lastPurchase != null) {
                    "¡Hola! Desde tu Widget veo que tu última compra registrada es \"${lastPurchase.desc}\" por ${FinancialEngine.formatCop(lastPurchase.monto)} (${lastPurchase.entidad}, ${FinancialEngine.formatTimeAgo(lastPurchase.timestamp)}). ¿Qué deseas verificar o registrar?"
                } else {
                    "¡Hola! Estoy conectado a tu Widget en tiempo real. Pregúntame si ya se registró una compra o dime qué movimiento deseas anotar."
                },
                actionsExecuted = listOf("Escáner y Widget sincronizados en vivo")
            )
        )
    }

    val sendToAgent: (String) -> Unit = { raw ->
        val clean = raw.trim()
        if (clean.isNotEmpty()) {
            BankNotificationListener.instance?.scanAllActiveNotifications()
            messages.add(
                ChatMessageItem(
                    id = "w-u-${System.currentTimeMillis()}",
                    sender = "Tú",
                    text = clean
                )
            )
            val response = ConversationalFinanceAgent.processUserMessage(
                context = context,
                rawInput = clean
            )
            AppRepository.setWidgetAgentReply(context, response.replyText)
            MisFinanzasAppWidgetProvider.updateAllWidgets(context)
            messages.add(
                ChatMessageItem(
                    id = "w-a-${System.currentTimeMillis()}",
                    sender = "Asesor",
                    text = response.replyText,
                    actionsExecuted = response.actionsExecuted
                )
            )
        }
    }

    val speechLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val spoken = result.data
                ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull()
                ?.trim()
            if (!spoken.isNullOrEmpty()) {
                voiceStatusHint = null
                sendToAgent(spoken)
            }
        }
    }

    val triggerVoiceInput: () -> Unit = {
        runCatching {
            val voiceIntent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
                )
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-CO")
                putExtra(
                    RecognizerIntent.EXTRA_PROMPT,
                    "Habla con tu Agente (Ej: ¿Ya registraste la compra? o Gasté 35 mil en almuerzo)"
                )
            }
            speechLauncher.launch(voiceIntent)
        }.onFailure {
            voiceStatusHint = "Dictado por voz no disponible en este dispositivo. Escribe o toca una pregunta rápida abajo."
        }
    }

    LaunchedEffect(Unit) {
        if (!initialPrompt.isNullOrBlank()) {
            sendToAgent(initialPrompt)
        } else if (autoStartVoice) {
            triggerVoiceInput()
        }
    }

    val quickWidgetQuestions = listOf(
        "¿Ya registraste mi última compra?",
        "¿Llegó alguna notificación hoy?",
        "Gasté 35 mil en almuerzo",
        "¿Cuánto disponible real tengo?",
        "Elimina el último gasto"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.35f))
            .clickable(onClick = onClose)
            .padding(horizontal = 14.dp, vertical = 24.dp),
        contentAlignment = Alignment.Center
    ) {
        Surface(
            color = palette.surface,
            shape = RoundedCornerShape(26.dp),
            border = BorderStroke(1.5.dp, palette.primaryAccent.copy(alpha = 0.55f)),
            tonalElevation = 8.dp,
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 520.dp)
                .clickable(enabled = false) { }
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // ENCABEZADO DEL WIDGET INTERACTIVO
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(38.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(palette.primaryAccent),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.AutoAwesome,
                                contentDescription = "Agente del Widget",
                                tint = Color.White,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        Column {
                            Text(
                                text = "Agente en tu Widget",
                                color = palette.textPrimary,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.ExtraBold
                            )
                            Text(
                                text = "Escudo activo ($blockedDups duplicadas bloqueadas)",
                                color = palette.primaryAccent,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        TextButton(onClick = onOpenFullApp) {
                            Text("Abrir App", color = palette.secondaryAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                        IconButton(onClick = onClose, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Default.Close, contentDescription = "Cerrar", tint = palette.textSecondary)
                        }
                    }
                }

                // RESUMEN DE DATOS RELEVANTES EN VIVO DENTRO DEL MODAL DEL WIDGET
                Surface(
                    color = palette.elevated,
                    shape = RoundedCornerShape(16.dp),
                    border = BorderStroke(1.dp, palette.border),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column {
                                Text("DISPONIBLE REAL", color = palette.textSecondary, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                Text(
                                    text = FinancialEngine.formatCop(disponibleReal),
                                    color = palette.primaryAccent,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.ExtraBold
                                )
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text("COMPRAS MES", color = palette.textSecondary, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                Text(
                                    text = FinancialEngine.formatCop(totalGastos),
                                    color = palette.secondaryAccent,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }

                        HorizontalDivider(color = palette.border)

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = if (lastPurchase != null)
                                        "Última compra: ${lastPurchase.desc} (${FinancialEngine.formatCop(lastPurchase.monto)})"
                                    else
                                        "Sin compras registradas hoy",
                                    color = palette.textPrimary,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                if (lastPurchase != null) {
                                    Text(
                                        text = "${lastPurchase.entidad} • ${FinancialEngine.formatTimeAgo(lastPurchase.timestamp)} • ${lastPurchase.categoria}",
                                        color = palette.textSecondary,
                                        fontSize = 11.sp
                                    )
                                }
                            }
                            OutlinedButton(
                                onClick = { sendToAgent("¿Ya registraste mi última compra?") },
                                shape = RoundedCornerShape(10.dp),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                            ) {
                                Text("Verificar", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = palette.primaryAccent)
                            }
                        }
                    }
                }

                if (voiceStatusHint != null) {
                    Text(
                        text = voiceStatusHint ?: "",
                        color = palette.warningAccent,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                // PREGUNTAS RÁPIDAS DESDE EL WIDGET
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(quickWidgetQuestions) { q ->
                        SuggestionChip(
                            onClick = { sendToAgent(q) },
                            label = { Text(q, fontSize = 11.sp) }
                        )
                    }
                }

                // HISTORIAL DE CONVERSACIÓN DEL WIDGET
                Surface(
                    color = palette.bg,
                    shape = RoundedCornerShape(18.dp),
                    border = BorderStroke(1.dp, palette.border),
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 170.dp, max = 260.dp)
                ) {
                    LazyColumn(
                        modifier = Modifier.fillMaxWidth(),
                        contentPadding = PaddingValues(12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(messages, key = { it.id }) { msg ->
                            val isUser = msg.sender == "Tú"
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
                            ) {
                                Surface(
                                    color = if (isUser) palette.primaryAccent else palette.surface,
                                    shape = RoundedCornerShape(14.dp),
                                    border = if (isUser) null else BorderStroke(1.dp, palette.border),
                                    modifier = Modifier.widthIn(max = 280.dp)
                                ) {
                                    Column(
                                        modifier = Modifier.padding(10.dp),
                                        verticalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        msg.actionsExecuted.forEach { act ->
                                            Text(
                                                text = "✓ $act",
                                                color = if (isUser) Color.White else palette.primaryAccent,
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.Bold
                                            )
                                        }
                                        Text(
                                            text = msg.text,
                                            color = if (isUser) Color.White else palette.textPrimary,
                                            fontSize = 12.sp
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // BARRA DE ENTRADA DE TEXTO + BOTÓN DE VOZ
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedIconButton(
                        onClick = triggerVoiceInput,
                        shape = CircleShape,
                        border = BorderStroke(1.dp, palette.primaryAccent),
                        modifier = Modifier
                            .size(44.dp)
                            .testTag("widget_voice_button")
                    ) {
                        Icon(
                            imageVector = Icons.Default.Mic,
                            contentDescription = "Hablar por voz al agente",
                            tint = palette.primaryAccent
                        )
                    }

                    OutlinedTextField(
                        value = inputMessage,
                        onValueChange = { inputMessage = it },
                        placeholder = {
                            Text("Pregunta si ya registró la compra o anota un gasto...", fontSize = 11.sp)
                        },
                        singleLine = true,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .weight(1f)
                            .testTag("widget_agent_input")
                    )

                    Button(
                        onClick = {
                            val q = inputMessage
                            inputMessage = ""
                            sendToAgent(q)
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = palette.primaryAccent,
                            contentColor = Color.White
                        ),
                        shape = RoundedCornerShape(14.dp),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
                        modifier = Modifier.testTag("widget_agent_send")
                    ) {
                        Icon(
                            imageVector = Icons.Default.Send,
                            contentDescription = "Enviar al agente",
                            modifier = Modifier.size(17.dp)
                        )
                    }
                }
            }
        }
    }
}
