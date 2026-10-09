import UIKit
import AVFoundation
import ZXingCpp

/**
 * Vollbild-Scanner für iOS, Gegenstück zur Android-ScanActivity.
 *
 * Kamera: die virtuelle Mehrfachkamera (Triple → DualWide → Dual → Wide). Sie wechselt bei Nahfokus
 * selbst auf die Makro-fähige Linse, wo das Gerät eine hat. Start-Zoom aus minimumFocusDistance und
 * Sichtfeld (WWDC21-Muster), Zoom per Fingergeste und Regler, Tippen zum Fokussieren, Licht. Bleibt der
 * Treffer aus, fokussiert der Controller periodisch auf die Bildmitte nach. Dekodiert wird mit ZXing-C++
 * direkt aus dem CVPixelBuffer (Y-Ebene), auf einer eigenen Queue, höchstens ein Frame gleichzeitig.
 *
 * Datenschutz: Jedes Kamerabild lebt nur für die Dauer des read-Aufrufs. Kein Speichern, kein Logging
 * von Bild oder Inhalt, kein Netz. Zurück geht nur der gelesene Inhalt an das Plugin.
 */
final class ScanViewController: UIViewController {

    var onFinish: ((ScanOutcome) -> Void)?

    /// Anteil der Bildbreite für den Zielrahmen (wie Android).
    private static let frameFill: Double = 0.72
    private static let refocusInterval: TimeInterval = 4

