import Foundation

@main
struct CodexInstallationTests {
    static func main() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent("berserk-discovery-\(UUID().uuidString)")
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: root) }
        func executable(_ relative: String) throws -> URL {
            let url = root.appendingPathComponent(relative)
            try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data("#!/bin/sh\nexit 0\n".utf8).write(to: url)
            try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: url.path)
            return url
        }
        let local = try executable(".local/bin/codex")
        let finder = CodexInstallation(environment: ["PATH": "/usr/bin:/bin"], home: root)
        precondition(finder.executable == local, "Finder must find the user installation")
        precondition(finder.environment["BERSERK_CODEX_BIN"] == local.path)
        let custom = try executable("custom/bin/codex")
        let inherited = CodexInstallation(environment: ["PATH": custom.deletingLastPathComponent().path], home: root)
        precondition(inherited.executable == custom, "Inherited PATH must take precedence")
        let override = CodexInstallation(environment: ["BERSERK_CODEX_BIN": "~/custom/bin/codex", "PATH": "/usr/bin"], home: root)
        precondition(override.executable == custom)
        precondition(override.environment["PATH"]!.hasPrefix(custom.deletingLastPathComponent().path + ":"), "Wrapper runtimes must remain discoverable")
        let missing = CodexInstallation(environment: ["BERSERK_CODEX_BIN": root.appendingPathComponent("missing").path], home: root)
        precondition(missing.executable == nil, "Do not ignore invalid explicit overrides")
        try fm.setAttributes([.posixPermissions: 0o644], ofItemAtPath: custom.path)
        precondition(CodexInstallation(environment: ["BERSERK_CODEX_BIN": custom.path], home: root).executable == nil)
        precondition(CodexInstallation(environment: ["BERSERK_CODEX_BIN": root.path], home: root).executable == nil)
        let target = try executable("installed/codex")
        try fm.removeItem(at: local)
        try fm.createSymbolicLink(at: local, withDestinationURL: target)
        precondition(CodexInstallation(environment: ["PATH": "/usr/bin:/bin"], home: root).executable == local, "Installed symlinks must work")
        print("PASS: Finder discovery, PATH priority, overrides, wrapper PATH, missing/non-executable paths and symlinks")
        if let installed = CodexInstallation(environment: ["PATH": "/usr/bin:/bin"]).executable {
            print("Existing installation found with Finder-like PATH: \(installed.path)")
        }
    }
}
