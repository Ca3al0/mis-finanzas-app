package com.misfinanzas.personal.a36

import android.app.DatePickerDialog
import android.content.Intent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import java.util.Calendar
import java.util.Locale
import kotlin.math.max

data class OptionTabItem<T>(
    val id: T,
    val title: String,
    val badge: String? = null,
    val icon: ImageVector
)

@Composable
fun <T> SegmentedOptionSelector(
    options: List<OptionTabItem<T>>,
    selected: T,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalAppPalette.current
    Surface(
        color = palette.surface,
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, palette.border),
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(5.dp),
            horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            options.forEach { opt ->
                val isSelected = opt.id == selected
                Surface(
                    color = if (isSelected) palette.primaryAccent else Color.Transparent,
                    shape = RoundedCornerShape(13.dp),
                    modifier = Modifier
                        .weight(1f)
                        .clickable { onSelect(opt.id) }
                ) {
                    Column(
                        modifier = Modifier.padding(vertical = 9.dp, horizontal = 4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
                        Icon(
                            imageVector = opt.icon,
                            contentDescription = opt.title,
                            tint = if (isSelected) Color.White else palette.textSecondary,
                            modifier = Modifier.size(17.dp)
                        )
                        Text(
                            text = opt.title,
                            color = if (isSelected) Color.White else palette.textSecondary,
                            fontSize = 11.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        }
    }
}

// ============================================================================
// PESTAÑA 1: INICIO (RESUMEN 2x2 + 4 OPCIONES CON EDICIÓN EN TIEMPO REAL)
// ============================================================================
enum class HomeOption {
    MOVIMIENTOS,
    PAGOS_FIJOS,
    SALARIO,
    METAS
}

@Composable
fun HomeNeobankScreen(
    disponibleReal: Long,
    totalIngresos: Long,
    totalGastos: Long,
    pagosPendientes: Long,
    deudaTotal: Long,
    blockedDuplicates: Int,
    transactions: List<TransactionItem>,
    bills: List<RecurringBillItem>,
    goals: List<SavingsGoalItem>,
    salaryNeto: Long,
    salaryFreq: String,
    onOpenAddModal: () -> Unit,
    onCleanDuplicates: () -> Unit,
    onGoToScanner: () -> Unit
) {
    val context = LocalContext.current
    val palette = LocalAppPalette.current
    var selectedOption by remember { mutableStateOf(HomeOption.MOVIMIENTOS) }
    var searchQuery by remember { mutableStateOf("") }
    var txTypeFilter by remember { mutableStateOf<TxType?>(null) }
    var editingTransaction by remember { mutableStateOf<TransactionItem?>(null) }
    var showNewBillDialog by remember { mutableStateOf(false) }
    var showNewGoalDialog by remember { mutableStateOf(false) }

    val homeOptions = remember(transactions.size, bills.size, goals.size) {
        listOf(
            OptionTabItem(HomeOption.MOVIMIENTOS, "Movimientos", "${transactions.size}", Icons.Default.ReceiptLong),
            OptionTabItem(HomeOption.PAGOS_FIJOS, "Pagos Fijos", "${bills.size}", Icons.Default.EventRepeat),
            OptionTabItem(HomeOption.SALARIO, "Salario", null, Icons.Default.Payments),
            OptionTabItem(HomeOption.METAS, "Metas", "${goals.size}", Icons.Default.Flag)
        )
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // 1. TARJETA PRINCIPAL DE SALDO CON CUADRÍCULA 2x2 ESPACIADA
        item {
            Surface(
                color = palette.surface,
                shape = RoundedCornerShape(24.dp),
                border = BorderStroke(1.dp, palette.border),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "SALDO DISPONIBLE REAL",
                            color = palette.textSecondary,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Surface(
                            color = palette.elevated,
                            shape = RoundedCornerShape(20.dp),
                            border = BorderStroke(1.dp, palette.primaryAccent.copy(alpha = 0.35f)),
                            modifier = Modifier.clickable { onGoToScanner() }
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(5.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Shield,
                                    contentDescription = "Escudo anti-duplicados",
                                    tint = palette.primaryAccent,
                                    modifier = Modifier.size(13.dp)
                                )
                                Text(
                                    text = "Anti-duplicados ($blockedDuplicates)",
                                    color = palette.primaryAccent,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    Text(
                        text = FinancialEngine.formatCop(disponibleReal),
                        color = if (disponibleReal >= 0) palette.textPrimary else palette.dangerAccent,
                        fontSize = 31.sp,
                        fontWeight = FontWeight.ExtraBold
                    )

                    Spacer(modifier = Modifier.height(14.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        SummaryMiniBox(
                            label = "Ingresos del Mes",
                            value = FinancialEngine.formatCop(totalIngresos),
                            valueColor = palette.primaryAccent,
                            modifier = Modifier.weight(1f)
                        )
                        SummaryMiniBox(
                            label = "Compras Únicas",
                            value = FinancialEngine.formatCop(totalGastos),
                            valueColor = palette.textPrimary,
                            modifier = Modifier.weight(1f)
                        )
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        SummaryMiniBox(
                            label = "Pagos Fijos Pend.",
                            value = FinancialEngine.formatCop(pagosPendientes),
                            valueColor = palette.warningAccent,
                            modifier = Modifier.weight(1f)
                        )
                        SummaryMiniBox(
                            label = "Deuda Total",
                            value = FinancialEngine.formatCop(deudaTotal),
                            valueColor = palette.dangerAccent,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        }

        // 2. MENÚ DE 4 OPCIONES EN INICIO
        item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "OPCIONES DE TU MES (TOCA PARA CAMBIAR DE VISTA)",
                    color = palette.textSecondary,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 4.dp)
                )
                SegmentedOptionSelector(
                    options = homeOptions,
                    selected = selectedOption,
                    onSelect = { selectedOption = it }
                )
            }
        }

        // 3. VISTA EXCLUSIVA DE LA OPCIÓN ELEGIDA
        when (selectedOption) {
            HomeOption.MOVIMIENTOS -> {
                item {
                    Surface(
                        color = palette.surface,
                        shape = RoundedCornerShape(20.dp),
                        border = BorderStroke(1.dp, palette.border),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        text = "Tabla de Movimientos (${transactions.size})",
                                        color = palette.textPrimary,
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        text = "Toca cualquier registro para editar monto o categoría en vivo",
                                        color = palette.textSecondary,
                                        fontSize = 11.sp
                                    )
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    if (transactions.size > 1) {
                                        OutlinedButton(
                                            onClick = onCleanDuplicates,
                                            shape = RoundedCornerShape(10.dp),
                                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                            border = BorderStroke(1.dp, palette.border),
                                            modifier = Modifier.testTag("deduplicate_button")
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.CleaningServices,
                                                contentDescription = "Limpiar repetidos",
                                                tint = palette.primaryAccent,
                                                modifier = Modifier.size(14.dp)
                                            )
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text("Depurar", fontSize = 11.sp, color = palette.textPrimary)
                                        }
                                    }
                                    Button(
                                        onClick = onOpenAddModal,
                                        colors = ButtonDefaults.buttonColors(containerColor = palette.secondaryAccent),
                                        shape = RoundedCornerShape(10.dp),
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                                    ) {
                                        Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(14.dp), tint = Color.White)
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Nuevo", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White)
                                    }
                                }
                            }

                            OutlinedTextField(
                                value = searchQuery,
                                onValueChange = { searchQuery = it },
                                placeholder = { Text("Buscar por comercio, banco o categoría...", fontSize = 12.sp) },
                                leadingIcon = {
                                    Icon(
                                        imageVector = Icons.Default.Search,
                                        contentDescription = "Buscar",
                                        modifier = Modifier.size(18.dp)
                                    )
                                },
                                singleLine = true,
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("search_transactions_input")
                            )

                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                FilterChip(
                                    selected = txTypeFilter == null,
                                    onClick = { txTypeFilter = null },
                                    label = { Text("Todos", fontSize = 11.sp) }
                                )
                                FilterChip(
                                    selected = txTypeFilter == TxType.GASTO,
                                    onClick = { txTypeFilter = TxType.GASTO },
                                    label = { Text("Compras", fontSize = 11.sp) }
                                )
                                FilterChip(
                                    selected = txTypeFilter == TxType.GANANCIA,
                                    onClick = { txTypeFilter = TxType.GANANCIA },
                                    label = { Text("Ingresos", fontSize = 11.sp) }
                                )
                            }
                        }
                    }
                }

                val filtered = transactions.filter { tx ->
                    val matchesType = txTypeFilter == null || tx.tipo == txTypeFilter
                    val q = searchQuery.trim().lowercase(Locale.ROOT)
                    val matchesQuery = q.isEmpty() ||
                        tx.desc.lowercase(Locale.ROOT).contains(q) ||
                        tx.entidad.lowercase(Locale.ROOT).contains(q) ||
                        tx.categoria.lowercase(Locale.ROOT).contains(q)
                    matchesType && matchesQuery
                }

                if (filtered.isEmpty()) {
                    item {
                        EmptyStateCard(
                            title = "Sin movimientos en esta vista",
                            subtitle = "Tus compras bancarias se registrarán automáticamente una sola vez sin repetirse.",
                            actionLabel = "+ Registrar movimiento manual",
                            onAction = onOpenAddModal
                        )
                    }
                } else {
                    items(filtered, key = { it.id }) { tx ->
                        TransactionRowCard(
                            tx = tx,
                            onEdit = { editingTransaction = tx },
                            onDelete = { AppRepository.deleteTransaction(context, tx.id) }
                        )
                    }
                }
            }

            HomeOption.PAGOS_FIJOS -> {
                item {
                    RecurringBillsCleanView(
                        bills = bills,
                        onOpenNewBillModal = { showNewBillDialog = true },
                        onTogglePaid = { AppRepository.toggleBillPaid(context, it) },
                        onDelete = { AppRepository.deleteBill(context, it) }
                    )
                }
            }

            HomeOption.SALARIO -> {
                item {
                    SalaryConfigSection(
                        salaryNeto = salaryNeto,
                        salaryFreq = salaryFreq,
                        onSaveSalary = { m, f -> AppRepository.updateSalary(context, m, f) },
                        onDepositNow = { amount, label ->
                            val now = System.currentTimeMillis()
                            AppRepository.addManualTransaction(
                                context,
                                TransactionItem(
                                    id = "tx-sal-$now",
                                    desc = label,
                                    monto = amount,
                                    tipo = TxType.GANANCIA,
                                    categoria = "Salario / Ingreso Principal",
                                    entidad = "Nómina",
                                    fechaStr = FinancialEngine.formatShortDate(now),
                                    timestamp = now
                                )
                            )
                        }
                    )
                }
            }

            HomeOption.METAS -> {
                item {
                    GoalsCleanView(
                        goals = goals,
                        onOpenNewGoalModal = { showNewGoalDialog = true },
                        onContribute = { id, ab -> AppRepository.contributeGoal(context, id, ab) },
                        onDelete = { AppRepository.deleteGoal(context, it) }
                    )
                }
            }
        }
    }

    editingTransaction?.let { txToEdit ->
        EditTransactionDialog(
            tx = txToEdit,
            onDismiss = { editingTransaction = null },
            onSave = { newDesc, newMonto, newCat, newTipo ->
                AppRepository.updateTransaction(
                    context = context,
                    id = txToEdit.id,
                    newDesc = newDesc,
                    newMonto = newMonto,
                    newCategoria = newCat,
                    newTipo = newTipo
                )
                editingTransaction = null
            }
        )
    }

    if (showNewBillDialog) {
        NewBillModalDialog(
            onDismiss = { showNewBillDialog = false },
            onSave = { n, m, d ->
                AppRepository.addBill(context, n, m, d, "Vivienda y Servicios")
                showNewBillDialog = false
            }
        )
    }

    if (showNewGoalDialog) {
        NewGoalModalDialog(
            onDismiss = { showNewGoalDialog = false },
            onSave = { n, obj, m ->
                AppRepository.addGoal(context, n, obj, m)
                showNewGoalDialog = false
            }
        )
    }
}

