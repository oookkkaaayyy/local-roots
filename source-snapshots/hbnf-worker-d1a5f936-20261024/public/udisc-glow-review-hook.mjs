/** Return a local Glow HTML copy with a read-only proposal-review entry point. */
export function addUdiscGlowReviewHook(html) {
  if (typeof html !== 'string' || !html.includes('id="quickUdiscFileInput"')) {
    throw new Error('The selected Glow source does not contain the known UDisc upload control.');
  }
  if (html.includes('data-udisc-proposal-review="1"')) {
    throw new Error('The Glow source already contains the proposal-review entry point.');
  }
  const previewButton = '<button id="quickImportPreviewBtn" class="btn" type="button">Preview Import</button>';
  if (html.split(previewButton).length !== 2 || !html.includes('id="quickImportConfirmBtn"')) {
    throw new Error('The current Glow import controls differ from the reviewed integration anchor.');
  }
  const button = `${previewButton}<button id="udiscProposalReviewBtn" class="btn" type="button" data-udisc-proposal-review="1">Review Proposal (No Score Changes)</button>`;
  const script = `<script>(function(){const key='hbnfUdiscProposalHandoff';let pendingObjectUrl='';const button=document.getElementById('udiscProposalReviewBtn');if(!button)return;button.addEventListener('click',function(){const input=document.getElementById('quickUdiscFileInput'),status=document.getElementById('quickImportStatus'),file=input&&input.files&&input.files[0];if(!file){if(status)status.textContent='Choose a UDisc export first. This review will not change scores.';return}pendingObjectUrl=URL.createObjectURL(file);sessionStorage.setItem(key,JSON.stringify({objectUrl:pendingObjectUrl,name:file.name,type:file.type}));const child=window.open('/udisc-glow-reconcile.html?from=glow','_blank');if(!child){sessionStorage.removeItem(key);URL.revokeObjectURL(pendingObjectUrl);pendingObjectUrl='';if(status)status.textContent='The review page was blocked. Allow this site to open the local review page, then try again.';return}if(status)status.textContent='Opening a read-only proposal from this file. No scores or tags have been changed.'});window.addEventListener('message',function(event){if(event.origin!==location.origin||event.data?.type!=='hbnf-udisc-review-file-loaded'||event.data?.key!==key)return;sessionStorage.removeItem(key);if(pendingObjectUrl)URL.revokeObjectURL(pendingObjectUrl);pendingObjectUrl=''})})();</script>`;
  let result = html.replace(previewButton, button);
  const bodyEnd = result.lastIndexOf('</body>');
  if (bodyEnd < 0) throw new Error('The current Glow document has no closing body tag.');
  result = `${result.slice(0, bodyEnd)}${script}${result.slice(bodyEnd)}`;
  return result;
}
