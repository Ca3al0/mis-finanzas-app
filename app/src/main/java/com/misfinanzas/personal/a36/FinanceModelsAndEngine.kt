package com.misfinanzas.personal.a36

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.roundToLong

enum class TxType(val label: String) {
    GASTO("Gasto"),
    GANANCIA("Ingreso")
}

val ALL_CATEGORIES = listOf(
    "Alimentación y Supermercado",
    "Transporte y Gasolina",
    "Vivienda y Servicios",
    "Entretenimiento y Suscripciones",
    "Salud y Bienestar",
    "Educación",
    "Deudas y Créditos",
    "Compras y Ropa",
    "Transferencias y Pagos",
    "Salario / Ingreso Principal",
    "Ingresos Extras",
    "Otros"
)

data class TransactionItem(
    val id: String,
    val desc: String,
    val monto: Long,
    val tipo: TxType,
    val categoria: String,
    val entidad: String,
    val fechaStr: String,
    val timestamp: Long,
    val esAutomatico: Boolean = false,
    val esEsencial: Boolean = true,
    val fingerprint: String = "",
    val duplicateAlertsCount: Int = 1
)

data class RecurringBillItem(
    val id: String,
    val nombre: String,
    val monto: Long,
    val diaPago: Int,
    val categoria: String,
    val pagadoEsteMes: Boolean
)

data class SavingsGoalItem(
    val id: String,
    val nombre: String,
    val montoObjetivo: Long,
    val montoAhorrado: Long,
    val plazoMeses: Int
)

data class CreditCardItem(
    val id: String,
    val nombre: String,
    val entidad: String,
    val cupoTotal: Long,
    val saldoActual: Long,
    val tasaEA: Double,
    val cuotaMinima: Long,
    val diaCorte: Int,
    val diaPago: Int
)

enum class NotifStatus(val label: String) {
    REGISTRADA("Registrada"),
    DUPLICADA("Duplicada Bloqueada"),
    ANTIGUA_OMITIDA("Antigua Omitida")
}

data class NotificationHistoryItem(
    val id: String,
    val textoOriginal: String,
    val resumen: String,
    val monto: Long,
    val tipo: TxType,
    val categoria: String,
    val entidad: String,
    val fechaStr: String,
    val timestamp: Long,
    val status: NotifStatus = NotifStatus.REGISTRADA,
    val motivo: String = "Compra única registrada"
)

enum class CaptureTimeframeMode(val label: String) {
    DESDE_HOY("Solo desde Hoy (00:00)"),
    FECHA_PERSONALIZADA("Elegir Fecha en Calendario"),
    ULTIMOS_DIAS("Últimos Días (1 a 30d)"),
    DESDE_AHORA("Desde Este Momento"),
    TODAS("Todas (Sin límite de fecha)")
}

data class CapturePolicy(
    val ignorarAntiguas: Boolean = true,
    val modoPlazo: CaptureTimeframeMode = CaptureTimeframeMode.DESDE_HOY,
    val timestampCorteMs: Long = startOfTodayMs(),
    val ultimosDias: Int = 7
) {
    fun effectiveCutoffMs(): Long {
        if (!ignorarAntiguas || modoPlazo == CaptureTimeframeMode.TODAS) return 0L
        return when (modoPlazo) {
            CaptureTimeframeMode.DESDE_HOY -> startOfTodayMs()
            CaptureTimeframeMode.ULTIMOS_DIAS -> {
                val cal = Calendar.getInstance()
                cal.add(Calendar.DAY_OF_YEAR, -max(1, ultimosDias))
                cal.set(Calendar.HOUR_OF_DAY, 0)
                cal.set(Calendar.MINUTE, 0)
                cal.set(Calendar.SECOND, 0)
                cal.set(Calendar.MILLISECOND, 0)
                cal.timeInMillis
            }
            CaptureTimeframeMode.FECHA_PERSONALIZADA,
            CaptureTimeframeMode.DESDE_AHORA -> timestampCorteMs
            CaptureTimeframeMode.TODAS -> 0L
        }
    }
}

fun startOfTodayMs(): Long {
    val cal = Calendar.getInstance()
    cal.set(Calendar.HOUR_OF_DAY, 0)
    cal.set(Calendar.MINUTE, 0)
    cal.set(Calendar.SECOND, 0)
    cal.set(Calendar.MILLISECOND, 0)
    return cal.timeInMillis
}

data class CategoryImpact(
    val categoria: String,
    val total: Long,
    val count: Int,
    val promedio: Long,
    val porcentaje: Float,
    val rank: Int,
    val colorHex: Long
)

data class ChatMessageItem(
    val id: String,
    val sender: String, // "Tú" o "Asesor"
    val text: String,
    val actionsExecuted: List<String> = emptyList(),
    val timestampStr: String = FinancialEngine.formatShortDate(System.currentTimeMillis())
)

// ============================================================================
// MOTOR DE INTELIGENCIA FINANCIERA, PARSER DE NOTIFICACIONES Y ANTI-DUPLICADOS
// ============================================================================
object FinancialEngine {

    fun formatCop(amount: Long): String {
        val nf = NumberFormat.getCurrencyInstance(Locale("es", "CO"))
        nf.maximumFractionDigits = 0
        return nf.format(amount)
    }

    fun formatShortDate(ms: Long): String {
        val sdf = SimpleDateFormat("dd MMM, hh:mm a", Locale("es", "CO"))
        return sdf.format(Date(ms))
    }

    fun formatTimeAgo(ms: Long): String {
        val diffMin = max(0L, (System.currentTimeMillis() - ms) / 60_000L)
        return when {
            diffMin < 1L -> "hace instantes"
            diffMin < 60L -> "hace $diffMin min"
            diffMin < 1440L -> "hace ${diffMin / 60L} h"
            else -> formatShortDate(ms)
        }
    }

    private val NON_TRANSACTIONAL_PATTERNS = listOf(
        Regex("""c[oó]digo\s+(de\s+)?(seguridad|verificaci[oó]n|din[aá]mico)""", RegexOption.IGNORE_CASE),
        Regex("""clave\s+din[aá]mica""", RegexOption.IGNORE_CASE),
        Regex("""\botp\b""", RegexOption.IGNORE_CASE),
        Regex("""intento\s+de\s+ingreso""", RegexOption.IGNORE_CASE),
        Regex("""iniciaste\s+sesi[oó]n""", RegexOption.IGNORE_CASE)
    )

    fun isTransactionalNotification(rawText: String): Boolean {
        val clean = rawText.trim()
        if (clean.length < 10) return false
        if (NON_TRANSACTIONAL_PATTERNS.any { it.containsMatchIn(clean) }) return false
        val amount = extractAmountFromNotification(clean)
        if (amount < 100L) return false
        val low = clean.lowercase(Locale.ROOT)
        val keywords = listOf(
            "compra", "compraste", "pagaste", "pago", "transferencia", "transferiste",
            "enviaste", "recibiste", "retiro", "retiraste", "abono", "débito", "debito",
            "crédito", "credito", "nequi", "bancolombia", "daviplata", "davivienda",
            "nu ", "nubank", "pse", "transfiya", "aprobada", "exitosa", "valor", "$"
        )
        return keywords.any { low.contains(it) }
    }

    /**
     * Extrae montos tanto en formato bancario ($45.000, $1.250.000,00) como en
     * lenguaje natural ("45 mil", "1.2 millones", "80k", "50 lucas", "2 palos").
     */
    fun extractNaturalOrBankAmount(rawText: String): Long {
        val low = rawText.lowercase(Locale.ROOT)

        // 1. Expresiones naturales en español ("3.5 millones", "2 millones", "1 palo")
        val millionRegex = Regex("""(\d+(?:[.,]\d+)?)\s*(millones|mill[oó]n|palos|palo)\b""")
        val mMatch = millionRegex.find(low)
        if (mMatch != null) {
            val num = mMatch.groupValues[1].replace(',', '.').toDoubleOrNull() ?: 0.0
            if (num > 0) return (num * 1_000_000.0).roundToLong()
        }

        // 2. Expresiones en miles ("45 mil", "120k", "50 lucas", "50 lukas")
        val thousandRegex = Regex("""(\d+(?:[.,]\d+)?)\s*(mil|k|lucas|lukas)\b""")
        val kMatch = thousandRegex.find(low)
        if (kMatch != null) {
            val num = kMatch.groupValues[1].replace(',', '.').toDoubleOrNull() ?: 0.0
            if (num > 0) return (num * 1_000.0).roundToLong()
        }

        return extractAmountFromNotification(rawText)
    }

    fun extractAmountFromNotification(rawText: String): Long {
        val text = rawText.replace('\u00A0', ' ')
        val currencyRegex = Regex(
            """(?:\$\s*|COP\s*|USD\s*|valor\s*(?:de)?\s*\$?\s*|por\s*\$?\s*)(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d{4,12}(?:[.,]\d{1,2})?)""",
            RegexOption.IGNORE_CASE
        )
        val candidates = mutableListOf<Long>()
        currencyRegex.findAll(text).forEach { m ->
            val parsed = parseColombianNumber(m.groupValues[1])
            if (parsed in 100L..500_000_000L) candidates.add(parsed)
        }
        if (candidates.isNotEmpty()) return candidates.first()

        val genericRegex = Regex("""\b(\d{1,3}(?:\.\d{3})+|\d{4,9})\b""")
        genericRegex.findAll(text).forEach { m ->
            val parsed = parseColombianNumber(m.groupValues[1])
            if (parsed !in 1990L..2035L && parsed in 500L..500_000_000L) {
                candidates.add(parsed)
            }
        }
        return candidates.firstOrNull() ?: 0L
    }

