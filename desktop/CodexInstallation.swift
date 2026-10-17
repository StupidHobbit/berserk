import Foundation

/// Resolve the user's installation without requiring Finder to inherit a shell's PATH.
struct CodexInstallation {
    let executable: URL?
    let environment: [String: String]

    init(environment incoming: [String: String] = ProcessInfo.processInfo.environment,
         home: URL = FileManager.default.homeDirectoryForCurrentUser) {
        let defaults = [home.appendingPathComponent(".local/bin").path,
                        "/opt/homebrew/bin", "/usr/local/bin",
                        home.appendingPathComponent(".cargo/bin").path,
                        home.appendingPathComponent(".npm-global/bin").path,
                        home.appendingPathComponent(".volta/bin").path,
                        "/usr/bin", "/bin", "/usr/sbin", "/sbin"]
        var paths: [String] = []
        for path in (incoming["PATH"] ?? "").components(separatedBy: ":") + defaults {
            if path.hasPrefix("/") && !paths.contains(path) { paths.append(path) }
        }
        func runnable(_ path: String) -> Bool {
            var directory: ObjCBool = false
            return FileManager.default.fileExists(atPath: path, isDirectory: &directory)
                && !directory.boolValue && FileManager.default.isExecutableFile(atPath: path)
        }
        let configured = incoming["BERSERK_CODEX_BIN"].flatMap { $0.isEmpty ? nil : $0 }
        var name = configured ?? "codex"
        if name.hasPrefix("~/") { name = home.appendingPathComponent(String(name.dropFirst(2))).path }
        let candidates = name.hasPrefix("/") ? [name] : paths.map { URL(fileURLWithPath: $0).appendingPathComponent(name).path }
        executable = candidates.first(where: runnable).map { URL(fileURLWithPath: $0) }
        if configured != nil, let directory = executable?.deletingLastPathComponent().path,
           !paths.contains(directory) { paths.insert(directory, at: 0) }
        var result = incoming
        result["PATH"] = paths.joined(separator: ":")
        // Leave collection browsing available even if the installed executable is missing.
        result["BERSERK_CODEX_BIN"] = executable?.path ?? name
        environment = result
    }
}
