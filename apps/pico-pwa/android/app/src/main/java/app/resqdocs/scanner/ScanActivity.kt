package app.resqdocs.scanner

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.drawable.GradientDrawable
import android.hardware.camera2.CameraCharacteristics
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Size
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import androidx.annotation.OptIn
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.AppCompatImageButton
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.graphics.ColorUtils
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsControllerCompat
import app.resqdocs.R
import androidx.core.view.WindowInsetsCompat
import zxingcpp.BarcodeReader
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Vollbild-Scanner. CameraX waehlt die erste Rueckkamera (Hauptkamera; logische
 * Mehrfachkameras starten laut CDD mit normalem Sichtfeld) und ueberlaesst Linsenwechsel beim Zoomen
 * dem Geraet. Analyse in mindestens 1080p, dekodiert mit ZXing-C++ direkt auf der Y-Ebene.
 *
 * Bedienung: Start-Zoom aus dem Mindest-Fokusabstand, Zoom per Fingergeste und Regler, Tippen zum
 * Fokussieren, Licht. Bleibt der Treffer aus, fokussiert die Activity periodisch auf die Bildmitte nach.
 *
 * Datenschutz: Jedes Kamerabild lebt nur bis image.close() im Speicher. Kein Speichern, kein Logging
 * von Bild oder Inhalt, kein Netz. Zurueck geht nur der gelesene Inhalt an das Plugin.
 */
class ScanActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_BYTES = "scan.result.bytes"
        const val EXTRA_TEXT = "scan.result.text"
        const val EXTRA_FORMAT = "scan.result.format"
        const val EXTRA_DIAG = "scan.result.diag"
        const val RESULT_CAMERA_ERROR = RESULT_FIRST_USER + 1

        /** Anteil der Bildbreite fuer den Zielrahmen. */
        private const val FRAME_FILL = 0.72f
        private const val REFOCUS_INTERVAL_MS = 4000L
    }

    private lateinit var options: ScanOptions
    private lateinit var reader: BarcodeReader
    private lateinit var previewView: PreviewView
    private lateinit var diagView: TextView
    private lateinit var zoomBar: SeekBar
    private lateinit var torchButton: AppCompatImageButton
    private val analysisExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val done = AtomicBoolean(false)
    private val mainHandler = Handler(Looper.getMainLooper())
    private var camera: Camera? = null
    private var torchOn = false

    // Diagnose ohne Inhalt: nur Technik (Kamera, Aufloesung, Zoom, Fokus, Versuche).
    private var diagCamera = ""
    private var diagAnalysis = ""
    private var diagFocus = ""
    @Volatile private var attempts = 0
    @Volatile private var lastDecodeMs = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        options = ScanOptions.fromIntent(intent)
        reader = BarcodeReader(options.readerOptions())
        setContentView(buildLayout())
        // Statusleisten-Symbole passend zum Theme (heller Hintergrund -> dunkle Symbole).
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = options.theme.isLight
            isAppearanceLightNavigationBars = options.theme.isLight
        }
        val providerFuture = ProcessCameraProvider.getInstance(this)
        providerFuture.addListener({
            try {
                bindCamera(providerFuture.get())
            } catch (e: Exception) {
                finishWith(RESULT_CAMERA_ERROR, null)
            }
        }, ContextCompat.getMainExecutor(this))
    }

    override fun onDestroy() {
        super.onDestroy()
        mainHandler.removeCallbacksAndMessages(null)
        analysisExecutor.shutdown()
    }

    // ---------------------------------------------------------------- Kamera

    private fun bindCamera(provider: ProcessCameraProvider) {
        val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
        val selector = ResolutionSelector.Builder()
            .setAspectRatioStrategy(AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY)
            .setResolutionStrategy(
                ResolutionStrategy(Size(1920, 1080), ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER),
            )
            .build()
        val analysis = ImageAnalysis.Builder()
            .setResolutionSelector(selector)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
        analysis.setAnalyzer(analysisExecutor) { image -> analyze(image) }

        provider.unbindAll()
        val cam = provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
        camera = cam
        torchButton.visibility = if (cam.cameraInfo.hasFlashUnit()) View.VISIBLE else View.INVISIBLE
        cam.cameraInfo.zoomState.observe(this) { z -> zoomBar.progress = (z.linearZoom * 100).toInt() }
        applyStartZoom(cam)
        scheduleRefocus()
    }

    @OptIn(markerClass = [ExperimentalCamera2Interop::class])
    private fun applyStartZoom(cam: Camera) {
        val info = Camera2CameraInfo.from(cam.cameraInfo)
        val diopters = info.getCameraCharacteristic(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE) ?: 0f
        val calibration = info.getCameraCharacteristic(CameraCharacteristics.LENS_INFO_FOCUS_DISTANCE_CALIBRATION)
        val calibrated = calibration == CameraCharacteristics.LENS_INFO_FOCUS_DISTANCE_CALIBRATION_APPROXIMATE ||
            calibration == CameraCharacteristics.LENS_INFO_FOCUS_DISTANCE_CALIBRATION_CALIBRATED
        val focal = info.getCameraCharacteristic(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)?.firstOrNull() ?: 0f
        val sensor = info.getCameraCharacteristic(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE)
        val sensorShort = if (sensor != null) minOf(sensor.width, sensor.height) else 0f
        val maxZoom = cam.cameraInfo.zoomState.value?.maxZoomRatio ?: 1f
        val zoom = StartZoom.compute(diopters, calibrated, focal, sensorShort, options.codeSizeMm, FRAME_FILL, maxZoom)
        if (zoom > 1f) cam.cameraControl.setZoomRatio(zoom)

        diagCamera = "Kamera ${info.cameraId}"
        diagFocus = when {
            diopters <= 0f -> "Fixfokus"
            calibrated -> "Nahgrenze ~${(100f / diopters).toInt()} cm"
            else -> "Fokus unkalibriert"
        } + " · Start-Zoom ${"%.1f".format(zoom)}"
        updateDiag()
    }

    /** Ohne Treffer periodisch auf die Bildmitte nachfokussieren (manche Geraete bleiben sonst haengen). */
    private fun scheduleRefocus() {
        mainHandler.postDelayed({
            if (!done.get()) {
                focusAt(previewView.width / 2f, previewView.height / 2f)
                scheduleRefocus()
            }
        }, REFOCUS_INTERVAL_MS)
    }

    private fun focusAt(x: Float, y: Float) {
        val cam = camera ?: return
        val point = previewView.meteringPointFactory.createPoint(x, y)
        val action = FocusMeteringAction.Builder(point, FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE)
            .setAutoCancelDuration(3, TimeUnit.SECONDS)
            .build()
        cam.cameraControl.startFocusAndMetering(action)
    }

    // ---------------------------------------------------------------- Analyse

    private fun analyze(image: ImageProxy) {
        image.use {
            if (done.get()) return
            if (diagAnalysis.isEmpty()) {
                diagAnalysis = "Analyse ${image.width}x${image.height}"
                runOnUiThread { updateDiag() }
            }
            val hit = try {
                reader.read(image).firstOrNull()
            } catch (e: Exception) {
                null
            }
            attempts++
            lastDecodeMs = reader.lastReadTime
            if (attempts % 10 == 0) runOnUiThread { updateDiag() }
            val bytes = hit?.bytes ?: return
            if (!done.compareAndSet(false, true)) return
            val result = Intent()
                .putExtra(EXTRA_BYTES, bytes)
                .putExtra(EXTRA_TEXT, hit.text ?: "")
                .putExtra(EXTRA_FORMAT, hit.format.name)
            runOnUiThread {
                vibrate()
                finishWith(RESULT_OK, result)
            }
        }
    }

    private fun finishWith(code: Int, data: Intent?) {
        val out = data ?: Intent()
        out.putExtra(EXTRA_DIAG, diagText())
        setResult(code, out)
        finish()
    }

    /** Haptische Bestaetigung ueber die View - braucht anders als Vibrator keine VIBRATE-Berechtigung. */
    private fun vibrate() {
        val feedback = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            HapticFeedbackConstants.CONFIRM
        } else {
            HapticFeedbackConstants.VIRTUAL_KEY
        }
        previewView.performHapticFeedback(feedback)
    }

    private fun diagText(): String =
        listOf(diagCamera, diagAnalysis, diagFocus, "Versuche $attempts · ${lastDecodeMs} ms")
            .filter { it.isNotEmpty() }
            .joinToString(" · ")

    private fun updateDiag() {
        if (options.showDiagnostics) diagView.text = diagText()
    }

    // ---------------------------------------------------------------- Oberflaeche

    private fun dp(v: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    @SuppressLint("ClickableViewAccessibility")
    private fun buildLayout(): View {
        val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        previewView = PreviewView(this).apply { scaleType = PreviewView.ScaleType.FILL_CENTER }
        root.addView(previewView, FrameLayout.LayoutParams(MATCH, MATCH))
        root.addView(FrameOverlay(this, FRAME_FILL), FrameLayout.LayoutParams(MATCH, MATCH))

        // Tippen fokussiert, zwei Finger zoomen.
        val scale = ScaleGestureDetector(this, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(detector: ScaleGestureDetector): Boolean {
                val cam = camera ?: return false
                val z = cam.cameraInfo.zoomState.value ?: return false
                cam.cameraControl.setZoomRatio((z.zoomRatio * detector.scaleFactor).coerceIn(z.minZoomRatio, z.maxZoomRatio))
                return true
            }
        })
        previewView.setOnTouchListener { _, ev ->
            scale.onTouchEvent(ev)
            if (ev.actionMasked == MotionEvent.ACTION_UP && !scale.isInProgress && ev.pointerCount == 1) {
                focusAt(ev.x, ev.y)
            }
            true
        }

        // Optik wie das WebView-Overlay der App: Leisten in base-100, Text in base-content, Zoom in
        // primary, runde Icon-Buttons in base-300. Farben kommen vom aktiven Theme (hell/dunkel/ResQDocs).
        val th = options.theme
        val top = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(12), dp(16), dp(12))
            setBackgroundColor(th.base100)
            addView(label(options.title, 18f, true, th.baseContent))
            addView(label(options.hint, 14f, false, withAlpha(th.baseContent, 0.7f)))
        }
        diagView = label("", 11f, false, withAlpha(th.baseContent, 0.5f)).apply {
            visibility = if (options.showDiagnostics) View.VISIBLE else View.GONE
        }
        top.addView(diagView)
        root.addView(top, FrameLayout.LayoutParams(MATCH, WRAP, Gravity.TOP))

        zoomBar = SeekBar(this).apply {
            max = 100
            progressTintList = ColorStateList.valueOf(th.primary)
            thumbTintList = ColorStateList.valueOf(th.primary)
            progressBackgroundTintList = ColorStateList.valueOf(withAlpha(th.baseContent, 0.25f))
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(bar: SeekBar, progress: Int, fromUser: Boolean) {
                    if (fromUser) camera?.cameraControl?.setLinearZoom(progress / 100f)
                }
                override fun onStartTrackingTouch(bar: SeekBar) {}
                override fun onStopTrackingTouch(bar: SeekBar) {}
            })
        }
        torchButton = roundButton(R.drawable.ic_scanner_torch, options.torchLabel, th.base300, th.baseContent).apply {
            setOnClickListener {
                torchOn = !torchOn
                camera?.cameraControl?.enableTorch(torchOn)
                paintRound(this, if (torchOn) th.primary else th.base300, if (torchOn) th.primaryContent else th.baseContent)
            }
        }
        val cancel = roundButton(R.drawable.ic_scanner_close, options.cancelLabel, th.base300, th.baseContent).apply {
            setOnClickListener { finishWith(RESULT_CANCELED, null) }
        }
        val buttons = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(cancel, LinearLayout.LayoutParams(dp(44), dp(44)))
            addView(View(context), LinearLayout.LayoutParams(0, 1, 1f))
            addView(torchButton, LinearLayout.LayoutParams(dp(44), dp(44)))
        }
        val bottom = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(8), dp(12), dp(12))
            setBackgroundColor(th.base100)
            addView(zoomBar, LinearLayout.LayoutParams(MATCH, dp(40)))
            addView(buttons, LinearLayout.LayoutParams(MATCH, WRAP))
        }
        root.addView(bottom, FrameLayout.LayoutParams(MATCH, WRAP, Gravity.BOTTOM))

        // Android 15+ zeichnet randlos: Leisten um die Systemleisten einruecken.
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            top.setPadding(dp(16), dp(12) + bars.top, dp(16), dp(12))
            bottom.setPadding(dp(12), dp(8), dp(12), dp(12) + bars.bottom)
            insets
        }
        return root
    }

    private fun label(text: String, sizeSp: Float, bold: Boolean, color: Int) = TextView(this).apply {
        this.text = text
        setTextColor(color)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
        if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
    }

    /** Runder Icon-Button (44 dp) wie im WebView-Overlay; Farben werden per paintRound gesetzt. */
    private fun roundButton(iconRes: Int, description: String, bg: Int, fg: Int) = AppCompatImageButton(this).apply {
        setImageResource(iconRes)
        contentDescription = description
        scaleType = ImageView.ScaleType.CENTER
        paintRound(this, bg, fg)
    }

    private fun paintRound(b: AppCompatImageButton, bg: Int, fg: Int) {
        b.background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(bg)
        }
        b.imageTintList = ColorStateList.valueOf(fg)
    }

    private fun withAlpha(color: Int, alpha: Float): Int = ColorUtils.setAlphaComponent(color, (alpha * 255).toInt())

    private val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
    private val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT

    /** Abgedunkelter Rand mit quadratischem Zielrahmen in der Bildmitte (rein beratend). */
    private class FrameOverlay(context: Context, private val fill: Float) : View(context) {
        private val dim = Paint().apply { color = 0x66000000 }
        private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            style = Paint.Style.STROKE
            strokeWidth = 6f
        }

        override fun onDraw(canvas: Canvas) {
            val side = width * fill
            val left = (width - side) / 2f
            val topY = (height - side) / 2f
            val r = RectF(left, topY, left + side, topY + side)
            canvas.drawRect(0f, 0f, width.toFloat(), r.top, dim)
            canvas.drawRect(0f, r.bottom, width.toFloat(), height.toFloat(), dim)
            canvas.drawRect(0f, r.top, r.left, r.bottom, dim)
            canvas.drawRect(r.right, r.top, width.toFloat(), r.bottom, dim)
            canvas.drawRoundRect(r, 24f, 24f, stroke)
        }
    }
}