    private fun parseColombianNumber(raw: String): Long {
        var s = raw.trim()
        if (s.matches(Regex(""".*\d+[.,]\d{2}$"""))) {
            s = s.substring(0, s.length - 3)
        }
        val digitsOnly = s.replace(Regex("""[^\d]"""), "")
        return digitsOnly.toLongOrNull() ?: 0L
    }

    fun extractNotificationDateMs(rawText: String, fallbackMs: Long): Long {
        val slashDate = Regex("""\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2}|\d{2})\b""").find(rawText)
        if (slashDate != null) {
            val d = slashDate.groupValues[1].toIntOrNull() ?: 1
            val m = (slashDate.groupValues[2].toIntOrNull() ?: 1) - 1
            var y = slashDate.groupValues[3].toIntOrNull() ?: 2026
            if (y < 100) y += 2000
            if (m in 0..11 && d in 1..31) {
                val cal = Calendar.getInstance()
                cal.set(y, m, d, 12, 0, 0)
                return cal.timeInMillis
            }
        }
        return fallbackMs
    }

    fun detectBankEntity(sourcePkgOrLabel: String, text: String): String {
        val combined = "$sourcePkgOrLabel $text".lowercase(Locale.ROOT)
        return when {
            combined.contains("nequi") -> "Nequi"
            combined.contains("bancolombia") -> "Bancolombia"
            combined.contains("daviplata") -> "DaviPlata"
            combined.contains("davivienda") -> "Davivienda"
            combined.contains("nubank") || combined.contains("nu ") || combined.contains("tarjeta nu") -> "Nu"
            combined.contains("bbva") -> "BBVA"
            combined.contains("lulo") -> "Lulo Bank"
            combined.contains("rappi") -> "RappiPay"
            combined.contains("colpatria") || combined.contains("scotiabank") -> "Colpatria"
            combined.contains("bogota") || combined.contains("bogotá") -> "Banco de Bogotá"
            combined.contains("dale") -> "Dale!"
            combined.contains("movii") -> "MOVii"
            combined.contains("pse") -> "PSE"
            else -> "Banco"
        }
    }

    fun extractCleanMerchant(text: String, entidad: String, tipo: TxType): String {
        val clean = text.replace(Regex("""\s+"""), " ").trim()
        val merchantRegex = Regex(
            """(?:compra(?:ste)?\s+en|pagaste\s+en|establecimiento|comercio|transferiste\s+a|enviaste\s+a|recibiste\s+de)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s.&*-]{2,32}?)(?:\s+por\b|\s+valor\b|\s+con\b|\s+el\b|\s+exitos|\.|,|$)""",
            RegexOption.IGNORE_CASE
        )
        val m = merchantRegex.find(clean)
        if (m != null) {
            val candidate = m.groupValues[1].trim()
            if (candidate.length >= 2) {
                return if (tipo == TxType.GANANCIA) "Ingreso $candidate" else "Compra en $candidate"
            }
        }
        return if (tipo == TxType.GANANCIA) "Abono recibido ($entidad)" else "Compra registrada ($entidad)"
    }

    fun categorize(text: String, tipo: TxType): Pair<String, Boolean> {
        if (tipo == TxType.GANANCIA) {
            val low = text.lowercase(Locale.ROOT)
            return if (low.contains("nomina") || low.contains("nómina") || low.contains("salario") || low.contains("sueldo") || low.contains("quincena")) {
                "Salario / Ingreso Principal" to true
            } else {
                "Ingresos Extras" to false
            }
        }
        val low = text.lowercase(Locale.ROOT)
        return when {
            listOf("exito", "éxito", "carulla", "jumbo", "olimpica", "d1", "ara", "alkosto", "mercado", "restaurante", "rappi", "almuerzo", "comida", "cafe", "café", "crepes", "corral", "frisby", "panaderia").any { low.contains(it) } ->
                "Alimentación y Supermercado" to true
            listOf("uber", "didi", "cabify", "indriver", "terpel", "primax", "texaco", "biomax", "gasolina", "peaje", "transmilenio", "metro", "bus", "taxi", "parqueadero").any { low.contains(it) } ->
                "Transporte y Gasolina" to true
            listOf("epm", "enel", "codensa", "vanti", "acueducto", "claro", "movistar", "tigo", "wom", "etb", "arriendo", "administracion", "servicios", "luz", "agua", "internet", "gas").any { low.contains(it) } ->
                "Vivienda y Servicios" to true
            listOf("netflix", "spotify", "disney", "hbo", "prime", "youtube", "cine", "bar", "juego", "playstation", "xbox", "concierto", "salida").any { low.contains(it) } ->
                "Entretenimiento y Suscripciones" to false
            listOf("drogueria", "farmatodo", "cruz verde", "rebaja", "eps", "salud", "medico", "médico", "gym", "smartfit", "bodytech", "gimnasio", "odontologo").any { low.contains(it) } ->
                "Salud y Bienestar" to true
            listOf("universidad", "colegio", "curso", "platzi", "udemy", "libro", "semestre").any { low.contains(it) } ->
                "Educación" to true
            listOf("cuota", "tarjeta", "credito", "crédito", "prestamo", "préstamo").any { low.contains(it) } ->
                "Deudas y Créditos" to true
            listOf("zara", "falabella", "adidas", "nike", "ropa", "zapatos", "amazon", "mercadolibre", "celular", " Audifonos").any { low.contains(it) } ->
                "Compras y Ropa" to false
            else -> "Transferencias y Pagos" to false
        }
    }

    fun normalizeMerchantKey(desc: String): String {
        return desc.lowercase(Locale.ROOT)
            .replace(
                Regex("""\b(compra|compraste|pago|pagaste|transferencia|en|de|el|la|los|las|por|con|exitosa|aprobada|tarjeta|bancolombia|nequi|daviplata|davivienda|nu|bbva|pse|banco|registrada)\b"""),
                " "
            )
            .replace(Regex("""[^a-z0-9]"""), "")
            .take(14)
    }

    fun buildFingerprint(monto: Long, tipo: TxType, desc: String, entidad: String): String {
        val mKey = normalizeMerchantKey(desc).ifEmpty { entidad.lowercase(Locale.ROOT) }
        return "${tipo.name}_${monto}_$mKey"
    }

    fun isDuplicatePurchase(
        candidateAmount: Long,
        candidateType: TxType,
        candidateDesc: String,
        candidateEntity: String,
        candidateTimeMs: Long,
        existing: List<TransactionItem>
    ): TransactionItem? {
        val candMerchant = normalizeMerchantKey(candidateDesc)
        val candEntity = candidateEntity.lowercase(Locale.ROOT).trim()

        for (tx in existing) {
            if (tx.monto != candidateAmount || tx.tipo != candidateType) continue
            val deltaMin = abs(candidateTimeMs - tx.timestamp) / 60_000L
            val exMerchant = normalizeMerchantKey(tx.desc)
            val exEntity = tx.entidad.lowercase(Locale.ROOT).trim()

            val sameMerchant = candMerchant.isNotEmpty() && exMerchant.isNotEmpty() &&
                (candMerchant == exMerchant || candMerchant.contains(exMerchant) || exMerchant.contains(candMerchant))
            val sameEntity = candEntity == exEntity || candEntity == "banco" || exEntity == "banco"

            // Mismo monto dentro de 25 min = aviso repetido de la misma compra (SMS + Push + Email)
            if (deltaMin <= 25L) return tx
            // Mismo monto y mismo comercio/banco dentro de 6 horas = misma compra
            if ((sameMerchant || sameEntity) && deltaMin <= 360L) return tx
        }
        return null
    }

    fun simulateInstallments(monto: Long, cuotas: Int, tasaEA: Double): Triple<Long, Long, Long> {
        if (monto <= 0L || cuotas <= 0) return Triple(0L, 0L, 0L)
        if (cuotas == 1 || tasaEA <= 0.0) return Triple(monto, monto, 0L)
        val mv = (1.0 + tasaEA / 100.0).pow(1.0 / 12.0) - 1.0
        val factor = (mv * (1.0 + mv).pow(cuotas.toDouble())) / ((1.0 + mv).pow(cuotas.toDouble()) - 1.0)
        val cuota = (monto.toDouble() * factor).roundToLong()
        val total = cuota * cuotas
        val intereses = max(0L, total - monto)
        return Triple(cuota, total, intereses)
    }
}

// ============================================================================
// AGENTE CONVERSACIONAL NATURAL CON MEMORIA Y EJECUCIÓN DE ACCIONES EN LA APP
// ============================================================================
sealed class PendingAgentFollowUp {
    data class WaitingAmountForExpense(val desc: String, val entidad: String) : PendingAgentFollowUp()
    data class WaitingAmountForIncome(val desc: String) : PendingAgentFollowUp()
    data class WaitingAmountForSalary(val freq: String) : PendingAgentFollowUp()
    data class WaitingAmountForBill(val billName: String) : PendingAgentFollowUp()
}

data class AgentResponseResult(
    val replyText: String,
    val actionsExecuted: List<String>
)

object ConversationalFinanceAgent {
    private var pendingFollowUp: PendingAgentFollowUp? = null

