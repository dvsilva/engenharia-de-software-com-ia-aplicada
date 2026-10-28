import Foundation

struct HarnessError: Error {
  let message: String
}

struct SchemaAdequacy {
  let valid: Bool
  let reason: String?
  let missing: [String]
  let extra: [String]
  let fields: [String: Any]?
}

struct FieldPrecision {
  let perField: [String: Bool]
  let hits: Int
  let total: Int

  var precision: Double { Double(hits) / Double(total) }
}

let heldOutOffset = 5000

let expectedFields = [
  "amplitude-auto": ["segurado", "placa", "valor"],
  "amplitude-saude-empresarial": ["beneficiario", "procedimento", "valor"],
]

let missingEndpoint = "Defina a variável de ambiente ENDPOINT_MODULO32 com o endpoint do seu modelo publicado no Módulo 3.2 antes de rodar este script."

func heldOutSet() -> [Example] {
  let auto = DatasetScaling.autoSources.enumerated().map { index, source in
    DatasetScaling.example(caseName: "amplitude-auto", source: source, index: heldOutOffset + index)
  }
  let health = DatasetScaling.healthSources.enumerated().map { index, source in
    DatasetScaling.example(caseName: "amplitude-saude-empresarial", source: source, index: heldOutOffset + index)
  }

  return auto + health
}

func endpoint() throws -> String {
  guard let value = ProcessInfo.processInfo.environment["ENDPOINT_MODULO32"], !value.isEmpty else {
    throw HarnessError(message: missingEndpoint)
  }

  return value
}

func accessToken() throws -> String {
  let process = Process()
  let output = Pipe()

  process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
  process.arguments = ["gcloud", "auth", "print-access-token"]
  process.standardOutput = output

  try process.run()
  let data = output.fileHandleForReading.readDataToEndOfFile()
  process.waitUntilExit()

  guard process.terminationStatus == 0 else {
    throw HarnessError(message: "gcloud auth print-access-token falhou (exit \(process.terminationStatus))")
  }

  return String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
}

func vertexBaseURL() -> String {
  ProcessInfo.processInfo.environment["GOOGLE_VERTEX_BASE_URL"] ?? "https://us-central1-aiplatform.googleapis.com"
}

func callTunedModel(_ example: Example) async throws -> String {
  let token = try accessToken()
  let url = URL(string: "\(vertexBaseURL())/v1/\(try endpoint()):generateContent")!
  let body: [String: Any] = [
    "contents": [["role": "user", "parts": [["text": "\(example.instruction)\n\n\(example.input)"]]]],
    "generationConfig": ["temperature": 0],
  ]
  var request = URLRequest(url: url)

  request.httpMethod = "POST"
  request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
  request.setValue("application/json", forHTTPHeaderField: "Content-Type")
  request.httpBody = try JSONSerialization.data(withJSONObject: body)

  let (data, response) = try await URLSession.shared.data(for: request)
  let status = (response as? HTTPURLResponse)?.statusCode ?? 0

  guard (200..<300).contains(status) else {
    throw HarnessError(message: "Falha ao chamar o modelo: \(status) \(HTTPURLResponse.localizedString(forStatusCode: status))")
  }

  guard
    let answer = try JSONSerialization.jsonObject(with: data) as? [String: Any],
    let candidates = answer["candidates"] as? [[String: Any]],
    let content = candidates.first?["content"] as? [String: Any],
    let parts = content["parts"] as? [[String: Any]],
    let text = parts.first?["text"] as? String
  else {
    throw HarnessError(message: "resposta do modelo sem texto")
  }

  return text
}

func withoutMarkdownFence(_ text: String) -> String {
  let fence = try! Regex(#"^```(?:json)?\s*([\s\S]*?)\s*```$"#)
  let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)

  guard let match = trimmed.wholeMatch(of: fence), let inner = match.output[1].substring else { return text }

  return String(inner)
}

