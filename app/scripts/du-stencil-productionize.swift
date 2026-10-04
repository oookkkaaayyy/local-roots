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
  var widthMM: Double; var heightMM: Double; var areaMM2: Double; var lengthMM: Double?; var minWidthMM: Double?; var skeletonIndices: [Int] = []; var supportKey: String? = nil
}
struct CaseResult { var json: [String: Any]; var islandViolations: [Violation]; var narrowViolations: [Violation]; var artifactPixels: [(Int, Int)]; var ignoredNarrow: [Violation]; var width: Int; var height: Int; var artWidth: Int; var artHeight: Int; var originX: Int; var originY: Int; var mmPerPixel: Double; var mime: String; var sourceData: Data; var rgba: [UInt8]; var normalizedMask: [UInt8] }

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
    let supportKey=meaningful ? "\(parents.sorted().map(String.init).joined(separator:"/")):\(adjacent.sorted().map(String.init).joined(separator:"/"))" : nil
    let v=Violation(kind:meaningful ? "meaningful_bridge_neck" : "ignored_terminal_or_nonarticulating_narrow",id:c.id,x0:c.box.x0,y0:c.box.y0,x1:c.box.x1,y1:c.box.y1,widthMM:Double(c.box.width)*mmPerPx,heightMM:Double(c.box.height)*mmPerPx,areaMM2:Double(c.area)*mmPerPx*mmPerPx,lengthMM:length,minWidthMM:minW,skeletonIndices:indices,supportKey:supportKey)
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
  let json:[String:Any]=["case":label,"source_path":URL(fileURLWithPath:path).standardizedFileURL.path,"source_filename":URL(fileURLWithPath:path).lastPathComponent,"source_sha256":sha256(data),"source_identity":libraryID as Any? ?? NSNull(),"image_pixels":[iw,ih],"binarization":["method":"alpha-composite on white; integer sRGB luma=(299R+587G+114B)/1000; luma >= 128 is retained white; otherwise black","threshold_luma":128,"alpha_handling":"composite on white","normalization":"remove isolated one-pixel 4-connected white components only; do not alter multi-pixel regions or contours","removed_one_pixel_artifacts":artifactRecords],"artwork_bounds_pixel_xyxy":[x0,y0,x1,y1],"artwork_bounds_pixels":[w,h],"physical_scale":["intended_artwork_width_mm":widthMM,"source_of_width":"caller-supplied physical artwork width","millimeters_per_pixel":round4(mmPerPx),"artwork_height_mm":round4(Double(h)*mmPerPx),"aspect_ratio_preserved":true],"coverage_within_artwork_bounds":["black_pixels":bwBlack,"black_percent":round4(100*Double(bwBlack)/Double(px)),"white_pixels":bwWhite,"white_percent":round4(100*Double(bwWhite)/Double(px))],"topology_4_connected":componentMetrics(c4.items),"topology_8_connected":componentMetrics(c8.items),"diagonal_only_contact_count":diagonalContacts,"standalone_island_rule":["basis":"normalized 4-connected white components not touching artwork-bounds edge","minimum_bbox_width_mm":2.0,"minimum_bbox_height_mm":2.0,"violation_count":islandViolations.count,"violations":islandViolations.map(violationJSON)],"connected_width_rule":["basis":"width-under-1mm medial skeleton candidates; fail only when candidate is >=0.4mm and comes within 1mm of two distinct >=2x2mm eroded lobes within one original 8-connected parent","minimum_local_width_mm":1.0,"minimum_feature_length_mm":0.4,"lobe_significance_bbox_mm":[2.0,2.0],"erosion_width_mm":1.0,"violation_count":narrowViolations.count,"violations":narrowViolations.map(violationJSON),"ignored_terminal_or_nonarticulating_count":ignoredNarrow.count,"ignored_terminal_or_nonarticulating":ignoredNarrow.map(violationJSON),"minimum_sampled_medial_width_mm_diagnostic_only":round4(minWidth)],"erosion_curve_euclidean_mm":erosion,"diagnostic_pixel_area_cutoffs_only":smallCutoffs,"physical_verdict":islandViolations.isEmpty && narrowViolations.isEmpty ? "PASS" : "FAIL"]
  return CaseResult(json:json,islandViolations:islandViolations,narrowViolations:narrowViolations,artifactPixels:artifactPixels,ignoredNarrow:ignoredNarrow,width:iw,height:ih,artWidth:w,artHeight:h,originX:x0,originY:y0,mmPerPixel:mmPerPx,mime:mime,sourceData:data,rgba:rgba,normalizedMask:white)
}

