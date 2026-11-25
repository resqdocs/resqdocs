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
import android.os.SystemClock
import android.util.Base64
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
import androidx.activity.OnBackPressedCallback
import androidx.annotation.OptIn
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.AppCompatButton
import androidx.appcompat.widget.AppCompatImageButton
import androidx.appcompat.widget.SwitchCompat
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
 * Mehrfach-Modus (Optionen multi / multiToggleLabel): Der Bildschirm bleibt nach einem Treffer offen und
 * sammelt Codes, bis Fertig, Schliessen oder Zurueck ihn beenden. Mit multiToggleLabel schaltet ein Schalter
 * im Kamerabild zwischen Einzel- und Mehrfach-Scan um. Ohne beide Optionen laeuft alles wie beim Einzel-Scan.
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
        /** Mit Schalter bzw. im Mehrfach-Modus: alle erfassten Codes in Scan-Reihenfolge (Bytes als Base64). */
        const val EXTRA_ITEM_BYTES = "scan.result.items.bytes"
        const val EXTRA_ITEM_TEXTS = "scan.result.items.texts"
        const val EXTRA_ITEM_FORMATS = "scan.result.items.formats"
        /** Nur mit Schalter: seine letzte Stellung. */
        const val EXTRA_MULTI_ON = "scan.result.multiOn"
        const val RESULT_CAMERA_ERROR = RESULT_FIRST_USER + 1

        /** Anteil der Bildbreite fuer den Zielrahmen. */
        private const val FRAME_FILL = 0.72f
        private const val REFOCUS_INTERVAL_MS = 4000L

        /** Mehrfach-Modus: Pause nach einem neuen Code, damit die Hand die Packung wechseln kann. */
        private const val MULTI_PAUSE_MS = 700L
        /** Mehrfach-Modus: so lange steht die Meldung "schon erfasst" im Kamerabild. */
        private const val DUPLICATE_SHOW_MS = 1500L
        /** Mehrfach-Modus: dieselbe Meldung fuer denselben Code fruehestens nach dieser Zeit erneut. */
        private const val DUPLICATE_REPEAT_MS = 2000L
        /** Schluessel eines Codes ohne PZN: der gelesene Inhalt mit diesem Vorsatz (eine PZN hat keinen). */
        private const val RAW_KEY_PREFIX = "raw:"
        private const val STATE_MULTI_ON = "scan.state.multiOn"
        private const val STATE_ITEM_BYTES = "scan.state.items.bytes"
        private const val STATE_ITEM_TEXTS = "scan.state.items.texts"
        private const val STATE_ITEM_FORMATS = "scan.state.items.formats"
        private const val STATE_ITEM_KEYS = "scan.state.items.keys"
    }

    private lateinit var options: ScanOptions
    private lateinit var reader: BarcodeReader
    private lateinit var previewView: PreviewView
    private lateinit var diagView: TextView
    private lateinit var hintView: TextView
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
    /** Nutzer hat selbst gezoomt (Geste oder Regler) - ein verzoegerter Start-Zoom ueberschreibt das nicht. */
    private var userZoomed = false

    // Mehrfach-Modus. Alle Felder werden nur auf dem Haupt-Thread gelesen und geschrieben.
    /** Mehrfach-Modus an? Mit Schalter dessen Stellung, sonst fest options.multi. */
    private var multiOn = false
    /** Erfasste Codes in Scan-Reihenfolge: Bytes als Base64, Text, Formatname, Schluessel der Dublettenpruefung. */
    private val itemBytes = ArrayList<String>()
    private val itemTexts = ArrayList<String>()
    private val itemFormats = ArrayList<String>()
    private val itemKeys = ArrayList<String>()
    /** Bis zu diesem Zeitpunkt (SystemClock.elapsedRealtime) werden keine Treffer angenommen. */
    private var pauseUntil = 0L
    private var lastDuplicateKey: String? = null
    private var lastDuplicateAt = 0L
    private var doneButton: AppCompatButton? = null
    private var duplicateView: TextView? = null
    private val hideDuplicate = Runnable { duplicateView?.visibility = View.GONE }

    /** Mit Schalter oder festem Mehrfach-Modus laufen Treffer und Beenden ueber die Liste der Codes. */
    private val multiCapable: Boolean get() = options.multi || options.multiToggleLabel.isNotEmpty()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        options = ScanOptions.fromIntent(intent)
        multiOn = options.multi
        if (multiCapable && savedInstanceState != null) restoreMultiState(savedInstanceState)
        reader = BarcodeReader(options.readerOptions())
        setContentView(buildLayout())
        if (multiCapable) {
            updateMultiUi()
            // Zurueck-Taste und Zurueck-Geste: Erfasstes zurueckgeben statt verwerfen.
            onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    finishCollected()
                }
            })
        }
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

    /** Ein Neuaufbau der Activity (z. B. Drehung) darf Erfasstes nicht verlieren. Nur gelesener Inhalt, nie Bilder. */
    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (!multiCapable) return
        outState.putBoolean(STATE_MULTI_ON, multiOn)
        outState.putStringArrayList(STATE_ITEM_BYTES, itemBytes)
        outState.putStringArrayList(STATE_ITEM_TEXTS, itemTexts)
        outState.putStringArrayList(STATE_ITEM_FORMATS, itemFormats)
        outState.putStringArrayList(STATE_ITEM_KEYS, itemKeys)
    }

    private fun restoreMultiState(state: Bundle) {
        multiOn = state.getBoolean(STATE_MULTI_ON, options.multi)
        val bytes = state.getStringArrayList(STATE_ITEM_BYTES) ?: return
        val texts = state.getStringArrayList(STATE_ITEM_TEXTS) ?: return
        val formats = state.getStringArrayList(STATE_ITEM_FORMATS) ?: return
        val keys = state.getStringArrayList(STATE_ITEM_KEYS) ?: return
        if (texts.size != bytes.size || formats.size != bytes.size || keys.size != bytes.size) return
        itemBytes.addAll(bytes)
        itemTexts.addAll(texts)
        itemFormats.addAll(formats)
        itemKeys.addAll(keys)
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
        val delayed = zoom > 1f && options.startZoomDelayMs > 0
        if (delayed) {
            // Erst ohne Zoom (Ratio 1 = Hauptlinse), damit ein grosser Code ganz ins Bild passt; ohne Treffer
            // und ohne eigenes Zoomen nach der Wartezeit auf den Start-Zoom.
            mainHandler.postDelayed({
                if (!done.get() && !userZoomed && itemBytes.isEmpty()) camera?.cameraControl?.setZoomRatio(zoom)
            }, options.startZoomDelayMs)
        } else if (zoom > 1f) {
            cam.cameraControl.setZoomRatio(zoom)
        }

        diagCamera = "Kamera ${info.cameraId}"
        diagFocus = when {
            diopters <= 0f -> "Fixfokus"
            calibrated -> "Nahgrenze ~${(100f / diopters).toInt()} cm"
            else -> "Fokus unkalibriert"
        } + if (delayed) {
            " · Start-Zoom 1.0 -> ${"%.1f".format(zoom)} nach ${"%.1f".format(options.startZoomDelayMs / 1000f)} s"
        } else {
            " · Start-Zoom ${"%.1f".format(zoom)}"
        }
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
            if (multiCapable) {
                // Mit Schalter bzw. im Mehrfach-Modus entscheidet der Haupt-Thread (Liste, Pause, Dubletten).
                val text = hit.text ?: ""
                val format = hit.format.name
                runOnUiThread { onMultiHit(bytes, text, format) }
                return
            }
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

    // ---------------------------------------------------------------- Mehrfach-Modus

    /** Treffer mit Schalter bzw. im Mehrfach-Modus. Nur Haupt-Thread. */
    private fun onMultiHit(bytes: ByteArray, text: String, format: String) {
        if (done.get()) return
        val now = SystemClock.elapsedRealtime()
        if (now < pauseUntil) return
        // Bytes 1:1 als ISO-8859-1 lesen, wie es das Packungs-Profil in scanProfiles.ts vorgibt.
        val raw = if (bytes.isNotEmpty()) String(bytes, Charsets.ISO_8859_1) else text
        val pzn = extractPznFromPackageCode(raw, format)
        val key = pzn ?: (RAW_KEY_PREFIX + raw)
        val captured = itemKeys.contains(key)
        if (!multiOn) {
            // Schalter aus: Der erste Code schliesst den Bildschirm wie beim Einzel-Scan, ohne Pruefung gegen
            // known. Sind aus der Zeit mit Schalter an schon Codes erfasst, zaehlt nur ein Code, der noch
            // nicht dabei ist; er kommt dazu und der Bildschirm schliesst mit allen.
            if (captured) return
            addItem(bytes, text, format, key)
            vibrate()
            finishCollected()
            return
        }
        if (captured || (pzn != null && options.known.contains(pzn))) {
            // Die Packung liegt meist noch im Bild: dieselbe Meldung nicht staendig neu ausloesen.
            if (key == lastDuplicateKey && now - lastDuplicateAt < DUPLICATE_REPEAT_MS) return
            lastDuplicateKey = key
            lastDuplicateAt = now
            showDuplicate()
            return
        }
        addItem(bytes, text, format, key)
        pauseUntil = now + MULTI_PAUSE_MS
        // Auch die eben erfasste Packung liegt meist noch im Bild: Meldung fuer sie erst nach der Sperrzeit.
        lastDuplicateKey = key
        lastDuplicateAt = now
        hideDuplicateNow()
        vibrate()
        updateMultiUi()
    }

    private fun addItem(bytes: ByteArray, text: String, format: String, key: String) {
        itemBytes.add(Base64.encodeToString(bytes, Base64.NO_WRAP))
        itemTexts.add(text)
        itemFormats.add(format)
        itemKeys.add(key)
    }

    /**
     * Beenden mit Schalter bzw. im Mehrfach-Modus (Fertig, Schliessen, Zurueck, Treffer bei Schalter aus):
     * Erfasste Codes gehen zurueck; ohne Codes gilt das Ergebnis als abgebrochen.
     */
    private fun finishCollected() {
        if (!done.compareAndSet(false, true)) return
        val result = Intent()
        if (options.multiToggleLabel.isNotEmpty()) result.putExtra(EXTRA_MULTI_ON, multiOn)
        if (itemBytes.isEmpty()) {
            finishWith(RESULT_CANCELED, result)
            return
        }
        // Oberste Ebene = erster Code (wie beim Einzel-Scan), die Liste enthaelt alle, auch den ersten.
        result.putExtra(EXTRA_BYTES, Base64.decode(itemBytes[0], Base64.NO_WRAP))
        result.putExtra(EXTRA_TEXT, itemTexts[0])
        result.putExtra(EXTRA_FORMAT, itemFormats[0])
        result.putStringArrayListExtra(EXTRA_ITEM_BYTES, itemBytes)
        result.putStringArrayListExtra(EXTRA_ITEM_TEXTS, itemTexts)
        result.putStringArrayListExtra(EXTRA_ITEM_FORMATS, itemFormats)
        finishWith(RESULT_OK, result)
    }

    /** Zaehler und Fertig-Knopf: sichtbar, solange der Mehrfach-Modus an ist oder schon Codes erfasst sind. */
    private fun updateMultiUi() {
        val n = itemBytes.size
        doneButton?.visibility = if (multiOn || n > 0) View.VISIBLE else View.INVISIBLE
        // Ohne Codes bleibt der normale Hinweistext stehen.
        if (n == 0) return
        val text = if (n == 1) options.countOne else options.countMany.replace("{n}", n.toString())
        hintView.text = text
        hintView.contentDescription = text
        hintView.setTextColor(options.theme.baseContent)
        hintView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        hintView.setTypeface(hintView.typeface, android.graphics.Typeface.BOLD)
    }

    /** Meldung "schon erfasst" kurz im Kamerabild zeigen, mit anderer Haptik als beim Erfolg. */
    private fun showDuplicate() {
        val v = duplicateView ?: return
        v.text = options.duplicateLabel
        v.visibility = View.VISIBLE
        val feedback = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            HapticFeedbackConstants.REJECT
        } else {
            HapticFeedbackConstants.LONG_PRESS
        }
        previewView.performHapticFeedback(feedback)
        mainHandler.removeCallbacks(hideDuplicate)
        mainHandler.postDelayed(hideDuplicate, DUPLICATE_SHOW_MS)
    }

    private fun hideDuplicateNow() {
        mainHandler.removeCallbacks(hideDuplicate)
        duplicateView?.visibility = View.GONE
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
                userZoomed = true
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
        hintView = label(options.hint, 14f, false, withAlpha(th.baseContent, 0.7f))
        val top = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(12), dp(16), dp(12))
            setBackgroundColor(th.base100)
            addView(label(options.title, 18f, true, th.baseContent))
            addView(hintView)
        }
        diagView = label("", 11f, false, withAlpha(th.baseContent, 0.5f)).apply {
            visibility = if (options.showDiagnostics) View.VISIBLE else View.GONE
        }
        top.addView(diagView)
        if (multiCapable) {
            // Der Zaehler steht im Hinweis-Text: Aenderungen fuer Bedienhilfen als Live-Region kennzeichnen.
            hintView.accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
            // Meldung "schon erfasst" im Kamerabild, direkt unter der oberen Leiste.
            val duplicate = label(options.duplicateLabel, 16f, true, th.baseContent).apply {
                gravity = Gravity.CENTER
                setPadding(dp(16), dp(10), dp(16), dp(10))
                background = GradientDrawable().apply {
                    cornerRadius = dp(12).toFloat()
                    setColor(th.base100)
                }
                contentDescription = options.duplicateLabel
                accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
                visibility = View.GONE
            }
            duplicateView = duplicate
            val duplicateParams = LinearLayout.LayoutParams(WRAP, WRAP)
            duplicateParams.gravity = Gravity.CENTER_HORIZONTAL
            duplicateParams.setMargins(dp(16), dp(12), dp(16), 0)
            val topArea = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                addView(top, LinearLayout.LayoutParams(MATCH, WRAP))
                addView(duplicate, duplicateParams)
            }
            root.addView(topArea, FrameLayout.LayoutParams(MATCH, WRAP, Gravity.TOP))
        } else {
            root.addView(top, FrameLayout.LayoutParams(MATCH, WRAP, Gravity.TOP))
        }

        zoomBar = SeekBar(this).apply {
            max = 100
            progressTintList = ColorStateList.valueOf(th.primary)
            thumbTintList = ColorStateList.valueOf(th.primary)
            progressBackgroundTintList = ColorStateList.valueOf(withAlpha(th.baseContent, 0.25f))
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(bar: SeekBar, progress: Int, fromUser: Boolean) {
                    if (fromUser) {
                        userZoomed = true
                        camera?.cameraControl?.setLinearZoom(progress / 100f)
                    }
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
            setOnClickListener { if (multiCapable) finishCollected() else finishWith(RESULT_CANCELED, null) }
        }
        // Mit Schalter bzw. im Mehrfach-Modus sitzt zwischen Schliessen und Licht der Fertig-Knopf
        // (48 dp hoch, primary/primaryContent); updateMultiUi blendet ihn ein und aus.
        val doneView: AppCompatButton? = if (multiCapable) {
            AppCompatButton(this).apply {
                text = options.doneLabel
                contentDescription = options.doneLabel
                setAllCaps(false)
                setTextColor(th.primaryContent)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                minHeight = dp(48)
                minimumHeight = dp(48)
                setPadding(dp(16), 0, dp(16), 0)
                stateListAnimator = null
                background = GradientDrawable().apply {
                    cornerRadius = dp(12).toFloat()
                    setColor(th.primary)
                }
                setOnClickListener { finishCollected() }
            }
        } else {
            null
        }
        doneButton = doneView
        val buttons = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(cancel, LinearLayout.LayoutParams(dp(44), dp(44)))
            if (doneView != null) {
                addView(doneView, LinearLayout.LayoutParams(0, WRAP, 1f).also { it.setMargins(dp(12), 0, dp(12), 0) })
            } else {
                addView(View(context), LinearLayout.LayoutParams(0, 1, 1f))
            }
            addView(torchButton, LinearLayout.LayoutParams(dp(44), dp(44)))
        }
        val bottom = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(8), dp(12), dp(12))
            setBackgroundColor(th.base100)
            addView(zoomBar, LinearLayout.LayoutParams(MATCH, dp(40)))
            addView(buttons, LinearLayout.LayoutParams(MATCH, WRAP))
        }
        if (options.multiToggleLabel.isNotEmpty()) {
            // Schalter fuer den Mehrfach-Modus im Kamerabild, direkt ueber der unteren Leiste (48 dp hoch).
            val toggle = SwitchCompat(this).apply {
                text = options.multiToggleLabel
                contentDescription = options.multiToggleLabel
                setTextColor(th.baseContent)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
                minHeight = dp(48)
                minimumHeight = dp(48)
                setPadding(dp(16), 0, dp(12), 0)
                setSwitchPadding(dp(12))
                background = GradientDrawable().apply {
                    cornerRadius = dp(24).toFloat()
                    setColor(th.base100)
                }
                val states = arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf())
                setThumbTintList(ColorStateList(states, intArrayOf(th.primary, th.baseContent)))
                setTrackTintList(
                    ColorStateList(states, intArrayOf(withAlpha(th.primary, 0.5f), withAlpha(th.baseContent, 0.3f))),
                )
                isChecked = multiOn
                setOnCheckedChangeListener { _, checked ->
                    multiOn = checked
                    if (!checked) hideDuplicateNow()
                    updateMultiUi()
                }
            }
            val toggleParams = LinearLayout.LayoutParams(WRAP, WRAP)
            toggleParams.gravity = Gravity.CENTER_HORIZONTAL
            toggleParams.setMargins(dp(16), 0, dp(16), dp(12))
            val bottomArea = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                addView(toggle, toggleParams)
                addView(bottom, LinearLayout.LayoutParams(MATCH, WRAP))
            }
            root.addView(bottomArea, FrameLayout.LayoutParams(MATCH, WRAP, Gravity.BOTTOM))
        } else {
            root.addView(bottom, FrameLayout.LayoutParams(MATCH, WRAP, Gravity.BOTTOM))
        }

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