func schemaAdequacy(caseName: String, answer: String) -> SchemaAdequacy {
  guard
    let data = withoutMarkdownFence(answer).data(using: .utf8),
    let parsed = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
  else {
    return SchemaAdequacy(valid: false, reason: "resposta não é JSON válido", missing: [], extra: [], fields: nil)
  }

  guard let fields = parsed as? [String: Any] else {
    return SchemaAdequacy(valid: false, reason: "resposta não é um objeto JSON", missing: [], extra: [], fields: nil)
  }

  let expected = expectedFields[caseName] ?? []
  let missing = expected.filter { fields[$0] == nil }
  let extra = fields.keys.filter { !expected.contains($0) }.sorted()

  return SchemaAdequacy(valid: missing.isEmpty && extra.isEmpty, reason: nil, missing: missing, extra: extra, fields: fields)
}

func normalized(_ text: String) -> String {
  let withoutMarks = String(String.UnicodeScalarView(
    text.decomposedStringWithCanonicalMapping.unicodeScalars.filter { !(0x300...0x36F).contains($0.value) }
  ))

  return withoutMarks.lowercased().split(whereSeparator: \.isWhitespace).joined(separator: " ")
}

func textOf(_ value: Any?) -> String {
  switch value {
  case let text as String: return text
  case let number as NSNumber: return number.stringValue
  default: return ""
  }
}

func numberOf(_ value: Any?) -> Double? {
  switch value {
  case let number as NSNumber: return number.doubleValue
  case let text as String: return Double(text.trimmingCharacters(in: .whitespaces))
  default: return nil
  }
}

func fieldPrecision(expected: [(field: String, value: FieldValue)], obtained: [String: Any]?) -> FieldPrecision {
  var perField: [String: Bool] = [:]

  for (field, value) in expected {
    let answer = obtained?[field]

    switch value {
    case .number(let number):
      perField[field] = numberOf(answer).map { abs(number - $0) < 0.01 } ?? false
    case .text(let text):
      perField[field] = normalized(text) == normalized(textOf(answer))
    }
  }

  return FieldPrecision(perField: perField, hits: perField.values.filter { $0 }.count, total: expected.count)
}

func consistency(of example: Example, repetitions: Int = 3) async throws -> [String] {
  var answers: [String] = []

  for _ in 0..<repetitions {
    answers.append(try await callTunedModel(example))
  }

  return answers
}

struct SelfChecks {
  var total = 0
  var failed = 0

  mutating func check(_ description: String, _ body: () async throws -> Void) async {
    total += 1

    do {
      try await body()
      print("  [OK] \(description)")
    } catch {
      failed += 1
      print("  [FALHOU] \(description)")
      print("           \((error as? HarnessError)?.message ?? "\(error)")")
    }
  }
}

func expect(_ condition: Bool, _ message: String = "valor inesperado") throws {
  guard condition else { throw HarnessError(message: message) }
}