    fun processUserMessage(
        context: Context,
        rawInput: String,
        onSwitchTheme: ((Boolean) -> Unit)? = null,
        onNavigateTab: ((MainTab) -> Unit)? = null
    ): AgentResponseResult {
        val text = rawInput.trim()
        val low = text.lowercase(Locale.ROOT)
        val actions = mutableListOf<String>()
        val extractedAmount = FinancialEngine.extractNaturalOrBankAmount(text)

        // 1. Verificar si había una pregunta pendiente del turno anterior (Memoria Conversacional)
        val currentFollowUp = pendingFollowUp
        if (currentFollowUp != null && extractedAmount > 0L) {
            pendingFollowUp = null
            when (currentFollowUp) {
                is PendingAgentFollowUp.WaitingAmountForExpense -> {
                    val now = System.currentTimeMillis()
                    val (cat, es) = FinancialEngine.categorize(currentFollowUp.desc, TxType.GASTO)
                    val tx = TransactionItem(
                        id = "tx-agent-$now",
                        desc = currentFollowUp.desc,
                        monto = extractedAmount,
                        tipo = TxType.GASTO,
                        categoria = cat,
                        entidad = currentFollowUp.entidad,
                        fechaStr = FinancialEngine.formatShortDate(now),
                        timestamp = now,
                        esEsencial = es,
                        fingerprint = FinancialEngine.buildFingerprint(extractedAmount, TxType.GASTO, currentFollowUp.desc, currentFollowUp.entidad)
                    )
                    AppRepository.addManualTransaction(context, tx)
                    actions.add("Gasto agregado: ${tx.desc} (${FinancialEngine.formatCop(extractedAmount)})")
                    return AgentResponseResult(
                        replyText = "Perfecto, registré tu gasto de ${FinancialEngine.formatCop(extractedAmount)} en \"${tx.desc}\" (${tx.categoria}). Tus tablas y el gráfico de anillos ya se actualizaron.",
                        actionsExecuted = actions
                    )
                }
                is PendingAgentFollowUp.WaitingAmountForIncome -> {
                    val now = System.currentTimeMillis()
                    val tx = TransactionItem(
                        id = "tx-agent-$now",
                        desc = currentFollowUp.desc,
                        monto = extractedAmount,
                        tipo = TxType.GANANCIA,
                        categoria = "Ingresos Extras",
                        entidad = "Cuenta",
                        fechaStr = FinancialEngine.formatShortDate(now),
                        timestamp = now,
                        esEsencial = false
                    )
                    AppRepository.addManualTransaction(context, tx)
                    actions.add("Ingreso agregado: ${tx.desc} (+${FinancialEngine.formatCop(extractedAmount)})")
                    return AgentResponseResult(
                        replyText = "Listo, sumé el ingreso de ${FinancialEngine.formatCop(extractedAmount)} por \"${tx.desc}\" a tu Disponible Real.",
                        actionsExecuted = actions
                    )
                }
                is PendingAgentFollowUp.WaitingAmountForSalary -> {
                    AppRepository.updateSalary(context, extractedAmount, currentFollowUp.freq)
                    actions.add("Salario actualizado: ${FinancialEngine.formatCop(extractedAmount)} (${currentFollowUp.freq})")
                    return AgentResponseResult(
                        replyText = "Actualicé tu salario base a ${FinancialEngine.formatCop(extractedAmount)} (${currentFollowUp.freq}).",
                        actionsExecuted = actions
                    )
                }
                is PendingAgentFollowUp.WaitingAmountForBill -> {
                    AppRepository.addBill(context, currentFollowUp.billName, extractedAmount, 5, "Vivienda y Servicios")
                    actions.add("Pago fijo creado: ${currentFollowUp.billName} (${FinancialEngine.formatCop(extractedAmount)})")
                    return AgentResponseResult(
                        replyText = "Agregué el pago fijo mensual de \"${currentFollowUp.billName}\" por ${FinancialEngine.formatCop(extractedAmount)}.",
                        actionsExecuted = actions
                    )
                }
            }
        }

        // 2. Ajustes de Tema Visual ("cambia a tema claro", "tema oscuro", "tema carbón")
        if (low.contains("tema claro") || low.contains("modo claro") || low.contains("marfil")) {
            AppRepository.setLightTheme(context, true)
            onSwitchTheme?.invoke(true)
            actions.add("Tema cambiado a Marfil Editorial (Claro)")
            return AgentResponseResult(
                replyText = "Cambié el diseño al tema Marfil Editorial (tonos cálidos claros sin azul oscuro).",
                actionsExecuted = actions
            )
        }
        if (low.contains("tema oscuro") || low.contains("modo oscuro") || low.contains("carbón") || low.contains("carbon")) {
            AppRepository.setLightTheme(context, false)
            onSwitchTheme?.invoke(false)
            actions.add("Tema cambiado a Carbón Cálido")
            return AgentResponseResult(
                replyText = "Activé el tema Carbón Cálido con acentos esmeralda y terracota (sin tonos azules).",
                actionsExecuted = actions
            )
        }

        // 3. Ajustar Opciones del Filtro de Notificaciones por Fecha
        if (low.contains("notificaci") && (low.contains("desde hoy") || low.contains("solo hoy"))) {
            val current = AppRepository.policy.value
            AppRepository.updatePolicy(
                context,
                current.copy(
                    ignorarAntiguas = true,
                    modoPlazo = CaptureTimeframeMode.DESDE_HOY,
                    timestampCorteMs = startOfTodayMs()
                )
            )
            actions.add("Filtro ajustado: Solo notificaciones desde hoy (00:00)")
            return AgentResponseResult(
                replyText = "Configuré el escáner para aceptar únicamente notificaciones desde hoy a las 00:00 en adelante. Las anteriores se bloquearán.",
                actionsExecuted = actions
            )
        }
        val daysMatch = Regex("""[uú]ltimos?\s+(\d+)\s*d[ií]as""").find(low)
        if (daysMatch != null) {
            val days = (daysMatch.groupValues[1].toIntOrNull() ?: 7).coerceIn(1, 90)
            val current = AppRepository.policy.value
            AppRepository.updatePolicy(
                context,
                current.copy(
                    ignorarAntiguas = true,
                    modoPlazo = CaptureTimeframeMode.ULTIMOS_DIAS,
                    ultimosDias = days
                )
            )
            actions.add("Filtro de notificaciones ajustado: Últimos $days días")
            return AgentResponseResult(
                replyText = "Listo. El filtro de plazo ahora acepta solo notificaciones de los últimos $days días.",
                actionsExecuted = actions
            )
        }

        // 4. Depurar duplicados
        if (low.contains("duplicad") || low.contains("repetid") || low.contains("depura")) {
            val removed = AppRepository.cleanDuplicatesNow(context)
            actions.add("Depuración ejecutada ($removed duplicados eliminados)")
            val reply = if (removed > 0)
                "Eliminé $removed movimientos duplicados. Tus saldos y gráficas ya fueron recalculados."
            else
                "Revisé todos tus registros y están limpios: no tienes compras duplicadas."
            AppRepository.setWidgetAgentReply(context, reply)
            return AgentResponseResult(
                replyText = reply,
                actionsExecuted = actions
            )
        }

        // 4.5. INTENCIÓN DESDE EL WIDGET O CHAT: "¿YA REGISTRASTE LA COMPRA?" / "¿CUÁL FUE MI ÚLTIMA COMPRA?"
        val isCheckingPurchaseQuestion = (
            low.contains("ya registraste") ||
                low.contains("ya se registr") ||
                low.contains("registró la compra") ||
                low.contains("registro la compra") ||
                low.contains("registró mi compra") ||
                low.contains("registro mi compra") ||
                low.contains("última compra") ||
                low.contains("ultima compra") ||
                low.contains("último movimiento") ||
                low.contains("ultimo movimiento") ||
                low.contains("último gasto") ||
                low.contains("ultimo gasto") ||
                low.contains("llegó alguna notificaci") ||
                low.contains("llego alguna notificaci") ||
                low.contains("llegó notificaci") ||
                low.contains("llego notificaci") ||
                low.contains("qué fue lo último") ||
                low.contains("que fue lo ultimo") ||
                (low.startsWith("¿") && (low.contains("registr") || low.contains("compra") || low.contains("notificaci")))
            ) && !listOf("elimina", "borra", "quita", "cambia", "edita").any { low.contains(it) }

        if (isCheckingPurchaseQuestion) {
            BankNotificationListener.instance?.scanAllActiveNotifications()
            val txs = AppRepository.transactions.value
            val hist = AppRepository.history.value
            val dupsBlocked = AppRepository.blockedDuplicates.value

            if (extractedAmount > 0L) {
                val matchedTx = txs.firstOrNull { it.monto == extractedAmount }
                val reply = if (matchedTx != null) {
                    "Sí, la compra por ${FinancialEngine.formatCop(matchedTx.monto)} en \"${matchedTx.desc}\" (${matchedTx.entidad}) ya está registrada (${FinancialEngine.formatTimeAgo(matchedTx.timestamp)}) en la categoría ${matchedTx.categoria}."
                } else {
                    "Aún no veo ninguna compra registrada por ${FinancialEngine.formatCop(extractedAmount)}. Si deseas que la anote ahora mismo, dime: \"Gasté ${FinancialEngine.formatCop(extractedAmount)} en [comercio]\"."
                }
                actions.add("Verificación en vivo de compra por ${FinancialEngine.formatCop(extractedAmount)}")
                AppRepository.setWidgetAgentReply(context, reply)
                return AgentResponseResult(replyText = reply, actionsExecuted = actions)
            }

            val lastExpense = txs.firstOrNull { it.tipo == TxType.GASTO } ?: txs.firstOrNull()
            val lastHist = hist.firstOrNull()
            val reply = if (lastExpense != null) {
                val ago = FinancialEngine.formatTimeAgo(lastExpense.timestamp)
                val dupInfo = if (lastExpense.duplicateAlertsCount > 1) {
                    "Se fusionaron ${lastExpense.duplicateAlertsCount} notificaciones repetidas en 1 único registro."
                } else {
                    "Escudo anti-duplicados activo ($dupsBlocked alertas repetidas bloqueadas)."
                }
                val histExtra = if (lastHist != null && lastHist.status != NotifStatus.REGISTRADA) {
                    "\n• Última alerta filtrada: ${lastHist.resumen} (${lastHist.status.label})."
                } else ""
                "Sí, tu última compra registrada es \"${lastExpense.desc}\" por ${FinancialEngine.formatCop(lastExpense.monto)} con ${lastExpense.entidad} ($ago, categoría ${lastExpense.categoria}). $dupInfo$histExtra"
            } else {
                "Revisé el escáner en vivo y aún no tienes compras registradas hoy. Puedes decirme por ejemplo: \"Gasté 35 mil en almuerzo\"."
            }
            actions.add("Escáner y última compra verificados en tiempo real")
            AppRepository.setWidgetAgentReply(context, reply)
            return AgentResponseResult(replyText = reply, actionsExecuted = actions)
        }

        // 5. INTENCIÓN: ELIMINAR / BORRAR / QUITAR DATOS
        if (listOf("elimina", "eliminar", "borra", "borrar", "quita", "quitar", "suprime", "deshacer", "anula").any { low.contains(it) }) {
            val txs = AppRepository.transactions.value
            val bills = AppRepository.bills.value
            val goals = AppRepository.goals.value
            val credits = AppRepository.credits.value

            // ¿Borrar el último movimiento?
            if (low.contains("último") || low.contains("ultimo") || low.contains("reciente") || low == "bórralo" || low == "borralo" || low == "elimínalo") {
                val target = txs.firstOrNull()
                if (target != null) {
                    AppRepository.deleteTransaction(context, target.id)
                    actions.add("Eliminado: ${target.desc} (${FinancialEngine.formatCop(target.monto)})")
                    return AgentResponseResult(
                        replyText = "Eliminé el último movimiento: \"${target.desc}\" por ${FinancialEngine.formatCop(target.monto)}.",
                        actionsExecuted = actions
                    )
                }
            }

            // ¿Borrar un pago fijo por nombre?
            val billToDelete = bills.firstOrNull { low.contains(it.nombre.lowercase(Locale.ROOT)) }
            if (billToDelete != null && (low.contains("pago fijo") || low.contains("factura") || low.contains(billToDelete.nombre.lowercase(Locale.ROOT)))) {
                AppRepository.deleteBill(context, billToDelete.id)
                actions.add("Pago fijo eliminado: ${billToDelete.nombre}")
                return AgentResponseResult(
                    replyText = "Eliminé el pago fijo \"${billToDelete.nombre}\" (${FinancialEngine.formatCop(billToDelete.monto)}).",
                    actionsExecuted = actions
                )
            }

            // ¿Borrar una meta por nombre?
            val goalToDelete = goals.firstOrNull { low.contains(it.nombre.lowercase(Locale.ROOT)) }
            if (goalToDelete != null) {
                AppRepository.deleteGoal(context, goalToDelete.id)
                actions.add("Meta eliminada: ${goalToDelete.nombre}")
                return AgentResponseResult(
                    replyText = "Eliminé la meta de ahorro \"${goalToDelete.nombre}\".",
                    actionsExecuted = actions
                )
            }

            // ¿Borrar una tarjeta o deuda por nombre?
            val creditToDelete = credits.firstOrNull { low.contains(it.nombre.lowercase(Locale.ROOT)) || low.contains(it.entidad.lowercase(Locale.ROOT)) }
            if (creditToDelete != null && (low.contains("tarjeta") || low.contains("crédito") || low.contains("credito") || low.contains("deuda"))) {
                AppRepository.deleteCredit(context, creditToDelete.id)
                actions.add("Obligación eliminada: ${creditToDelete.nombre}")
                return AgentResponseResult(
                    replyText = "Eliminé la obligación crediticia \"${creditToDelete.nombre}\".",
                    actionsExecuted = actions
                )
            }

            // ¿Borrar un movimiento por monto o por palabra clave?
            val txByMatch = txs.firstOrNull { tx ->
                (extractedAmount > 0L && tx.monto == extractedAmount) ||
                    tx.desc.lowercase(Locale.ROOT).split(" ").any { word -> word.length >= 3 && low.contains(word) } ||
                    low.contains(tx.entidad.lowercase(Locale.ROOT))
            }
            if (txByMatch != null) {
                AppRepository.deleteTransaction(context, txByMatch.id)
                actions.add("Movimiento eliminado: ${txByMatch.desc} (${FinancialEngine.formatCop(txByMatch.monto)})")
                return AgentResponseResult(
                    replyText = "Borré el movimiento \"${txByMatch.desc}\" de ${FinancialEngine.formatCop(txByMatch.monto)}. Las tablas y gráficas ya se actualizaron.",
                    actionsExecuted = actions
                )
            }

            return AgentResponseResult(
                replyText = "No encontré ese registro exacto para borrar. Puedes decirme por ejemplo: \"Elimina el último gasto\" o \"Borra el gasto de 45.000\".",
                actionsExecuted = actions
            )
        }

        // 6. INTENCIÓN: CONFIGURAR SALARIO ("mi salario es 3.5 millones", "gano 4 millones")
        if (listOf("salario", "sueldo", "nómina", "nomina", "gano ", "me gano").any { low.contains(it) }) {
            val freq = if (low.contains("quincena")) "quincenal" else "mensual"
            if (extractedAmount > 0L) {
                AppRepository.updateSalary(context, extractedAmount, freq)
                actions.add("Salario configurado: ${FinancialEngine.formatCop(extractedAmount)} ($freq)")
                return AgentResponseResult(
                    replyText = "Actualicé tu salario neto a ${FinancialEngine.formatCop(extractedAmount)} en modalidad $freq. Tu Disponible Real ya refleja este cambio.",
                    actionsExecuted = actions
                )
            } else {
                pendingFollowUp = PendingAgentFollowUp.WaitingAmountForSalary(freq)
                return AgentResponseResult(
                    replyText = "¿Cuál es el valor de tu salario neto mensual?",
                    actionsExecuted = actions
                )
            }
        }

        // 7. INTENCIÓN: MARCAR PAGO FIJO COMO PAGADO ("ya pagué el arriendo", "marca internet como pagado")
        val billToMark = AppRepository.bills.value.firstOrNull { low.contains(it.nombre.lowercase(Locale.ROOT)) }
        if (billToMark != null && (low.contains("ya pagu") || low.contains("marca") || low.contains("pagado"))) {
            if (!billToMark.pagadoEsteMes) {
                AppRepository.toggleBillPaid(context, billToMark.id)
            }
            actions.add("Pago fijo marcado como pagado: ${billToMark.nombre}")
            return AgentResponseResult(
                replyText = "Excelente, marqué \"${billToMark.nombre}\" (${FinancialEngine.formatCop(billToMark.monto)}) como pagado este mes.",
                actionsExecuted = actions
            )
        }

        // 8. INTENCIÓN: CREAR PAGO FIJO ("agrega pago fijo de arriendo por 900 mil", "pago 80 mil de internet fijo")
        if (low.contains("pago fijo") || low.contains("factura fija") || low.contains("arriendo") || low.contains("suscripción")) {
            val cleanName = extractConceptName(text, listOf("agrega", "agregar", "crea", "crear", "pago fijo", "factura fija", "de", "por", "valor", "mensual"))
                .ifEmpty { if (low.contains("arriendo")) "Arriendo" else "Pago Fijo" }
            if (extractedAmount > 0L) {
                AppRepository.addBill(context, cleanName, extractedAmount, 5, "Vivienda y Servicios")
                actions.add("Pago fijo agregado: $cleanName (${FinancialEngine.formatCop(extractedAmount)})")
                return AgentResponseResult(
                    replyText = "Registré tu pago fijo mensual \"$cleanName\" por ${FinancialEngine.formatCop(extractedAmount)}.",
                    actionsExecuted = actions
                )
            } else {
                pendingFollowUp = PendingAgentFollowUp.WaitingAmountForBill(cleanName)
                return AgentResponseResult(
                    replyText = "¿De cuánto es el pago mensual de \"$cleanName\"?",
                    actionsExecuted = actions
                )
            }
        }

        // 9. INTENCIÓN: CREAR META O ABONAR A META
        if (low.contains("meta")) {
            val cleanGoal = extractConceptName(text, listOf("crea", "crear", "agrega", "meta", "de", "ahorro", "para", "por"))
                .ifEmpty { "Meta de Ahorro" }
            if (extractedAmount > 0L) {
                AppRepository.addGoal(context, cleanGoal, extractedAmount, 6)
                actions.add("Meta creada: $cleanGoal (${FinancialEngine.formatCop(extractedAmount)})")
                return AgentResponseResult(
                    replyText = "Creé tu meta de ahorro \"$cleanGoal\" con objetivo de ${FinancialEngine.formatCop(extractedAmount)}.",
                    actionsExecuted = actions
                )
            }
        }

        // 10. INTENCIÓN: EDITAR / CAMBIAR EL MONTO O CATEGORÍA DE UN MOVIMIENTO
        if (low.contains("cambia") || low.contains("edita") || low.contains("modifica") || low.contains("corrige")) {
            val txs = AppRepository.transactions.value
            val targetTx = txs.firstOrNull { tx ->
                tx.desc.lowercase(Locale.ROOT).split(" ").any { w -> w.length >= 3 && low.contains(w) }
            } ?: txs.firstOrNull()

            if (targetTx != null && extractedAmount > 0L) {
                AppRepository.updateTransaction(
                    context = context,
                    id = targetTx.id,
                    newDesc = targetTx.desc,
                    newMonto = extractedAmount,
                    newCategoria = targetTx.categoria,
                    newTipo = targetTx.tipo
                )
                actions.add("Movimiento actualizado: ${targetTx.desc} -> ${FinancialEngine.formatCop(extractedAmount)}")
                return AgentResponseResult(
                    replyText = "Actualicé el monto de \"${targetTx.desc}\" a ${FinancialEngine.formatCop(extractedAmount)}. La gráfica y los saldos ya se recalcularon.",
                    actionsExecuted = actions
                )
            }
        }

        // 11. INTENCIÓN: REGISTRAR INGRESO / ENTRADA DE DINERO
        if (listOf("me pagaron", "recibí", "recibi", "ingreso", "me transfirieron", "me entró", "me entro", "gané", "gane").any { low.contains(it) }) {
            val cleanDesc = extractConceptName(text, listOf("agrega", "anota", "registra", "un", "ingreso", "recibí", "recibi", "me pagaron", "de", "por"))
                .ifEmpty { "Ingreso recibido" }
            val entidad = FinancialEngine.detectBankEntity("", text)
            if (extractedAmount > 0L) {
                val now = System.currentTimeMillis()
                val (cat, es) = FinancialEngine.categorize(cleanDesc, TxType.GANANCIA)
                val tx = TransactionItem(
                    id = "tx-agent-$now",
                    desc = cleanDesc,
                    monto = extractedAmount,
                    tipo = TxType.GANANCIA,
                    categoria = cat,
                    entidad = entidad,
                    fechaStr = FinancialEngine.formatShortDate(now),
                    timestamp = now,
                    esEsencial = es,
                    fingerprint = FinancialEngine.buildFingerprint(extractedAmount, TxType.GANANCIA, cleanDesc, entidad)
                )
                AppRepository.addManualTransaction(context, tx)
                actions.add("Ingreso registrado: $cleanDesc (+${FinancialEngine.formatCop(extractedAmount)})")
                return AgentResponseResult(
                    replyText = "Registré tu ingreso de ${FinancialEngine.formatCop(extractedAmount)} por \"$cleanDesc\".",
                    actionsExecuted = actions
                )
            } else {
                pendingFollowUp = PendingAgentFollowUp.WaitingAmountForIncome(cleanDesc)
                return AgentResponseResult(
                    replyText = "¿De qué valor fue el ingreso por \"$cleanDesc\"?",
                    actionsExecuted = actions
                )
            }
        }

        // 12. INTENCIÓN: REGISTRAR GASTO / COMPRA ("gasté 35 mil en almuerzo", "compré café por 12.000", "anota 50k de uber")
        if (listOf("gasté", "gaste", "compré", "compre", "pagué", "pague", "gasto", "compra", "anota", "registra", "agrega").any { low.contains(it) }) {
            val entidad = FinancialEngine.detectBankEntity("", text)
            val cleanDesc = extractConceptName(
                text,
                listOf("gasté", "gaste", "compré", "compre", "pagué", "pague", "agrega", "anota", "registra", "un", "gasto", "compra", "de", "en", "por", "con", "nequi", "bancolombia", "daviplata", "nu")
            ).ifEmpty { "Compra registrada" }

            if (extractedAmount > 0L) {
                val now = System.currentTimeMillis()
                val (cat, es) = FinancialEngine.categorize("$cleanDesc $text", TxType.GASTO)
                val tx = TransactionItem(
                    id = "tx-agent-$now",
                    desc = cleanDesc.replaceFirstChar { it.uppercase() },
                    monto = extractedAmount,
                    tipo = TxType.GASTO,
                    categoria = cat,
                    entidad = entidad,
                    fechaStr = FinancialEngine.formatShortDate(now),
                    timestamp = now,
                    esEsencial = es,
                    fingerprint = FinancialEngine.buildFingerprint(extractedAmount, TxType.GASTO, cleanDesc, entidad)
                )
                AppRepository.addManualTransaction(context, tx)
                actions.add("Compra registrada: ${tx.desc} (${FinancialEngine.formatCop(extractedAmount)} • $cat)")
                return AgentResponseResult(
                    replyText = "Anoté tu compra de ${FinancialEngine.formatCop(extractedAmount)} en \"${tx.desc}\" dentro de la categoría $cat. Tus gráficas y disponible ya se actualizaron en tiempo real.",
                    actionsExecuted = actions
                )
            } else {
                pendingFollowUp = PendingAgentFollowUp.WaitingAmountForExpense(
                    desc = cleanDesc.replaceFirstChar { it.uppercase() },
                    entidad = entidad
                )
                return AgentResponseResult(
                    replyText = "Entendido. ¿Cuánto gastaste en \"${cleanDesc.replaceFirstChar { it.uppercase() }}\"?",
                    actionsExecuted = actions
                )
            }
        }

        // 13. RESPUESTA CONVERSACIONAL INTELIGENTE CON DATOS REALES EN TIEMPO REAL
        val txs = AppRepository.transactions.value
        val bills = AppRepository.bills.value
        val credits = AppRepository.credits.value
        val salary = AppRepository.salaryNeto.value
        val ingresosMov = txs.filter { it.tipo == TxType.GANANCIA }.sumOf { it.monto }
        val totalIngresos = max(salary, ingresosMov)
        val totalGastos = txs.filter { it.tipo == TxType.GASTO }.sumOf { it.monto }
        val fijosPend = bills.filter { !it.pagadoEsteMes }.sumOf { it.monto }
        val disponible = totalIngresos - totalGastos - fijosPend
        val deudaTotal = credits.sumOf { it.saldoActual }

        val topCat = txs.filter { it.tipo == TxType.GASTO }
            .groupBy { it.categoria }
            .maxByOrNull { (_, list) -> list.sumOf { it.monto } }

        val topCatLine = if (topCat != null) {
            "• Categoría de mayor gasto: ${topCat.key} (${FinancialEngine.formatCop(topCat.value.sumOf { it.monto })})"
        } else {
            "• Aún no tienes gastos por categorías este mes."
        }

        return AgentResponseResult(
            replyText = "Así están tus finanzas en tiempo real:\n" +
                "• Disponible Real: ${FinancialEngine.formatCop(disponible)}\n" +
                "• Ingresos del mes: ${FinancialEngine.formatCop(totalIngresos)}\n" +
                "• Compras registradas: ${FinancialEngine.formatCop(totalGastos)} (${txs.count { it.tipo == TxType.GASTO }} compras)\n" +
                "• Pagos fijos pendientes: ${FinancialEngine.formatCop(fijosPend)}\n" +
                "• Deuda en créditos: ${FinancialEngine.formatCop(deudaTotal)}\n" +
                "$topCatLine\n\n" +
                "Puedes pedirme acciones en lenguaje natural como:\n" +
                "• \"Gasté 38 mil en almuerzo con Nequi\"\n" +
                "• \"Cambia el último gasto a 45 mil\"\n" +
                "• \"Elimina el último gasto\" o \"Ya pagué el arriendo\"",
            actionsExecuted = actions
        )
    }