func mkdir(_ path:String) { do { try FileManager.default.createDirectory(atPath:path,withIntermediateDirectories:true) } catch { fail("cannot create \(path): \(error)") } }
func writeJSON(_ value:Any,_ path:String) { guard let data=try? JSONSerialization.data(withJSONObject:value,options:[.prettyPrinted,.sortedKeys]) else { fail("cannot serialize JSON") }; do { try data.write(to:URL(fileURLWithPath:path)) } catch { fail("cannot write \(path): \(error)") } }
func json(_ path:String)->[String:Any] { guard let d=try? Data(contentsOf:URL(fileURLWithPath:path)),let x=(try? JSONSerialization.jsonObject(with:d)) as? [String:Any] else { fail("invalid JSON: \(path)") }; return x }
func runValidator(_ binary:String,_ input:String,_ width:Double,_ out:String) -> [String:Any] {
  mkdir(out); let p=Process(); p.executableURL=URL(fileURLWithPath:binary); p.arguments=["--accepted",input,"--failed",input,"--artwork-width-mm",String(format:"%.8g",width),"--out-dir",out]
  let pipe=Pipe(); p.standardOutput=pipe; p.standardError=pipe
  do { try p.run(); p.waitUntilExit() } catch { fail("cannot launch unchanged validator: \(error)") }
  let d=pipe.fileHandleForReading.readDataToEndOfFile()
  if p.terminationStatus != 0 { fail("validator failed: \(String(data:d,encoding:.utf8) ?? "unknown")") }
  return json(URL(fileURLWithPath:out).appendingPathComponent("rusty-viability-report.json").path)
}
func reportCase(_ report:[String:Any],_ path:String)->[String:Any] {
  let expected=URL(fileURLWithPath:path).standardizedFileURL.path
  guard let cases=report["cases"] as? [[String:Any]],let c=cases.last(where:{($0["source_path"] as? String)==expected}) else { fail("validator report does not contain input \(expected)") }
  return c
}
func featureList(_ c:[String:Any],_ key:String)->[[String:Any]] {
  guard let rule=c[key] as? [String:Any],let values=rule["violations"] as? [[String:Any]] else { fail("missing validator findings: \(key)") }; return values
}
func boundsKey(_ v:Violation)->String { "\(v.x0),\(v.y0),\(v.x1),\(v.y1)" }
func reportBoundsKey(_ r:[String:Any],_ ox:Int,_ oy:Int)->String {
  guard let b=r["pixel_bounds_xyxy_in_original"] as? [Int],b.count==4 else { fail("validator finding has no coordinate bounds") }
  return "\(b[0]-ox),\(b[1]-oy),\(b[2]-ox),\(b[3]-oy)"
}
func pngData(_ rgba:[UInt8],_ w:Int,_ h:Int)->Data {
  let cf=Data(rgba) as CFData
  guard let provider=CGDataProvider(data:cf),let image=CGImage(width:w,height:h,bitsPerComponent:8,bitsPerPixel:32,bytesPerRow:w*4,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGBitmapInfo(rawValue:CGImageAlphaInfo.premultipliedLast.rawValue),provider:provider,decode:nil,shouldInterpolate:false,intent:.defaultIntent) else { fail("cannot build PNG image") }
  let data=NSMutableData(); guard let dest=CGImageDestinationCreateWithData(data,"public.png" as CFString,1,nil) else { fail("cannot create PNG destination") }; CGImageDestinationAddImage(dest,image,nil); if !CGImageDestinationFinalize(dest) { fail("PNG encode failed") }; return data as Data
}
func writePixels(_ rgba:[UInt8],_ w:Int,_ h:Int,_ path:String) { do { try pngData(rgba,w,h).write(to:URL(fileURLWithPath:path)) } catch { fail("cannot write image \(path): \(error)") } }
func fileHash(_ data:Data)->String { SHA256.hash(data:data).map{String(format:"%02x",$0)}.joined() }
func supportTube(_ indices:[Int],_ width:Int,_ height:Int,_ radius:Int)->Set<Int> {
  var out=Set<Int>()
  for i in indices { let cx=i%width,cy=i/width
    for dy in -radius...radius { for dx in -radius...radius where dx*dx+dy*dy<=radius*radius { let x=cx+dx,y=cy+dy; if x>=0 && x<width && y>=0 && y<height { out.insert(y*width+x) } } }
  }
  return out
}
func findRoot(_ i:Int,_ parent:inout [Int])->Int { var n=i; while parent[n] != n { n=parent[n] }; return n }
func widenResidual(_ residual:CaseResult,_ pixels:inout [UInt8],_ iteration:Int)->([[String:Any]],Bool) {
  let aw=residual.artWidth,ah=residual.artHeight,radius=max(1,Int(ceil((1.0/residual.mmPerPixel+1.0)/2.0))-1)
  let tubes=residual.narrowViolations.map{supportTube($0.skeletonIndices,aw,ah,radius)};var parent=Array(0..<tubes.count)
  if tubes.count>1 { for i in 0..<tubes.count { for j in (i+1)..<tubes.count where !tubes[i].isDisjoint(with:tubes[j]) || (residual.narrowViolations[i].supportKey != nil && residual.narrowViolations[i].supportKey == residual.narrowViolations[j].supportKey) {let a=findRoot(i,&parent),b=findRoot(j,&parent);if a != b {parent[b]=a}} } }
  var groups=[Int:[Int]]();for i in tubes.indices {groups[findRoot(i,&parent),default:[]].append(i)}
  var log=[[String:Any]](),changed=false
  for (eventIndex,members) in groups.values.sorted(by:{($0.first ?? 0)<($1.first ?? 0)}).enumerated() {
    let pixelsToWhite=members.reduce(into:Set<Int>()){$0.formUnion(tubes[$1])},boxes=members.map{residual.narrowViolations[$0]}
    let x0=boxes.map{$0.x0}.min() ?? 0,y0=boxes.map{$0.y0}.min() ?? 0,x1=boxes.map{$0.x1}.max() ?? 0,y1=boxes.map{$0.y1}.max() ?? 0
    var count=0
    for i in pixelsToWhite {
      let x=i%aw+residual.originX,y=i/aw+residual.originY,p=(y*residual.width+x)*4
      if pixels[p] != 255 || pixels[p+1] != 255 || pixels[p+2] != 255 {pixels[p]=255;pixels[p+1]=255;pixels[p+2]=255;pixels[p+3]=255;count += 1;changed=true}
    }
    log.append(["issue_id":"residual-connected-neck-pass-\(iteration)-event-\(eventIndex+1)","repair_iteration":iteration,"candidate_ids_from_validator":members.map{residual.narrowViolations[$0].id},"issue_type":"residual meaningful connected neck below 1.0 mm","original_dimensions_px":[x1-x0+1,y1-y0+1],"original_dimensions_mm":[round4(Double(x1-x0+1)*residual.mmPerPixel),round4(Double(y1-y0+1)*residual.mmPerPixel)],"original_minimum_width_mm":round4(boxes.compactMap{$0.minWidthMM}.min() ?? 0),"candidate_path_lengths_mm":boxes.compactMap{$0.lengthMM}.map{round4($0)},"operation":"local validator-directed Euclidean support-tube widening; retain existing white feature","support_radius_px":radius,"changed_pixels":count,"changed_area_mm2":round4(Double(count)*residual.mmPerPixel*residual.mmPerPixel),"pixel_bounds_xyxy_original":[residual.originX+x0,residual.originY+y0,residual.originX+x1,residual.originY+y1]])
  }
  return (log,changed)
}

