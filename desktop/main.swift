import Cocoa
import WebKit

// The application owns its service and WebKit storage; no user-managed server is needed.
final class App: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var web: WKWebView?
    var service: Process?
    var parentPipe: Pipe?
    var login: Process?
    var origin: URL?
    var stopping = false
    var startupComplete = false
    let smoke = CommandLine.arguments.contains("--smoke-test")

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "О Berserk", action: #selector(about), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Завершить Berserk", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let appItem = NSMenuItem(); appItem.submenu = appMenu; menu.addItem(appItem)
        let edit = NSMenu(title: "Правка")
        for (title, selector, key) in [("Отменить", "undo:", "z"), ("Вырезать", "cut:", "x"), ("Копировать", "copy:", "c"), ("Вставить", "paste:", "v"), ("Выбрать всё", "selectAll:", "a")] {
            edit.addItem(withTitle: title, action: Selector(selector), keyEquivalent: key)
        }
        let editItem = NSMenuItem(); editItem.submenu = edit; menu.addItem(editItem)
        NSApp.mainMenu = menu
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 860), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Berserk"
        window.minSize = NSSize(width: 850, height: 600)
        window.setFrameAutosaveName("BerserkMainWindow")
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        start()
    }

    @objc func about() {
        NSApp.orderFrontStandardAboutPanel(options: [.applicationName: "Berserk", .applicationVersion: "0.1.0", .credits: NSAttributedString(string: "Коллекция, колоды и Codex AI\nНа основе berserk-nxt. Лицензии — Contents/Resources/Notices.")])
    }

    func start() {
        startupComplete = false
        let label = NSTextField(labelWithString: "Запускаем Berserk…")
        label.alignment = .center; label.font = .systemFont(ofSize: 22)
        label.frame = NSRect(x: 0, y: 350, width: 1280, height: 40)
        label.autoresizingMask = [.width, .minYMargin, .maxYMargin]
        let view = NSView(); view.addSubview(label); window.contentView = view
        guard let resources = Bundle.main.resourceURL else { failure("Не найдены файлы приложения."); return }
        let process = Process()
        process.executableURL = resources.appendingPathComponent("berserk-service")
        process.arguments = ["--app"]
        var environment = CodexInstallation().environment
        environment["BERSERK_WEB_ROOT"] = resources.appendingPathComponent("web").path
        environment["BERSERK_DESKTOP_PORT"] = smoke ? "0" : "47381"
        process.environment = environment
        let input = Pipe(), output = Pipe(), errors = Pipe()
        parentPipe = input; process.standardInput = input; process.standardOutput = output; process.standardError = errors
        errors.fileHandleForReading.readabilityHandler = { handle in _ = handle.availableData }
        service = process
        process.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async {
                guard let self, self.service === process, !self.stopping else { return }
                output.fileHandleForReading.readabilityHandler = nil
                errors.fileHandleForReading.readabilityHandler = nil
                self.failure("Локальный сервис остановился. Возможно, Berserk уже запущен или порт 47381 занят. Закройте другую копию и повторите запуск.")
            }
        }
        var buffer = Data()
        output.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { handle.readabilityHandler = nil; return }
            buffer.append(data)
            if let end = buffer.firstIndex(of: 10) {
                handle.readabilityHandler = nil
                let line = Data(buffer[..<end])
                DispatchQueue.main.async {
                    guard let self, self.service === process, !self.stopping else { return }
                    self.load(line)
                }
            }
        }
        do { try process.run() } catch { service = nil; failure("Не удалось запустить встроенный сервис: \(error.localizedDescription)") }
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in
            guard let self, self.service === process, !self.startupComplete else { return }
            self.service = nil
            if process.isRunning { process.terminate() }
            self.failure("Сервис не ответил. Повторите запуск приложения.")
        }
    }

    func load(_ data: Data) {
        guard let info = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let address = info["origin"] as? String, let url = URL(string: address),
              url.scheme == "http", url.host == "127.0.0.1", let port = info["port"] as? Int,
              url.port == port, let token = info["token"] as? String,
              token.count == 32, token.allSatisfy({ $0.isHexDigit }) else {
            failure("Некорректный ответ встроенного сервиса."); return
        }
        startupComplete = true; origin = url
        let config = WKWebViewConfiguration()
        if smoke { config.websiteDataStore = .nonPersistent() }
        config.userContentController.add(self, name: "berserk")
        let script = "window.__BERSERK_DESKTOP='\(port):\(token)';window.print=()=>window.webkit.messageHandlers.berserk.postMessage({action:'print',payload:''});"
        config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let browser = WKWebView(frame: .zero, configuration: config)
        browser.navigationDelegate = self; browser.uiDelegate = self
        web = browser; window.contentView = browser
        browser.load(URLRequest(url: url))
        if smoke {
            DispatchQueue.main.asyncAfter(deadline: .now() + 45) { self.finishSmoke(false, "WebKit startup timed out") }
        }
    }

    func failure(_ message: String) {
        if smoke { finishSmoke(false, message); return }
        let alert = NSAlert(); alert.messageText = "Не удалось открыть Berserk"; alert.informativeText = message
        alert.addButton(withTitle: "Повторить"); alert.addButton(withTitle: "Выйти")
        alert.beginSheetModal(for: window) { response in
            if response == .alertFirstButtonReturn {
                let previous = self.service; self.service = nil
                self.parentPipe?.fileHandleForWriting.closeFile()
                if previous?.isRunning == true { previous?.terminate(); previous?.waitUntilExit() }
                self.start()
            } else { NSApp.terminate(nil) }
        }
    }

    func trusted(_ url: URL?) -> Bool {
        guard let url, let origin else { return false }
        return url.scheme == origin.scheme && url.host == origin.host && url.port == origin.port
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, trusted(message.frameInfo.request.url),
              let body = message.body as? [String: String], let action = body["action"] else { return }
        switch action {
        case "login": signIn()
        case "save":
            guard let data = body["payload"]?.data(using: .utf8),
                  let value = try? JSONSerialization.jsonObject(with: data) as? [String: String],
                  let name = value["name"], let text = value["text"] else { return }
            let panel = NSSavePanel(); panel.nameFieldStringValue = (name as NSString).lastPathComponent
            panel.beginSheetModal(for: window) { response in
                guard response == .OK, let url = panel.url else { return }
                do { try text.write(to: url, atomically: true, encoding: .utf8) }
                catch { self.inform("Не удалось сохранить файл", error.localizedDescription) }
            }
        case "print":
            web?.printOperation(with: NSPrintInfo.shared).runModal(for: window, delegate: nil, didRun: nil, contextInfo: nil)
        default: break
        }
    }

    func inform(_ title: String, _ message: String) {
        let alert = NSAlert(); alert.messageText = title; alert.informativeText = message
        alert.beginSheetModal(for: window)
    }

    func signIn() {
        guard login == nil else { return }
        let installation = CodexInstallation()
        guard let executable = installation.executable else {
            inform("Codex не найден", "Проверьте расположение установленного Codex. Для нестандартного пути можно задать BERSERK_CODEX_BIN перед запуском Berserk.")
            return
        }
        let process = Process()
        process.executableURL = executable
        process.environment = installation.environment
        process.arguments = ["login"]
        process.standardInput = FileHandle.nullDevice
        process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
        let alert = NSAlert(); alert.messageText = "Вход в Codex"; alert.informativeText = "Завершите вход в открывшемся браузере. После входа вернитесь в Berserk."; alert.addButton(withTitle: "Отменить")
        login = process
        process.terminationHandler = { [weak self] _ in DispatchQueue.main.async {
            guard let self, self.login === process, !self.stopping else { return }
            self.login = nil
            self.window.endSheet(alert.window)
            self.inform(process.terminationStatus == 0 ? "Вы вошли в Codex" : "Вход не завершён", process.terminationStatus == 0 ? "Теперь можно создавать колоды из вашей коллекции." : "Проверьте подключение к интернету и повторите вход.")
        } }
        do {
            try process.run()
            alert.beginSheetModal(for: window) { _ in
                if self.login === process { self.login = nil; if process.isRunning { process.terminate() } }
            }
        } catch { login = nil; inform("Не удалось открыть Codex", error.localizedDescription) }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if trusted(navigationAction.request.url) { decisionHandler(.allow); return }
        if let url = navigationAction.request.url, ["http", "https"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            if trusted(url) { webView.load(URLRequest(url: url)) }
            else if ["http", "https"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        guard trusted(frame.request.url) else { completionHandler(nil); return }
        let panel = NSOpenPanel(); panel.canChooseDirectories = false; panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { completionHandler($0 == .OK ? panel.urls : nil) }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert(); alert.messageText = message; alert.addButton(withTitle: "Да"); alert.addButton(withTitle: "Отмена")
        alert.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert(); alert.messageText = message
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failure("Не удалось загрузить интерфейс: \(error.localizedDescription)") }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard smoke else { return }
        // Isolated integration test: real bundled Wasm UI, automatic bridge and WebKit storage.
        let check = """
        (() => {
          const text = document.body.innerText;
          if (!text.includes('Мои колоды') || !text.includes('Перенести данные')) return false;
          if (document.querySelector('.agent-connection [role=status]')) return false;
          return localStorage.getItem('berserk-leptos-v1') !== null && !!window.__BERSERK_DESKTOP;
        })()
        """
        func poll(_ remaining: Int) {
            webView.evaluateJavaScript(check) { result, error in
                if result as? Bool == true { self.finishSmoke(true, "Bundled WebKit UI, storage and automatic connection loaded") }
                else if remaining > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { poll(remaining - 1) } }
                else { self.finishSmoke(false, error?.localizedDescription ?? "UI failed readiness check") }
            }
        }
        poll(60)
    }

    func finishSmoke(_ success: Bool, _ message: String) {
        guard !stopping else { return }
        print("\(success ? "PASS" : "FAIL"): \(message)")
        stop()
        exit(success ? 0 : 1)
    }

    func stop() {
        stopping = true
        login?.terminationHandler = nil
        if login?.isRunning == true { login?.terminate() }
        service?.terminationHandler = nil
        parentPipe?.fileHandleForWriting.closeFile()
        if service?.isRunning == true { service?.terminate(); service?.waitUntilExit() }
    }
    func applicationWillTerminate(_ notification: Notification) { stop() }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { window.makeKeyAndOrderFront(nil); return true }
}

let app = NSApplication.shared
let delegate = App()
app.setActivationPolicy(.regular)
app.delegate = delegate
app.run()
