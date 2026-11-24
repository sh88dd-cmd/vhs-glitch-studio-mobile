/* Optional anonymous PWA usage analytics for PHOTO VHS and VHS Video Lab.
 * Disabled by default until a GoatCounter account is created and the private
 * dashboard access controls have been explicitly verified.
 * Never accesses media, file names, photos, videos, or user-entered content.
 */
(function(root){
 'use strict';
 const GOATCOUNTER_CODE = ''; // Public site code (NOT a secret or API token).
 const EXCLUDE_KEY = 'vhs.analytics.exclude-owner.v1';
 const isVideo=/\/video\/?$/.test(location.pathname)||/\/video\/index\.html$/.test(location.pathname);
 const app=isVideo?'video':'photo';
 const appName=isVideo?'VHS Video Lab':'PHOTO VHS';
 const events=isVideo?{
  videoLiveOpenTop:'camera_open',videoLiveOpenPanel:'camera_open',
  videoLiveRecord:'record_button',export:'export_button',
  frameSavePng:'frame_export_button'
 }:{
  liveCameraOpenTop:'camera_open',liveCameraOpenPanel:'camera_open',
  liveCameraShot:'shutter_button',liveCameraSave:'camera_save_button',
  saveOne:'export_button',exportBatch:'x50_export_button',
  saveDialog:'x50_single_save_button'
 };
 // An optional one-time per-device/per-PWA exclusion link for the owner.
 // It is a counting preference, NOT a dashboard authentication mechanism.
 try{
  if(location.hash==='#stats-owner-off'){
   localStorage.setItem(EXCLUDE_KEY,'1');
   history.replaceState(history.state,'',location.pathname+location.search);
  }else if(location.hash==='#stats-owner-on'){
   localStorage.removeItem(EXCLUDE_KEY);
   history.replaceState(history.state,'',location.pathname+location.search);
  }
 }catch(_){}
 let excluded=false;
 try{excluded=localStorage.getItem(EXCLUDE_KEY)==='1';}catch(_){}
 if(navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true)excluded=true;
 let ready=false;
 const queue=[];
 function send(action){
  if(!ready||!root.goatcounter||typeof root.goatcounter.count!=='function')return;
  root.goatcounter.count({
   path:'/event/'+app+'/'+action,
   title:appName+' — '+action,
   event:true,
   no_session:true,
   referrer:''
  });
 }
 function event(action){
  if(excluded||!GOATCOUNTER_CODE||!/^[-a-z0-9_]{2,40}$/.test(action))return;
  if(!ready){if(queue.length<40)queue.push(action);return;}
  send(action);
 }
 root.VHSUsageStats=Object.freeze({event,excluded:()=>excluded,enabled:()=>!!GOATCOUNTER_CODE&&!excluded});
 // Avoid a broken or arbitrary domain if the account code is not configured.
 if(excluded||!/^[-a-z0-9]{3,64}$/.test(GOATCOUNTER_CODE))return;
 root.goatcounter={no_onload:true,no_events:true};
 const script=document.createElement('script');
 script.async=true;
 script.src='https://gc.zgo.at/count.js';
 script.setAttribute('data-goatcounter','https://'+GOATCOUNTER_CODE+'.goatcounter.com/count');
 script.addEventListener('load',()=>{
  if(typeof root.goatcounter?.count!=='function')return;
  ready=true;
  // Separate APP visits without recording query strings, file names, or media.
  root.goatcounter.count({path:'/'+app,title:appName,referrer:''});
  queue.splice(0).forEach(send);
 });
 script.addEventListener('error',()=>{queue.length=0;});
 document.head.appendChild(script);
 document.addEventListener('click',eventObject=>{
  const node=eventObject.target?.closest?.('button[id]');
  if(!node||node.disabled)return;
  const action=events[node.id];
  if(action)event(action);
 },{passive:true});
})(window);
