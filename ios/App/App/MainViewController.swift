import Capacitor

// Capacitor only auto-registers native plugins that ship as npm packages
// (it reads their names from the generated capacitor.config.json). A plugin
// added straight to the app target, like SpeechInputPlugin, has to be
// registered here instead — see Main.storyboard, which points its root
// view controller at this subclass instead of CAPBridgeViewController.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SpeechInputPlugin())
    }
}