    private let options: ScanOptions
    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "app.resqdocs.scanner.session")
    private let decodeQueue = DispatchQueue(label: "app.resqdocs.scanner.decode", qos: .userInitiated)
    private let decodeLock = DispatchSemaphore(value: 1)
    private let reader: ZXIBarcodeReader
    private var device: AVCaptureDevice?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var refocusTimer: Timer?
    private var done = false
    private var torchOn = false

    private let titleLabel = UILabel()
    private let hintLabel = UILabel()
    private let diagLabel = UILabel()
    private let zoomSlider = UISlider()
    private let torchButton = UIButton(type: .system)
    private let cancelButton = UIButton(type: .system)
    private let previewView = UIView()
    private let frameOverlay = FrameOverlayView()

    // Diagnose ohne Inhalt: nur Technik (Kamera, Auflösung, Zoom, Fokus, Versuche).
    // Alle Felder werden NUR auf dem Main-Thread geschrieben und gelesen (die Decode-Queue meldet per async).
    private var diagCamera = ""
    private var diagAnalysis = ""
    private var diagFocus = ""
    private var attempts = 0
    private var lastDecodeMs = 0

    init(options: ScanOptions) {
        self.options = options
        let ro = ZXIReaderOptions()
        // Formate erst fertig berechnen und dann EINMAL setzen, nie zurücklesen: der Getter
        // ZXIReaderOptions.formats in zxing-cpp 3.1.1 iteriert über eine Referenz in eine temporäre
        // ReaderOptions-Kopie (self.cppOpts.formats() gibt const& in das Pimpl zurück) -> EXC_BAD_ACCESS.
        var formats = options.formats.compactMap { ScanViewController.formatMap[$0] }.map { NSNumber(value: $0.rawValue) }
        if formats.isEmpty { formats = [NSNumber(value: ZXIFormat.DATA_MATRIX.rawValue)] }
        ro.formats = formats
        ro.tryHarder = options.tryHarder
        ro.tryRotate = options.tryRotate
        ro.tryInvert = options.tryInvert
        ro.tryDownscale = options.tryDownscale
        ro.binarizer = .localAverage
        // PLAIN: Inhalt unverändert (keine HRI-Umformatierung); die App dekodiert die Rohbytes selbst.
        ro.textMode = .plain
        ro.maxNumberOfSymbols = 1
        reader = ZXIBarcodeReader(options: ro)
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) wird nicht unterstützt") }

    /// Formatnamen der JS-API -> ZXing-C++ (PZN kennt der iOS-Wrapper nicht; Code 39 deckt ihn ab).
    private static let formatMap: [String: ZXIFormat] = [
        "DataMatrix": .DATA_MATRIX, "QRCode": .QR_CODE, "Code39": .CODE_39, "PZN": .CODE_39,
    ]

    // ---------------------------------------------------------------- Lebenszyklus

    private var sessionStarted = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        buildLayout()
    }

    /// Session erst nach der Präsentation starten: scheitert sie sofort (kein Gerät, Simulator), darf das
    /// dismiss nicht in die laufende Present-Animation fallen - UIKit verwirft es sonst.
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !sessionStarted else { return }
        sessionStarted = true
        sessionQueue.async { [weak self] in self?.configureSession() }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        refocusTimer?.invalidate()
        // Licht aus und Session stoppen gehören beide auf die sessionQueue (gleiche Reihenfolge wie der Start).
        sessionQueue.async { [weak self] in
            guard let s = self else { return }
            s.setTorch(false)
            if s.session.isRunning { s.session.stopRunning() }
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = previewView.bounds
    }

    override var prefersStatusBarHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }

    // ---------------------------------------------------------------- Kamera

    private func configureSession() {
        let discovery = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera],
            mediaType: .video, position: .back)
        guard let cam = discovery.devices.first, let input = try? AVCaptureDeviceInput(device: cam) else {
            finish(.cameraError(diag: "keine Rückkamera"))
            return
        }
        device = cam
        session.beginConfiguration()
        guard session.canAddInput(input) else {
            session.commitConfiguration()
            finish(.cameraError(diag: "Kamera-Eingang abgelehnt"))
            return
        }
        session.addInput(input)
        // Preset ERST nach dem Input prüfen: ohne Input sagt canSetSessionPreset immer ja, und ein Gerät ohne
        // 4K (ältere iPads) würde dann den Input ablehnen. Hohe Auflösung für dichte Codes, aber NICHT .photo
        // (längere Belichtung, mehr Unschärfe; TN2325).
        session.sessionPreset = session.canSetSessionPreset(.hd4K3840x2160) ? .hd4K3840x2160 : .hd1920x1080
        let output = AVCaptureVideoDataOutput()
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange]
        output.alwaysDiscardsLateVideoFrames = true
        output.setSampleBufferDelegate(self, queue: decodeQueue)
        guard session.canAddOutput(output) else {
            session.commitConfiguration()
            finish(.cameraError(diag: "Video-Ausgang abgelehnt"))
            return
        }
        session.addOutput(output)
        if let conn = output.connection(with: .video), conn.isVideoRotationAngleSupported(90) {
            conn.videoRotationAngle = 90 // Hochformat
        }
        session.commitConfiguration()
        // Erst starten, dann das Gerät einstellen: das aktive Format (Sichtfeld, Zoombereich) steht erst mit
        // laufender Session verbindlich fest, und ein Formatwechsel beim Start setzt den Zoom sonst zurück.
        session.startRunning()
        configureDevice(cam)
        DispatchQueue.main.async { [weak self] in
            guard let s = self else { return }
            s.torchButton.isHidden = !cam.hasTorch
            s.zoomSlider.value = Float(s.sliderPosition(for: cam.videoZoomFactor))
            s.updateDiag()
            s.scheduleRefocus()
        }
    }

    /// Fokus nah, kein Video-Smoothing, Start-Zoom aus Nahgrenze und Sichtfeld.
    private func configureDevice(_ cam: AVCaptureDevice) {
        guard (try? cam.lockForConfiguration()) != nil else { return }
        defer { cam.unlockForConfiguration() }
        if cam.isFocusModeSupported(.continuousAutoFocus) { cam.focusMode = .continuousAutoFocus }
        // Apple: .near „should use this value if your app ... recognize machine-readable codes".
        if cam.isAutoFocusRangeRestrictionSupported { cam.autoFocusRangeRestriction = .near }
        if cam.isSmoothAutoFocusSupported { cam.isSmoothAutoFocusEnabled = false }
        if cam.isExposureModeSupported(.continuousAutoExposure) { cam.exposureMode = .continuousAutoExposure }

        let minFocus = Double(cam.minimumFocusDistance) // mm, -1 = unbekannt
        let fovAtOne = Double(cam.activeFormat.videoFieldOfView) // horizontal, bei Zoom 1
        let maxZoom = Double(cam.maxAvailableVideoZoomFactor)
        // Virtuelle Kameras zählen den Zoom ab der weitesten Linse (Ultraweitwinkel): Faktor 1 ist dort NICHT
        // die Hauptlinse. Deren Umschaltpunkt steht in virtualDeviceSwitchOverVideoZoomFactors, in der
        // Reihenfolge der constituentDevices (bei Weit+Tele ist der erste Punkt der Wechsel ZUM Tele, nicht zur
        // Hauptlinse - deshalb den Index der Weitwinkellinse suchen).
        let wideIdx = cam.constituentDevices.firstIndex { $0.deviceType == .builtInWideAngleCamera } ?? 0
        let switchOvers = cam.virtualDeviceSwitchOverVideoZoomFactors
        let wideFactor = (wideIdx > 0 && wideIdx - 1 < switchOvers.count) ? Double(truncating: switchOvers[wideIdx - 1]) : 1
        // Zoom k verkleinert das Sichtfeld: tan(fov_k/2) = tan(fov_1/2) / k.
        let fovWide = 2 * atan(tan(fovAtOne / 2 * .pi / 180) / wideFactor) * 180 / .pi
        let relative = StartZoom.compute(minFocusMm: minFocus, fovDegrees: fovWide, codeSizeMm: options.codeSizeMm,
                                         frameFill: ScanViewController.frameFill, maxZoom: maxZoom / wideFactor)
        let zoom = min(max(CGFloat(wideFactor * relative), cam.minAvailableVideoZoomFactor), cam.maxAvailableVideoZoomFactor)
        cam.videoZoomFactor = zoom

        let camName = cam.deviceType.rawValue.replacingOccurrences(of: "AVCaptureDeviceType", with: "")
        let focusText = (minFocus > 0 ? "Nahgrenze ~\(Int(minFocus / 10)) cm" : "Nahgrenze unbekannt")
            + String(format: " · Start-Zoom %.1f", Double(zoom))
        DispatchQueue.main.async { [weak self] in
            self?.diagCamera = "Kamera \(camName)"
            self?.diagFocus = focusText
            self?.updateDiag()
        }
    }

    private func scheduleRefocus() {
        refocusTimer?.invalidate()
        refocusTimer = Timer.scheduledTimer(withTimeInterval: ScanViewController.refocusInterval, repeats: true) { [weak self] _ in
            guard let s = self, !s.done else { return }
            s.focus(at: CGPoint(x: 0.5, y: 0.5))
        }
    }

    /// Fokus- und Belichtungspunkt setzen (Koordinaten 0...1 im Kameraraum). Gerätezugriff auf der sessionQueue.
    private func focus(at devicePoint: CGPoint) {
        guard let cam = device else { return }
        sessionQueue.async {
            guard (try? cam.lockForConfiguration()) != nil else { return }
            if cam.isFocusPointOfInterestSupported, cam.isFocusModeSupported(.autoFocus) {
                cam.focusPointOfInterest = devicePoint
                cam.focusMode = .autoFocus
            }
            if cam.isExposurePointOfInterestSupported, cam.isExposureModeSupported(.autoExpose) {
                cam.exposurePointOfInterest = devicePoint
                cam.exposureMode = .autoExpose
            }
            cam.unlockForConfiguration()
        }
        // Nach dem Einzelfokus wieder kontinuierlich scharfstellen – sonst bleibt der Fokus gesperrt.
        sessionQueue.asyncAfter(deadline: .now() + 2) {
            guard (try? cam.lockForConfiguration()) != nil else { return }
            if cam.isFocusModeSupported(.continuousAutoFocus) { cam.focusMode = .continuousAutoFocus }
            if cam.isExposureModeSupported(.continuousAutoExposure) { cam.exposureMode = .continuousAutoExposure }
            cam.unlockForConfiguration()
        }
    }

    private func setZoom(_ factor: CGFloat) {
        guard let cam = device else { return }
        let clamped = min(max(factor, cam.minAvailableVideoZoomFactor), cam.maxAvailableVideoZoomFactor)
        sessionQueue.async {
            guard (try? cam.lockForConfiguration()) != nil else { return }
            cam.videoZoomFactor = clamped
            cam.unlockForConfiguration()
        }
    }

    private func setTorch(_ on: Bool) {
        guard let cam = device, cam.hasTorch, (try? cam.lockForConfiguration()) != nil else { return }
        if on {
            try? cam.setTorchModeOn(level: AVCaptureDevice.maxAvailableTorchLevel)
        } else {
            cam.torchMode = .off
        }
        cam.unlockForConfiguration()
    }

    /// Regler 0...1 -> Zoom logarithmisch zwischen min und max (feines Zoomen im unteren Bereich).
    private func zoomFactor(forSlider pos: Double) -> CGFloat {
        guard let cam = device else { return 1 }
        let lo = log(Double(cam.minAvailableVideoZoomFactor)), hi = log(Double(min(cam.maxAvailableVideoZoomFactor, 8)))
        return CGFloat(exp(lo + (hi - lo) * pos))
    }

    private func sliderPosition(for zoom: CGFloat) -> Double {
        guard let cam = device else { return 0 }
        let lo = log(Double(cam.minAvailableVideoZoomFactor)), hi = log(Double(min(cam.maxAvailableVideoZoomFactor, 8)))
        return hi > lo ? (log(Double(zoom)) - lo) / (hi - lo) : 0
    }

    // ---------------------------------------------------------------- Abschluss

    /// Von jedem Thread aufrufbar; entscheidet und meldet genau einmal, auf dem Main-Thread.
    private func finish(_ outcome: ScanOutcome) {
        let work = { [weak self] in
            guard let s = self, !s.done else { return }
            s.done = true
            s.refocusTimer?.invalidate()
            s.onFinish?(outcome)
        }
        if Thread.isMainThread { work() } else { DispatchQueue.main.async(execute: work) }
    }

    private func diagText() -> String {
        [diagCamera, diagAnalysis, diagFocus, "Versuche \(attempts) · \(lastDecodeMs) ms"]
            .filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private func updateDiag() {
        if options.showDiagnostics { diagLabel.text = diagText() }
    }

    // ---------------------------------------------------------------- Oberfläche

    private func buildLayout() {
        previewView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(previewView)
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        previewView.layer.addSublayer(layer)
        previewLayer = layer

        frameOverlay.fill = CGFloat(ScanViewController.frameFill)
        frameOverlay.translatesAutoresizingMaskIntoConstraints = false
        frameOverlay.isUserInteractionEnabled = false
        view.addSubview(frameOverlay)

        // Tippen fokussiert, zwei Finger zoomen.
        previewView.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(onTap(_:))))
        previewView.addGestureRecognizer(UIPinchGestureRecognizer(target: self, action: #selector(onPinch(_:))))

        // Optik wie das WebView-Overlay der App: Leisten in base-100, Text in base-content, Zoom in
        // primary, runde Icon-Buttons in base-300. Farben kommen vom aktiven Theme (hell/dunkel/ResQDocs).
        let th = options.theme
        let top = UIStackView(arrangedSubviews: [titleLabel, hintLabel, diagLabel])
        top.axis = .vertical
        top.spacing = 4
        top.isLayoutMarginsRelativeArrangement = true
        top.layoutMargins = UIEdgeInsets(top: 12, left: 16, bottom: 12, right: 16)
        top.backgroundColor = th.base100
        top.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.text = options.title
        titleLabel.textColor = th.baseContent
        titleLabel.font = .boldSystemFont(ofSize: 18)
        hintLabel.text = options.hint
        hintLabel.textColor = th.baseContent.withAlphaComponent(0.7)
        hintLabel.font = .systemFont(ofSize: 14)
        hintLabel.numberOfLines = 0
        diagLabel.textColor = th.baseContent.withAlphaComponent(0.5)
        diagLabel.font = .systemFont(ofSize: 11)
        diagLabel.numberOfLines = 0
        diagLabel.isHidden = !options.showDiagnostics
        view.addSubview(top)

        zoomSlider.minimumValue = 0
        zoomSlider.maximumValue = 1
        zoomSlider.minimumTrackTintColor = th.primary
        zoomSlider.maximumTrackTintColor = th.baseContent.withAlphaComponent(0.25)
        zoomSlider.thumbTintColor = th.primary
        zoomSlider.addTarget(self, action: #selector(onSlider(_:)), for: .valueChanged)

        configureRound(torchButton, symbol: "bolt.fill", label: options.torchLabel)
        paintRound(torchButton, background: th.base300, foreground: th.baseContent)
        torchButton.addTarget(self, action: #selector(onTorch), for: .touchUpInside)
        configureRound(cancelButton, symbol: "xmark", label: options.cancelLabel)
        paintRound(cancelButton, background: th.base300, foreground: th.baseContent)
        cancelButton.addTarget(self, action: #selector(onCancel), for: .touchUpInside)

        let spacer = UIView()
        spacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
        let buttons = UIStackView(arrangedSubviews: [cancelButton, spacer, torchButton])
        buttons.axis = .horizontal
        buttons.alignment = .center
        let bottom = UIStackView(arrangedSubviews: [zoomSlider, buttons])
        bottom.axis = .vertical
        bottom.spacing = 8
        bottom.isLayoutMarginsRelativeArrangement = true
        bottom.layoutMargins = UIEdgeInsets(top: 8, left: 12, bottom: 12, right: 12)
        bottom.backgroundColor = th.base100
        bottom.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bottom)

        NSLayoutConstraint.activate([
            previewView.topAnchor.constraint(equalTo: view.topAnchor),
            previewView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            previewView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            previewView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            frameOverlay.topAnchor.constraint(equalTo: view.topAnchor),
            frameOverlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            frameOverlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            frameOverlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            // Leisten bis an den Bildschirmrand, Inhalt per Rand innerhalb der Safe Area.
            top.topAnchor.constraint(equalTo: view.topAnchor),
            top.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            top.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bottom.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            bottom.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bottom.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            cancelButton.widthAnchor.constraint(equalToConstant: 44),
            cancelButton.heightAnchor.constraint(equalToConstant: 44),
            torchButton.widthAnchor.constraint(equalToConstant: 44),
            torchButton.heightAnchor.constraint(equalToConstant: 44),
        ])
        topBar = top
        bottomBar = bottom
    }

    private var topBar: UIStackView?
    private var bottomBar: UIStackView?

    /// Safe Area (Notch, Home-Indikator) in die Leisten-Raender einrechnen.
    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        let safe = view.safeAreaInsets
        topBar?.layoutMargins = UIEdgeInsets(top: 12 + safe.top, left: 16, bottom: 12, right: 16)
        bottomBar?.layoutMargins = UIEdgeInsets(top: 8, left: 12, bottom: 12 + safe.bottom, right: 12)
    }

    /// Statusleisten-Symbole passend zum Theme (heller Hintergrund -> dunkle Symbole).
    override var preferredStatusBarStyle: UIStatusBarStyle { options.theme.isLight ? .darkContent : .lightContent }

    /// Runder Icon-Button (44 pt) wie im WebView-Overlay; Farben setzt paintRound.
    private func configureRound(_ b: UIButton, symbol: String, label: String) {
        let config = UIImage.SymbolConfiguration(pointSize: 18, weight: .semibold)
        b.setImage(UIImage(systemName: symbol, withConfiguration: config), for: .normal)
        b.setTitle(nil, for: .normal)
        b.accessibilityLabel = label
        b.layer.cornerRadius = 22
        b.clipsToBounds = true
    }

    private func paintRound(_ b: UIButton, background: UIColor, foreground: UIColor) {
        b.backgroundColor = background
        b.tintColor = foreground
    }

    @objc private func onTap(_ g: UITapGestureRecognizer) {
        guard let layer = previewLayer else { return }
        let p = layer.captureDevicePointConverted(fromLayerPoint: g.location(in: previewView))
        focus(at: p)
    }

    @objc private func onPinch(_ g: UIPinchGestureRecognizer) {
        guard let cam = device else { return }
        switch g.state {
        case .changed, .ended:
            setZoom(cam.videoZoomFactor * g.scale)
            g.scale = 1
            zoomSlider.value = Float(sliderPosition(for: cam.videoZoomFactor))
        default: break
        }
    }

    @objc private func onSlider(_ s: UISlider) { setZoom(zoomFactor(forSlider: Double(s.value))) }

    @objc private func onTorch() {
        torchOn.toggle()
        let on = torchOn
        sessionQueue.async { [weak self] in self?.setTorch(on) }
        let th = options.theme
        paintRound(torchButton, background: on ? th.primary : th.base300, foreground: on ? th.primaryContent : th.baseContent)
    }

    @objc private func onCancel() { finish(.cancelled(diag: diagText())) }

    /// Abgedunkelter Rand mit quadratischem Zielrahmen in der Bildmitte (rein beratend).
    private final class FrameOverlayView: UIView {
        var fill: CGFloat = 0.72

        override init(frame: CGRect) {
            super.init(frame: frame)
            backgroundColor = .clear
        }
        required init?(coder: NSCoder) { fatalError() }

        override func draw(_ rect: CGRect) {
            guard let ctx = UIGraphicsGetCurrentContext() else { return }
            let side = bounds.width * fill
            let box = CGRect(x: (bounds.width - side) / 2, y: (bounds.height - side) / 2, width: side, height: side)
            ctx.setFillColor(UIColor.black.withAlphaComponent(0.4).cgColor)
            ctx.addRect(bounds)
            ctx.addPath(UIBezierPath(roundedRect: box, cornerRadius: 24).cgPath)
            ctx.fillPath(using: .evenOdd)
            ctx.setStrokeColor(UIColor.white.cgColor)
            ctx.setLineWidth(3)
            ctx.addPath(UIBezierPath(roundedRect: box, cornerRadius: 24).cgPath)
            ctx.strokePath()
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            setNeedsDisplay()
        }
    }
}

// ---------------------------------------------------------------- Dekodierung

extension ScanViewController: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        // Läuft noch ein Decode, wird das Frame verworfen (kein Rückstau).
        guard decodeLock.wait(timeout: .now()) == .success else { return }
        defer { decodeLock.signal() }
        guard let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let size = "Analyse \(CVPixelBufferGetWidth(buffer))x\(CVPixelBufferGetHeight(buffer))"
        let started = CFAbsoluteTimeGetCurrent()
        let hit = (try? reader.read(buffer))?.first
        let ms = Int((CFAbsoluteTimeGetCurrent() - started) * 1000)
        DispatchQueue.main.async { [weak self] in
            guard let s = self else { return }
            if s.diagAnalysis.isEmpty { s.diagAnalysis = size }
            s.attempts += 1
            s.lastDecodeMs = ms
            if s.attempts % 10 == 0 { s.updateDiag() }
            guard let r = hit, !s.done else { return }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            s.finish(.found(format: ScanViewController.formatName(r.format), bytes: r.bytes, text: r.text, diag: s.diagText()))
        }
    }

    /// Formatnamen wie der Android-Wrapper (Format.name), damit JS beide gleich behandelt.
    private static func formatName(_ f: ZXIFormat) -> String {
        switch f {
        case .DATA_MATRIX: return "DATA_MATRIX"
        case .QR_CODE: return "QR_CODE"
        case .CODE_39: return "CODE_39"
        default: return "OTHER"
        }
    }
}
