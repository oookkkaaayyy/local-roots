import Foundation
import Security

enum WatchCredentialStoreError: Error {
    case unhandled(OSStatus)
}

struct WatchCredentialStore {
    private let service = "com.hbnf.watch"
    private let account = "cart-device-session"

    func saveDeviceToken(_ token: String) throws {
        let data = Data(token.utf8)
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]

        SecItemDelete(base as CFDictionary)
        var insert = base
        insert[kSecValueData as String] = data
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(insert as CFDictionary, nil)
        guard status == errSecSuccess else { throw WatchCredentialStoreError.unhandled(status) }
    }

    func loadDeviceToken() throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw WatchCredentialStoreError.unhandled(status) }
        guard let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func deleteDeviceToken() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw WatchCredentialStoreError.unhandled(status)
        }
    }
}