    private fun extractConceptName(rawText: String, stopWords: List<String>): String {
        var cleaned = rawText
            .replace(Regex("""\$?\s*\d+(?:[.,]\d+)*\s*(?:millones|mill[oó]n|palos|palo|mil|k|lucas|lukas)?""", RegexOption.IGNORE_CASE), " ")
            .replace(Regex("""[^\p{L}\p{N}\s]"""), " ")
        for (w in stopWords) {
            cleaned = cleaned.replace(Regex("""\b$w\b""", RegexOption.IGNORE_CASE), " ")
        }
        return cleaned.replace(Regex("""\s+"""), " ").trim().take(34)
    }
}

// ============================================================================
// REPOSITORIO CENTRAL REACTIVO (Persistencia + Actualización en Tiempo Real)
// ============================================================================
object AppRepository {
    private const val PREFS_NAME = "mis_finanzas_native_store_v3"
    private const val KEY_TX = "transactions_json"
    private const val KEY_BILLS = "bills_json"
    private const val KEY_GOALS = "goals_json"
    private const val KEY_CREDITS = "credits_json"
    private const val KEY_HISTORY = "notif_history_json"
    private const val KEY_SALARY_AMOUNT = "salary_amount"
    private const val KEY_SALARY_FREQ = "salary_freq"
    private const val KEY_POLICY_IGNORE_OLD = "policy_ignore_old"
    private const val KEY_POLICY_MODE = "policy_mode"
    private const val KEY_POLICY_CUTOFF_MS = "policy_cutoff_ms"
    private const val KEY_POLICY_DAYS = "policy_days"
    private const val KEY_BLOCKED_DUPS = "blocked_duplicates_count"
    private const val KEY_BLOCKED_OLD = "blocked_old_count"
    private const val KEY_LIGHT_THEME = "use_editorial_light_theme"
    private const val KEY_WIDGET_AGENT_REPLY = "widget_agent_last_reply"