func runSelfChecks() async {
  var checks = SelfChecks()

  print("== Testes: conjunto de teste retido ==")
  await checks.check("gera 11 exemplos (6 Auto + 5 Saúde, uma por fonte real do Módulo 3.2), todos com índice >= 5000 (fora da faixa de treino)") {
    let examples = heldOutSet()

    try expect(examples.count == 11)
    try expect(examples.filter { $0.caseName == "amplitude-auto" }.count == 6)
    try expect(examples.filter { $0.caseName == "amplitude-saude-empresarial" }.count == 5)
    for example in examples {
      try expect((Int(example.id.split(separator: "-").last ?? "") ?? 0) >= heldOutOffset, "id \(example.id) não usa offset retido")
    }
  }

  print()
  print("== Testes: adequação de schema ==")
  await checks.check("JSON com exatamente os campos esperados é válido") {
    try expect(schemaAdequacy(caseName: "amplitude-auto", answer: #"{"segurado":"X","placa":"Y","valor":10}"#).valid)
  }
  await checks.check("JSON com campo faltando é inválido") {
    let result = schemaAdequacy(caseName: "amplitude-auto", answer: #"{"segurado":"X","placa":"Y"}"#)

    try expect(!result.valid && result.missing == ["valor"])
  }
  await checks.check("JSON com campo extra é inválido") {
    let result = schemaAdequacy(caseName: "amplitude-auto", answer: #"{"segurado":"X","placa":"Y","valor":10,"extra":1}"#)

    try expect(!result.valid && result.extra == ["extra"])
  }
  await checks.check("resposta que não é JSON é sinalizada, não derruba o harness") {
    let result = schemaAdequacy(caseName: "amplitude-auto", answer: "não é json")

    try expect(!result.valid && result.reason == "resposta não é JSON válido")
  }
  await checks.check("JSON envolvido em cerca de markdown (```json ... ```) ainda é reconhecido como válido") {
    try expect(schemaAdequacy(caseName: "amplitude-auto", answer: "```json\n{\"segurado\":\"X\",\"placa\":\"Y\",\"valor\":10}\n```").valid)
  }

  print()
  print("== Testes: precisão por campo ==")
  let key: [(field: String, value: FieldValue)] = [("segurado", .text("Ana")), ("placa", .text("ABC-1234")), ("valor", .number(100.5))]
  await checks.check("todos os campos corretos dá precisão 1.0") {
    try expect(fieldPrecision(expected: key, obtained: ["segurado": "Ana", "placa": "ABC-1234", "valor": 100.5]).precision == 1)
  }
  await checks.check("um campo errado reduz a precisão proporcionalmente") {
    let result = fieldPrecision(expected: key, obtained: ["segurado": "Ana", "placa": "ZZZ-0000", "valor": 100.5])

    try expect(result.hits == 2 && result.total == 3 && abs(result.precision - 2.0 / 3.0) < 1e-9)
  }
  await checks.check("valor numérico com diferença de arredondamento sob a tolerância ainda acerta") {
    try expect(fieldPrecision(expected: [("valor", .number(100.5))], obtained: ["valor": 100.5000001]).perField["valor"] == true)
  }
  await checks.check("diferença só de acento não é erro de extração") {
    let result = fieldPrecision(expected: [("beneficiario", .text("Marcos Lopes Guimarães"))], obtained: ["beneficiario": "Marcos Lopes Guimaraes"])

    try expect(result.perField["beneficiario"] == true)
  }
  await checks.check("chamada real ao modelo do Módulo 3.2 devolve schema válido e alta precisão num exemplo novo") {
    let example = DatasetScaling.example(caseName: "amplitude-auto", source: "Oficina Estrela", index: heldOutOffset + 999)
    let schema = schemaAdequacy(caseName: "amplitude-auto", answer: try await callTunedModel(example))

    try expect(schema.valid, "schema inválido")
    try expect(fieldPrecision(expected: example.expected, obtained: schema.fields).precision >= 2.0 / 3.0, "precisão baixa")
  }

  print()
  print("Total: \(checks.total) teste(s), \(checks.total - checks.failed) passou(passaram), \(checks.failed) falhou(falharam).")
}

func percent(_ value: Double, decimals: Int) -> String {
  String(format: "%.\(decimals)f", value * 100)
}

func today() -> String {
  let formatter = DateFormatter()

  formatter.locale = Locale(identifier: "en_US_POSIX")
  formatter.dateFormat = "yyyy-MM-dd"
  return formatter.string(from: Date())
}

func recordMeasurement(at path: String, key: String, entry: [String: Any]) throws {
  let lock = "\(path).lock"
  let started = Date()
  var descriptor = open(lock, O_CREAT | O_EXCL | O_WRONLY, 0o644)

  while descriptor < 0 {
    guard errno == EEXIST else { throw HarnessError(message: "não consegui criar \(lock)") }
    guard Date().timeIntervalSince(started) < 30 else {
      throw HarnessError(message: "Não consegui obter o lock de \(lock) em 30s -- remova o arquivo .lock se nenhuma outra execução estiver rodando.")
    }

    Thread.sleep(forTimeInterval: 0.1)
    descriptor = open(lock, O_CREAT | O_EXCL | O_WRONLY, 0o644)
  }
  close(descriptor)
  defer { unlink(lock) }

  var ledger: [String: Any] = [:]
  if let data = FileManager.default.contents(atPath: path) {
    ledger = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
  }
  ledger[key] = entry

  let temporary = "\(path).\(ProcessInfo.processInfo.processIdentifier).tmp"
  var data = try JSONSerialization.data(withJSONObject: ledger, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])

  data.append(contentsOf: Array("\n".utf8))
  try data.write(to: URL(fileURLWithPath: temporary))
  guard rename(temporary, path) == 0 else { throw HarnessError(message: "não consegui gravar \(path)") }
}

func evaluateHeldOutSet() async throws {
  print()
  print("== Avaliação real contra o conjunto de teste retido ==")

  let examples = heldOutSet()
  print("Endpoint: \(try endpoint())")
  print("\(examples.count) exemplos, nunca vistos no treino do Módulo 3.2.\n")

  var precisionSum = 0.0
  var validSchemas = 0
  var answered = 0
  var failures = 0

  for example in examples {
    let answer: String
    do {
      answer = try await callTunedModel(example)
    } catch {
      print("\(example.id): [FALHOU] \((error as? HarnessError)?.message ?? "\(error)")")
      failures += 1
      continue
    }

    let schema = schemaAdequacy(caseName: example.caseName, answer: answer)
    let precision = schema.valid
      ? fieldPrecision(expected: example.expected, obtained: schema.fields)
      : FieldPrecision(perField: [:], hits: 0, total: example.expected.count)

    if schema.valid { validSchemas += 1 }
    precisionSum += precision.precision
    answered += 1

    print("\(example.id): schema \(schema.valid ? "válido" : "INVÁLIDO"), precisão \(percent(precision.precision, decimals: 0))% (\(precision.hits)/\(precision.total))")
  }

  if failures > 0 {
    print("\n\(failures)/\(examples.count) exemplo(s) falharam na chamada real -- verifique projeto/endpoint/billing.")
  }
  guard answered > 0 else {
    throw HarnessError(message: "Nenhum exemplo processado com sucesso -- verifique GCP_PROJECT_ID, ENDPOINT_MODULO32, e a autenticação (gcloud auth login).")
  }

  let meanPrecision = precisionSum / Double(answered)
  let schemaRate = Double(validSchemas) / Double(answered)
  let measured = Int((min(schemaRate, meanPrecision) * 100).rounded())

  print("\nAdequação de schema: \(validSchemas)/\(answered)")
  print("Precisão média por campo: \(percent(meanPrecision, decimals: 1))%")

  try recordMeasurement(
    at: FileManager.default.currentDirectoryPath + "/resultado-medido.json",
    key: "baseline",
    entry: [
      "medido": "\(measured)% (\(validSchemas)/\(answered) schema válido, precisão média por campo)",
      "medidoPct": measured,
      "n": answered,
      "medidoEm": today(),
      "origem": "Módulo 5.1",
      "script": "model-evaluation-harness-tool.swift",
    ]
  )

  print()
  print("== Consistência: mesmo exemplo, três chamadas separadas ==")
  do {
    let answers = try await consistency(of: examples[0])
    let distinct = Set(answers).count

    print("Exemplo: \(examples[0].id)")
    for (index, answer) in answers.enumerated() {
      print("  Chamada \(index + 1): \(answer)")
    }
    print("Respostas únicas: \(distinct) de \(answers.count) (\(distinct == 1 ? "estável" : "instável"))")
  } catch {
    print("[FALHOU] \((error as? HarnessError)?.message ?? "\(error)")")
  }
}

@main
struct ModelEvaluationHarnessTool {
  static func main() async {
    await runSelfChecks()

    do {
      try await evaluateHeldOutSet()
    } catch {
      FileHandle.standardError.write(Data("Erro: \((error as? HarnessError)?.message ?? "\(error)")\n".utf8))
      exit(1)
    }
  }
}
