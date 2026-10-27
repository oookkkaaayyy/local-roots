const decoder=new TextDecoder();
const REL_NS='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const textOf=(parent,tag)=>Array.from(parent.getElementsByTagNameNS('*',tag)).map(n=>n.textContent||'').join('');
const xml=(bytes,label)=>{const doc=new DOMParser().parseFromString(decoder.decode(bytes),'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error(`Invalid XLSX XML in ${label}.`);return doc;};

function columnIndex(ref){const letters=String(ref).match(/^[A-Z]+/i)?.[0];if(!letters)throw Error(`Invalid XLSX cell reference: ${ref}`);let n=0;for(const ch of letters.toUpperCase())n=n*26+ch.charCodeAt(0)-64;return n-1;}
function normalizeZipPath(path){const parts=[];for(const part of path.split('/')){if(!part||part==='.')continue;if(part==='..')parts.pop();else parts.push(part);}return parts.join('/');}

async function zipEntries(buffer){
  const view=new DataView(buffer),bytes=new Uint8Array(buffer);let eocd=-1;
  for(let p=Math.max(0,bytes.length-65557);p<=bytes.length-22;p++)if(view.getUint32(p,true)===0x06054b50)eocd=p;
  if(eocd<0)throw Error('File is not a valid XLSX ZIP archive.');
  const count=view.getUint16(eocd+10,true),directory=view.getUint32(eocd+16,true),files=new Map();let p=directory;
  for(let i=0;i<count;i++){
    if(view.getUint32(p,true)!==0x02014b50)throw Error('XLSX central directory is malformed.');
    const method=view.getUint16(p+10,true),compressedSize=view.getUint32(p+20,true),nameLen=view.getUint16(p+28,true),extraLen=view.getUint16(p+30,true),commentLen=view.getUint16(p+32,true),localOffset=view.getUint32(p+42,true);
    const name=decoder.decode(bytes.subarray(p+46,p+46+nameLen));files.set(name,{method,compressedSize,localOffset});p+=46+nameLen+extraLen+commentLen;
  }
  return async name=>{
    const entry=files.get(name);if(!entry)throw Error(`XLSX entry is missing: ${name}`);
    const q=entry.localOffset;if(view.getUint32(q,true)!==0x04034b50)throw Error(`XLSX local header is malformed: ${name}`);
    const start=q+30+view.getUint16(q+26,true)+view.getUint16(q+28,true),compressed=bytes.slice(start,start+entry.compressedSize);
    if(entry.method===0)return compressed.buffer;
    if(entry.method!==8)throw Error(`Unsupported XLSX compression method ${entry.method}.`);
    if(typeof DecompressionStream==='undefined')throw Error('This browser does not support local XLSX decompression.');
    try{return await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();}
    catch{throw Error('Could not decompress the XLSX workbook.');}
  };
}

export async function readUdiscXlsx(arrayBuffer){
  if(!(arrayBuffer instanceof ArrayBuffer)||arrayBuffer.byteLength<22)throw Error('XLSX file is empty or unreadable.');
  const read=await zipEntries(arrayBuffer),workbook=xml(await read('xl/workbook.xml'),'workbook.xml'),rels=xml(await read('xl/_rels/workbook.xml.rels'),'workbook relationships');
  const firstSheet=workbook.getElementsByTagNameNS('*','sheet')[0];if(!firstSheet)throw Error('Workbook has no worksheet.');
  const relId=firstSheet.getAttributeNS(REL_NS,'id')||firstSheet.getAttribute('r:id');
  const relation=Array.from(rels.getElementsByTagNameNS('*','Relationship')).find(r=>r.getAttribute('Id')===relId);
  if(!relation)throw Error('Workbook worksheet relationship is missing.');
  const sheetPath=normalizeZipPath(relation.getAttribute('Target').startsWith('/')?relation.getAttribute('Target'): `xl/${relation.getAttribute('Target')}`);
  const sheet=xml(await read(sheetPath),sheetPath);
  let shared=[];
  try{const strings=xml(await read('xl/sharedStrings.xml'),'sharedStrings.xml');shared=Array.from(strings.getElementsByTagNameNS('*','si')).map(si=>textOf(si,'t'));}catch(error){if(!/entry is missing/.test(error.message))throw error;}
  const rows=[];
  for(const rowNode of sheet.getElementsByTagNameNS('*','row')){
    const row=[];
    for(const cell of rowNode.getElementsByTagNameNS('*','c')){
      const index=columnIndex(cell.getAttribute('r'));while(row.length<=index)row.push('');
      const type=cell.getAttribute('t'),v=cell.getElementsByTagNameNS('*','v')[0];let value='';
      if(type==='inlineStr')value=textOf(cell,'t');
      else if(v){value=v.textContent||'';if(type==='s'){const at=Number(value);if(!Number.isInteger(at)||at<0||at>=shared.length)throw Error('XLSX shared-string reference is invalid.');value=shared[at];}else if(type==='b')value=value==='1';else if(type!=='str'&&value!==''){const n=Number(value);if(Number.isFinite(n))value=n;}}
      row[index]=value;
    }
    rows.push(row);
  }
  return{sheetName:firstSheet.getAttribute('name')||'',aoa:rows};
}

export function parseCsvText(source){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<source.length;i++){const ch=source[i];if(quoted){if(ch==='"'&&source[i+1]==='"'){field+='"';i++;}else if(ch==='"')quoted=false;else field+=ch;}else if(ch==='"'&&field==='')quoted=true;else if(ch===','){row.push(field);field='';}else if(ch==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=ch;}
  if(quoted)throw Error('CSV contains an unterminated quoted field.');if(field!==''||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}return rows;
}
