import Foundation

struct HBNFWatchAPIResponse: Decodable {
    let ok: Bool
    let apiVersion: String?
    let domain: String?
    let provider: String?
    let upstreamStatus: Int?
    let revisionStrategy: String?
    let attempts: Int?
    let staleRetry: Bool?
    let data: JSONValue?
    let error: String?
}

enum HBNFWatchAPIError: Error {
    case invalidResponse
    case server(status: Int, response: HBNFWatchAPIResponse?)
}

actor HBNFWatchAPIClient {
    static let stagingURL = URL(string: "https://phcpbvuqibyarpfrftgx.supabase.co/functions/v1/hbnf-watch-api-staging")!

    private let baseURL: URL
    private let watchToken: String
    private let session: URLSession

    init(baseURL: URL = HBNFWatchAPIClient.stagingURL, watchToken: String, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.watchToken = watchToken
        self.session = session
    }

    func cartStatus(deviceToken: String) async throws -> HBNFWatchAPIResponse {
        try await send([
            "domain": .string("cart"),
            "action": .string("status"),
            "deviceToken": .string(deviceToken)
        ])
    }

    /// Preferred cart mutation path for Watch.
    /// The facade resolves the authoritative current revision and retries once on stale_revision.
    func cartIntent(
        deviceToken: String,
        type: String,
        payload: [String: JSONValue],
        commandID: String = UUID().uuidString
    ) async throws -> HBNFWatchAPIResponse {
        try await send([
            "domain": .string("cart"),
            "action": .string("intent"),
            "deviceToken": .string(deviceToken),
            "commandId": .string(commandID),
            "type": .string(type),
            "payload": .object(payload)
        ])
    }

    func score(_ fields: [String: JSONValue]) async throws -> HBNFWatchAPIResponse {
        var body = fields
        body["domain"] = .string("score")
        return try await send(body)
    }

    func capabilities() async throws -> HBNFWatchAPIResponse {
        try await send([
            "domain": .string("system"),
            "action": .string("capabilities")
        ])
    }

    private func send(_ body: [String: JSONValue]) async throws -> HBNFWatchAPIResponse {
        var request = URLRequest(url: baseURL)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(watchToken, forHTTPHeaderField: "x-hbnf-watch-token")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw HBNFWatchAPIError.invalidResponse }
        let decoded = try? JSONDecoder().decode(HBNFWatchAPIResponse.self, from: data)
        guard (200..<300).contains(http.statusCode), decoded?.ok == true else {
            throw HBNFWatchAPIError.server(status: http.statusCode, response: decoded)
        }
        guard let decoded else { throw HBNFWatchAPIError.invalidResponse }
        return decoded
    }
}