private val PPN_PZN = Regex("9N11([0-9]{8})")

/**
 * PZN eines Packungscodes, 8-stellig, oder null. Gleiche Regel wie extractPznFromPackageCode in
 * apps/pico-pwa/src/medications/packageScan.ts (dort die massgebliche Fassung; Aenderungen dort hier und
 * im iOS-ScanViewController nachziehen): bei Data Matrix oder unbekanntem Format zuerst das PPN-Muster
 * 9N11 + 8 Ziffern; Data Matrix ohne diesen Treffer hat keine PZN; sonst fuehrendes '-' und alle
 * Nicht-Ziffern entfernen, 4 bis 8 Ziffern links mit Nullen auf 8 Stellen auffuellen.
 *
 * formatName ist der Formatname von zxing-cpp. Wie normalizeScanFormat in scanProfiles.ts: DATA_MATRIX ist
 * Data Matrix, QR_CODE, CODE_39 und PZN sind bekannte andere Formate, alles andere gilt als unbekannt.
 * Der Inhalt wird hier weder gespeichert noch ausgegeben.
 */
internal fun extractPznFromPackageCode(raw: String, formatName: String): String? {
    val s = raw.trim()
    if (s.isEmpty()) return null
    val dataMatrix = formatName == "DATA_MATRIX"
    val unknown = !dataMatrix && formatName != "QR_CODE" && formatName != "CODE_39" && formatName != "PZN"
    if (dataMatrix || unknown) {
        val ppn = PPN_PZN.find(s)
        if (ppn != null) return ppn.groupValues[1]
        if (dataMatrix) return null
    }
    val digits = s.removePrefix("-").filter { it in '0'..'9' }
    if (digits.length < 4 || digits.length > 8) return null
    return digits.padStart(8, '0')
}
