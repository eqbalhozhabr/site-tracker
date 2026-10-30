// Display-only permissions. Every API operation is independently authorized on the server.
fetch('/api/5s/session').then(async response=>{
 if(!response.ok)return;const {user}=await response.json();
 const readOnly=['management','site_supervisor'].includes(user.role);
 const update=()=>{
  document.querySelectorAll('button[onclick^="newProject"]').forEach(button=>button.hidden=user.role!=='administrator');
  if(!readOnly)return;
  document.querySelectorAll('button[onclick^="newVisit"],button[data-edit-visit],#addBtn,#editSpacesBtn,#selectAllBtn,#deleteSelectedBtn,#importExcelBtn,#renameSpaceBtn,#reportDateBtn,#restoreBtn,#reportBtn,#statusReportBtn,#timelineBtn').forEach(button=>{button.disabled=true;button.style.setProperty('display','none','important')});
  document.querySelectorAll('#main input,#main textarea,#main button').forEach(control=>control.disabled=true);
  document.querySelectorAll('.status-btn,.drag-handle').forEach(control=>control.style.pointerEvents='none');
 };
 update();const main=document.getElementById('app')||document.getElementById('main');if(main)new MutationObserver(update).observe(main,{subtree:true,childList:true});
}).catch(()=>{});
