#!/usr/bin/env swift
import Foundation
import ImageIO
import CoreGraphics
import CryptoKit

struct Box { var x0: Int; var y0: Int; var x1: Int; var y1: Int
  var width: Int { x1 - x0 + 1 }; var height: Int { y1 - y0 + 1 }
}
struct Component { var id: Int; var area: Int; var box: Box; var border: Bool; var diagonalLinks = 0
  var centroidX: Double; var centroidY: Double
}
struct Violation { var kind: String; var id: Int; var x0: Int; var y0: Int; var x1: Int; var y1: Int
  var widthMM: Double; var heightMM: Double; var areaMM2: Double; var lengthMM: Double?; var minWidthMM: Double?; var skeletonIndices: [Int] = []
}
struct CaseResult { var json: [String: Any]; var islandViolations: [Violation]; var narrowViolations: [Violation]; var artifactPixels: [(Int, Int)]; var ignoredNarrow: [Violation]; var width: Int; var height: Int; var originX: Int; var originY: Int; var mmPerPixel: Double; var mime: String; var sourceData: Data }

func fail(_ message: String) -> Never { fputs("ERROR: \(message)\n", stderr); exit(2) }
func sha256(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
func round4(_ x: Double) -> Double { (x * 10_000).rounded() / 10_000 }
func rectJSON(_ b: Box, _ scale: Double, _ ox: Int, _ oy: Int) -> [String: Any] {
  ["pixel_bounds_xyxy_in_original": [ox+b.x0, oy+b.y0, ox+b.x1, oy+b.y1],
   "bbox_width_mm": round4(Double(b.width)*scale), "bbox_height_mm": round4(Double(b.height)*scale)]
}

func components(_ mask: [UInt8], _ w: Int, _ h: Int, diagonal: Bool) -> (labels: [Int32], items: [Component]) {
  let dx = diagonal ? [-1,0,1,-1,1,-1,0,1] : [0,-1,1,0]
  let dy = diagonal ? [-1,-1,-1,0,0,1,1,1] : [-1,0,0,1]
  var labels = [Int32](repeating: 0, count: mask.count), items = [Component](), queue = [Int]()
  for start in 0..<mask.count where mask[start] == 1 && labels[start] == 0 {
    let id = Int32(items.count + 1); queue.removeAll(keepingCapacity: true); queue.append(start); labels[start] = id
    var head = 0, x0=w, y0=h, x1=0, y1=0, sx=0.0, sy=0.0, border=false
    while head < queue.count {
      let i=queue[head]; head += 1; let x=i%w, y=i/w
      x0=min(x0,x); x1=max(x1,x); y0=min(y0,y); y1=max(y1,y); sx += Double(x); sy += Double(y)
      if x == 0 || y == 0 || x == w-1 || y == h-1 { border=true }
      for k in dx.indices { let nx=x+dx[k], ny=y+dy[k]; if nx>=0 && nx<w && ny>=0 && ny<h { let ni=ny*w+nx; if mask[ni]==1 && labels[ni]==0 { labels[ni]=id; queue.append(ni) } } }
    }
    let b=Box(x0:x0,y0:y0,x1:x1,y1:y1)
    items.append(Component(id:Int(id),area:queue.count,box:b,border:border,centroidX:sx/Double(queue.count),centroidY:sy/Double(queue.count)))
  }
  return (labels,items)
}

// Exact squared Euclidean distance transform (Felzenszwalb-Huttenlocher).
func edt1D(_ f: [Double]) -> [Double] {
  let n=f.count; var v=[Int](repeating:0,count:n), z=[Double](repeating:0,count:n+1), d=[Double](repeating:0,count:n)
  var k=0; v[0]=0; z[0] = -Double.infinity; z[1] = Double.infinity
  if n > 1 { for q in 1..<n {
    var s: Double
    repeat { let vk=v[k]; s=((f[q]+Double(q*q))-(f[vk]+Double(vk*vk)))/(2.0*Double(q-vk)); if s <= z[k] && k>0 { k -= 1 } else { break } } while true
    k += 1; v[k]=q; z[k]=s; z[k+1]=Double.infinity
  }}
  k=0
  for q in 0..<n { while z[k+1] < Double(q) { k += 1 }; let delta=q-v[k]; d[q]=Double(delta*delta)+f[v[k]] }
  return d
}
func distanceTransform(_ white: [UInt8], _ w: Int, _ h: Int) -> [Double] {
  let inf=1e18; var pass=[Double](repeating:0,count:w*h)
  for y in 0..<h { var f=[Double](repeating:inf,count:w); for x in 0..<w { if white[y*w+x]==0 || x==0 || x==w-1 || y==0 || y==h-1 { f[x]=0 } }; let d=edt1D(f); for x in 0..<w { pass[y*w+x]=d[x] } }
  var out=[Double](repeating:0,count:w*h)
  for x in 0..<w { var f=[Double](repeating:inf,count:h); for y in 0..<h { f[y]=pass[y*w+x] }; let d=edt1D(f); for y in 0..<h { out[y*w+x]=d[y] } }
  return out
}

func skeleton(_ input: [UInt8], _ w: Int, _ h: Int) -> [UInt8] {
  var m=input, changed=true
  while changed {
    changed=false
    for phase in 0...1 {
      var remove=[Int]()
      if h>2 && w>2 { for y in 1..<(h-1) { for x in 1..<(w-1) {
        let i=y*w+x; if m[i]==0 { continue }
        let p=[m[i-w],m[i-w+1],m[i+1],m[i+w+1],m[i+w],m[i+w-1],m[i-1],m[i-w-1]]
        let b=p.reduce(0){$0+Int($1)}; if b<2 || b>6 { continue }
        var a=0; for j in 0..<8 { if p[j]==0 && p[(j+1)%8]==1 { a += 1 } }; if a != 1 { continue }
        let c1 = phase==0 ? p[0]*p[2]*p[4] : p[0]*p[2]*p[6]
        let c2 = phase==0 ? p[2]*p[4]*p[6] : p[0]*p[4]*p[6]
        if c1==0 && c2==0 { remove.append(i) }
      }} }
      if !remove.isEmpty { changed=true; for i in remove { m[i]=0 } }
    }
  }
  return m
}

func imagePixels(_ path: String) -> (Int,Int,[UInt8],Data,String) {
  let url=URL(fileURLWithPath:path); guard let src=CGImageSourceCreateWithURL(url as CFURL,nil), let image=CGImageSourceCreateImageAtIndex(src,0,nil) else { fail("cannot decode \(path)") }
  let w=image.width,h=image.height,bpr=w*4; var rgba=[UInt8](repeating:0,count:h*bpr)
  guard let ctx=CGContext(data:&rgba,width:w,height:h,bitsPerComponent:8,bytesPerRow:bpr,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else { fail("cannot create image buffer") }
  ctx.draw(image,in:CGRect(x:0,y:0,width:w,height:h))
  guard let data=try? Data(contentsOf:url) else { fail("cannot read source bytes") }
  let ext=url.pathExtension.lowercased(); let mime=ext=="jpg" || ext=="jpeg" ? "image/jpeg" : "image/png"
  return (w,h,rgba,data,mime)
}

func analyze(_ path: String, label: String, libraryID: String?, widthMM: Double) -> CaseResult {
  let (iw,ih,rgba,data,mime)=imagePixels(path); let bpr=iw*4
  func lum(_ x:Int,_ y:Int)->Int { let p=y*bpr+x*4, a=Int(rgba[p+3]); let r=(Int(rgba[p])*299+Int(rgba[p+1])*587+Int(rgba[p+2])*114)/1000; return (r*a + 255*(255-a))/255 }
  var x0=iw,y0=ih,x1 = -1,y1 = -1
  for y in 0..<ih { for x in 0..<iw { if lum(x,y) < 128 { x0=min(x0,x);x1=max(x1,x);y0=min(y0,y);y1=max(y1,y) } } }
  if x1<0 { fail("no dark artwork in \(path)") }
  let w=x1-x0+1,h=y1-y0+1,mmPerPx=widthMM/Double(w),px=w*h
  var sourceMask=[UInt8](repeating:0,count:px)
  for y in 0..<h { for x in 0..<w { sourceMask[y*w+x] = lum(x+x0,y+y0) >= 128 ? 1 : 0 } }
  // Remove only isolated one-pixel components as raster noise; no anatomy-sized geometry is altered.
  let raw4=components(sourceMask,w,h,diagonal:false)
  let artifactComponents=raw4.items.filter { !$0.border && $0.area == 1 }
  var artifactPixels=[(Int,Int)](), white=sourceMask
  for c in artifactComponents { let i=raw4.labels.firstIndex(of:Int32(c.id))!; white[i]=0; artifactPixels.append((i%w,i/w)) }
  let c4=components(white,w,h,diagonal:false), c8=components(white,w,h,diagonal:true)
  let islands=c4.items.filter{ !$0.border }
  let islandViolations=islands.filter{ Double($0.box.width)*mmPerPx < 2.0 || Double($0.box.height)*mmPerPx < 2.0 }.map { c in
    Violation(kind:"standalone_island",id:c.id,x0:c.box.x0,y0:c.box.y0,x1:c.box.x1,y1:c.box.y1,widthMM:Double(c.box.width)*mmPerPx,heightMM:Double(c.box.height)*mmPerPx,areaMM2:Double(c.area)*mmPerPx*mmPerPx,lengthMM:nil,minWidthMM:nil)
  }
  let dist=distanceTransform(white,w,h); var sk=skeleton(white,w,h)
  for x in 0..<w { sk[x]=0; sk[(h-1)*w+x]=0 }; for y in 0..<h { sk[y*w]=0; sk[y*w+w-1]=0 }
  var narrowMask=[UInt8](repeating:0,count:px), widthAt=[Double](repeating:Double.infinity,count:px)
  for i in 0..<px where sk[i]==1 { let mm=max(0.0,2.0*sqrt(dist[i])-1.0)*mmPerPx; widthAt[i]=mm; if mm < 1.0 { narrowMask[i]=1 } }
  let narrowCC=components(narrowMask,w,h,diagonal:true)
  // Erosion at the measured 1 mm width floor. Only surviving lobes at least 2 x 2 mm
  // count as substantial supports; this avoids treating terminal points as bridges.
  var eroded=[UInt8](repeating:0,count:px)
  for i in 0..<px where white[i]==1 { if max(0.0,2.0*sqrt(dist[i])-1.0)*mmPerPx >= 1.0 { eroded[i]=1 } }
  let erodedCC=components(eroded,w,h,diagonal:true)
  var substantialIds=Set<Int>(), parentForLabel=[Int:Int]()
  for c in erodedCC.items where Double(c.box.width)*mmPerPx >= 2.0 && Double(c.box.height)*mmPerPx >= 2.0 {
    let i=(0..<px).first(where:{erodedCC.labels[$0]==Int32(c.id)})!, parent=Int(c8.labels[i]); if parent>0 { substantialIds.insert(c.id); parentForLabel[c.id]=parent }
  }
  // Narrow skeleton parts must approach two distinct eroded substantial lobes of one parent.
  let searchRadius=max(1,Int(ceil(1.0/mmPerPx))), r2=searchRadius*searchRadius
  var narrowViolations=[Violation](), ignoredNarrow=[Violation]()
  for c in narrowCC.items {
    var edges=0.0,minW=Double.infinity,indices=[Int](),adjacent=Set<Int>()
    for y in c.box.y0...c.box.y1 { for x in c.box.x0...c.box.x1 { let i=y*w+x; if narrowMask[i]==0 || narrowCC.labels[i] != Int32(c.id) {continue}; minW=min(minW,widthAt[i]);indices.append(i)
      for dy in -searchRadius...searchRadius { for dx in -searchRadius...searchRadius where dx*dx+dy*dy<=r2 {let nx=x+dx,ny=y+dy;if nx>=0 && nx<w && ny>=0 && ny<h {let id=Int(erodedCC.labels[ny*w+nx]);if substantialIds.contains(id){adjacent.insert(id)}}} }
      for (dx,dy,weight) in [(1,0,1.0),(0,1,1.0),(1,1,sqrt(2.0)),(-1,1,sqrt(2.0))] {let nx=x+dx,ny=y+dy;if nx>=0 && nx<w && ny>=0 && ny<h && narrowCC.labels[ny*w+nx]==Int32(c.id){edges += weight*mmPerPx}}
    }}
    let length=edges/2.0+mmPerPx, parents=Set(adjacent.compactMap{parentForLabel[$0]})
    let meaningful=adjacent.count>=2 && parents.count==1 && length>=0.4
    let v=Violation(kind:meaningful ? "meaningful_bridge_neck" : "ignored_terminal_or_nonarticulating_narrow",id:c.id,x0:c.box.x0,y0:c.box.y0,x1:c.box.x1,y1:c.box.y1,widthMM:Double(c.box.width)*mmPerPx,heightMM:Double(c.box.height)*mmPerPx,areaMM2:Double(c.area)*mmPerPx*mmPerPx,lengthMM:length,minWidthMM:minW,skeletonIndices:indices)
    if meaningful {narrowViolations.append(v)} else {ignoredNarrow.append(v)}
  }
  var diagonalContacts=0
  if h>1 && w>1 { for y in 0..<(h-1) { for x in 0..<(w-1) { let i=y*w+x
    if white[i]==1 && white[i+w+1]==1 && c4.labels[i] != c4.labels[i+w+1] {diagonalContacts += 1}
    if white[i+1]==1 && white[i+w]==1 && c4.labels[i+1] != c4.labels[i+w] {diagonalContacts += 1}
  }} }
  let enclosedWhite=white.reduce(0){$0+Int($1)}
  let bwWhite=enclosedWhite, bwBlack=px-enclosedWhite
  let erosionRadii=[0.0,0.25,0.5,0.75,1.0,1.5,2.0]
  let erosion=erosionRadii.map { r -> [String:Any] in let n=(0..<px).reduce(0){$0 + (white[$1]==1 && max(0.0,sqrt(dist[$1])-0.5)*mmPerPx >= r ? 1:0)}; return ["radius_mm":r,"remaining_white_pixels":n,"remaining_percent":round4(100.0*Double(n)/Double(max(1,enclosedWhite)))] }
  let smallCutoffs=[1,2,4,8,16,32,64,128,256]
  func componentMetrics(_ list:[Component]) -> [String:Any] {
    let enclosed=list.filter{ !$0.border }
    var counts=[String:Int]()
    for cutoff in smallCutoffs { counts[String(cutoff)] = enclosed.filter{$0.area <= cutoff}.count }
    let records=enclosed.map { c -> [String:Any] in
      ["id":c.id,"area_px":c.area,"pixel_bounds_xyxy_in_original":[x0+c.box.x0,y0+c.box.y0,x0+c.box.x1,y0+c.box.y1],"bbox_width_mm":round4(Double(c.box.width)*mmPerPx),"bbox_height_mm":round4(Double(c.box.height)*mmPerPx),"area_mm2_estimate":round4(Double(c.area)*mmPerPx*mmPerPx)]
    }
    return ["component_count":list.count,"border_connected_component_count":list.filter{$0.border}.count,
      "enclosed_component_count":enclosed.count,"enclosed_area_px_distribution":enclosed.map{$0.area}.sorted(),
      "enclosed_counts_at_or_below_area_px":counts,"enclosed_component_records":records]
  }
  func violationJSON(_ v:Violation)->[String:Any] { var d:[String:Any]=["id":v.id,"kind":v.kind,"pixel_bounds_xyxy_in_original":[x0+v.x0,y0+v.y0,x0+v.x1,y0+v.y1],"bbox_width_mm":round4(v.widthMM),"bbox_height_mm":round4(v.heightMM),"area_mm2":round4(v.areaMM2)]; if let x=v.lengthMM {d["length_mm_estimate"]=round4(x)}; if let x=v.minWidthMM {d["minimum_local_width_mm_estimate"]=round4(x)}; return d }
  let minWidth=widthAt.filter{$0.isFinite}.min() ?? 0
  let artifactRecords=artifactPixels.map { (x,y) -> [String:Any] in ["pixel_xy_original":[x0+x,y0+y],"classification":"isolated one-pixel raster artifact removed from normalized mask"] }
  let json:[String:Any]=["case":label,"source_path":URL(fileURLWithPath:path).standardizedFileURL.path,"source_filename":URL(fileURLWithPath:path).lastPathComponent,"source_sha256":sha256(data),"source_identity":libraryID as Any? ?? NSNull(),"image_pixels":[iw,ih],"binarization":["method":"alpha-composite on white; integer sRGB luma=(299R+587G+114B)/1000; luma >= 128 is retained white; otherwise black","threshold_luma":128,"alpha_handling":"composite on white","normalization":"remove isolated one-pixel 4-connected white components only; do not alter multi-pixel regions or contours","removed_one_pixel_artifacts":artifactRecords],"artwork_bounds_pixel_xyxy":[x0,y0,x1,y1],"artwork_bounds_pixels":[w,h],"physical_scale":["intended_artwork_width_mm":widthMM,"source_of_width":"supabase/functions/submit-intake/index.ts:102 states final artwork width 7.5 inches","millimeters_per_pixel":round4(mmPerPx),"artwork_height_mm":round4(Double(h)*mmPerPx),"aspect_ratio_preserved":true],"coverage_within_artwork_bounds":["black_pixels":bwBlack,"black_percent":round4(100*Double(bwBlack)/Double(px)),"white_pixels":bwWhite,"white_percent":round4(100*Double(bwWhite)/Double(px))],"topology_4_connected":componentMetrics(c4.items),"topology_8_connected":componentMetrics(c8.items),"diagonal_only_contact_count":diagonalContacts,"standalone_island_rule":["basis":"normalized 4-connected white components not touching artwork-bounds edge","minimum_bbox_width_mm":2.0,"minimum_bbox_height_mm":2.0,"violation_count":islandViolations.count,"violations":islandViolations.map(violationJSON)],"connected_width_rule":["basis":"width-under-1mm medial skeleton candidates; fail only when candidate is >=0.4mm and comes within 1mm of two distinct >=2x2mm eroded lobes within one original 8-connected parent","minimum_local_width_mm":1.0,"minimum_feature_length_mm":0.4,"lobe_significance_bbox_mm":[2.0,2.0],"erosion_width_mm":1.0,"violation_count":narrowViolations.count,"violations":narrowViolations.map(violationJSON),"ignored_terminal_or_nonarticulating_count":ignoredNarrow.count,"ignored_terminal_or_nonarticulating":ignoredNarrow.map(violationJSON),"minimum_sampled_medial_width_mm_diagnostic_only":round4(minWidth)],"erosion_curve_euclidean_mm":erosion,"diagnostic_pixel_area_cutoffs_only":smallCutoffs,"physical_verdict":islandViolations.isEmpty && narrowViolations.isEmpty ? "PASS" : "FAIL"]
  return CaseResult(json:json,islandViolations:islandViolations,narrowViolations:narrowViolations,artifactPixels:artifactPixels,ignoredNarrow:ignoredNarrow,width:iw,height:ih,originX:x0,originY:y0,mmPerPixel:mmPerPx,mime:mime,sourceData:data)
}

func esc(_ s:String)->String { s.replacingOccurrences(of:"&",with:"&amp;").replacingOccurrences(of:"\"",with:"&quot;").replacingOccurrences(of:"<",with:"&lt;") }
func overlay(_ r:CaseResult, _ output:String) {
  let href="data:\(r.mime);base64,\(r.sourceData.base64EncodedString())"
  var body=""
  for v in r.islandViolations {
    let x=r.originX+v.x0,y=r.originY+v.y0,w=v.x1-v.x0+1,h=v.y1-v.y0+1
    let label=String(format:"Island #%d: %.2f × %.2f mm; %.2f mm²",v.id,v.widthMM,v.heightMM,v.areaMM2)
    body += "<rect x=\"\(x)\" y=\"\(y)\" width=\"\(w)\" height=\"\(h)\" fill=\"#ff1744\" fill-opacity=\".35\" stroke=\"#ff1744\" stroke-width=\"1.5\"><title>\(esc(label))</title></rect>"
  }
  for v in r.narrowViolations {
    let label=String(format:"Meaningful bridge #%d: min width %.3f mm; estimated path %.3f mm",v.id,v.minWidthMM ?? 0,v.lengthMM ?? 0)
    body += "<g><title>\(esc(label)) — bbox \(String(format:"%.2f",v.widthMM)) × \(String(format:"%.2f",v.heightMM)) mm</title>"
    for i in v.skeletonIndices { body += "<circle cx=\"\(r.originX+i%r.width)\" cy=\"\(r.originY+i/r.width)\" r=\"1.5\" fill=\"#ff9f1c\" fill-opacity=\".95\"/>" }
    body += "</g>"
  }
  for v in r.ignoredNarrow {
    let label=String(format:"Ignored terminal/non-articulating candidate #%d: %.3f mm minimum width, %.3f mm path",v.id,v.minWidthMM ?? 0,v.lengthMM ?? 0)
    body += "<g><title>\(esc(label)) — no two substantial supports</title>"
    for i in v.skeletonIndices { body += "<circle cx=\"\(r.originX+i%r.width)\" cy=\"\(r.originY+i/r.width)\" r=\"1\" fill=\"#a78bfa\" fill-opacity=\".78\"/>" }; body += "</g>"
  }
  for (x,y) in r.artifactPixels { body += "<circle cx=\"\(r.originX+x)\" cy=\"\(r.originY+y)\" r=\"3\" fill=\"#f4f4f4\" stroke=\"#222\" stroke-width=\"1\"><title>Ignored isolated one-pixel raster artifact; removed during normalization</title></circle>" }
  let summary="\(r.islandViolations.count) island fails; \(r.narrowViolations.count) meaningful neck fails; \(r.artifactPixels.count) raster specks removed; \(r.ignoredNarrow.count) narrow tips/regions ignored"
  let svg="""
  <svg xmlns="http://www.w3.org/2000/svg" width="\(r.width)" height="\(r.height)" viewBox="0 0 \(r.width) \(r.height)"><image href="\(href)" width="\(r.width)" height="\(r.height)"/>\(body)<rect x="0" y="0" width="\(r.width)" height="42" fill="#111" fill-opacity=".82"/><text x="12" y="17" fill="white" font-family="sans-serif" font-size="13">\(esc(summary))</text><text x="12" y="34" fill="white" font-family="sans-serif" font-size="12">Scale: \(String(format:"%.3f",r.mmPerPixel)) mm/px; red=island; amber=neck; purple=ignored tip; pale=speck removed</text></svg>
  """
  do { try svg.write(toFile:output,atomically:true,encoding:.utf8) } catch { fail("cannot write overlay: \(error)") }
}

func main() {
  var args=Array(CommandLine.arguments.dropFirst()), vals=[String:String](); while !args.isEmpty { let k=args.removeFirst(); if !args.isEmpty { vals[k]=args.removeFirst() } else { fail("missing value for \(k)") } }
  guard let accepted=vals["--accepted"],let failed=vals["--failed"],let out=vals["--out-dir"],let width=Double(vals["--artwork-width-mm"] ?? "") else { fail("usage: du-stencil-viability.swift --accepted PATH --failed PATH --artwork-width-mm MM --out-dir DIR") }
  guard width>0 else { fail("artwork width must be positive") }
  let fm=FileManager.default; do { try fm.createDirectory(atPath:out,withIntermediateDirectories:true) } catch { fail("cannot create output folder: \(error)") }
  let cases=[analyze(accepted,label:"accepted-rusty",libraryID:"libfile_1bef5cd1611881919234549fb4cbd59a",widthMM:width),analyze(failed,label:"failed-rusty",libraryID:nil,widthMM:width)]
  let report:[String:Any]=["validator":"D&U manufacturing-aware deterministic stencil viability validator","version":"2.0.0","thresholds":["standalone_island_min_bbox_mm":[2.0,2.0],"meaningful_connected_bridge_min_width_mm":1.0,"meaningful_connected_bridge_min_length_mm":0.4],"artwork_width_mm":width,"cases":cases.map{$0.json},"thresholds_cleanly_separate":cases[0].json["physical_verdict"] as? String == "PASS" && cases[1].json["physical_verdict"] as? String == "FAIL"]
  // Sorted-key JSON and no timestamps make repeated reports byte-identical.
  guard let output=try? JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]) else { fail("cannot serialize JSON report") }
  do { try output.write(to:URL(fileURLWithPath:out).appendingPathComponent("rusty-viability-report.json")) } catch { fail("cannot write report: \(error)") }
  overlay(cases[0],URL(fileURLWithPath:out).appendingPathComponent("accepted-rusty-overlay.svg").path)
  overlay(cases[1],URL(fileURLWithPath:out).appendingPathComponent("failed-rusty-overlay.svg").path)
  let md="""
  # Rusty stencil viability report

Artwork width: **\(width) mm** (7.5 in project spec; aspect ratio preserved).

| Case | SHA-256 | 4-CC floating island fails | 8-CC enclosed | meaningful neck fails | ignored tips | specks removed | Verdict |
|---|---|---:|---:|---:|---:|---:|---|
\(cases.map { c in let j=c.json; let iso=j["standalone_island_rule"] as! [String:Any]; let narrow=j["connected_width_rule"] as! [String:Any]; let t4=j["topology_4_connected"] as! [String:Any]; let t8=j["topology_8_connected"] as! [String:Any]; let norm=j["binarization"] as! [String:Any]; return "| \(j["case"]!) | \(j["source_sha256"]!) | \(iso["violation_count"]!) / \(t4["enclosed_component_count"]!) | \(t8["enclosed_component_count"]!) | \(narrow["violation_count"]!) | \(narrow["ignored_terminal_or_nonarticulating_count"]!) | \((norm["removed_one_pixel_artifacts"] as! [[String:Any]]).count) | **\(j["physical_verdict"]!)** |" }.joined(separator:"\n"))

Normalization removes only isolated one-pixel white 4-connected components as raster specks; multi-pixel art is not modified. Floating islands fail when either physical bounding-box dimension is below 2.0 mm. A connected feature fails only if a sub-1.0 mm medial skeleton region at least 0.4 mm long approaches two distinct substantial remnants (each at least 2.0 × 2.0 mm) of its original 8-connected parent after 1.0 mm width erosion. One-support terminal/taper branches are explicitly ignored. The reused 2 × 2 mm floor defines substantial support; no new physical minimum is introduced.

Overlays: `accepted-rusty-overlay.svg` and `failed-rusty-overlay.svg`. Hover highlighted shapes for exact physical dimensions; the JSON contains every component/feature coordinate and measurement.
"""
  do { try md.write(toFile:URL(fileURLWithPath:out).appendingPathComponent("rusty-viability-report.md").path,atomically:true,encoding:.utf8) } catch { fail("cannot write markdown report: \(error)") }
  fputs("Report: \(URL(fileURLWithPath:out).appendingPathComponent("rusty-viability-report.json").path)\n",stdout)
  fputs("Accepted Rusty: \(cases[0].json["physical_verdict"]!); failed Rusty: \(cases[1].json["physical_verdict"]!)\n",stdout)
}
main()