    private var initialized = false

    private val _transactions = MutableStateFlow<List<TransactionItem>>(emptyList())
    val transactions: StateFlow<List<TransactionItem>> = _transactions.asStateFlow()

    private val _bills = MutableStateFlow<List<RecurringBillItem>>(emptyList())
    val bills: StateFlow<List<RecurringBillItem>> = _bills.asStateFlow()

    private val _goals = MutableStateFlow<List<SavingsGoalItem>>(emptyList())
    val goals: StateFlow<List<SavingsGoalItem>> = _goals.asStateFlow()

    private val _credits = MutableStateFlow<List<CreditCardItem>>(emptyList())
    val credits: StateFlow<List<CreditCardItem>> = _credits.asStateFlow()

    private val _history = MutableStateFlow<List<NotificationHistoryItem>>(emptyList())
    val history: StateFlow<List<NotificationHistoryItem>> = _history.asStateFlow()

    private val _salaryNeto = MutableStateFlow(3_200_000L)
    val salaryNeto: StateFlow<Long> = _salaryNeto.asStateFlow()

    private val _salaryFrecuencia = MutableStateFlow("mensual")
    val salaryFrecuencia: StateFlow<String> = _salaryFrecuencia.asStateFlow()

    private val _policy = MutableStateFlow(CapturePolicy())
    val policy: StateFlow<CapturePolicy> = _policy.asStateFlow()

