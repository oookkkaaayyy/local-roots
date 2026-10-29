import {parseUdiscGlowEvents} from './udisc-glow-events.mjs';
import {buildGlowProposal, buildReviewedCrosswalk, validateIdentityEvidence} from '../worker-private/udisc-glow-reconcile.mjs';
import {prepareGlowWeekSync} from './udisc-glow-sync.mjs';

const attr = (node,key) => node?.attrs?.[key];
const colIndex = cellRef => {
  const letters = String(cellRef || '').match(/^[A-Z]+/i)?.[0];
  if (!letters) throw Error('UDisc workbook contains a malformed cell reference.');
  let n=0; for (const letter of letters.toUpperCase()) n=n*26+letter.charCodeAt(0)-64;
  return n-1;
};
const clean = value => String(value ?? '').trim();
const xmlText = value => String(value ?? '').replace(/&#x([0-9a-f]+);/gi,(_,hex)=>String.fromCodePoint(parseInt(hex,16)))
  .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&lt;/g,'<').replace(/&gt;/g,'>')
  .replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');

function boundedZipReader(buffer) {
  const bytes=new Uint8Array(buffer), view=new DataView(buffer);
  let eocd=-1;
  for(let p=Math.max(0,bytes.length-65557);p<=bytes.length-22;p++) if(view.getUint32(p,true)===0x06054b50)eocd=p;
  if(eocd<0)throw Error('UDisc export is not a valid XLSX archive.');
  const count=view.getUint16(eocd+10,true),directory=view.getUint32(eocd+16,true);
  if(count>256||directory===0xffffffff)throw Error('UDisc workbook archive structure is unsupported.');
  let offset=directory,total=0;
  const entries=new Map();
  for(let i=0;i<count;i++){
    if(offset+46>bytes.length||view.getUint32(offset,true)!==0x02014b50)throw Error('UDisc workbook archive directory is malformed.');
    const compressed=view.getUint32(offset+20,true),uncompressed=view.getUint32(offset+24,true);
    const nameLength=view.getUint16(offset+28,true),extraLength=view.getUint16(offset+30,true),commentLength=view.getUint16(offset+32,true);
    const method=view.getUint16(offset+10,true),flags=view.getUint16(offset+8,true);
    if(flags&1||compressed===0xffffffff||uncompressed===0xffffffff||uncompressed>12*1024*1024)throw Error('UDisc workbook contains an unsupported or oversized entry.');
    total+=uncompressed;
    if(total>24*1024*1024)throw Error('UDisc workbook expands beyond the safe size limit.');
    const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(offset+46,offset+46+nameLength));
    if(!name||name.startsWith('/')||name.split('/').includes('..')||entries.has(name))throw Error('UDisc workbook contains an invalid archive path.');
    if(method!==0&&method!==8)throw Error('UDisc workbook uses an unsupported compression method.');
    entries.set(name,{method,compressed,uncompressed,localOffset:view.getUint32(offset+42,true)});
    offset+=46+nameLength+extraLength+commentLength;
  }
  if(offset>directory+view.getUint32(eocd+12,true))throw Error('UDisc workbook archive directory is malformed.');
  return async name=>{
    const entry=entries.get(name);if(!entry)throw Error(`UDisc workbook is missing ${name}.`);
    const start=entry.localOffset;
    if(start+30>bytes.length||view.getUint32(start,true)!==0x04034b50)throw Error('UDisc workbook local entry is malformed.');
    const dataStart=start+30+view.getUint16(start+26,true)+view.getUint16(start+28,true);
    const end=dataStart+entry.compressed;
    if(end>bytes.length)throw Error('UDisc workbook entry exceeds its archive.');
    const compressed=bytes.slice(dataStart,end);
    if(entry.method===0){if(compressed.byteLength!==entry.uncompressed)throw Error('UDisc workbook entry size is invalid.');return compressed;}
    if(typeof DecompressionStream==='undefined')throw Error('This runtime cannot decompress UDisc score files.');
    let result;
    try{result=new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());}
    catch{throw Error('UDisc workbook could not be decompressed.');}
    if(result.byteLength!==entry.uncompressed)throw Error('UDisc workbook expanded entry size is invalid.');
    return result;
  };
}

function decodeXmlText(value){
  return String(value).replace(/&([^;\s]+);/g,(_,entity)=>{
    if(entity==='amp')return '&';if(entity==='lt')return '<';if(entity==='gt')return '>';
    if(entity==='quot')return '"';if(entity==='apos')return "'";
    if(!entity.startsWith('#'))throw Error('UDisc workbook contains an unsupported XML entity.');
    const point=entity[1]?.toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));
    if(!Number.isInteger(point)||point<0||point>0x10ffff||point>=0xd800&&point<=0xdfff)throw Error('UDisc workbook contains an invalid XML character reference.');
    return String.fromCodePoint(point);
  });
}