@Composable
private fun SummaryMiniBox(
    label: String,
    value: String,
    valueColor: Color,
    modifier: Modifier = Modifier
) {
    val palette = LocalAppPalette.current
    Surface(
        color = palette.elevated,
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, palette.border),
        modifier = modifier
    ) {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
            Text(
                text = label,
                color = palette.textSecondary,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(modifier = Modifier.height(3.dp))
            Text(
                text = value,
                color = valueColor,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun MetricColumn(label: String, value: String, valueColor: Color) {
    val palette = LocalAppPalette.current
    Column {
        Text(text = label, color = palette.textSecondary, fontSize = 11.sp)
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            text = value,
            color = valueColor,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
fun TransactionRowCard(
    tx: TransactionItem,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    val palette = LocalAppPalette.current
    val isIncome = tx.tipo == TxType.GANANCIA
    Surface(
        color = palette.surface,
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, palette.border),
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onEdit() }
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.weight(1f)
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(11.dp))
                        .background(
                            if (isIncome) palette.primaryAccent.copy(alpha = 0.14f)
                            else palette.secondaryAccent.copy(alpha = 0.14f)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = if (isIncome) Icons.Default.SouthWest else Icons.Default.NorthEast,
                        contentDescription = tx.tipo.label,
                        tint = if (isIncome) palette.primaryAccent else palette.secondaryAccent,
                        modifier = Modifier.size(17.dp)
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = tx.desc,
                            color = palette.textPrimary,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        if (tx.duplicateAlertsCount > 1) {
                            Surface(
                                color = palette.primaryAccent.copy(alpha = 0.15f),
                                shape = RoundedCornerShape(6.dp)
                            ) {
                                Text(
                                    text = "${tx.duplicateAlertsCount} avisos -> 1 cobro",
                                    color = palette.primaryAccent,
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp)
                                )
                            }
                        }
                    }
                    Text(
                        text = "${tx.entidad} • ${tx.categoria} • ${tx.fechaStr}",
                        color = palette.textSecondary,
                        fontSize = 11.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = (if (isIncome) "+" else "-") + FinancialEngine.formatCop(tx.monto),
                    color = if (isIncome) palette.primaryAccent else palette.textPrimary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.ExtraBold
                )
                IconButton(onClick = onEdit, modifier = Modifier.size(28.dp)) {
                    Icon(
                        imageVector = Icons.Default.Edit,
                        contentDescription = "Editar movimiento",
                        tint = palette.secondaryAccent,
                        modifier = Modifier.size(15.dp)
                    )
                }
                IconButton(onClick = onDelete, modifier = Modifier.size(28.dp)) {
                    Icon(
                        imageVector = Icons.Default.DeleteOutline,
                        contentDescription = "Eliminar",
                        tint = palette.textSecondary,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyStateCard(
    title: String,
    subtitle: String,
    actionLabel: String,
    onAction: () -> Unit
) {
    val palette = LocalAppPalette.current
    Surface(
        color = palette.surface,
        shape = RoundedCornerShape(20.dp),
        border = BorderStroke(1.dp, palette.border),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(text = title, color = palette.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = subtitle, color = palette.textSecondary, fontSize = 12.sp, textAlign = TextAlign.Center)
            Spacer(modifier = Modifier.height(14.dp))
            Button(
                onClick = onAction,
                colors = ButtonDefaults.buttonColors(containerColor = palette.primaryAccent, contentColor = Color.White),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(actionLabel, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun RecurringBillsCleanView(
    bills: List<RecurringBillItem>,
    onOpenNewBillModal: () -> Unit,
    onTogglePaid: (String) -> Unit,
    onDelete: (String) -> Unit
) {
    val palette = LocalAppPalette.current
    Surface(
        color = palette.surface,
        shape = RoundedCornerShape(22.dp),
        border = BorderStroke(1.dp, palette.border),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Pagos Fijos Mensuales", color = palette.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    Text("Arriendo, servicios, internet y suscripciones", color = palette.textSecondary, fontSize = 11.sp)
                }
                Button(
                    onClick = onOpenNewBillModal,
                    colors = ButtonDefaults.buttonColors(containerColor = palette.primaryAccent, contentColor = Color.White),
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)
                ) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(15.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Agregar", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }

            if (bills.isEmpty()) {
                Text(
                    text = "No tienes pagos fijos registrados. Usa el botón '+ Agregar' para crear uno.",
                    color = palette.textSecondary,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(vertical = 12.dp)
                )
            } else {
                bills.forEach { b ->
                    Surface(
                        color = palette.elevated,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(b.nombre, color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                Text("Día ${b.diaPago} • ${FinancialEngine.formatCop(b.monto)}", color = palette.textSecondary, fontSize = 12.sp)
                            }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                TextButton(onClick = { onTogglePaid(b.id) }) {
                                    Text(
                                        text = if (b.pagadoEsteMes) "Pagado ✓" else "Marcar Pagado",
                                        color = if (b.pagadoEsteMes) palette.primaryAccent else palette.secondaryAccent,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                IconButton(onClick = { onDelete(b.id) }, modifier = Modifier.size(28.dp)) {
                                    Icon(Icons.Default.DeleteOutline, contentDescription = "Borrar", tint = palette.textSecondary, modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SalaryConfigSection(
    salaryNeto: Long,
    salaryFreq: String,
    onSaveSalary: (Long, String) -> Unit,
    onDepositNow: (Long, String) -> Unit
) {
    val palette = LocalAppPalette.current
    var inputMonto by remember(salaryNeto) { mutableStateOf(if (salaryNeto > 0) salaryNeto.toString() else "") }
    var freq by remember(salaryFreq) { mutableStateOf(salaryFreq) }

    Surface(
        color = palette.surface,
        shape = RoundedCornerShape(22.dp),
        border = BorderStroke(1.dp, palette.border),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Configuración de Salario", color = palette.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Text(
                text = "Define tu ingreso fijo para calcular automáticamente tu Disponible Real del mes.",
                color = palette.textSecondary,
                fontSize = 12.sp
            )
            OutlinedTextField(
                value = inputMonto,
                onValueChange = { inputMonto = it.filter { c -> c.isDigit() } },
                label = { Text("Salario Mensual Neto ($)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("mensual", "quincenal").forEach { f ->
                    FilterChip(
                        selected = freq == f,
                        onClick = { freq = f },
                        label = { Text(f.replaceFirstChar { it.uppercase() }) }
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { onSaveSalary(inputMonto.toLongOrNull() ?: 0L, freq) },
                    colors = ButtonDefaults.buttonColors(containerColor = palette.primaryAccent, contentColor = Color.White),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Guardar Salario", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
                if (salaryNeto > 0) {
                    OutlinedButton(
                        onClick = {
                            val amt = if (freq == "quincenal") salaryNeto / 2 else salaryNeto
                            onDepositNow(amt, if (freq == "quincenal") "Pago Quincena" else "Pago Salario")
                        },
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Abonar al Mes", fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun GoalsCleanView(
    goals: List<SavingsGoalItem>,
    onOpenNewGoalModal: () -> Unit,
    onContribute: (String, Long) -> Unit,
    onDelete: (String) -> Unit
) {
    val palette = LocalAppPalette.current
    Surface(
        color = palette.surface,
        shape = RoundedCornerShape(22.dp),
        border = BorderStroke(1.dp, palette.border),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Metas de Ahorro", color = palette.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    Text("Propósitos financieros y fondo de emergencia", color = palette.textSecondary, fontSize = 11.sp)
                }
                Button(
                    onClick = onOpenNewGoalModal,
                    colors = ButtonDefaults.buttonColors(containerColor = palette.primaryAccent, contentColor = Color.White),
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)
                ) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(15.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Nueva Meta", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }

            if (goals.isEmpty()) {
                Text(
                    text = "Aún no has creado metas. Toca '+ Nueva Meta' para empezar.",
                    color = palette.textSecondary,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(vertical = 12.dp)
                )
            } else {
                goals.forEach { g ->
                    val pct = if (g.montoObjetivo > 0) (g.montoAhorrado.toFloat() / g.montoObjetivo.toFloat()).coerceIn(0f, 1f) else 0f
                    Surface(color = palette.elevated, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(g.nombre, color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                Text("${FinancialEngine.formatCop(g.montoAhorrado)} / ${FinancialEngine.formatCop(g.montoObjetivo)}", color = palette.primaryAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                            LinearProgressIndicator(
                                progress = { pct },
                                color = palette.primaryAccent,
                                trackColor = palette.border,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(6.dp)
                                    .clip(CircleShape)
                            )
                            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                                TextButton(onClick = { onContribute(g.id, max(50_000L, g.montoObjetivo / max(1, g.plazoMeses))) }) {
                                    Text("+ Abonar cuota", color = palette.secondaryAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                                IconButton(onClick = { onDelete(g.id) }, modifier = Modifier.size(28.dp)) {
                                    Icon(Icons.Default.DeleteOutline, contentDescription = "Eliminar meta", tint = palette.textSecondary, modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ============================================================================
// PESTAÑA 2: ESCÁNER CON 4 OPCIONES (Plazo / Analizador / Historial / Permisos)
// ============================================================================
enum class ScannerOption {
    PLAZO_Y_FILTRO,
    ANALIZAR_TEXTO,
    HISTORIAL_COMPLETO,
    PERMISOS_AUTO
}

@Composable
fun ScannerCleanScreen(
    policy: CapturePolicy,
    blockedDuplicates: Int,
    blockedOld: Int,
    history: List<NotificationHistoryItem>,
    listenerActive: Boolean,
    onUpdatePolicy: (CapturePolicy) -> Unit,
    onOpenHistoryModal: () -> Unit,
    onCleanDuplicates: () -> Unit,
    onOpenNotificationAccess: () -> Unit,
    onOpenAppDetails: () -> Unit
) {
    val context = LocalContext.current
    val palette = LocalAppPalette.current
    val clipboard = LocalClipboardManager.current
    var selectedOption by remember { mutableStateOf(ScannerOption.PLAZO_Y_FILTRO) }
    var inputNotifText by remember { mutableStateOf("") }
    var historyFilter by remember { mutableStateOf<NotifStatus?>(null) }
    var historyQuery by remember { mutableStateOf("") }

    val scannerOptions = remember(history.size) {
        listOf(
            OptionTabItem(ScannerOption.PLAZO_Y_FILTRO, "Plazo", null, Icons.Default.EventAvailable),
            OptionTabItem(ScannerOption.ANALIZAR_TEXTO, "Analizar", null, Icons.Default.DocumentScanner),
            OptionTabItem(ScannerOption.HISTORIAL_COMPLETO, "Historial (${history.size})", null, Icons.Default.History),
            OptionTabItem(ScannerOption.PERMISOS_AUTO, "Permisos", null, Icons.Default.NotificationsActive)
        )
    }

    val openDatePicker = {
        val cal = Calendar.getInstance()
        cal.timeInMillis = policy.timestampCorteMs
        DatePickerDialog(
            context,
            { _, year, month, dayOfMonth ->
                val chosen = Calendar.getInstance().apply {
                    set(year, month, dayOfMonth, 0, 0, 0)
                    set(Calendar.MILLISECOND, 0)
                }
                onUpdatePolicy(
                    policy.copy(
                        ignorarAntiguas = true,
                        modoPlazo = CaptureTimeframeMode.FECHA_PERSONALIZADA,
                        timestampCorteMs = chosen.timeInMillis
                    )
                )
            },
            cal.get(Calendar.YEAR),
            cal.get(Calendar.MONTH),
            cal.get(Calendar.DAY_OF_MONTH)
        ).show()
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "OPCIONES DEL ESCÁNER E HISTORIAL DE NOTIFICACIONES",
                    color = palette.textSecondary,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 4.dp)
                )
                SegmentedOptionSelector(
                    options = scannerOptions,
                    selected = selectedOption,
                    onSelect = { selectedOption = it }
                )
            }
        }

        when (selectedOption) {
            // OPCIÓN 1: PLAZO DE FECHA Y ESCUDO ANTI-DUPLICADOS
            ScannerOption.PLAZO_Y_FILTRO -> {
                item {
                    Surface(
                        color = palette.surface,
                        shape = RoundedCornerShape(24.dp),
                        border = BorderStroke(1.dp, palette.border),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "Plazo de Registro y Anti-Duplicados",
                                        color = palette.textPrimary,
                                        fontSize = 16.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        text = "Recibiendo desde: ${FinancialEngine.formatShortDate(policy.effectiveCutoffMs())}",
                                        color = palette.primaryAccent,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }

                                OutlinedButton(
                                    onClick = { selectedOption = ScannerOption.HISTORIAL_COMPLETO },
                                    shape = RoundedCornerShape(12.dp),
                                    border = BorderStroke(1.dp, palette.border),
                                    modifier = Modifier.testTag("open_history_modal_button")
                                ) {
                                    Icon(Icons.Default.History, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Ver (${history.size})", fontSize = 12.sp)
                                }
                            }

                            Text(
                                text = "Elige desde qué fecha en adelante deseas registrar compras (las anteriores se ignorarán):",
                                color = palette.textSecondary,
                                fontSize = 12.sp
                            )

                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                CaptureTimeframeMode.entries.forEach { mode ->
                                    val selected = policy.modoPlazo == mode
                                    Surface(
                                        color = if (selected) palette.primaryAccent.copy(alpha = 0.14f) else palette.elevated,
                                        shape = RoundedCornerShape(14.dp),
                                        border = BorderStroke(
                                            1.dp,
                                            if (selected) palette.primaryAccent else palette.border
                                        ),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable {
                                                if (mode == CaptureTimeframeMode.FECHA_PERSONALIZADA) {
                                                    openDatePicker()
                                                } else {
                                                    onUpdatePolicy(
                                                        policy.copy(
                                                            ignorarAntiguas = true,
                                                            modoPlazo = mode,
                                                            timestampCorteMs = if (mode == CaptureTimeframeMode.DESDE_AHORA) System.currentTimeMillis() else policy.timestampCorteMs
                                                        )
                                                    )
                                                }
                                            }
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(horizontal = 14.dp, vertical = 11.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                                            ) {
                                                RadioButton(
                                                    selected = selected,
                                                    onClick = null,
                                                    colors = RadioButtonDefaults.colors(selectedColor = palette.primaryAccent)
                                                )
                                                Column {
                                                    Text(
                                                        text = mode.label,
                                                        color = palette.textPrimary,
                                                        fontSize = 13.sp,
                                                        fontWeight = FontWeight.SemiBold
                                                    )
                                                    if (mode == CaptureTimeframeMode.FECHA_PERSONALIZADA && selected) {
                                                        Text(
                                                            text = "Fecha elegida: ${FinancialEngine.formatShortDate(policy.timestampCorteMs)}",
                                                            color = palette.primaryAccent,
                                                            fontSize = 11.sp
                                                        )
                                                    }
                                                }
                                            }
                                            if (mode == CaptureTimeframeMode.FECHA_PERSONALIZADA) {
                                                TextButton(onClick = openDatePicker) {
                                                    Text("Calendario", color = palette.secondaryAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            if (policy.modoPlazo == CaptureTimeframeMode.ULTIMOS_DIAS) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    listOf(1, 3, 7, 15, 30).forEach { d ->
                                        FilterChip(
                                            selected = policy.ultimosDias == d,
                                            onClick = { onUpdatePolicy(policy.copy(ultimosDias = d)) },
                                            label = { Text("${d}d", fontSize = 11.sp) }
                                        )
                                    }
                                }
                            }

                            HorizontalDivider(color = palette.border)

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        text = "Escudo Anti-Duplicados Activo",
                                        color = palette.textPrimary,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        text = "Repetidas bloqueadas: $blockedDuplicates • Antiguas omitidas: $blockedOld",
                                        color = palette.textSecondary,
                                        fontSize = 11.sp
                                    )
                                }
                                OutlinedButton(
                                    onClick = onCleanDuplicates,
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Text("Depurar", color = palette.primaryAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            }

            // OPCIÓN 2: ANALIZAR NOTIFICACIÓN + PRUEBAS EN VIVO
            ScannerOption.ANALIZAR_TEXTO -> {
                item {
                    Surface(
                        color = palette.surface,
                        shape = RoundedCornerShape(24.dp),
                        border = BorderStroke(1.dp, palette.border),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Analizador Inteligente de Notificaciones",
                                    color = palette.textPrimary,
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                TextButton(
                                    onClick = {
                                        val clipText = clipboard.getText()?.text?.trim().orEmpty()
                                        if (clipText.isNotEmpty()) {
                                            inputNotifText = clipText
                                            AppRepository.processIncomingNotification(context, "Portapapeles", clipText)
                                        }
                                    }
                                ) {
                                    Icon(Icons.Default.ContentPaste, contentDescription = null, modifier = Modifier.size(15.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Pegar", fontSize = 12.sp)
                                }
                            }

                            OutlinedTextField(
                                value = inputNotifText,
                                onValueChange = { inputNotifText = it },
                                placeholder = {
                                    Text(
                                        "Pega o escribe una notificación bancaria (Ej: Bancolombia: Compraste $45.000 en Crepes & Waffles...)",
                                        fontSize = 12.sp
                                    )
                                },
                                minLines = 3,
                                shape = RoundedCornerShape(16.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("scanner_input_text")
                            )

                            Button(
                                onClick = {
                                    if (inputNotifText.isNotBlank()) {
                                        AppRepository.processIncomingNotification(context, "Escáner", inputNotifText)
                                        inputNotifText = ""
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = palette.primaryAccent, contentColor = Color.White),
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("analyze_notification_button")
                            ) {
                                Text("Analizar y Registrar Compra Única", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                            }

                            HorizontalDivider(color = palette.border)

                            Text(
                                text = "PRUEBAS RÁPIDAS EN 1 TOQUE (Verifica análisis, anti-duplicados y filtro de fecha):",
                                color = palette.textSecondary,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )

                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                                OutlinedButton(
                                    onClick = {
                                        AppRepository.processIncomingNotification(
                                            context,
                                            "Bancolombia",
                                            "Bancolombia te informa compra por $54.000 en CREPES Y WAFFLES con tu Tarjeta Debito."
                                        )
                                    },
                                    shape = RoundedCornerShape(12.dp),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text("1. Simular Compra", fontSize = 11.sp)
                                }
                                OutlinedButton(
                                    onClick = {
                                        // Envía un segundo aviso de la misma compra de $54.000 para demostrar el bloqueo anti-duplicados
                                        AppRepository.processIncomingNotification(
                                            context,
                                            "PSE / SMS",
                                            "Alerta de seguridad Bancolombia: Transaccion aprobada en CREPES Y WAFFLES por valor de $54.000."
                                        )
                                    },
                                    shape = RoundedCornerShape(12.dp),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text("2. Probar Duplicado", fontSize = 11.sp)
                                }
                            }
                        }
                    }
                }
            }

            // OPCIÓN 3: HISTORIAL COMPLETO INTERACTIVO (Registradas / Duplicadas / Antiguas)
            ScannerOption.HISTORIAL_COMPLETO -> {
                item {
                    Surface(
                        color = palette.surface,
                        shape = RoundedCornerShape(24.dp),
                        border = BorderStroke(1.dp, palette.border),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text("Historial de Notificaciones (${history.size})", color = palette.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                                    Text("Consulta las compras registradas y las bloqueadas por duplicado o antigüedad", color = palette.textSecondary, fontSize = 11.sp)
                                }
                                if (history.isNotEmpty()) {
                                    TextButton(onClick = { AppRepository.clearHistory(context) }) {
                                        Text("Limpiar", color = palette.dangerAccent, fontSize = 12.sp)
                                    }
                                }
                            }

                            OutlinedTextField(
                                value = historyQuery,
                                onValueChange = { historyQuery = it },
                                placeholder = { Text("Buscar por banco, comercio o monto...", fontSize = 12.sp) },
                                singleLine = true,
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.fillMaxWidth()
                            )

                            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                item {
                                    FilterChip(
                                        selected = historyFilter == null,
                                        onClick = { historyFilter = null },
                                        label = { Text("Todas (${history.size})", fontSize = 11.sp) }
                                    )
                                }
                                items(NotifStatus.entries) { st ->
                                    val count = history.count { it.status == st }
                                    FilterChip(
                                        selected = historyFilter == st,
                                        onClick = { historyFilter = st },
                                        label = { Text("${st.label} ($count)", fontSize = 11.sp) }
                                    )
                                }
                            }
                        }
                    }
                }

                val filteredHistory = history.filter { h ->
                    val matchStatus = historyFilter == null || h.status == historyFilter
                    val q = historyQuery.trim().lowercase(Locale.ROOT)
                    val matchText = q.isEmpty() ||
                        h.resumen.lowercase(Locale.ROOT).contains(q) ||
                        h.textoOriginal.lowercase(Locale.ROOT).contains(q) ||
                        h.entidad.lowercase(Locale.ROOT).contains(q)
                    matchStatus && matchText
                }

                if (filteredHistory.isEmpty()) {
                    item {
                        Surface(
                            color = palette.surface,
                            shape = RoundedCornerShape(20.dp),
                            border = BorderStroke(1.dp, palette.border),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = "No hay notificaciones en esta categoría del historial.",
                                color = palette.textSecondary,
                                fontSize = 12.sp,
                                modifier = Modifier.padding(20.dp)
                            )
                        }
                    }
                } else {
                    items(filteredHistory, key = { it.id }) { item ->
                        val badgeColor = when (item.status) {
                            NotifStatus.REGISTRADA -> palette.primaryAccent
                            NotifStatus.DUPLICADA -> palette.warningAccent
                            NotifStatus.ANTIGUA_OMITIDA -> palette.dangerAccent
                        }
                        Surface(
                            color = palette.surface,
                            shape = RoundedCornerShape(18.dp),
                            border = BorderStroke(1.dp, palette.border),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Surface(
                                            color = badgeColor.copy(alpha = 0.14f),
                                            shape = RoundedCornerShape(8.dp)
                                        ) {
                                            Text(
                                                text = item.status.label,
                                                color = badgeColor,
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp)
                                            )
                                        }
                                        Text("${item.entidad} • ${item.fechaStr}", color = palette.textSecondary, fontSize = 11.sp)
                                    }
                                    Text(
                                        text = FinancialEngine.formatCop(item.monto),
                                        color = palette.textPrimary,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.ExtraBold
                                    )
                                }

                                Text(item.resumen, color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                Text(item.textoOriginal, color = palette.textSecondary, fontSize = 11.sp)
                                Text(item.motivo, color = badgeColor, fontSize = 11.sp, fontWeight = FontWeight.Medium)

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.End
                                ) {
                                    if (item.status != NotifStatus.REGISTRADA) {
                                        TextButton(
                                            onClick = {
                                                AppRepository.processIncomingNotification(
                                                    context = context,
                                                    sourceName = item.entidad,
                                                    rawText = item.textoOriginal,
                                                    postTimeMs = item.timestamp,
                                                    bypassFilters = true
                                                )
                                            }
                                        ) {
                                            Text("Registrar de todos modos", color = palette.primaryAccent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                        }
                                    }
                                    TextButton(onClick = { AppRepository.deleteHistoryItem(context, item.id) }) {
                                        Text("Borrar del historial", color = palette.textSecondary, fontSize = 11.sp)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // OPCIÓN 4: PERMISOS DE LECTURA AUTOMÁTICA 24/7
            ScannerOption.PERMISOS_AUTO -> {
                item {
                    Surface(
                        color = palette.surface,
                        shape = RoundedCornerShape(24.dp),
                        border = BorderStroke(1.dp, palette.border),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(12.dp)
                                        .clip(CircleShape)
                                        .background(if (listenerActive) palette.primaryAccent else palette.warningAccent)
                                )
                                Text(
                                    text = if (listenerActive) "Lectura Automática Activa 24/7" else "Permiso Pendiente de Activación",
                                    color = palette.textPrimary,
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }

                            Text(
                                text = "Activa estos 2 pasos para que cada notificación de Nequi, Bancolombia, Daviplata, Nu y SMS se analice sola al instante:",
                                color = palette.textSecondary,
                                fontSize = 12.sp
                            )

                            Surface(color = palette.elevated, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text("Paso 1: Permitir ajustes restringidos", color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                    Text("En información de la app, toca los 3 puntos (⋮) arriba a la derecha y selecciona 'Permitir ajustes restringidos'.", color = palette.textSecondary, fontSize = 12.sp)
                                    OutlinedButton(
                                        onClick = onOpenAppDetails,
                                        shape = RoundedCornerShape(12.dp),
                                        modifier = Modifier.fillMaxWidth().testTag("btn_app_details")
                                    ) {
                                        Text("Abrir Paso 1: Información de la App", fontSize = 12.sp)
                                    }
                                }
                            }

                            Surface(color = palette.elevated, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text("Paso 2: Encender Acceso a Notificaciones", color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                    Text("Busca 'Mis Finanzas' en la lista del sistema y enciende el interruptor.", color = palette.textSecondary, fontSize = 12.sp)
                                    Button(
                                        onClick = onOpenNotificationAccess,
                                        colors = ButtonDefaults.buttonColors(containerColor = palette.primaryAccent, contentColor = Color.White),
                                        shape = RoundedCornerShape(12.dp),
                                        modifier = Modifier.fillMaxWidth().testTag("btn_notif_access")
                                    ) {
                                        Text("Abrir Paso 2: Acceso a Notificaciones", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ============================================================================
// PESTAÑA 3: GRÁFICAS Y TABLAS EDITABLES EN TIEMPO REAL
// ============================================================================
enum class AnalyticsOption {
    GRAFICO_ANILLOS,
    PROMEDIOS_Y_REGLA,
    SIMULADOR_CUOTAS
}

@Composable
fun AnalyticsDonutScreen(
    transactions: List<TransactionItem>,
    totalIngresos: Long,
    totalGastos: Long
) {
    val context = LocalContext.current
    val palette = LocalAppPalette.current
    var selectedOption by remember { mutableStateOf(AnalyticsOption.GRAFICO_ANILLOS) }
    var editingTx by remember { mutableStateOf<TransactionItem?>(null) }

    val expenses = transactions.filter { it.tipo == TxType.GASTO }
    // Paleta cálida y contrastada sin azules oscuros
    val chartColors = listOf(
        0xFFC25E00, // #1 Terracota Cálido
        0xFF0D7A5F, // #2 Esmeralda Bosque
        0xFFD97706, // #3 Ámbar Dorado
        0xFFBE123C, // #4 Carmesí
        0xFF65A30D, // #5 Oliva
        0xFF9333EA  // #6 Ciruela
    )

    val categoriesImpact = remember(expenses, totalGastos) {
        val grouped = expenses.groupBy { it.categoria }
            .map { (cat, list) ->
                val sum = list.sumOf { it.monto }
                Triple(cat, sum, list.size)
            }
            .sortedByDescending { it.second }

        grouped.mapIndexed { idx, (cat, sum, count) ->
            CategoryImpact(
                categoria = cat,
                total = sum,
                count = count,
                promedio = if (count > 0) sum / count else 0L,
                porcentaje = if (totalGastos > 0L) (sum.toFloat() / totalGastos.toFloat()) * 100f else 0f,
                rank = idx + 1,
                colorHex = chartColors[idx % chartColors.size]
            )
        }
    }

    var selectedIndex by remember { mutableIntStateOf(0) }
    var simMonto by remember { mutableStateOf("1200000") }
    var simCuotas by remember { mutableStateOf("6") }
    var simTasa by remember { mutableStateOf("28.5") }

    val (cuotaMensual, totalPagar, totalIntereses) = FinancialEngine.simulateInstallments(
        monto = simMonto.toLongOrNull() ?: 0L,
        cuotas = simCuotas.toIntOrNull() ?: 1,
        tasaEA = simTasa.toDoubleOrNull() ?: 28.5
    )

    val analyticsOptions = remember {
        listOf(
            OptionTabItem(AnalyticsOption.GRAFICO_ANILLOS, "Anillos y Tabla", null, Icons.Default.DonutLarge),
            OptionTabItem(AnalyticsOption.PROMEDIOS_Y_REGLA, "Promedios", null, Icons.Default.Insights),
            OptionTabItem(AnalyticsOption.SIMULADOR_CUOTAS, "Cuotas", null, Icons.Default.Calculate)
        )
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "OPCIONES DE GRÁFICAS Y CÁLCULOS EN TIEMPO REAL",
                    color = palette.textSecondary,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 4.dp)
                )
                SegmentedOptionSelector(
                    options = analyticsOptions,
                    selected = selectedOption,
                    onSelect = { selectedOption = it }
                )
            }
        }

        when (selectedOption) {
            AnalyticsOption.GRAFICO_ANILLOS -> {
                item {
                    Surface(
                        color = palette.surface,
                        shape = RoundedCornerShape(24.dp),
                        border = BorderStroke(1.dp, palette.border),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            Text(
                                text = "Gráfico de Anillos por Mayor Impacto",
                                color = palette.textPrimary,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold
                            )

                            if (categoriesImpact.isEmpty()) {
                                Text(
                                    text = "Registra compras para visualizar el gráfico de anillos interactivo.",
                                    color = palette.textSecondary,
                                    fontSize = 12.sp
                                )
                            } else {
                                val safeIndex = selectedIndex.coerceIn(0, categoriesImpact.lastIndex)
                                val activeCat = categoriesImpact[safeIndex]

                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(210.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Canvas(modifier = Modifier.size(180.dp)) {
                                        var startAngle = -90f
                                        categoriesImpact.forEachIndexed { idx, item ->
                                            val sweep = (item.porcentaje / 100f) * 360f
                                            drawArc(
                                                color = Color(item.colorHex),
                                                startAngle = startAngle,
                                                sweepAngle = max(4f, sweep - 3f),
                                                useCenter = false,
                                                style = Stroke(
                                                    width = if (idx == safeIndex) 32.dp.toPx() else 24.dp.toPx(),
                                                    cap = StrokeCap.Round
                                                )
                                            )
                                            startAngle += sweep
                                        }
                                    }

                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text(
                                            text = "#${activeCat.rank} Impacto",
                                            color = Color(activeCat.colorHex),
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                        Text(
                                            text = FinancialEngine.formatCop(activeCat.total),
                                            color = palette.textPrimary,
                                            fontSize = 16.sp,
                                            fontWeight = FontWeight.ExtraBold
                                        )
                                        Text(
                                            text = "${String.format(Locale.US, "%.1f", activeCat.porcentaje)}%",
                                            color = palette.textSecondary,
                                            fontSize = 11.sp
                                        )
                                    }
                                }

                                Text(
                                    text = "Toca una categoría para ver y editar sus datos en tiempo real:",
                                    color = palette.textSecondary,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold
                                )

                                categoriesImpact.forEachIndexed { idx, cat ->
                                    Surface(
                                        color = if (idx == safeIndex) palette.elevated else Color.Transparent,
                                        shape = RoundedCornerShape(14.dp),
                                        border = BorderStroke(1.dp, if (idx == safeIndex) Color(cat.colorHex) else palette.border),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable { selectedIndex = idx }
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(horizontal = 12.dp, vertical = 10.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                                            ) {
                                                Box(
                                                    modifier = Modifier
                                                        .size(12.dp)
                                                        .clip(CircleShape)
                                                        .background(Color(cat.colorHex))
                                                )
                                                Column {
                                                    Text(cat.categoria, color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                                    Text("${cat.count} compras • Prom: ${FinancialEngine.formatCop(cat.promedio)}", color = palette.textSecondary, fontSize = 11.sp)
                                                }
                                            }
                                            Text(
                                                text = "${FinancialEngine.formatCop(cat.total)} (${String.format(Locale.US, "%.0f", cat.porcentaje)}%)",
                                                color = palette.textPrimary,
                                                fontSize = 13.sp,
                                                fontWeight = FontWeight.ExtraBold
                                            )
                                        }
                                    }
                                }

                                // TABLA EDITABLE DE LA CATEGORÍA SELECCIONADA (Cambia la gráfica en vivo)
                                HorizontalDivider(color = palette.border)
                                Text(
                                    text = "Movimientos de \"${activeCat.categoria}\" (Toca para editar y recalcular la gráfica):",
                                    color = palette.textPrimary,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                val catTxs = expenses.filter { it.categoria == activeCat.categoria }
                                catTxs.forEach { tx ->
                                    TransactionRowCard(
                                        tx = tx,
                                        onEdit = { editingTx = tx },
                                        onDelete = { AppRepository.deleteTransaction(context, tx.id) }
                                    )
                                }
                            }
                        }
                    }
                }
            }

            AnalyticsOption.PROMEDIOS_Y_REGLA -> {
                item {
                    val promCompra = if (expenses.isNotEmpty()) totalGastos / expenses.size else 0L
                    val promDiario = totalGastos / 30L
                    Surface(
                        color = palette.surface,
                        shape = RoundedCornerShape(24.dp),
                        border = BorderStroke(1.dp, palette.border),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            Text("Promedios y Regla 50 / 30 / 20", color = palette.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                SummaryMiniBox(
                                    label = "Promedio por Compra",
                                    value = FinancialEngine.formatCop(promCompra),
                                    valueColor = palette.secondaryAccent,
                                    modifier = Modifier.weight(1f)
                                )
                                SummaryMiniBox(
                                    label = "Promedio Diario (30d)",
                                    value = FinancialEngine.formatCop(promDiario),
                                    valueColor = palette.warningAccent,
                                    modifier = Modifier.weight(1f)
                                )
                            }

                            HorizontalDivider(color = palette.border)

                            Text(
                                text = "Distribución Ideal sugerida sobre tus Ingresos (${FinancialEngine.formatCop(totalIngresos)}):",
                                color = palette.textSecondary,
                                fontSize = 12.sp
                            )

                            SummaryMiniBox(
                                label = "50% Necesidades Básicas (Tope sugerido)",
                                value = FinancialEngine.formatCop((totalIngresos * 0.5).toLong()),
                                valueColor = palette.primaryAccent,
                                modifier = Modifier.fillMaxWidth()
                            )
                            SummaryMiniBox(
                                label = "30% Gustos y Estilo de Vida (Tope sugerido)",
                                value = FinancialEngine.formatCop((totalIngresos * 0.3).toLong()),
                                valueColor = palette.secondaryAccent,
                                modifier = Modifier.fillMaxWidth()
                            )
                            SummaryMiniBox(
                                label = "20% Ahorro y Pago de Deuda (Meta mensual)",
                                value = FinancialEngine.formatCop((totalIngresos * 0.2).toLong()),
                                valueColor = palette.warningAccent,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }
                }
            }

            AnalyticsOption.SIMULADOR_CUOTAS -> {
                item {
                    Surface(
                        color = palette.surface,
                        shape = RoundedCornerShape(24.dp),
                        border = BorderStroke(1.dp, palette.border),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text("Simulador de Compras a Cuotas", color = palette.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                            Text("Calcula cuánto terminarás pagando en intereses antes de diferir una compra.", color = palette.textSecondary, fontSize = 12.sp)

                            OutlinedTextField(
                                value = simMonto,
                                onValueChange = { simMonto = it.filter { c -> c.isDigit() } },
                                label = { Text("Valor de la Compra ($)") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                OutlinedTextField(
                                    value = simCuotas,
                                    onValueChange = { simCuotas = it.filter { c -> c.isDigit() } },
                                    label = { Text("Número de Cuotas") },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    singleLine = true,
                                    modifier = Modifier.weight(1f)
                                )
                                OutlinedTextField(
                                    value = simTasa,
                                    onValueChange = { simTasa = it },
                                    label = { Text("Tasa % E.A.") },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f)
                                )
                            }

                            Surface(color = palette.elevated, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        MetricColumn("Cuota Mensual", FinancialEngine.formatCop(cuotaMensual), palette.primaryAccent)
                                        MetricColumn("Intereses Totales", FinancialEngine.formatCop(totalIntereses), palette.dangerAccent)
                                        MetricColumn("Total Final", FinancialEngine.formatCop(totalPagar), palette.textPrimary)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    editingTx?.let { txToEdit ->
        EditTransactionDialog(
            tx = txToEdit,
            onDismiss = { editingTx = null },
            onSave = { newDesc, newMonto, newCat, newTipo ->
                AppRepository.updateTransaction(
                    context = context,
                    id = txToEdit.id,
                    newDesc = newDesc,
                    newMonto = newMonto,
                    newCategoria = newCat,
                    newTipo = newTipo
                )
                editingTx = null
            }
        )
    }
}

// ============================================================================
// PESTAÑA 4: CRÉDITOS CON 3 OPCIONES SEPARADAS
// ============================================================================
enum class CreditOption {
    MIS_TARJETAS,
    SCORE_Y_CUPO,
    PLAN_DEUDAS
}

@Composable
fun CreditLifeCleanScreen(
    credits: List<CreditCardItem>,
    totalIngresos: Long
) {
    val context = LocalContext.current
    val palette = LocalAppPalette.current
    var selectedOption by remember { mutableStateOf(CreditOption.MIS_TARJETAS) }
    var showNewCreditModal by remember { mutableStateOf(false) }

    val cupoTotal = credits.sumOf { it.cupoTotal }
    val saldoTotal = credits.sumOf { it.saldoActual }
    val utilizacion = if (cupoTotal > 0) (saldoTotal.toFloat() / cupoTotal.toFloat()) * 100f else 0f
    val score = (820 - (utilizacion * 1.8f).toInt()).coerceIn(300, 950)

    val creditOptions = remember(credits.size) {
        listOf(
            OptionTabItem(CreditOption.MIS_TARJETAS, "Obligaciones", "${credits.size}", Icons.Default.CreditCard),
            OptionTabItem(CreditOption.SCORE_Y_CUPO, "Mi Score", null, Icons.Default.Speed),
            OptionTabItem(CreditOption.PLAN_DEUDAS, "Plan Pagos", null, Icons.Default.TrendingDown)
        )
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "OPCIONES DE VIDA CREDITICIA",
                    color = palette.textSecondary,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 4.dp)
                )
                SegmentedOptionSelector(
                    options = creditOptions,
                    selected = selectedOption,
                    onSelect = { selectedOption = it }
                )
            }
        }

        when (selectedOption) {
            CreditOption.MIS_TARJETAS -> {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("Mis Tarjetas y Créditos (${credits.size})", color = palette.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                            Text("Deuda total: ${FinancialEngine.formatCop(saldoTotal)}", color = palette.textSecondary, fontSize = 12.sp)
                        }
                        Button(
                            onClick = { showNewCreditModal = true },
                            colors = ButtonDefaults.buttonColors(containerColor = palette.primaryAccent, contentColor = Color.White),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(15.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Nueva", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                if (credits.isEmpty()) {
                    item {
                        EmptyStateCard(
                            title = "Sin obligaciones registradas",
                            subtitle = "Agrega tus tarjetas de crédito o préstamos para controlar tu cupo y fechas de pago.",
                            actionLabel = "+ Registrar Tarjeta o Crédito",
                            onAction = { showNewCreditModal = true }
                        )
                    }
                } else {
                    items(credits, key = { it.id }) { cred ->
                        Surface(
                            color = palette.surface,
                            shape = RoundedCornerShape(18.dp),
                            border = BorderStroke(1.dp, palette.border),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(cred.nombre, color = palette.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                                    Text(
                                        "Deuda: ${FinancialEngine.formatCop(cred.saldoActual)} • Cupo: ${FinancialEngine.formatCop(cred.cupoTotal)}",
                                        color = palette.textSecondary,
                                        fontSize = 12.sp
                                    )
                                }
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    TextButton(onClick = { AppRepository.payCredit(context, cred.id, cred.cuotaMinima) }) {
                                        Text("Abonar", color = palette.primaryAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }
                                    IconButton(onClick = { AppRepository.deleteCredit(context, cred.id) }) {
                                        Icon(Icons.Default.DeleteOutline, contentDescription = "Eliminar", tint = palette.textSecondary)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            CreditOption.SCORE_Y_CUPO -> {
                item {
                    Surface(
                        color = palette.surface,
                        shape = RoundedCornerShape(24.dp),
                        border = BorderStroke(1.dp, palette.border),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Column {
                                    Text("Score Crediticio Estimado", color = palette.textSecondary, fontSize = 12.sp)
                                    Text("$score pts", color = palette.primaryAccent, fontSize = 30.sp, fontWeight = FontWeight.ExtraBold)
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text("Uso de Cupo Total", color = palette.textSecondary, fontSize = 12.sp)
                                    Text("${String.format(Locale.US, "%.1f", utilizacion)}%", color = palette.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                            LinearProgressIndicator(
                                progress = { (utilizacion / 100f).coerceIn(0f, 1f) },
                                color = if (utilizacion <= 30f) palette.primaryAccent else palette.warningAccent,
                                trackColor = palette.border,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(8.dp)
                                    .clip(CircleShape)
                            )
                            Text(
                                text = if (utilizacion <= 30f)
                                    "Excelente: Mantener el uso de tu cupo por debajo del 30% mejora tu puntaje en centrales de riesgo."
                                else
                                    "Recomendación: Intenta bajar la utilización de tus tarjetas a menos del 30% antes de la fecha de corte.",
                                color = palette.textSecondary,
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            }

            CreditOption.PLAN_DEUDAS -> {
                item {
                    val sortedAvalancha = credits.sortedByDescending { it.tasaEA }
                    Surface(
                        color = palette.surface,
                        shape = RoundedCornerShape(24.dp),
                        border = BorderStroke(1.dp, palette.border),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text("Orden de Prioridad para Salir de Deudas", color = palette.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                            Text(
                                text = "Ataca primero la obligación #1 abonando cualquier dinero extra y paga el mínimo en las demás:",
                                color = palette.textSecondary,
                                fontSize = 12.sp
                            )
                            if (sortedAvalancha.isEmpty()) {
                                Text("No tienes deudas activas registradas.", color = palette.primaryAccent, fontSize = 13.sp)
                            } else {
                                sortedAvalancha.forEachIndexed { idx, c ->
                                    Surface(color = palette.elevated, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(12.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Column {
                                                Text("#${idx + 1} ${c.nombre}", color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                                Text("Tasa: ${c.tasaEA}% E.A. • Cuota mín: ${FinancialEngine.formatCop(c.cuotaMinima)}", color = palette.textSecondary, fontSize = 11.sp)
                                            }
                                            Text(FinancialEngine.formatCop(c.saldoActual), color = palette.warningAccent, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showNewCreditModal) {
        NewCreditModalDialog(
            onDismiss = { showNewCreditModal = false },
            onSave = { nombre, cupo, saldo ->
                AppRepository.addCredit(context, nombre, "Banco", cupo, saldo, 28.5, max(50_000L, saldo / 12))
                showNewCreditModal = false
            }
        )
    }
}

// ============================================================================
// PESTAÑA 5: AGENTE CONVERSACIONAL Y WIDGET INTERACTIVO DE PANTALLA DE INICIO
// ============================================================================
enum class AdvisorSectionOption {
    CHAT_AGENTE,
    WIDGET_INICIO
}

@Composable
fun AdvisorCleanScreen(
    disponibleReal: Long,
    totalIngresos: Long,
    totalGastos: Long,
    deudaTotal: Long,
    onNavigateTab: (MainTab) -> Unit
) {
    val context = LocalContext.current
    val palette = LocalAppPalette.current
    var selectedSection by remember { mutableStateOf(AdvisorSectionOption.CHAT_AGENTE) }
    var inputQuestion by remember { mutableStateOf("") }

    val transactions by AppRepository.transactions.collectAsState()
    val bills by AppRepository.bills.collectAsState()
    val blockedDuplicates by AppRepository.blockedDuplicates.collectAsState()
    val blockedOld by AppRepository.blockedOld.collectAsState()
    val widgetAgentReply by AppRepository.lastWidgetAgentReply.collectAsState()

    val pagosFijosPend = bills.filter { !it.pagadoEsteMes }.sumOf { it.monto }
    val lastPurchase = transactions.firstOrNull { it.tipo == TxType.GASTO } ?: transactions.firstOrNull()

    val advisorOptions = remember {
        listOf(
            OptionTabItem(AdvisorSectionOption.CHAT_AGENTE, "Chat con Agente", null, Icons.Default.AutoAwesome),
            OptionTabItem(AdvisorSectionOption.WIDGET_INICIO, "Widget de Inicio", "Nuevo", Icons.Default.Widgets)
        )
    }

    val messages = remember {
        mutableStateListOf(
            ChatMessageItem(
                id = "msg-init",
                sender = "Asesor",
                text = "¡Hola! Soy tu agente financiero conectado a tus datos, notificaciones y Widget en tiempo real. Puedes preguntarme o pedirme acciones:\n" +
                    "• \"¿Ya registraste mi última compra?\"\n" +
                    "• \"Gasté 42 mil en almuerzo con Nequi\"\n" +
                    "• \"Cambia el último gasto a 50 mil\"\n" +
                    "• \"Elimina el último gasto\"\n" +
                    "• \"Mi salario es 3.8 millones\"",
                actionsExecuted = listOf("Sincronizado con tablas, gráficas y Widget de Inicio")
            )
        )
    }

    val sendNaturalCommand: (String) -> Unit = { rawText ->
        val clean = rawText.trim()
        if (clean.isNotEmpty()) {
            messages.add(
                ChatMessageItem(
                    id = "msg-u-${System.currentTimeMillis()}",
                    sender = "Tú",
                    text = clean
                )
            )
            val result = ConversationalFinanceAgent.processUserMessage(
                context = context,
                rawInput = clean,
                onNavigateTab = onNavigateTab
            )
            AppRepository.setWidgetAgentReply(context, result.replyText)
            MisFinanzasAppWidgetProvider.updateAllWidgets(context)
            messages.add(
                ChatMessageItem(
                    id = "msg-a-${System.currentTimeMillis()}",
                    sender = "Asesor",
                    text = result.replyText,
                    actionsExecuted = result.actionsExecuted
                )
            )
        }
    }

    val quickActionChips = listOf(
        "¿Ya registraste mi última compra?",
        "Gasté 35 mil en almuerzo",
        "Elimina el último gasto",
        "Filtra notificaciones desde hoy",
        "Depura compras duplicadas"
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                text = "OPCIONES DEL AGENTE Y WIDGET DE PANTALLA DE INICIO",
                color = palette.textSecondary,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 4.dp)
            )
            SegmentedOptionSelector(
                options = advisorOptions,
                selected = selectedSection,
                onSelect = { selectedSection = it }
            )
        }

        when (selectedSection) {
            AdvisorSectionOption.CHAT_AGENTE -> {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(quickActionChips) { chip ->
                        SuggestionChip(
                            onClick = { sendNaturalCommand(chip) },
                            label = { Text(chip, fontSize = 11.sp) }
                        )
                    }
                }

                Surface(
                    color = palette.surface,
                    shape = RoundedCornerShape(24.dp),
                    border = BorderStroke(1.dp, palette.border),
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                ) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(messages, key = { it.id }) { msg ->
                            val isUser = msg.sender == "Tú"
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
                            ) {
                                Surface(
                                    color = if (isUser) palette.primaryAccent else palette.elevated,
                                    shape = RoundedCornerShape(16.dp),
                                    border = if (isUser) null else BorderStroke(1.dp, palette.border),
                                    modifier = Modifier.widthIn(max = 310.dp)
                                ) {
                                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                        if (msg.actionsExecuted.isNotEmpty()) {
                                            msg.actionsExecuted.forEach { act ->
                                                Surface(
                                                    color = palette.primaryAccent.copy(alpha = 0.16f),
                                                    shape = RoundedCornerShape(8.dp)
                                                ) {
                                                    Row(
                                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                                    ) {
                                                        Icon(
                                                            imageVector = Icons.Default.CheckCircle,
                                                            contentDescription = null,
                                                            tint = palette.primaryAccent,
                                                            modifier = Modifier.size(13.dp)
                                                        )
                                                        Text(
                                                            text = act,
                                                            color = palette.primaryAccent,
                                                            fontSize = 11.sp,
                                                            fontWeight = FontWeight.Bold
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                        Text(
                                            text = msg.text,
                                            color = if (isUser) Color.White else palette.textPrimary,
                                            fontSize = 13.sp
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedIconButton(
                        onClick = {
                            context.startActivity(
                                Intent(context, WidgetAgentDialogActivity::class.java).apply {
                                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                                    putExtra(WidgetAgentDialogActivity.EXTRA_AUTO_VOICE, true)
                                }
                            )
                        },
                        border = BorderStroke(1.dp, palette.primaryAccent),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .size(48.dp)
                            .testTag("agent_voice_dialog_button")
                    ) {
                        Icon(
                            imageVector = Icons.Default.Mic,
                            contentDescription = "Hablar por voz",
                            tint = palette.primaryAccent
                        )
                    }

                    OutlinedTextField(
                        value = inputQuestion,
                        onValueChange = { inputQuestion = it },
                        placeholder = { Text("Ej: ¿Ya registraste la compra? / Gasté 45 mil...", fontSize = 12.sp) },
                        singleLine = true,
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier
                            .weight(1f)
                            .testTag("agent_chat_input")
                    )
                    Button(
                        onClick = {
                            val q = inputQuestion
                            inputQuestion = ""
                            sendNaturalCommand(q)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = palette.primaryAccent, contentColor = Color.White),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.testTag("agent_send_button")
                    ) {
                        Icon(Icons.Default.Send, contentDescription = "Enviar", modifier = Modifier.size(18.dp))
                    }
                }
            }

            AdvisorSectionOption.WIDGET_INICIO -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    item {
                        Surface(
                            color = palette.surface,
                            shape = RoundedCornerShape(24.dp),
                            border = BorderStroke(1.dp, palette.border),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(18.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = "Widget Interactivo de Pantalla de Inicio",
                                            color = palette.textPrimary,
                                            fontSize = 16.sp,
                                            fontWeight = FontWeight.ExtraBold
                                        )
                                        Text(
                                            text = "Consulta tu saldo, verifica tu última compra y habla con el Agente sin abrir la app",
                                            color = palette.textSecondary,
                                            fontSize = 11.sp
                                        )
                                    }
                                }

                                // VISTA PREVIA EN VIVO DEL WIDGET (Idéntica al Widget Nativo de Android)
                                Surface(
                                    color = Color(0xFFF6F4EE),
                                    shape = RoundedCornerShape(22.dp),
                                    border = BorderStroke(1.5.dp, Color(0xFFDDD7C8)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column(
                                        modifier = Modifier.padding(14.dp),
                                        verticalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Column {
                                                Text(
                                                    text = "Mis Finanzas • Tiempo Real",
                                                    color = Color(0xFF181815),
                                                    fontSize = 13.sp,
                                                    fontWeight = FontWeight.ExtraBold
                                                )
                                                Text(
                                                    text = "Escudo activo • $blockedDuplicates duplicadas • $blockedOld antiguas omitidas",
                                                    color = Color(0xFF0D7A5F),
                                                    fontSize = 10.sp,
                                                    fontWeight = FontWeight.Bold
                                                )
                                            }
                                            Surface(
                                                color = Color.White,
                                                shape = RoundedCornerShape(10.dp),
                                                border = BorderStroke(1.dp, Color(0xFFE2DDD1)),
                                                modifier = Modifier.clickable {
                                                    BankNotificationListener.instance?.scanAllActiveNotifications()
                                                    MisFinanzasAppWidgetProvider.updateAllWidgets(context)
                                                    AppRepository.showBanner("Widget sincronizado con el escáner en vivo")
                                                }
                                            ) {
                                                Text(
                                                    text = "↻ Escanear",
                                                    color = Color(0xFF181815),
                                                    fontSize = 10.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                                                )
                                            }
                                        }

                                        // 3 MÉTRICAS RELEVANTES DEL WIDGET
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            Surface(
                                                color = Color.White,
                                                shape = RoundedCornerShape(12.dp),
                                                border = BorderStroke(1.dp, Color(0xFFE2DDD1)),
                                                modifier = Modifier.weight(1f)
                                            ) {
                                                Column(modifier = Modifier.padding(8.dp)) {
                                                    Text("DISPONIBLE REAL", color = Color(0xFF5E5B52), fontSize = 9.sp, fontWeight = FontWeight.Bold)
                                                    Text(
                                                        text = FinancialEngine.formatCop(disponibleReal),
                                                        color = Color(0xFF0D7A5F),
                                                        fontSize = 12.sp,
                                                        fontWeight = FontWeight.ExtraBold,
                                                        maxLines = 1
                                                    )
                                                }
                                            }
                                            Surface(
                                                color = Color.White,
                                                shape = RoundedCornerShape(12.dp),
                                                border = BorderStroke(1.dp, Color(0xFFE2DDD1)),
                                                modifier = Modifier.weight(1f)
                                            ) {
                                                Column(modifier = Modifier.padding(8.dp)) {
                                                    Text("COMPRAS MES", color = Color(0xFF5E5B52), fontSize = 9.sp, fontWeight = FontWeight.Bold)
                                                    Text(
                                                        text = FinancialEngine.formatCop(totalGastos),
                                                        color = Color(0xFFC25E00),
                                                        fontSize = 12.sp,
                                                        fontWeight = FontWeight.ExtraBold,
                                                        maxLines = 1
                                                    )
                                                }
                                            }
                                            Surface(
                                                color = Color.White,
                                                shape = RoundedCornerShape(12.dp),
                                                border = BorderStroke(1.dp, Color(0xFFE2DDD1)),
                                                modifier = Modifier.weight(1f)
                                            ) {
                                                Column(modifier = Modifier.padding(8.dp)) {
                                                    Text("FIJOS PEND.", color = Color(0xFF5E5B52), fontSize = 9.sp, fontWeight = FontWeight.Bold)
                                                    Text(
                                                        text = FinancialEngine.formatCop(pagosFijosPend),
                                                        color = Color(0xFF181815),
                                                        fontSize = 12.sp,
                                                        fontWeight = FontWeight.ExtraBold,
                                                        maxLines = 1
                                                    )
                                                }
                                            }
                                        }

                                        // ÚLTIMA COMPRA REGISTRADA EN EL WIDGET
                                        Surface(
                                            color = Color.White,
                                            shape = RoundedCornerShape(12.dp),
                                            border = BorderStroke(1.dp, Color(0xFFE2DDD1)),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Column(modifier = Modifier.padding(8.dp)) {
                                                Text(
                                                    text = "ÚLTIMA COMPRA REGISTRADA EN TIEMPO REAL",
                                                    color = Color(0xFF5E5B52),
                                                    fontSize = 9.sp,
                                                    fontWeight = FontWeight.Bold
                                                )
                                                if (lastPurchase != null) {
                                                    Text(
                                                        text = "${lastPurchase.desc} • ${FinancialEngine.formatCop(lastPurchase.monto)}",
                                                        color = Color(0xFF181815),
                                                        fontSize = 12.sp,
                                                        fontWeight = FontWeight.Bold
                                                    )
                                                    Text(
                                                        text = "${lastPurchase.entidad} • ${FinancialEngine.formatTimeAgo(lastPurchase.timestamp)} • ${lastPurchase.categoria}",
                                                        color = Color(0xFF5E5B52),
                                                        fontSize = 10.sp
                                                    )
                                                } else {
                                                    Text(
                                                        text = "Sin compras registradas aún",
                                                        color = Color(0xFF181815),
                                                        fontSize = 12.sp,
                                                        fontWeight = FontWeight.Bold
                                                    )
                                                }
                                            }
                                        }

                                        // BURBUJA DE RESPUESTA DEL AGENTE EN EL WIDGET
                                        Surface(
                                            color = Color(0xFFEAF5F1),
                                            shape = RoundedCornerShape(12.dp),
                                            border = BorderStroke(1.dp, Color(0xFF0D7A5F)),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Text(
                                                text = "Agente: $widgetAgentReply",
                                                color = Color(0xFF0D7A5F),
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.padding(9.dp)
                                            )
                                        }

                                        // BOTONES INTERACTIVOS DEL WIDGET
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            Button(
                                                onClick = {
                                                    context.startActivity(
                                                        Intent(context, WidgetAgentDialogActivity::class.java).apply {
                                                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                                                            putExtra(WidgetAgentDialogActivity.EXTRA_AUTO_VOICE, false)
                                                        }
                                                    )
                                                },
                                                colors = ButtonDefaults.buttonColors(
                                                    containerColor = Color(0xFF0D7A5F),
                                                    contentColor = Color.White
                                                ),
                                                shape = RoundedCornerShape(10.dp),
                                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp),
                                                modifier = Modifier
                                                    .weight(1.3f)
                                                    .testTag("preview_widget_ask_agent_btn")
                                            ) {
                                                Text("💬 Hablar con Agente", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                            }

                                            Button(
                                                onClick = {
                                                    context.startActivity(
                                                        Intent(context, WidgetAgentDialogActivity::class.java).apply {
                                                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                                                            putExtra(WidgetAgentDialogActivity.EXTRA_AUTO_VOICE, true)
                                                        }
                                                    )
                                                },
                                                colors = ButtonDefaults.buttonColors(
                                                    containerColor = Color(0xFF0D7A5F),
                                                    contentColor = Color.White
                                                ),
                                                shape = RoundedCornerShape(10.dp),
                                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp)
                                            ) {
                                                Text("🎤 Voz", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                            }

                                            Button(
                                                onClick = {
                                                    val res = ConversationalFinanceAgent.processUserMessage(
                                                        context = context,
                                                        rawInput = "¿Ya registraste mi última compra?"
                                                    )
                                                    AppRepository.setWidgetAgentReply(context, res.replyText)
                                                },
                                                colors = ButtonDefaults.buttonColors(
                                                    containerColor = Color(0xFFC25E00),
                                                    contentColor = Color.White
                                                ),
                                                shape = RoundedCornerShape(10.dp),
                                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp),
                                                modifier = Modifier
                                                    .weight(1.1f)
                                                    .testTag("preview_widget_check_purchase_btn")
                                            ) {
                                                Text("✓ ¿Registró compra?", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                            }
                                        }
                                    }
                                }

                                // ACCIONES PARA AGREGAR EL WIDGET A LA PANTALLA DE INICIO
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Button(
                                        onClick = {
                                            val pinned = MisFinanzasAppWidgetProvider.requestPinWidget(context)
                                            if (pinned) {
                                                AppRepository.showBanner("Confirma en la ventana del sistema para fijar el Widget en tu inicio.")
                                            } else {
                                                AppRepository.showBanner("Mantén presionada tu pantalla de inicio > Widgets > elige 'Mis Finanzas'.")
                                            }
                                        },
                                        colors = ButtonDefaults.buttonColors(
                                            containerColor = palette.primaryAccent,
                                            contentColor = Color.White
                                        ),
                                        shape = RoundedCornerShape(14.dp),
                                        modifier = Modifier
                                            .weight(1f)
                                            .testTag("pin_widget_to_home_button")
                                    ) {
                                        Icon(Icons.Default.AddToHomeScreen, contentDescription = null, modifier = Modifier.size(17.dp))
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text("Fijar Widget en Inicio", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }

                                    OutlinedButton(
                                        onClick = {
                                            context.startActivity(
                                                Intent(context, WidgetAgentDialogActivity::class.java).apply {
                                                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                                                }
                                            )
                                        },
                                        shape = RoundedCornerShape(14.dp),
                                        modifier = Modifier.testTag("open_floating_widget_dialog_button")
                                    ) {
                                        Text("Probar Ventana Rápida", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }
                                }

                                Text(
                                    text = "También puedes agregarlo manualmente manteniendo presionado un espacio vacío en la pantalla principal de tu teléfono -> sección 'Widgets' -> 'Mis Finanzas • Agente y Saldo'.",
                                    color = palette.textSecondary,
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

// ============================================================================
// MODALES DE EDICIÓN EN TIEMPO REAL Y CREACIÓN LIMPIA
// ============================================================================
@Composable
fun EditTransactionDialog(
    tx: TransactionItem,
    onDismiss: () -> Unit,
    onSave: (String, Long, String, TxType) -> Unit
) {
    val palette = LocalAppPalette.current
    var desc by remember(tx) { mutableStateOf(tx.desc) }
    var monto by remember(tx) { mutableStateOf(tx.monto.toString()) }
    var categoria by remember(tx) { mutableStateOf(tx.categoria) }
    var tipo by remember(tx) { mutableStateOf(tx.tipo) }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            color = palette.surface,
            shape = RoundedCornerShape(24.dp),
            border = BorderStroke(1.dp, palette.border),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Editar Movimiento en Tiempo Real", color = palette.textPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold)

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(TxType.GASTO, TxType.GANANCIA).forEach { t ->
                        FilterChip(
                            selected = tipo == t,
                            onClick = { tipo = t },
                            label = { Text(t.label, fontSize = 12.sp) }
                        )
                    }
                }

                OutlinedTextField(
                    value = desc,
                    onValueChange = { desc = it },
                    label = { Text("Descripción / Comercio") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = monto,
                    onValueChange = { monto = it.filter { c -> c.isDigit() } },
                    label = { Text("Monto ($)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Text("Categoría (actualiza el gráfico de anillos en vivo):", color = palette.textSecondary, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)

                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(ALL_CATEGORIES) { cat ->
                        FilterChip(
                            selected = categoria == cat,
                            onClick = { categoria = cat },
                            label = { Text(cat, fontSize = 11.sp) }
                        )
                    }
                }

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) {
                        Text("Cancelar", color = palette.textSecondary)
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Button(
                        onClick = {
                            val m = monto.toLongOrNull() ?: tx.monto
                            onSave(desc, m, categoria, tipo)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = palette.primaryAccent, contentColor = Color.White),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("Guardar Cambios", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
fun NewBillModalDialog(
    onDismiss: () -> Unit,
    onSave: (String, Long, Int) -> Unit
) {
    val palette = LocalAppPalette.current
    var nombre by remember { mutableStateOf("") }
    var monto by remember { mutableStateOf("") }
    var dia by remember { mutableStateOf("5") }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            color = palette.surface,
            shape = RoundedCornerShape(24.dp),
            border = BorderStroke(1.dp, palette.border),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Nuevo Pago Fijo Mensual", color = palette.textPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                OutlinedTextField(
                    value = nombre,
                    onValueChange = { nombre = it },
                    label = { Text("Concepto (ej: Arriendo, Internet)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = monto,
                    onValueChange = { monto = it.filter { c -> c.isDigit() } },
                    label = { Text("Valor Mensual ($)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = dia,
                    onValueChange = { dia = it.filter { c -> c.isDigit() } },
                    label = { Text("Día de pago del mes (1-31)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text("Cancelar", color = palette.textSecondary) }
                    Spacer(modifier = Modifier.width(8.dp))
                    Button(
                        onClick = {
                            val m = monto.toLongOrNull() ?: 0L
                            if (nombre.isNotBlank() && m > 0L) {
                                onSave(nombre.trim(), m, (dia.toIntOrNull() ?: 5).coerceIn(1, 31))
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = palette.primaryAccent, contentColor = Color.White)
                    ) {
                        Text("Guardar", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
fun NewGoalModalDialog(
    onDismiss: () -> Unit,
    onSave: (String, Long, Int) -> Unit
) {
    val palette = LocalAppPalette.current
    var nombre by remember { mutableStateOf("") }
    var objetivo by remember { mutableStateOf("") }
    var meses by remember { mutableStateOf("6") }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            color = palette.surface,
            shape = RoundedCornerShape(24.dp),
            border = BorderStroke(1.dp, palette.border),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Nueva Meta de Ahorro", color = palette.textPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                OutlinedTextField(
                    value = nombre,
                    onValueChange = { nombre = it },
                    label = { Text("Nombre de la Meta (ej: Fondo, Viaje)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = objetivo,
                    onValueChange = { objetivo = it.filter { c -> c.isDigit() } },
                    label = { Text("Monto Objetivo ($)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = meses,
                    onValueChange = { meses = it.filter { c -> c.isDigit() } },
                    label = { Text("Plazo estimado (meses)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text("Cancelar", color = palette.textSecondary) }
                    Spacer(modifier = Modifier.width(8.dp))
                    Button(
                        onClick = {
                            val obj = objetivo.toLongOrNull() ?: 0L
                            if (nombre.isNotBlank() && obj > 0L) {
                                onSave(nombre.trim(), obj, max(1, meses.toIntOrNull() ?: 6))
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = palette.primaryAccent, contentColor = Color.White)
                    ) {
                        Text("Crear Meta", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
fun NewCreditModalDialog(
    onDismiss: () -> Unit,
    onSave: (String, Long, Long) -> Unit
) {
    val palette = LocalAppPalette.current
    var nombre by remember { mutableStateOf("") }
    var cupo by remember { mutableStateOf("") }
    var saldo by remember { mutableStateOf("") }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            color = palette.surface,
            shape = RoundedCornerShape(24.dp),
            border = BorderStroke(1.dp, palette.border),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Registrar Tarjeta o Crédito", color = palette.textPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                OutlinedTextField(
                    value = nombre,
                    onValueChange = { nombre = it },
                    label = { Text("Nombre (ej: Tarjeta Nu / Bancolombia)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = cupo,
                    onValueChange = { cupo = it.filter { c -> c.isDigit() } },
                    label = { Text("Cupo Total Aprobado ($)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = saldo,
                    onValueChange = { saldo = it.filter { c -> c.isDigit() } },
                    label = { Text("Deuda / Saldo Actual ($)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text("Cancelar", color = palette.textSecondary) }
                    Spacer(modifier = Modifier.width(8.dp))
                    Button(
                        onClick = {
                            val s = saldo.toLongOrNull() ?: 0L
                            val c = cupo.toLongOrNull() ?: s
                            if (nombre.isNotBlank() && s > 0L) {
                                onSave(nombre.trim(), c, s)
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = palette.primaryAccent, contentColor = Color.White)
                    ) {
                        Text("Guardar", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
fun AddTransactionDialog(
    onDismiss: () -> Unit,
    onSave: (TransactionItem) -> Unit
) {
    val palette = LocalAppPalette.current
    var desc by remember { mutableStateOf("") }
    var monto by remember { mutableStateOf("") }
    var entidad by remember { mutableStateOf("Nequi") }
    var tipo by remember { mutableStateOf(TxType.GASTO) }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            color = palette.surface,
            shape = RoundedCornerShape(24.dp),
            border = BorderStroke(1.dp, palette.border),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Nuevo Movimiento", color = palette.textPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold)

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(TxType.GASTO, TxType.GANANCIA).forEach { t ->
                        FilterChip(
                            selected = tipo == t,
                            onClick = { tipo = t },
                            label = { Text(t.label, fontSize = 12.sp) }
                        )
                    }
                }

                OutlinedTextField(
                    value = monto,
                    onValueChange = { monto = it.filter { c -> c.isDigit() } },
                    label = { Text("Monto ($)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = desc,
                    onValueChange = { desc = it },
                    label = { Text("Comercio o descripción") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = entidad,
                    onValueChange = { entidad = it },
                    label = { Text("Banco / Medio (Nequi, Bancolombia...)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    TextButton(onClick = onDismiss) {
                        Text("Cancelar", color = palette.textSecondary)
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Button(
                        onClick = {
                            val m = monto.toLongOrNull() ?: 0L
                            if (m > 0L && desc.isNotBlank()) {
                                val now = System.currentTimeMillis()
                                val (cat, es) = FinancialEngine.categorize(desc, tipo)
                                onSave(
                                    TransactionItem(
                                        id = "tx-$now",
                                        desc = desc.trim(),
                                        monto = m,
                                        tipo = tipo,
                                        categoria = cat,
                                        entidad = entidad.trim().ifEmpty { "Banco" },
                                        fechaStr = FinancialEngine.formatShortDate(now),
                                        timestamp = now,
                                        esEsencial = es,
                                        fingerprint = FinancialEngine.buildFingerprint(m, tipo, desc, entidad)
                                    )
                                )
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = palette.primaryAccent, contentColor = Color.White),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("Guardar", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
fun NotificationHistoryModal(
    history: List<NotificationHistoryItem>,
    onDismiss: () -> Unit,
    onClearAll: () -> Unit
) {
    val palette = LocalAppPalette.current
    var query by remember { mutableStateOf("") }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            color = palette.surface,
            shape = RoundedCornerShape(24.dp),
            border = BorderStroke(1.dp, palette.border),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 320.dp, max = 560.dp)
        ) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Historial Completo (${history.size})", color = palette.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Cerrar", tint = palette.textSecondary)
                    }
                }

                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Buscar en historial...", fontSize = 12.sp) },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                val filtered = history.filter {
                    val q = query.trim().lowercase(Locale.ROOT)
                    q.isEmpty() || it.resumen.lowercase(Locale.ROOT).contains(q) ||
                        it.textoOriginal.lowercase(Locale.ROOT).contains(q) ||
                        it.entidad.lowercase(Locale.ROOT).contains(q)
                }

                LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (filtered.isEmpty()) {
                        item {
                            Text(
                                text = "No hay notificaciones procesadas con este filtro.",
                                color = palette.textSecondary,
                                fontSize = 12.sp,
                                modifier = Modifier.padding(vertical = 24.dp)
                            )
                        }
                    } else {
                        items(filtered, key = { it.id }) { item ->
                            Surface(color = palette.elevated, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text("${item.status.label} • ${item.entidad} • ${item.fechaStr}", color = palette.secondaryAccent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                        Text(FinancialEngine.formatCop(item.monto), color = palette.primaryAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }
                                    Text(item.resumen, color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                    Text(item.textoOriginal, color = palette.textSecondary, fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                    }
                }

                if (history.isNotEmpty()) {
                    TextButton(onClick = onClearAll, modifier = Modifier.align(Alignment.End)) {
                        Text("Vaciar historial", color = palette.dangerAccent, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}