    private val _blockedDuplicates = MutableStateFlow(0)
    val blockedDuplicates: StateFlow<Int> = _blockedDuplicates.asStateFlow()

    private val _blockedOld = MutableStateFlow(0)
    val blockedOld: StateFlow<Int> = _blockedOld.asStateFlow()

    private val _useLightTheme = MutableStateFlow(true)
    val useLightTheme: StateFlow<Boolean> = _useLightTheme.asStateFlow()

    private val _lastBannerMessage = MutableStateFlow<String?>(null)
    val lastBannerMessage: StateFlow<String?> = _lastBannerMessage.asStateFlow()

    private val _lastWidgetAgentReply = MutableStateFlow(
        "Sí, tu última compra en Supermercado Éxito ($145.000) ya está registrada sin duplicados."
    )
    val lastWidgetAgentReply: StateFlow<String> = _lastWidgetAgentReply.asStateFlow()

    fun init(context: Context) {
        if (initialized) return
        initialized = true
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        _salaryNeto.value = prefs.getLong(KEY_SALARY_AMOUNT, 3_200_000L)
        _salaryFrecuencia.value = prefs.getString(KEY_SALARY_FREQ, "mensual") ?: "mensual"
        _blockedDuplicates.value = prefs.getInt(KEY_BLOCKED_DUPS, 0)
        _blockedOld.value = prefs.getInt(KEY_BLOCKED_OLD, 0)
        _useLightTheme.value = prefs.getBoolean(KEY_LIGHT_THEME, true)
        _lastWidgetAgentReply.value = prefs.getString(
            KEY_WIDGET_AGENT_REPLY,
            "Sí, tu última compra en Supermercado Éxito ($145.000) ya está registrada sin duplicados."
        ) ?: "Listo para verificar tus compras."

        val modeName = prefs.getString(KEY_POLICY_MODE, CaptureTimeframeMode.DESDE_HOY.name)
            ?: CaptureTimeframeMode.DESDE_HOY.name
        val mode = runCatching { CaptureTimeframeMode.valueOf(modeName) }
            .getOrDefault(CaptureTimeframeMode.DESDE_HOY)

        _policy.value = CapturePolicy(
            ignorarAntiguas = prefs.getBoolean(KEY_POLICY_IGNORE_OLD, true),
            modoPlazo = mode,
            timestampCorteMs = prefs.getLong(KEY_POLICY_CUTOFF_MS, startOfTodayMs()),
            ultimosDias = prefs.getInt(KEY_POLICY_DAYS, 7)
        )

        _transactions.value = loadTransactions(prefs.getString(KEY_TX, null))
        _bills.value = loadBills(prefs.getString(KEY_BILLS, null))
        _goals.value = loadGoals(prefs.getString(KEY_GOALS, null))
        _credits.value = loadCredits(prefs.getString(KEY_CREDITS, null))
        _history.value = loadHistory(prefs.getString(KEY_HISTORY, null))
    }