function parseXml(source,label){
  if(source.length>12*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(source))throw Error(`UDisc workbook ${label} uses unsupported XML features.`);
  const root={name:'#document',attrs:{},children:[],text:''},stack=[root];let nodes=0;
  const tokens=source.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>|[^<]+/g)||[];
  for(const token of tokens){
    if(token.startsWith('<!--')||token.startsWith('<?'))continue;
    if(token.startsWith('<![CDATA[')){stack.at(-1).text+=token.slice(9,-3);continue;}
    if(token.startsWith('<!'))throw Error(`UDisc workbook ${label} contains unsupported XML markup.`);
    if(token.startsWith('</')){
      const name=token.slice(2,-1).trim();if(stack.length<2||stack.at(-1).qualifiedName!==name)throw Error(`UDisc workbook ${label} is malformed.`);
      stack.pop();continue;
    }
    if(token.startsWith('<')){
      const match=token.match(/^<([^\s/>]+)([\s\S]*?)\s*(\/?)>$/);if(!match)throw Error(`UDisc workbook ${label} is malformed.`);
      const [,qualifiedName,rawAttrs,selfClose]=match,attrs={};
      const attrText=rawAttrs.trim();let cursor=0;
      while(cursor<attrText.length){
        while(/\s/.test(attrText[cursor]||''))cursor++;
        if(cursor>=attrText.length)break;
        const parsed=attrText.slice(cursor).match(/^([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/);
        if(!parsed)throw Error(`UDisc workbook ${label} has malformed attributes.`);
        attrs[parsed[1]]=decodeXmlText(parsed[3]??parsed[4]??'');cursor+=parsed[0].length;
      }
      const node={name:qualifiedName.split(':').at(-1),qualifiedName,attrs,children:[],text:''};
      stack.at(-1).children.push(node);if(++nodes>500000||stack.length>64)throw Error(`UDisc workbook ${label} exceeds the XML complexity limit.`);
      if(!selfClose)stack.push(node);continue;
    }
    stack.at(-1).text+=decodeXmlText(token);
  }
  if(stack.length!==1||root.children.length!==1)throw Error(`UDisc workbook ${label} is malformed.`);
  return root.children[0];
}
const children=(node,name)=>node?.children?.filter(item=>item.name===name)||[];
const content=node=>node?.text+(node?.children||[]).map(content).join('');

export async function parseUdiscWorkbook(buffer, {eventId, weekDate, observedAt}) {
  const read=boundedZipReader(buffer);
  const xml=async path=>parseXml(new TextDecoder('utf-8',{fatal:true}).decode(await read(path)),path);
  const workbook=await xml('xl/workbook.xml');
  const relDoc=await xml('xl/_rels/workbook.xml.rels');
  const sheet=children(children(workbook,'sheets')[0],'sheet')[0];
  const relId=attr(sheet,'r:id');
  if (!relId) throw Error('UDisc workbook has no result sheet.');
  const relationships=children(relDoc,'Relationship');
  const relationship=relationships.find(item=>attr(item,'Id')===relId);
  const target = attr(relationship,'Target');
  if (!target) throw Error('UDisc result sheet link is missing.');
  const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//,'')}`;
  const sheetDoc=await xml(sheetPath);
  let shared=[];
  try{const sharedDoc=await xml('xl/sharedStrings.xml');shared=children(sharedDoc,'si').map(item=>children(item,'t').length?children(item,'t').map(content).join(''):children(item,'r').flatMap(run=>children(run,'t').map(content)).join(''));}
  catch(error){if(!/missing xl\/sharedStrings\.xml/.test(error.message))throw error;}
  const sheetData=children(sheetDoc,'sheetData')[0];
  const rows=children(sheetData,'row').map(rowNode=>{
    const cells=children(rowNode,'c'),row=[];
    for (const cell of cells) {
      const index=colIndex(attr(cell,'r'));
      while (row.length<=index) row.push('');
      const type=attr(cell,'t'), value=content(children(cell,'v')[0])||content(children(cell,'is')[0])||'';
      if (type==='s') {
        const at=Number(value); if (!Number.isInteger(at)||at<0||at>=shared.length) throw Error('UDisc workbook contains an invalid text reference.');
        row[index]=shared[at];
      } else if (type==='inlineStr') row[index]=clean(value);
      else {
        const number=Number(value);
        row[index]=value===''?'':Number.isFinite(number)?number:clean(value);
      }
    }
    return row;
  });
  if (!rows.length) throw Error('UDisc workbook has no results.');
  const snapshot=sourceParser().parseUdiscAoA(rows,{eventId,observedAtLocal:observedAt});
  return Object.freeze({...snapshot,weekDate,sourceUpdatedAt:null});
}

function sourceParser() {
  // Kept as a dynamic boundary so the same parser used by local review remains
  // the only authority for UDisc rank and score semantics.
  return parserModule;
}

import * as parserModule from '../worker-private/udisc-glow-preview.mjs';

export function exactAliasDecisions(model, evidence) {
  const rows=buildReviewedCrosswalk(model,evidence);
  const decisions={};
  for (const row of rows) {
    const exact=[...new Set(row.aliasCandidates)];
    if (row.status!=='conflict' && exact.length===1) decisions[row.key]={canonicalName:exact[0]};
  }
  return decisions;
}

export {parseUdiscGlowEvents,buildGlowProposal,validateIdentityEvidence,prepareGlowWeekSync};
