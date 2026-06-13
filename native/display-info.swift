import CoreGraphics
import Foundation

struct DisplayRecord: Codable {
    let id: UInt32
    let isBuiltin: Bool
    let isMain: Bool
    let isAsleep: Bool
    let isInMirrorSet: Bool
    let mirrorsDisplay: UInt32?
}

struct DisplayOutput: Codable {
    let displays: [DisplayRecord]
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

var count: UInt32 = 0
guard CGGetOnlineDisplayList(0, nil, &count) == .success else {
    fail("Could not count online displays.")
}

var displayIds = Array(repeating: CGDirectDisplayID(0), count: Int(count))
guard CGGetOnlineDisplayList(count, &displayIds, &count) == .success else {
    fail("Could not read online displays.")
}

let displays = displayIds.prefix(Int(count)).map { displayId in
    let mirroredDisplay = CGDisplayMirrorsDisplay(displayId)
    return DisplayRecord(
        id: displayId,
        isBuiltin: CGDisplayIsBuiltin(displayId) != 0,
        isMain: CGDisplayIsMain(displayId) != 0,
        isAsleep: CGDisplayIsAsleep(displayId) != 0,
        isInMirrorSet: CGDisplayIsInMirrorSet(displayId) != 0,
        mirrorsDisplay: mirroredDisplay == kCGNullDirectDisplay ? nil : mirroredDisplay
    )
}

do {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let data = try encoder.encode(DisplayOutput(displays: displays))
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
} catch {
    fail("Could not encode display information: \(error)")
}