    fun setWidgetAgentReply(context: Context, reply: String) {
        val clean = reply.trim()
        if (clean.isEmpty()) return
        _lastWidgetAgentReply.value = clean
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_WIDGET_AGENT_REPLY, clean)
            .apply()
        MisFinanzasAppWidgetProvider.updateAllWidgets(context)
    }

    fun showBanner(msg: String?) {
        _lastBannerMessage.value = msg
    }

    fun setLightTheme(context: Context, isLight: Boolean) {
        _useLightTheme.value = isLight
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_LIGHT_THEME, isLight)
            .apply()
    }

    fun updatePolicy(context: Context, newPolicy: CapturePolicy) {
        _policy.value = newPolicy
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putBoolean(KEY_POLICY_IGNORE_OLD, newPolicy.ignorarAntiguas)
            .putString(KEY_POLICY_MODE, newPolicy.modoPlazo.name)
            .putLong(KEY_POLICY_CUTOFF_MS, newPolicy.timestampCorteMs)
            .putInt(KEY_POLICY_DAYS, newPolicy.ultimosDias)
            .apply()
        showBanner("Plazo actualizado: desde ${FinancialEngine.formatShortDate(newPolicy.effectiveCutoffMs())}")
    }

    fun updateSalary(context: Context, amount: Long, frecuencia: String) {
        _salaryNeto.value = amount
        _salaryFrecuencia.value = frecuencia
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putLong(KEY_SALARY_AMOUNT, amount)
            .putString(KEY_SALARY_FREQ, frecuencia)
            .apply()
        showBanner("Salario actualizado: ${FinancialEngine.formatCop(amount)}")
    }

    /**
     * Procesa notificaciones bancarias validando fecha de corte y escudo anti-duplicados,
     * y registra cada evento en el Historial con su estado transparente.
     */
    fun processIncomingNotification(
        context: Context,
        sourceName: String,
        rawText: String,
        postTimeMs: Long = System.currentTimeMillis(),
        bypassFilters: Boolean = false
    ): Boolean {
        init(context)
        val cleanText = rawText.trim()
        if (!FinancialEngine.isTransactionalNotification(cleanText)) return false

        val amount = FinancialEngine.extractAmountFromNotification(cleanText)
        if (amount <= 0L) return false

        val eventTimeMs = FinancialEngine.extractNotificationDateMs(cleanText, postTimeMs)
        val low = cleanText.lowercase(Locale.ROOT)
        val isIncome = listOf("recibiste", "abono", "te enviaron", "nomina", "nómina", "consignacion", "transferencia recibida").any { low.contains(it) } &&
            !listOf("compraste", "pagaste", "enviaste", "retiraste", "compra ").any { low.contains(it) }
        val txType = if (isIncome) TxType.GANANCIA else TxType.GASTO
        val entidad = FinancialEngine.detectBankEntity(sourceName, cleanText)
        val desc = FinancialEngine.extractCleanMerchant(cleanText, entidad, txType)
        val (categoria, esencial) = FinancialEngine.categorize("$desc $cleanText", txType)
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        // 1. FILTRO DE FECHA DE CORTE
        val cutoffMs = _policy.value.effectiveCutoffMs()
        if (!bypassFilters && cutoffMs > 0L && eventTimeMs + 60_000L < cutoffMs) {
            val newOld = _blockedOld.value + 1
            _blockedOld.value = newOld
            prefs.edit().putInt(KEY_BLOCKED_OLD, newOld).apply()

            val histItem = NotificationHistoryItem(
                id = "hist-old-${System.currentTimeMillis()}",
                textoOriginal = cleanText,
                resumen = desc,
                monto = amount,
                tipo = txType,
                categoria = categoria,
                entidad = entidad,
                fechaStr = FinancialEngine.formatShortDate(eventTimeMs),
                timestamp = eventTimeMs,
                status = NotifStatus.ANTIGUA_OMITIDA,
                motivo = "Anterior a la fecha límite (${FinancialEngine.formatShortDate(cutoffMs)})"
            )
            _history.value = (listOf(histItem) + _history.value).take(200)
            saveHistory(context)
            showBanner("Notificación antigua omitida (${FinancialEngine.formatShortDate(eventTimeMs)})")
            return false
        }

        // 2. ESCUDO ANTI-DUPLICADOS
        val existingDup = if (!bypassFilters) {
            FinancialEngine.isDuplicatePurchase(
                candidateAmount = amount,
                candidateType = txType,
                candidateDesc = desc,
                candidateEntity = entidad,
                candidateTimeMs = eventTimeMs,
                existing = _transactions.value
            )
        } else null

        if (existingDup != null) {
            val newDups = _blockedDuplicates.value + 1
            _blockedDuplicates.value = newDups
            prefs.edit().putInt(KEY_BLOCKED_DUPS, newDups).apply()

            // Incrementar contador de avisos fusionados en la compra original
            _transactions.value = _transactions.value.map {
                if (it.id == existingDup.id) it.copy(duplicateAlertsCount = it.duplicateAlertsCount + 1) else it
            }
            saveTransactions(context)

            val histItem = NotificationHistoryItem(
                id = "hist-dup-${System.currentTimeMillis()}",
                textoOriginal = cleanText,
                resumen = desc,
                monto = amount,
                tipo = txType,
                categoria = categoria,
                entidad = entidad,
                fechaStr = FinancialEngine.formatShortDate(eventTimeMs),
                timestamp = eventTimeMs,
                status = NotifStatus.DUPLICADA,
                motivo = "Fusionada con compra existente (${existingDup.desc})"
            )
            _history.value = (listOf(histItem) + _history.value).take(200)
            saveHistory(context)
            showBanner("Escudo Anti-Duplicados: Compra repetida de ${FinancialEngine.formatCop(amount)} bloqueada")
            return false
        }

        // 3. REGISTRAR COMPRA ÚNICA
        val nowId = System.currentTimeMillis()
        val fp = FinancialEngine.buildFingerprint(amount, txType, desc, entidad)
        val newTx = TransactionItem(
            id = "tx-$nowId",
            desc = desc,
            monto = amount,
            tipo = txType,
            categoria = categoria,
            entidad = entidad,
            fechaStr = FinancialEngine.formatShortDate(eventTimeMs),
            timestamp = eventTimeMs,
            esAutomatico = true,
            esEsencial = esencial,
            fingerprint = fp,
            duplicateAlertsCount = 1
        )
        _transactions.value = listOf(newTx) + _transactions.value
        saveTransactions(context)

        val newHist = NotificationHistoryItem(
            id = "hist-$nowId",
            textoOriginal = cleanText,
            resumen = desc,
            monto = amount,
            tipo = txType,
            categoria = categoria,
            entidad = entidad,
            fechaStr = FinancialEngine.formatShortDate(eventTimeMs),
            timestamp = eventTimeMs,
            status = NotifStatus.REGISTRADA,
            motivo = "Registrada automáticamente en $categoria"
        )
        _history.value = (listOf(newHist) + _history.value).take(200)
        saveHistory(context)

        showBanner("Registrado: $desc (${FinancialEngine.formatCop(amount)})")
        setWidgetAgentReply(
            context,
            "Sí, acabo de registrar tu ${txType.label.lowercase(Locale.ROOT)} en \"$desc\" por ${FinancialEngine.formatCop(amount)} ($entidad)."
        )
        return true
    }

    fun addManualTransaction(context: Context, tx: TransactionItem) {
        init(context)
        val dup = FinancialEngine.isDuplicatePurchase(
            candidateAmount = tx.monto,
            candidateType = tx.tipo,
            candidateDesc = tx.desc,
            candidateEntity = tx.entidad,
            candidateTimeMs = tx.timestamp,
            existing = _transactions.value
        )
        if (dup != null) {
            showBanner("Ya existe esta compra (${dup.desc} por ${FinancialEngine.formatCop(dup.monto)}). No se duplicó.")
            return
        }
        _transactions.value = listOf(tx) + _transactions.value
        saveTransactions(context)
    }

    fun updateTransaction(
        context: Context,
        id: String,
        newDesc: String,
        newMonto: Long,
        newCategoria: String,
        newTipo: TxType
    ) {
        _transactions.value = _transactions.value.map { tx ->
            if (tx.id == id) {
                tx.copy(
                    desc = newDesc.trim().ifEmpty { tx.desc },
                    monto = max(1L, newMonto),
                    categoria = newCategoria,
                    tipo = newTipo,
                    fingerprint = FinancialEngine.buildFingerprint(newMonto, newTipo, newDesc, tx.entidad)
                )
            } else tx
        }
        saveTransactions(context)
        showBanner("Datos actualizados en tiempo real")
    }

    fun deleteTransaction(context: Context, id: String) {
        _transactions.value = _transactions.value.filterNot { it.id == id }
        saveTransactions(context)
    }

    fun cleanDuplicatesNow(context: Context): Int {
        val current = _transactions.value
        val kept = mutableListOf<TransactionItem>()
        var removed = 0
        for (tx in current.sortedBy { it.timestamp }) {
            val dup = FinancialEngine.isDuplicatePurchase(
                candidateAmount = tx.monto,
                candidateType = tx.tipo,
                candidateDesc = tx.desc,
                candidateEntity = tx.entidad,
                candidateTimeMs = tx.timestamp,
                existing = kept
            )
            if (dup == null) {
                kept.add(tx)
            } else {
                removed++
            }
        }
        if (removed > 0) {
            _transactions.value = kept.sortedByDescending { it.timestamp }
            saveTransactions(context)
            val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val totalDups = _blockedDuplicates.value + removed
            _blockedDuplicates.value = totalDups
            prefs.edit().putInt(KEY_BLOCKED_DUPS, totalDups).apply()
            showBanner("Se eliminaron $removed registros repetidos.")
        } else {
            showBanner("Sin duplicados: cada compra tiene un único registro.")
        }
        return removed
    }

    fun addBill(context: Context, nombre: String, monto: Long, dia: Int, categoria: String) {
        val item = RecurringBillItem(
            id = "bill-${System.currentTimeMillis()}",
            nombre = nombre,
            monto = monto,
            diaPago = dia.coerceIn(1, 31),
            categoria = categoria,
            pagadoEsteMes = false
        )
        _bills.value = _bills.value + item
        saveBills(context)
    }

    fun toggleBillPaid(context: Context, id: String) {
        var targetBill: RecurringBillItem? = null
        _bills.value = _bills.value.map {
            if (it.id == id) {
                val updated = it.copy(pagadoEsteMes = !it.pagadoEsteMes)
                targetBill = updated
                updated
            } else it
        }
        saveBills(context)
        targetBill?.let { b ->
            if (b.pagadoEsteMes) {
                val now = System.currentTimeMillis()
                addManualTransaction(
                    context,
                    TransactionItem(
                        id = "tx-bill-$now",
                        desc = "Pago Fijo: ${b.nombre}",
                        monto = b.monto,
                        tipo = TxType.GASTO,
                        categoria = b.categoria,
                        entidad = "Pago Mensual",
                        fechaStr = FinancialEngine.formatShortDate(now),
                        timestamp = now,
                        esEsencial = true,
                        fingerprint = FinancialEngine.buildFingerprint(b.monto, TxType.GASTO, b.nombre, "Pago Mensual")
                    )
                )
            }
        }
    }

    fun deleteBill(context: Context, id: String) {
        _bills.value = _bills.value.filterNot { it.id == id }
        saveBills(context)
    }

    fun addGoal(context: Context, nombre: String, objetivo: Long, meses: Int) {
        val g = SavingsGoalItem(
            id = "goal-${System.currentTimeMillis()}",
            nombre = nombre,
            montoObjetivo = objetivo,
            montoAhorrado = 0L,
            plazoMeses = max(1, meses)
        )
        _goals.value = _goals.value + g
        saveGoals(context)
    }

    fun contributeGoal(context: Context, id: String, abono: Long) {
        _goals.value = _goals.value.map {
            if (it.id == id) it.copy(montoAhorrado = it.montoAhorrado + abono) else it
        }
        saveGoals(context)
    }

    fun deleteGoal(context: Context, id: String) {
        _goals.value = _goals.value.filterNot { it.id == id }
        saveGoals(context)
    }

    fun addCredit(context: Context, nombre: String, entidad: String, cupo: Long, saldo: Long, tasaEA: Double, cuotaMin: Long) {
        val c = CreditCardItem(
            id = "cred-${System.currentTimeMillis()}",
            nombre = nombre,
            entidad = entidad,
            cupoTotal = cupo,
            saldoActual = saldo,
            tasaEA = tasaEA,
            cuotaMinima = cuotaMin,
            diaCorte = 15,
            diaPago = 2
        )
        _credits.value = _credits.value + c
        saveCredits(context)
    }

    fun payCredit(context: Context, id: String, abono: Long) {
        var credName = "Crédito"
        _credits.value = _credits.value.map {
            if (it.id == id) {
                credName = it.nombre
                it.copy(saldoActual = max(0L, it.saldoActual - abono))
            } else it
        }
        saveCredits(context)
        val now = System.currentTimeMillis()
        addManualTransaction(
            context,
            TransactionItem(
                id = "tx-cred-$now",
                desc = "Abono a $credName",
                monto = abono,
                tipo = TxType.GASTO,
                categoria = "Deudas y Créditos",
                entidad = credName,
                fechaStr = FinancialEngine.formatShortDate(now),
                timestamp = now,
                esEsencial = true,
                fingerprint = FinancialEngine.buildFingerprint(abono, TxType.GASTO, credName, credName)
            )
        )
    }

    fun deleteCredit(context: Context, id: String) {
        _credits.value = _credits.value.filterNot { it.id == id }
        saveCredits(context)
    }

    fun deleteHistoryItem(context: Context, id: String) {
        _history.value = _history.value.filterNot { it.id == id }
        saveHistory(context)
    }

    fun clearHistory(context: Context) {
        _history.value = emptyList()
        saveHistory(context)
    }

    private fun saveTransactions(context: Context) {
        val arr = JSONArray()
        _transactions.value.forEach { tx ->
            arr.put(JSONObject().apply {
                put("id", tx.id)
                put("desc", tx.desc)
                put("monto", tx.monto)
                put("tipo", tx.tipo.name)
                put("categoria", tx.categoria)
                put("entidad", tx.entidad)
                put("fechaStr", tx.fechaStr)
                put("timestamp", tx.timestamp)
                put("esAutomatico", tx.esAutomatico)
                put("esEsencial", tx.esEsencial)
                put("fingerprint", tx.fingerprint)
                put("duplicateAlertsCount", tx.duplicateAlertsCount)
            })
        }
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_TX, arr.toString()).apply()
        MisFinanzasAppWidgetProvider.updateAllWidgets(context)
    }

    private fun loadTransactions(json: String?): List<TransactionItem> {
        if (json.isNullOrBlank()) {
            val now = System.currentTimeMillis()
            return listOf(
                TransactionItem(
                    id = "tx-init-1",
                    desc = "Supermercado Éxito",
                    monto = 145_000L,
                    tipo = TxType.GASTO,
                    categoria = "Alimentación y Supermercado",
                    entidad = "Bancolombia",
                    fechaStr = FinancialEngine.formatShortDate(now - 3600_000L),
                    timestamp = now - 3600_000L,
                    esAutomatico = true,
                    esEsencial = true,
                    fingerprint = "GASTO_145000_supermercadoex"
                ),
                TransactionItem(
                    id = "tx-init-2",
                    desc = "Estación Terpel Gasolina",
                    monto = 68_000L,
                    tipo = TxType.GASTO,
                    categoria = "Transporte y Gasolina",
                    entidad = "Nequi",
                    fechaStr = FinancialEngine.formatShortDate(now - 7200_000L),
                    timestamp = now - 7200_000L,
                    esAutomatico = true,
                    esEsencial = true,
                    fingerprint = "GASTO_68000_estacionterpel"
                )
            )
        }
        return runCatching {
            val arr = JSONArray(json)
            val list = mutableListOf<TransactionItem>()
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                list.add(
                    TransactionItem(
                        id = o.optString("id"),
                        desc = o.optString("desc"),
                        monto = o.optLong("monto"),
                        tipo = runCatching { TxType.valueOf(o.optString("tipo")) }.getOrDefault(TxType.GASTO),
                        categoria = o.optString("categoria", "Otros"),
                        entidad = o.optString("entidad", "Banco"),
                        fechaStr = o.optString("fechaStr"),
                        timestamp = o.optLong("timestamp", System.currentTimeMillis()),
                        esAutomatico = o.optBoolean("esAutomatico", false),
                        esEsencial = o.optBoolean("esEsencial", true),
                        fingerprint = o.optString("fingerprint", ""),
                        duplicateAlertsCount = o.optInt("duplicateAlertsCount", 1)
                    )
                )
            }
            list
        }.getOrDefault(emptyList())
    }

    private fun saveBills(context: Context) {
        val arr = JSONArray()
        _bills.value.forEach { b ->
            arr.put(JSONObject().apply {
                put("id", b.id)
                put("nombre", b.nombre)
                put("monto", b.monto)
                put("diaPago", b.diaPago)
                put("categoria", b.categoria)
                put("pagadoEsteMes", b.pagadoEsteMes)
            })
        }
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_BILLS, arr.toString()).apply()
        MisFinanzasAppWidgetProvider.updateAllWidgets(context)
    }

    private fun loadBills(json: String?): List<RecurringBillItem> {
        if (json.isNullOrBlank()) {
            return listOf(
                RecurringBillItem("bill-1", "Arriendo / Vivienda", 950_000L, 5, "Vivienda y Servicios", false),
                RecurringBillItem("bill-2", "Internet Hogar y Celular", 115_000L, 12, "Vivienda y Servicios", false)
            )
        }
        return runCatching {
            val arr = JSONArray(json)
            val list = mutableListOf<RecurringBillItem>()
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                list.add(
                    RecurringBillItem(
                        id = o.optString("id"),
                        nombre = o.optString("nombre"),
                        monto = o.optLong("monto"),
                        diaPago = o.optInt("diaPago", 5),
                        categoria = o.optString("categoria", "Vivienda y Servicios"),
                        pagadoEsteMes = o.optBoolean("pagadoEsteMes", false)
                    )
                )
            }
            list
        }.getOrDefault(emptyList())
    }

    private fun saveGoals(context: Context) {
        val arr = JSONArray()
        _goals.value.forEach { g ->
            arr.put(JSONObject().apply {
                put("id", g.id)
                put("nombre", g.nombre)
                put("montoObjetivo", g.montoObjetivo)
                put("montoAhorrado", g.montoAhorrado)
                put("plazoMeses", g.plazoMeses)
            })
        }
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_GOALS, arr.toString()).apply()
    }

    private fun loadGoals(json: String?): List<SavingsGoalItem> {
        if (json.isNullOrBlank()) {
            return listOf(
                SavingsGoalItem("goal-1", "Fondo de Emergencia", 3_000_000L, 750_000L, 6)
            )
        }
        return runCatching {
            val arr = JSONArray(json)
            val list = mutableListOf<SavingsGoalItem>()
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                list.add(
                    SavingsGoalItem(
                        id = o.optString("id"),
                        nombre = o.optString("nombre"),
                        montoObjetivo = o.optLong("montoObjetivo"),
                        montoAhorrado = o.optLong("montoAhorrado"),
                        plazoMeses = o.optInt("plazoMeses", 6)
                    )
                )
            }
            list
        }.getOrDefault(emptyList())
    }

    private fun saveCredits(context: Context) {
        val arr = JSONArray()
        _credits.value.forEach { c ->
            arr.put(JSONObject().apply {
                put("id", c.id)
                put("nombre", c.nombre)
                put("entidad", c.entidad)
                put("cupoTotal", c.cupoTotal)
                put("saldoActual", c.saldoActual)
                put("tasaEA", c.tasaEA)
                put("cuotaMinima", c.cuotaMinima)
                put("diaCorte", c.diaCorte)
                put("diaPago", c.diaPago)
            })
        }
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_CREDITS, arr.toString()).apply()
    }

    private fun loadCredits(json: String?): List<CreditCardItem> {
        if (json.isNullOrBlank()) {
            return listOf(
                CreditCardItem("cred-1", "Tarjeta Nu / Bancolombia", "Nu", 4_500_000L, 1_150_000L, 28.5, 135_000L, 15, 2)
            )
        }
        return runCatching {
            val arr = JSONArray(json)
            val list = mutableListOf<CreditCardItem>()
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                list.add(
                    CreditCardItem(
                        id = o.optString("id"),
                        nombre = o.optString("nombre"),
                        entidad = o.optString("entidad", "Banco"),
                        cupoTotal = o.optLong("cupoTotal"),
                        saldoActual = o.optLong("saldoActual"),
                        tasaEA = o.optDouble("tasaEA", 28.5),
                        cuotaMinima = o.optLong("cuotaMinima", 100_000L),
                        diaCorte = o.optInt("diaCorte", 15),
                        diaPago = o.optInt("diaPago", 2)
                    )
                )
            }
            list
        }.getOrDefault(emptyList())
    }

    private fun saveHistory(context: Context) {
        val arr = JSONArray()
        _history.value.forEach { h ->
            arr.put(JSONObject().apply {
                put("id", h.id)
                put("textoOriginal", h.textoOriginal)
                put("resumen", h.resumen)
                put("monto", h.monto)
                put("tipo", h.tipo.name)
                put("categoria", h.categoria)
                put("entidad", h.entidad)
                put("fechaStr", h.fechaStr)
                put("timestamp", h.timestamp)
                put("status", h.status.name)
                put("motivo", h.motivo)
            })
        }
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_HISTORY, arr.toString()).apply()
        MisFinanzasAppWidgetProvider.updateAllWidgets(context)
    }

    private fun loadHistory(json: String?): List<NotificationHistoryItem> {
        if (json.isNullOrBlank()) {
            val now = System.currentTimeMillis()
            return listOf(
                NotificationHistoryItem(
                    id = "hist-init-1",
                    textoOriginal = "Bancolombia te informa compra por $145.000 en EXITO con tu Tarjeta Debito.",
                    resumen = "Compra en EXITO",
                    monto = 145_000L,
                    tipo = TxType.GASTO,
                    categoria = "Alimentación y Supermercado",
                    entidad = "Bancolombia",
                    fechaStr = FinancialEngine.formatShortDate(now - 3600_000L),
                    timestamp = now - 3600_000L,
                    status = NotifStatus.REGISTRADA,
                    motivo = "Registrada automáticamente en Alimentación y Supermercado"
                ),
                NotificationHistoryItem(
                    id = "hist-init-2",
                    textoOriginal = "Nequi: Pagaste $68.000 en ESTACION TERPEL. Tu saldo ya se actualizó.",
                    resumen = "Compra en ESTACION TERPEL",
                    monto = 68_000L,
                    tipo = TxType.GASTO,
                    categoria = "Transporte y Gasolina",
                    entidad = "Nequi",
                    fechaStr = FinancialEngine.formatShortDate(now - 7200_000L),
                    timestamp = now - 7200_000L,
                    status = NotifStatus.REGISTRADA,
                    motivo = "Registrada automáticamente en Transporte y Gasolina"
                )
            )
        }
        return runCatching {
            val arr = JSONArray(json)
            val list = mutableListOf<NotificationHistoryItem>()
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                list.add(
                    NotificationHistoryItem(
                        id = o.optString("id"),
                        textoOriginal = o.optString("textoOriginal"),
                        resumen = o.optString("resumen"),
                        monto = o.optLong("monto"),
                        tipo = runCatching { TxType.valueOf(o.optString("tipo")) }.getOrDefault(TxType.GASTO),
                        categoria = o.optString("categoria", "Otros"),
                        entidad = o.optString("entidad", "Banco"),
                        fechaStr = o.optString("fechaStr"),
                        timestamp = o.optLong("timestamp", System.currentTimeMillis()),
                        status = runCatching { NotifStatus.valueOf(o.optString("status")) }.getOrDefault(NotifStatus.REGISTRADA),
                        motivo = o.optString("motivo", "Compra registrada")
                    )
                )
            }
            list
        }.getOrDefault(emptyList())
    }
}
