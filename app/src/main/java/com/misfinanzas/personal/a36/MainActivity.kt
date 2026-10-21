package com.misfinanzas.personal.a36

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
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
import androidx.core.content.ContextCompat
import kotlin.math.max

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        AppRepository.init(applicationContext)

        intent?.getStringExtra(Intent.EXTRA_TEXT)?.let { shared ->
            if (shared.isNotBlank()) {
                AppRepository.processIncomingNotification(applicationContext, "Compartido", shared)
            }
        }

        setContent {
            val useLight by AppRepository.useLightTheme.collectAsState()
            MisFinanzasTheme(useLightTheme = useLight) {
                MisFinanzasApp(
                    checkListenerEnabled = { isNotificationListenerEnabled(this) },
                    openNotificationAccess = { openNotificationAccessSettings(this) },
                    openAppDetails = { openAppDetailsSettings(this) }
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        BankNotificationListener.instance?.scanAllActiveNotifications()
    }

    companion object {
        fun isNotificationListenerEnabled(context: Context): Boolean {
            val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: return false
            val cn = ComponentName(context, BankNotificationListener::class.java)
            return flat.contains(cn.flattenToString()) || flat.contains(context.packageName)
        }

        fun openNotificationAccessSettings(context: Context) {
            runCatching {
                val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            }
        }

        fun openAppDetailsSettings(context: Context) {
            runCatching {
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.fromParts("package", context.packageName, null)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            }
        }
    }
}

enum class MainTab(val label: String) {
    INICIO("Inicio"),
    ESCANER("Escáner"),
    ANALITICA("Gráficas"),
    CREDITOS("Créditos"),
    ASESOR("Agente")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MisFinanzasApp(
    checkListenerEnabled: () -> Boolean,
    openNotificationAccess: () -> Unit,
    openAppDetails: () -> Unit
) {
    val context = LocalContext.current
    val palette = LocalAppPalette.current
    var currentTab by remember { mutableStateOf(MainTab.INICIO) }
    var showAddModal by remember { mutableStateOf(false) }
    var showHistoryModal by remember { mutableStateOf(false) }

    val transactions by AppRepository.transactions.collectAsState()
    val bills by AppRepository.bills.collectAsState()
    val goals by AppRepository.goals.collectAsState()
    val credits by AppRepository.credits.collectAsState()
    val history by AppRepository.history.collectAsState()
    val salaryNeto by AppRepository.salaryNeto.collectAsState()
    val salaryFreq by AppRepository.salaryFrecuencia.collectAsState()
    val policy by AppRepository.policy.collectAsState()
    val blockedDuplicates by AppRepository.blockedDuplicates.collectAsState()
    val blockedOld by AppRepository.blockedOld.collectAsState()
    val bannerMsg by AppRepository.lastBannerMessage.collectAsState()
    val useLight by AppRepository.useLightTheme.collectAsState()

    val permLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { }

    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                permLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    if (currentTab != MainTab.INICIO) {
        BackHandler { currentTab = MainTab.INICIO }
    }

    val ingresosMovimientos = transactions.filter { it.tipo == TxType.GANANCIA }.sumOf { it.monto }
    val totalIngresos = max(salaryNeto, ingresosMovimientos)
    val totalGastos = transactions.filter { it.tipo == TxType.GASTO }.sumOf { it.monto }
    val pagosFijosPendientes = bills.filter { !it.pagadoEsteMes }.sumOf { it.monto }
    val disponibleReal = totalIngresos - totalGastos - pagosFijosPendientes
    val deudaTotal = credits.sumOf { it.saldoActual }

    Scaffold(
        containerColor = palette.bg,
        topBar = {
            Surface(
                color = palette.surface,
                border = BorderStroke(1.dp, palette.border),
                tonalElevation = 0.dp
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(palette.primaryAccent),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.AccountBalanceWallet,
                                contentDescription = "Logo Mis Finanzas",
                                tint = Color.White,
                                modifier = Modifier.size(19.dp)
                            )
                        }
                        Column {
                            Text(
                                text = "Mis Finanzas",
                                color = palette.textPrimary,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.ExtraBold
                            )
                            Text(
                                text = "Desde: ${FinancialEngine.formatShortDate(policy.effectiveCutoffMs())}",
                                color = palette.primaryAccent,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        OutlinedIconButton(
                            onClick = {
                                context.startActivity(
                                    Intent(context, WidgetAgentDialogActivity::class.java).apply {
                                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                                    }
                                )
                            },
                            border = BorderStroke(1.dp, palette.border),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .size(36.dp)
                                .testTag("top_widget_agent_button")
                        ) {
                            Icon(
                                imageVector = Icons.Default.Widgets,
                                contentDescription = "Abrir Widget del Agente",
                                tint = palette.primaryAccent,
                                modifier = Modifier.size(17.dp)
                            )
                        }

                        OutlinedIconButton(
                            onClick = { AppRepository.setLightTheme(context, !useLight) },
                            border = BorderStroke(1.dp, palette.border),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .size(36.dp)
                                .testTag("toggle_theme_button")
                        ) {
                            Icon(
                                imageVector = if (useLight) Icons.Default.DarkMode else Icons.Default.LightMode,
                                contentDescription = "Cambiar tema Marfil / Carbón",
                                tint = palette.textPrimary,
                                modifier = Modifier.size(17.dp)
                            )
                        }

                        Button(
                            onClick = { showAddModal = true },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = palette.primaryAccent,
                                contentColor = Color.White
                            ),
                            shape = RoundedCornerShape(12.dp),
                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
                            modifier = Modifier.testTag("top_add_movement_button")
                        ) {
                            Icon(
                                imageVector = Icons.Default.Add,
                                contentDescription = "Registrar",
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Registrar", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        },
        bottomBar = {
            NavigationBar(
                containerColor = palette.surface,
                contentColor = palette.textPrimary,
                tonalElevation = 0.dp,
                modifier = Modifier.windowInsetsPadding(WindowInsets.navigationBars)
            ) {
                MainTab.entries.forEach { tab ->
                    val selected = currentTab == tab
                    NavigationBarItem(
                        selected = selected,
                        onClick = { currentTab = tab },
                        modifier = Modifier.testTag("nav_tab_${tab.name.lowercase()}"),
                        icon = {
                            Icon(
                                imageVector = when (tab) {
                                    MainTab.INICIO -> Icons.Default.AccountBalanceWallet
                                    MainTab.ESCANER -> Icons.Default.NotificationsActive
                                    MainTab.ANALITICA -> Icons.Default.DonutLarge
                                    MainTab.CREDITOS -> Icons.Default.CreditCard
                                    MainTab.ASESOR -> Icons.Default.AutoAwesome
                                },
                                contentDescription = tab.label
                            )
                        },
                        label = {
                            Text(
                                text = tab.label,
                                fontSize = 11.sp,
                                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium
                            )
                        },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Color.White,
                            selectedTextColor = palette.primaryAccent,
                            indicatorColor = palette.primaryAccent,
                            unselectedIconColor = palette.textSecondary,
                            unselectedTextColor = palette.textSecondary
                        )
                    )
                }
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            if (bannerMsg != null) {
                Surface(
                    color = palette.elevated,
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, palette.primaryAccent.copy(alpha = 0.45f)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = bannerMsg ?: "",
                            color = palette.textPrimary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(1f)
                        )
                        IconButton(
                            onClick = { AppRepository.showBanner(null) },
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Cerrar aviso",
                                tint = palette.textSecondary,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                }
            }

            when (currentTab) {
                MainTab.INICIO -> HomeNeobankScreen(
                    disponibleReal = disponibleReal,
                    totalIngresos = totalIngresos,
                    totalGastos = totalGastos,
                    pagosPendientes = pagosFijosPendientes,
                    deudaTotal = deudaTotal,
                    blockedDuplicates = blockedDuplicates,
                    transactions = transactions,
                    bills = bills,
                    goals = goals,
                    salaryNeto = salaryNeto,
                    salaryFreq = salaryFreq,
                    onOpenAddModal = { showAddModal = true },
                    onCleanDuplicates = { AppRepository.cleanDuplicatesNow(context) },
                    onGoToScanner = { currentTab = MainTab.ESCANER }
                )

                MainTab.ESCANER -> ScannerCleanScreen(
                    policy = policy,
                    blockedDuplicates = blockedDuplicates,
                    blockedOld = blockedOld,
                    history = history,
                    listenerActive = checkListenerEnabled(),
                    onUpdatePolicy = { AppRepository.updatePolicy(context, it) },
                    onOpenHistoryModal = { showHistoryModal = true },
                    onCleanDuplicates = { AppRepository.cleanDuplicatesNow(context) },
                    onOpenNotificationAccess = openNotificationAccess,
                    onOpenAppDetails = openAppDetails
                )

                MainTab.ANALITICA -> AnalyticsDonutScreen(
                    transactions = transactions,
                    totalIngresos = totalIngresos,
                    totalGastos = totalGastos
                )

                MainTab.CREDITOS -> CreditLifeCleanScreen(
                    credits = credits,
                    totalIngresos = totalIngresos
                )

                MainTab.ASESOR -> AdvisorCleanScreen(
                    disponibleReal = disponibleReal,
                    totalIngresos = totalIngresos,
                    totalGastos = totalGastos,
                    deudaTotal = deudaTotal,
                    onNavigateTab = { currentTab = it }
                )
            }
        }
    }

    if (showAddModal) {
        AddTransactionDialog(
            onDismiss = { showAddModal = false },
            onSave = { tx ->
                AppRepository.addManualTransaction(context, tx)
                showAddModal = false
            }
        )
    }

    if (showHistoryModal) {
        NotificationHistoryModal(
            history = history,
            onDismiss = { showHistoryModal = false },
            onClearAll = { AppRepository.clearHistory(context) }
        )
    }
}
