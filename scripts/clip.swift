// Turns a screen recording into a clip for the site: a silent H.264 MP4 in src/content/images,
// at most 1456px wide (half a retina recording), streamable. Uses macOS's own AVFoundation.
//
//   npm run clip -- ~/Downloads/recording.mov pepper-docs-demo
//   npm run clip -- ~/Downloads/recording.mov name-picker-demo --crop-top 201 --crop-bottom 61 --crop-left 0 --crop-right 1
//
// --crop-top / --crop-bottom / --crop-left / --crop-right trim that many source pixels off that edge
// (a window bar, black strips, a dark edge column), before scaling. Also saves three frames of the
// finished clip to a temp folder, so whoever adds the clip can see what it shows. Prints the Markdown line to paste into a note.
import AVFoundation
import CoreImage

// Flags can sit anywhere after the video and name
var args = CommandLine.arguments
func flag(_ name: String) -> Int {
  guard let i = args.firstIndex(of: name) else { return 0 }
  guard i + 1 < args.count, let value = Int(args[i + 1]), value >= 0 else { print("\(name) needs a number of pixels"); exit(1) }
  args.removeSubrange(i...(i + 1))
  return value
}
let cropTop = flag("--crop-top")
let cropBottom = flag("--crop-bottom")
let cropLeft = flag("--crop-left")
let cropRight = flag("--crop-right")
guard args.count == 3 else {
  print("usage: npm run clip -- <video> <name> [--crop-top <px>] [--crop-bottom <px>] [--crop-left <px>] [--crop-right <px>]   (writes src/content/images/<name>.mp4)")
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
let cropped = cropTop + cropBottom + cropLeft + cropRight > 0
// Cropping works on the stored pixels, so it only makes sense for an upright recording
guard !cropped || track.preferredTransform.isIdentity else { print("--crop-top/--crop-bottom/--crop-left/--crop-right need an unrotated video"); exit(1) }
let visibleHeight = abs(source.height) - CGFloat(cropTop + cropBottom)
guard visibleHeight > 0 else { print("the crop leaves nothing: the video is \(Int(abs(source.height))) px tall"); exit(1) }
let visibleWidth = abs(source.width) - CGFloat(cropLeft + cropRight)
guard visibleWidth > 0 else { print("the crop leaves nothing: the video is \(Int(abs(source.width))) px wide"); exit(1) }
let width = min(Int(visibleWidth), 1456) / 2 * 2
let height = Int((visibleHeight * CGFloat(width) / visibleWidth).rounded()) / 2 * 2
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
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: video, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
  kCVPixelBufferWidthKey as String: width,
  kCVPixelBufferHeightKey as String: height,
])
writer.add(video)

// Crops and scales a frame in one pass; the writer would only scale, so cropping needs this.
// Core Image's origin is the bottom-left, so the bottom crop is the y offset (the left crop is the x offset).
let context = CIContext()
func trimmed(_ pixels: CVPixelBuffer) -> CVPixelBuffer {
  guard cropped, let pool = adaptor.pixelBufferPool else { return pixels }
  var out: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, pool, &out)
  guard let out else { return pixels }
  let keptWidth = CGFloat(CVPixelBufferGetWidth(pixels) - cropLeft - cropRight)
  let keptHeight = CGFloat(CVPixelBufferGetHeight(pixels) - cropTop - cropBottom)
  let image = CIImage(cvPixelBuffer: pixels)
    .cropped(to: CGRect(x: CGFloat(cropLeft), y: CGFloat(cropBottom), width: keptWidth, height: keptHeight))
    .transformed(by: CGAffineTransform(translationX: -CGFloat(cropLeft), y: -CGFloat(cropBottom)))
    .transformed(by: CGAffineTransform(scaleX: CGFloat(width) / keptWidth, y: CGFloat(height) / keptHeight))
  context.render(image, to: out)
  return out
}

reader.startReading()
writer.startWriting()
writer.startSession(atSourceTime: .zero)
var last: (CVPixelBuffer, CMTime)?
while let sample = frames.copyNextSampleBuffer() {
  guard let original = CMSampleBufferGetImageBuffer(sample) else { continue }
  while !video.isReadyForMoreMediaData { usleep(1000) }
  let pixels = trimmed(original)
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

// Three frames of the finished clip, for writing alt text without playing it
let preview = FileManager.default.temporaryDirectory.appendingPathComponent("clip-\(name)")
try? FileManager.default.createDirectory(at: preview, withIntermediateDirectories: true)
let grabber = AVAssetImageGenerator(asset: AVURLAsset(url: output))
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
