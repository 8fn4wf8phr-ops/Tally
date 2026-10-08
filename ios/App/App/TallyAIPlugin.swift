import Foundation
import Capacitor

// Capacitor bridge for TallyAIEngine. Registered by hand in
// MainViewController (like SpeechInputPlugin). The JavaScript name is
// "TallyAI". Requests and results carry only the task title and the
// suggested steps; nothing is logged.
@objc(TallyAIPlugin)
public class TallyAIPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TallyAIPlugin"
    public let jsName = "TallyAI"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "availability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "breakDownTask", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
    ]

    private let engine = TallyAIEngine()
    private var currentTask: Task<Void, Never>?

    @objc func availability(_ call: CAPPluginCall) {
        let status = engine.status()
        var result: [String: Any] = [
            "available": status.available,
            "osSupported": status.osSupported,
            "modelAvailable": status.modelAvailable,
        ]
        if let reason = status.reason { result["reason"] = reason }
        call.resolve(result)
    }

    @objc func breakDownTask(_ call: CAPPluginCall) {
        guard let title = call.getString("title") else {
            call.reject("A task title is required", "invalid_input")
            return
        }
        guard currentTask == nil else {
            call.reject("Another request is already running", "busy")
            return
        }

        currentTask = Task { [weak self] in
            guard let self = self else { return }
            do {
                let steps = try await self.engine.breakDown(title: title)
                DispatchQueue.main.async {
                    self.currentTask = nil
                    call.resolve(["steps": steps])
                }
            } catch {
                let aiError = error as? TallyAIError ?? .failed("inference_failed")
                DispatchQueue.main.async {
                    self.currentTask = nil
                    let data: [String: Any]? = aiError.reason.map { ["reason": $0] }
                    call.reject("Could not break the task into steps", aiError.code, nil, data)
                }
            }
        }
    }

    // The running request (if any) rejects itself with "cancelled".
    @objc func cancel(_ call: CAPPluginCall) {
        currentTask?.cancel()
        call.resolve()
    }
}

// `currentTask` is only read or written on the main queue (Capacitor invokes
// plugin methods there, and the task hops back via DispatchQueue.main), so
// capturing the plugin in the task's closure is safe.
extension TallyAIPlugin: @unchecked Sendable {}
