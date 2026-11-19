// Signs the store's index: `swift scripts/sign.swift <index.json>` writes `<index.json>.sig`, the base64 of the Ed25519
// signature over the file's exact bytes, which Wallive's StoreIndex.read verifies against StoreIndex.publicKeys.
// `swift scripts/sign.swift --verify <index.json>` checks `<index.json>.sig` against the key's public half and exits 1
// when it does not hold: the publish job reads the index the host serves through it before it keeps that index's
// artifacts, so a file changed on the host is not signed again.
//
// The private key comes from the environment variable STORE_SIGNING_KEY, the base64 of the raw 32-byte key, which CI
// fills from a secret of the protected publish environment. The script reads no key file and prints no part of the key.
import CryptoKit
import Foundation

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("sign: \(message)\n".utf8))
    exit(1)
}

var arguments = Array(CommandLine.arguments.dropFirst())
let verifying = arguments.first == "--verify"
if verifying { arguments.removeFirst() }
guard arguments.count == 1, let path = arguments.first else { fail("usage: swift scripts/sign.swift [--verify] <index.json>") }
guard let encoded = ProcessInfo.processInfo.environment["STORE_SIGNING_KEY"], !encoded.isEmpty else {
    fail("STORE_SIGNING_KEY is not set; the publish job reads it from the environment's secret.")
}
guard let raw = Data(base64Encoded: encoded.trimmingCharacters(in: .whitespacesAndNewlines)), raw.count == 32 else {
    fail("STORE_SIGNING_KEY is not the base64 of a raw 32-byte Ed25519 private key.")
}
let key: Curve25519.Signing.PrivateKey
do { key = try Curve25519.Signing.PrivateKey(rawRepresentation: raw) } catch { fail("STORE_SIGNING_KEY is not an Ed25519 private key.") }

let index = URL(fileURLWithPath: path)
let bytes: Data
do { bytes = try Data(contentsOf: index) } catch { fail("\(path) could not be read: \(error.localizedDescription)") }
let output = index.appendingPathExtension("sig")
if verifying {
    guard let text = try? String(contentsOf: output, encoding: .utf8),
          let signature = Data(base64Encoded: text.trimmingCharacters(in: .whitespacesAndNewlines)),
          key.publicKey.isValidSignature(signature, for: bytes) else {
        fail("\(output.path) does not verify \(path) with the signing key; the file on the host is not the one the job signed.")
    }
    print("verified \(path) (\(bytes.count) bytes)")
    exit(0)
}
let signature: Data
do { signature = try key.signature(for: bytes) } catch { fail("signing failed: \(error.localizedDescription)") }
guard key.publicKey.isValidSignature(signature, for: bytes) else { fail("the signature does not verify with the key's public half.") }

do { try Data(signature.base64EncodedString().utf8).write(to: output, options: .atomic) } catch {
    fail("\(output.path) could not be written: \(error.localizedDescription)")
}
print("signed \(path) (\(bytes.count) bytes) with the key \(key.publicKey.rawRepresentation.base64EncodedString())")
