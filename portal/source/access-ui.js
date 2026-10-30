// Display-only permissions. Every API operation is independently authorized on the server.
fetch('/api/5s/session').then(async response=>{
 if(!response.ok)return;const {user}=await response.json();
 const readOnly=user.role!=='administrator';
 document.body.dataset.role=user.role;
 const update=()=>{
  document.querySelectorAll('button[onclick^="newProject"],button[data-edit-project],button[data-edit-visit]').forEach(button=>button.hidden=user.role!=='administrator');
  document.querySelectorAll('button[onclick^="newVisit"]').forEach(button=>button.hidden=user.role==='management');
  if(!readOnly)return;
  document.querySelectorAll('button[data-edit-visit],#addBtn,#editSpacesBtn,#selectAllBtn,#deleteSelectedBtn,#importExcelBtn,#renameSpaceBtn,#reportDateBtn,#restoreBtn').forEach(button=>{button.disabled=true;button.style.setProperty('display','none','important')});
  document.querySelectorAll('#main input,#main textarea,#main button').forEach(control=>control.disabled=true);
  document.querySelectorAll('.drag-handle').forEach(control=>control.style.display='none');
  document.querySelectorAll('.status-btn,.drag-handle').forEach(control=>control.style.pointerEvents='none');
 };
 update();const main=document.getElementById('app')||document.getElementById('main');if(main)new MutationObserver(update).observe(main,{subtree:true,childList:true});
}).catch(()=>{});
