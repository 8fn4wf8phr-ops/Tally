// Standalone tests for TallyStepCleaner (pure Swift, no Xcode test target).
// Run: ios/App/AITests/run.sh
import Foundation

var failures = 0
func expect(_ condition: Bool, _ name: String) {
    if condition { print("ok   \(name)") } else { print("FAIL \(name)"); failures += 1 }
}

// Titles
expect(TallyStepCleaner.cleanTitle("   ") == nil, "blank title rejected")
expect(TallyStepCleaner.cleanTitle("") == nil, "empty title rejected")
expect(TallyStepCleaner.cleanTitle(String(repeating: "a", count: 201)) == nil, "over-long title rejected")
expect(TallyStepCleaner.cleanTitle(String(repeating: "a", count: 200)) != nil, "200-char title accepted")
expect(TallyStepCleaner.cleanTitle("  Build   my\n portfolio ") == "Build my portfolio", "title whitespace collapsed")

// Steps
expect(TallyStepCleaner.cleanSteps(["1. Outline sections", "2) Gather projects", "- Build layout"])
    == ["Outline sections", "Gather projects", "Build layout"], "list markers stripped")
expect(TallyStepCleaner.cleanSteps(["Create a website.", "Wait for it...", "Is it done?", "v2.0 release", "..."])
    == ["Create a website", "Wait for it", "Is it done?", "v2.0 release"], "trailing periods dropped, other punctuation kept")
expect(TallyStepCleaner.cleanSteps(["Test it", "test it", "  TEST IT ", "Ship it"]) == ["Test it", "Ship it"], "duplicates dropped case-insensitively")
expect(TallyStepCleaner.cleanSteps(["", "   ", "Real step"]) == ["Real step"], "empty steps dropped")
expect(TallyStepCleaner.cleanSteps((1...9).map { "Step \($0)" }).count == TallyStepCleaner.maxSteps, "capped at max steps")
expect(TallyStepCleaner.cleanSteps([String(repeating: "x", count: 500)])[0].count == TallyStepCleaner.maxStepLength, "long step shortened")
expect(TallyStepCleaner.cleanSteps(["B", "A", "C"]) == ["B", "A", "C"], "order preserved")
expect(TallyStepCleaner.cleanSteps([]) == [], "empty input")

print(failures == 0 ? "ALL PASSED" : "\(failures) FAILED")
exit(failures == 0 ? 0 : 1)
