import AppKit
import Foundation

let source = URL(fileURLWithPath: CommandLine.arguments[1])
let outputDirectory = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
let background = NSColor(calibratedRed: 0xf4 / 255, green: 0xef / 255, blue: 0xe7 / 255, alpha: 1)
guard let sourceImage = NSImage(contentsOf: source),
      let cgImage = sourceImage.cgImage(forProposedRect: nil, context: nil, hints: nil),
      let pixels = NSBitmapImageRep(cgImage: cgImage) as NSBitmapImageRep? else {
  fatalError("Could not read source PNG: \(source.path)")
}

// Tighten only transparent outer whitespace; every source artwork pixel is retained.
var minX = pixels.pixelsWide
var minY = pixels.pixelsHigh
var maxX = -1
var maxY = -1
for y in 0..<pixels.pixelsHigh {
  for x in 0..<pixels.pixelsWide {
    if let color = pixels.colorAt(x: x, y: y), color.alphaComponent > 0.02 {
      minX = min(minX, x); minY = min(minY, y)
      maxX = max(maxX, x); maxY = max(maxY, y)
    }
  }
}
guard maxX >= minX, maxY >= minY,
      let cropped = cgImage.cropping(to: CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)) else {
  fatalError("Source contains no visible artwork")
}

for size in [180, 192, 512] {
  let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  let context = NSGraphicsContext(bitmapImageRep: bitmap)!
  NSGraphicsContext.current = context
  context.imageInterpolation = .high
  background.setFill()
  NSBezierPath(rect: NSRect(x: 0, y: 0, width: size, height: size)).fill()

  // 82% maximum edge leaves a consistent branded margin around the approved mark.
  let scale = min(CGFloat(size) * 0.82 / CGFloat(cropped.width), CGFloat(size) * 0.82 / CGFloat(cropped.height))
  let width = CGFloat(cropped.width) * scale
  let height = CGFloat(cropped.height) * scale
  NSImage(cgImage: cropped, size: NSSize(width: cropped.width, height: cropped.height))
    .draw(in: NSRect(x: (CGFloat(size) - width) / 2, y: (CGFloat(size) - height) / 2,
                     width: width, height: height), from: .zero, operation: .sourceOver, fraction: 1)
  context.flushGraphics()
  NSGraphicsContext.restoreGraphicsState()

  let destination = outputDirectory.appendingPathComponent("dyed-unattached-icon-\(size).png")
  try bitmap.representation(using: .png, properties: [:])!.write(to: destination)
  print("Wrote \(destination.path) (\(size)x\(size))")
}