func productionize(_ input:String,_ widthMM:Double,_ validator:String,_ out:String) {
  mkdir(out)
  let source=analyze(input,label:"productionizer-input",libraryID:nil,widthMM:widthMM)
  let before=runValidator(validator,input,widthMM,URL(fileURLWithPath:out).appendingPathComponent("validator-before").path)
  let beforeCase=reportCase(before,input)
  let externalIslands=featureList(beforeCase,"standalone_island_rule"),externalNecks=featureList(beforeCase,"connected_width_rule")
  let internalIslandKeys=Set(source.islandViolations.map{boundsKey($0)}), externalIslandKeys=Set(externalIslands.map{reportBoundsKey($0,source.originX,source.originY)})
  let internalNeckKeys=Set(source.narrowViolations.map{boundsKey($0)}), externalNeckKeys=Set(externalNecks.map{reportBoundsKey($0,source.originX,source.originY)})
  if internalIslandKeys != externalIslandKeys || internalNeckKeys != externalNeckKeys { fail("local detector differs from unchanged validator; refusing to repair") }

  let aw=source.artWidth,ah=source.artHeight; var mask=source.normalizedMask,owners=[Int:String](),repairs=[[String:Any]]()
  for (x,y) in source.artifactPixels {
    let i=y*aw+x,id="raster-speck-\(x)-\(y)"; mask[i]=0;owners[i]=id
    repairs.append(["issue_id":id,"issue_type":"isolated one-pixel raster artifact","original_dimensions_px":[1,1],"original_dimensions_mm":[round4(source.mmPerPixel),round4(source.mmPerPixel)],"operation":"set isolated white pixel to black","changed_pixels":0,"changed_area_mm2":0.0,"pixel_xy_original":[source.originX+x,source.originY+y]])
  }
  let (labels,components4)=components(mask,aw,ah,diagonal:false)
  for (n,v) in source.islandViolations.enumerated() {
    guard let c=components4.first(where:{$0.box.x0==v.x0 && $0.box.y0==v.y0 && $0.box.x1==v.x1 && $0.box.y1==v.y1}) else { fail("cannot map island finding to normalized component") }
    let id="undersized-island-\(n+1)";var count=0
    for i in labels.indices where labels[i]==Int32(c.id) { if mask[i]==1 { mask[i]=0;owners[i]=id;count += 1 } }
    repairs.append(["issue_id":id,"issue_type":"undersized standalone white island","original_dimensions_px":[c.box.width,c.box.height],"original_dimensions_mm":[round4(Double(c.box.width)*source.mmPerPixel),round4(Double(c.box.height)*source.mmPerPixel)],"operation":"fill violating 4-connected island black","changed_pixels":count,"changed_area_mm2":round4(Double(count)*source.mmPerPixel*source.mmPerPixel),"pixel_bounds_xyxy_original":[source.originX+c.box.x0,source.originY+c.box.y0,source.originX+c.box.x1,source.originY+c.box.y1]])
  }
  let radius=max(1,Int(ceil((1.0/source.mmPerPixel+1.0)/2.0))-1)
  let tubes=source.narrowViolations.map{supportTube($0.skeletonIndices,aw,ah,radius)}
  var parent=Array(0..<tubes.count)
  if tubes.count>1 { for i in 0..<tubes.count { for j in (i+1)..<tubes.count where !tubes[i].isDisjoint(with:tubes[j]) || (source.narrowViolations[i].supportKey != nil && source.narrowViolations[i].supportKey == source.narrowViolations[j].supportKey) { let a=findRoot(i,&parent),b=findRoot(j,&parent);if a != b { parent[b]=a } } } }
  var grouped=[Int:[Int]]();for i in tubes.indices { grouped[findRoot(i,&parent),default:[]].append(i) }
  let events=grouped.values.sorted{($0.first ?? 0)<($1.first ?? 0)}
  for (eventIndex,members) in events.enumerated() {
    let all=members.reduce(into:Set<Int>()){ $0.formUnion(tubes[$1]) };let memberBoxes=members.map{source.narrowViolations[$0]}
    let x0=memberBoxes.map{$0.x0}.min() ?? 0,y0=memberBoxes.map{$0.y0}.min() ?? 0,x1=memberBoxes.map{$0.x1}.max() ?? 0,y1=memberBoxes.map{$0.y1}.max() ?? 0
    let id="connected-neck-event-\(eventIndex+1)";var count=0
    for i in all where mask[i]==0 { mask[i]=1;owners[i]=owners[i] ?? id;count += 1 }
    let lengths=memberBoxes.compactMap{$0.lengthMM};let minWidth=memberBoxes.compactMap{$0.minWidthMM}.min() ?? 0
    repairs.append(["issue_id":id,"candidate_ids_from_validator":members.map{source.narrowViolations[$0].id},"issue_type":"meaningful connected neck below 1.0 mm","original_dimensions_px":[x1-x0+1,y1-y0+1],"original_dimensions_mm":[round4(Double(x1-x0+1)*source.mmPerPixel),round4(Double(y1-y0+1)*source.mmPerPixel)],"original_minimum_width_mm":round4(minWidth),"candidate_path_lengths_mm":lengths.map{round4($0)},"operation":"widen only the validator-detected medial-axis corridors with a scale-derived Euclidean support tube; retain the existing white feature","support_radius_px":radius,"changed_pixels":count,"changed_area_mm2":round4(Double(count)*source.mmPerPixel*source.mmPerPixel),"pixel_bounds_xyxy_original":[source.originX+x0,source.originY+y0,source.originX+x1,source.originY+y1]])
  }

  var afterPixels=source.rgba,changedCoordinates=[Int](),changedOwners=[String:Int]()
  for (i,owner) in owners { let x=i%aw+source.originX,y=i/aw+source.originY,p=(y*source.width+x)*4,shade=mask[i]==1 ? UInt8(255):UInt8(0)
    if afterPixels[p] != shade || afterPixels[p+1] != shade || afterPixels[p+2] != shade { afterPixels[p]=shade;afterPixels[p+1]=shade;afterPixels[p+2]=shade;afterPixels[p+3]=255;changedCoordinates.append(i);changedOwners[owner,default:0]+=1 }
  }
  for i in repairs.indices { let id=repairs[i]["issue_id"] as! String;let count=changedOwners[id] ?? 0;repairs[i]["changed_pixels"]=count;repairs[i]["changed_area_mm2"]=round4(Double(count)*source.mmPerPixel*source.mmPerPixel) }
  let stem=URL(fileURLWithPath:input).deletingPathExtension().lastPathComponent;let output=URL(fileURLWithPath:out).appendingPathComponent(stem+"-productionized.png").path
  writePixels(afterPixels,source.width,source.height,output)
  let cw=source.width*2+16;var comparison=[UInt8](repeating:230,count:cw*source.height*4)
  for y in 0..<source.height { for x in 0..<source.width { let s=(y*source.width+x)*4,l=(y*cw+x)*4,r=(y*cw+source.width+16+x)*4;comparison[l...l+3]=source.rgba[s...s+3];comparison[r...r+3]=afterPixels[s...s+3] } }
  let comparisonPath=URL(fileURLWithPath:out).appendingPathComponent(stem+"-before-after.png").path;writePixels(comparison,cw,source.height,comparisonPath)
  var overlayPixels=source.rgba;for i in changedCoordinates { let x=i%aw+source.originX,y=i/aw+source.originY,p=(y*source.width+x)*4;overlayPixels[p]=255;overlayPixels[p+1]=0;overlayPixels[p+2]=190;overlayPixels[p+3]=255 }
  let overlayPath=URL(fileURLWithPath:out).appendingPathComponent(stem+"-changed-pixels.png").path;writePixels(overlayPixels,source.width,source.height,overlayPath)
  var post=runValidator(validator,output,widthMM,URL(fileURLWithPath:out).appendingPathComponent("validator-after").path);var postCase=reportCase(post,output)
  var afterVerdict=postCase["physical_verdict"] as? String ?? "FAIL"
  var validatorAfterPath=URL(fileURLWithPath:out).appendingPathComponent("validator-after/rusty-viability-report.json").path
  var repairIteration=1
  while afterVerdict != "PASS" && repairIteration < 4 && ((postCase["standalone_island_rule"] as? [String:Any])?["violation_count"] as? Int ?? 0)==0 {
    repairIteration += 1
    let residual=analyze(output,label:"productionizer-residual",libraryID:nil,widthMM:widthMM)
    let repairPass=widenResidual(residual,&afterPixels,repairIteration)
    if !repairPass.1 { break }
    for issue in repairPass.0 { repairs.append(issue) }
    writePixels(afterPixels,source.width,source.height,output)
    changedCoordinates=[]
    for y in source.originY..<(source.originY+source.artHeight) { for x in source.originX..<(source.originX+source.artWidth) {let p=(y*source.width+x)*4;if source.rgba[p] != afterPixels[p] || source.rgba[p+1] != afterPixels[p+1] || source.rgba[p+2] != afterPixels[p+2] || source.rgba[p+3] != afterPixels[p+3] {changedCoordinates.append((y-source.originY)*aw+x-source.originX)}} }
    let cw=source.width*2+16;var cmp=[UInt8](repeating:230,count:cw*source.height*4)
    for y in 0..<source.height { for x in 0..<source.width {let s=(y*source.width+x)*4,l=(y*cw+x)*4,r=(y*cw+source.width+16+x)*4;cmp[l...l+3]=source.rgba[s...s+3];cmp[r...r+3]=afterPixels[s...s+3]}}
    writePixels(cmp,cw,source.height,comparisonPath);overlayPixels=source.rgba
    for i in changedCoordinates {let x=i%aw+source.originX,y=i/aw+source.originY,p=(y*source.width+x)*4;overlayPixels[p]=255;overlayPixels[p+1]=0;overlayPixels[p+2]=190;overlayPixels[p+3]=255}
    writePixels(overlayPixels,source.width,source.height,overlayPath)
    let passDir=URL(fileURLWithPath:out).appendingPathComponent("validator-after-pass-\(repairIteration)").path
    post=runValidator(validator,output,widthMM,passDir);postCase=reportCase(post,output);validatorAfterPath=URL(fileURLWithPath:passDir).appendingPathComponent("rusty-viability-report.json").path;afterVerdict=postCase["physical_verdict"] as? String ?? "FAIL"
  }
  let report:[String:Any]=["pipeline":"generic deterministic stencil productionizer","input_path":URL(fileURLWithPath:input).standardizedFileURL.path,"input_sha256":fileHash(source.sourceData),"output_path":output,"output_sha256":fileHash((try? Data(contentsOf:URL(fileURLWithPath:output))) ?? Data()),"artwork_width_mm":widthMM,"artwork_bounds_pixel_xyxy":[source.originX,source.originY,source.originX+aw-1,source.originY+ah-1],"mm_per_pixel":round4(source.mmPerPixel),"physical_thresholds":["standalone_island_min_bbox_mm":[2.0,2.0],"meaningful_connected_neck_min_width_mm":1.0,"meaningful_connected_neck_min_length_mm":0.4],"raster_cleanup":"same luma threshold as v2; remove only isolated one-pixel 4-connected retained-white components","validator_before_report":URL(fileURLWithPath:out).appendingPathComponent("validator-before/rusty-viability-report.json").path,"validator_after_report":validatorAfterPath,"before_verdict":beforeCase["physical_verdict"] ?? "FAIL","after_verdict":afterVerdict,"after_island_violations":(postCase["standalone_island_rule"] as? [String:Any])?["violation_count"] ?? -1,"after_neck_violations":(postCase["connected_width_rule"] as? [String:Any])?["violation_count"] ?? -1,"repairs":repairs,"changed_pixels":changedCoordinates.count,"artwork_pixels":aw*ah,"changed_artwork_percent":round4(100.0*Double(changedCoordinates.count)/Double(aw*ah)),"changed_area_mm2":round4(Double(changedCoordinates.count)*source.mmPerPixel*source.mmPerPixel),"before_after_png":comparisonPath,"changed_pixel_overlay_png":overlayPath,"visual_equivalence":"not automatically asserted; visual review required"]
  let reportPath=URL(fileURLWithPath:out).appendingPathComponent("productionization-report.json").path;writeJSON(report,reportPath)
  print("\(output)\n\(reportPath)\nBefore \(beforeCase["physical_verdict"] ?? "FAIL"); after \(afterVerdict); \((postCase["standalone_island_rule"] as? [String:Any])?["violation_count"] ?? -1) island, \((postCase["connected_width_rule"] as? [String:Any])?["violation_count"] ?? -1) neck violations")
}
func main() {
  var args=Array(CommandLine.arguments.dropFirst()),values=[String:String]();while !args.isEmpty { let k=args.removeFirst();if !args.isEmpty {values[k]=args.removeFirst()}else{fail("missing value for \(k)")} }
  guard let input=values["--input"],let out=values["--out-dir"],let validator=values["--validator"],let width=Double(values["--artwork-width-mm"] ?? "") else {fail("usage: du-stencil-productionize.swift --input IMAGE --artwork-width-mm MM --validator PATH --out-dir DIR")}
  guard width>0 else {fail("artwork width must be positive")};productionize(input,width,validator,out)
}
main()
