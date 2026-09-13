import Foundation
import Capacitor
import Speech
import AVFoundation

// Bridges Apple's Speech framework to the web layer for the voice-input
// reminder feature. Hard requirement: transcription must never leave the
// device, so `requiresOnDeviceRecognition` is always forced to true and
// `start` refuses to run if on-device recognition isn't supported — there
// is intentionally no cloud fallback.
@objc(SpeechInputPlugin)
public class SpeechInputPlugin: CAPPlugin, CAPBridgedPlugin, SFSpeechRecognizerDelegate {
    public let identifier = "SpeechInputPlugin"
    public let jsName = "SpeechInput"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private var speechRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        call.resolve([
            "speech": authStatusString(SFSpeechRecognizer.authorizationStatus()),
            "microphone": micStatusString(AVAudioSession.sharedInstance().recordPermission),
        ])
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { [weak self] speechStatus in
            guard let self = self else { return }
            AVAudioSession.sharedInstance().requestRecordPermission { micGranted in
                DispatchQueue.main.async {
                    call.resolve([
                        "speech": self.authStatusString(speechStatus),
                        "microphone": micGranted ? "granted" : "denied",
                    ])
                }
            }
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard SFSpeechRecognizer.authorizationStatus() == .authorized,
              AVAudioSession.sharedInstance().recordPermission == .granted else {
            call.reject("Speech or microphone permission not granted")
            return
        }

        stopRecognitionInternal()

        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")), recognizer.isAvailable else {
            call.reject("Speech recognizer is not available")
            return
        }
        guard recognizer.supportsOnDeviceRecognition else {
            call.reject("On-device speech recognition is not supported on this device")
            return
        }
        recognizer.delegate = self
        speechRecognizer = recognizer

        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            call.reject("Could not configure audio session: \(error.localizedDescription)")
            return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        // Hard requirement: audio must never leave the device.
        request.requiresOnDeviceRecognition = true
        recognitionRequest = request

        let inputNode = audioEngine.inputNode
        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self = self else { return }
            if let result = result {
                self.notifyListeners("transcript", data: [
                    "text": result.bestTranscription.formattedString,
                    "isFinal": result.isFinal,
                ])
                if result.isFinal {
                    self.stopRecognitionInternal()
                }
            }
            if let error = error {
                self.notifyListeners("error", data: ["message": error.localizedDescription])
                self.stopRecognitionInternal()
            }
        }

        let recordingFormat = inputNode.outputFormat(forBus: 0)
        // installTap crashes (uncaught ObjC exception, not a throwing call) if the
        // input hardware hasn't handed back a valid format yet — seen intermittently
        // right after activating the audio session, especially in the Simulator.
        guard recordingFormat.sampleRate > 0, recordingFormat.channelCount > 0 else {
            stopRecognitionInternal()
            call.reject("Microphone is not ready yet — try again")
            return
        }
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            request.append(buffer)
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
            call.resolve()
        } catch {
            stopRecognitionInternal()
            call.reject("Could not start audio engine: \(error.localizedDescription)")
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        stopRecognitionInternal()
        call.resolve()
    }

    private func stopRecognitionInternal() {
        if audioEngine.isRunning {
            audioEngine.stop()
            recognitionRequest?.endAudio()
        }
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func authStatusString(_ status: SFSpeechRecognizerAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "granted"
        case .denied, .restricted: return "denied"
        case .notDetermined: return "prompt"
        @unknown default: return "denied"
        }
    }

    private func micStatusString(_ status: AVAudioSession.RecordPermission) -> String {
        switch status {
        case .granted: return "granted"
        case .denied: return "denied"
        case .undetermined: return "prompt"
        @unknown default: return "denied"
        }
    }
}
