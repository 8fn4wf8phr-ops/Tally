import Foundation

// Pure text clean-up for the on-device AI feature. Deliberately free of
// Capacitor and FoundationModels so it compiles anywhere and can be tested
// with a plain `swiftc` run (see ios/App/AITests). The JavaScript layer
// validates again; this is the native side's own defence in depth, since the
// model's output is untrusted input.
enum TallyStepCleaner {
    static let minSteps = 3
    static let maxSteps = 5
    static let maxStepLength = 120
    static let maxTitleLength = 200

    private static func collapse(_ text: String) -> String {
        text.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    /// A task title ready to send to the model, or nil if it is empty or too long.
    static func cleanTitle(_ raw: String) -> String? {
        let title = collapse(raw)
        guard !title.isEmpty, title.count <= maxTitleLength else { return nil }
        return title
    }

    /// Model output -> display-ready steps: trimmed, list markers removed,
    /// empties and case-insensitive duplicates dropped, long lines shortened,
    /// and at most `maxSteps` kept in their original order.
    static func cleanSteps(_ raw: [String]) -> [String] {
        var seen = Set<String>()
        var steps: [String] = []
        for item in raw {
            var step = collapse(item)
            step = step.replacingOccurrences(
                of: "^(?:[-*\u{2022}]|\\d+[.)])\\s+",
                with: "",
                options: .regularExpression
            )
            // The model ends every step with a period; a checklist reads better without.
            step = step.replacingOccurrences(of: "\\.+$", with: "", options: .regularExpression)
                .trimmingCharacters(in: .whitespaces)
            if step.count > maxStepLength {
                step = String(step.prefix(maxStepLength)).trimmingCharacters(in: .whitespaces)
            }
            guard !step.isEmpty, seen.insert(step.lowercased()).inserted else { continue }
            steps.append(step)
            if steps.count == maxSteps { break }
        }
        return steps
    }
}
