package com.misfinanzas.personal.a36

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

data class AppPalette(
    val isLight: Boolean,
    val bg: Color,
    val surface: Color,
    val elevated: Color,
    val border: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val primaryAccent: Color,      // Emerald / Forest
    val secondaryAccent: Color,    // Terracotta / Warm Bronze
    val warningAccent: Color,      // Amber Gold
    val dangerAccent: Color        // Crimson Rose
)

// Paleta 1: Marfil Editorial (Cálida, limpia, cero azul oscuro)
val EditorialLightPalette = AppPalette(
    isLight = true,
    bg = Color(0xFFF6F4EE),
    surface = Color(0xFFFFFFFF),
    elevated = Color(0xFFEEECE4),
    border = Color(0xFFE0DDD3),
    textPrimary = Color(0xFF181816),
    textSecondary = Color(0xFF65635D),
    primaryAccent = Color(0xFF0D7A5F),
    secondaryAccent = Color(0xFFC25E00),
    warningAccent = Color(0xFFB45309),
    dangerAccent = Color(0xFFBE123C)
)

// Paleta 2: Carbón Cálido & Bronce (Oscuro neutro cálido, sin tonos azules)
val WarmCarbonPalette = AppPalette(
    isLight = false,
    bg = Color(0xFF121210),
    surface = Color(0xFF1C1B18),
    elevated = Color(0xFF262521),
    border = Color(0xFF33312B),
    textPrimary = Color(0xFFF5F3EE),
    textSecondary = Color(0xFFA39E93),
    primaryAccent = Color(0xFF10B981),
    secondaryAccent = Color(0xFFEA580C),
    warningAccent = Color(0xFFD97706),
    dangerAccent = Color(0xFFF43F5E)
)

val LocalAppPalette = staticCompositionLocalOf { EditorialLightPalette }

@Composable
fun MisFinanzasTheme(
    useLightTheme: Boolean = true,
    content: @Composable () -> Unit
) {
    val palette = if (useLightTheme) EditorialLightPalette else WarmCarbonPalette

    val colorScheme = if (useLightTheme) {
        lightColorScheme(
            background = palette.bg,
            surface = palette.surface,
            primary = palette.primaryAccent,
            secondary = palette.secondaryAccent,
            tertiary = palette.warningAccent,
            error = palette.dangerAccent,
            onBackground = palette.textPrimary,
            onSurface = palette.textPrimary,
            onPrimary = Color.White
        )
    } else {
        darkColorScheme(
            background = palette.bg,
            surface = palette.surface,
            primary = palette.primaryAccent,
            secondary = palette.secondaryAccent,
            tertiary = palette.warningAccent,
            error = palette.dangerAccent,
            onBackground = palette.textPrimary,
            onSurface = palette.textPrimary,
            onPrimary = Color(0xFF121210)
        )
    }

    CompositionLocalProvider(LocalAppPalette provides palette) {
        MaterialTheme(
            colorScheme = colorScheme,
            content = content
        )
    }
}
