// Turns a screen recording into a clip for the site: a silent H.264 MP4 in src/content/images,
// at most 1456px wide (half a retina recording), streamable. Uses macOS's own AVFoundation.
//
//   npm run clip -- ~/Downloads/recording.mov pepper-docs-demo
//
// Also saves three frames next to the output's temp folder, so whoever adds the clip can see
// what it shows. Prints the Markdown line to paste into a note.
import AVFoundation

let args = CommandLine.arguments
guard args.count == 3 else {
  print("usage: npm run clip -- <video> <name>   (writes src/content/images/<name>.mp4)")
  exit(1)
}
let input = URL(fileURLWithPath: (args[1] as NSString).expandingTildeInPath)
guard FileManager.default.fileExists(atPath: input.path) else {
  print("no file at \(input.path)")
  exit(1)
}
let name = args[2].replacingOccurrences(of: ".mp4", with: "")
let output = URL(fileURLWithPath: "src/content/images/\(name).mp4")
guard !FileManager.default.fileExists(atPath: output.path) else {
  print("\(output.path) already exists; pick another name or delete it first")
  exit(1)
}

let asset = AVURLAsset(url: input)
guard let track = asset.tracks(withMediaType: .video).first else { print("no video in \(input.path)"); exit(1) }
let source = track.naturalSize.applying(track.preferredTransform)
let width = min(Int(abs(source.width)), 1456) / 2 * 2
let height = Int((abs(source.height) * CGFloat(width) / abs(source.width)).rounded()) / 2 * 2
// About 1.8 bits per pixel per second: 2.4 Mbps at 1456x902, sharp enough for UI text
let bitrate = min(max(width * height * 9 / 5, 800_000), 4_000_000)

let reader = try AVAssetReader(asset: asset)
let frames = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
reader.add(frames)
let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
writer.shouldOptimizeForNetworkUse = true
let video = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: width,
  AVVideoHeightKey: height,
  AVVideoScalingModeKey: AVVideoScalingModeResizeAspect,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: bitrate, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
])
video.transform = track.preferredTransform
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: video, sourcePixelBufferAttributes: nil)
writer.add(video)

reader.startReading()
writer.startWriting()
writer.startSession(atSourceTime: .zero)
var last: (CVPixelBuffer, CMTime)?
while let sample = frames.copyNextSampleBuffer() {
  guard let pixels = CMSampleBufferGetImageBuffer(sample) else { continue }
  while !video.isReadyForMoreMediaData { usleep(1000) }
  let time = CMSampleBufferGetPresentationTimeStamp(sample)
  adaptor.append(pixels, withPresentationTime: time)
  last = (pixels, time)
}
// A screen recording holds its last frame until the end without new samples, and browsers stop at
// the last sample, so repeat it just before the end to keep the full length
let end = track.timeRange.end
if let (pixels, time) = last, end - CMTime(value: 1, timescale: 30) > time {
  while !video.isReadyForMoreMediaData { usleep(1000) }
  adaptor.append(pixels, withPresentationTime: end - CMTime(value: 1, timescale: 30))
}
video.markAsFinished()
writer.endSession(atSourceTime: end)
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
guard writer.status == .completed else { print("failed: \(writer.error?.localizedDescription ?? "unknown")"); exit(1) }

// Three frames, for writing alt text without playing the clip
let preview = FileManager.default.temporaryDirectory.appendingPathComponent("clip-\(name)")
try? FileManager.default.createDirectory(at: preview, withIntermediateDirectories: true)
let grabber = AVAssetImageGenerator(asset: asset)
grabber.appliesPreferredTrackTransform = true
grabber.maximumSize = CGSize(width: 1200, height: 1200)
for (i, at) in [0.1, 0.5, 0.9].enumerated() {
  guard let image = try? grabber.copyCGImage(at: CMTime(seconds: end.seconds * at, preferredTimescale: 600), actualTime: nil),
        let file = CGImageDestinationCreateWithURL(preview.appendingPathComponent("\(i + 1).png") as CFURL, "public.png" as CFString, 1, nil)
  else { continue }
  CGImageDestinationAddImage(file, image, nil)
  CGImageDestinationFinalize(file)
}

let bytes = (try? FileManager.default.attributesOfItem(atPath: output.path)[.size] as? Int) ?? 0
print("""
\(output.path)
  \(width)x\(height), \(String(format: "%.1f", end.seconds)) s, \(String(format: "%.1f", Double(bytes) / 1_000_000)) MB\(bytes > 3_000_000 ? "  (over 3 MB: consider a shorter clip)" : "")
  frames: \(preview.path)
Paste into the note:
  ![what it shows](../images/\(name).mp4)
""")
