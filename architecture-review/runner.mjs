import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
const ledger=JSON.parse(readFileSync('../ne-fotograf-architecture-audit.json','utf8'));
const root='/tmp/nf-architecture-individual';
mkdirSync(root,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report=[];
try{
 for(let i=0;i<ledger.entries.length;i+=24){
  const page=await browser.newPage({viewport:{width:780,height:440},deviceScaleFactor:1,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  page.setDefaultTimeout(120000);
  try{
   await page.goto('http://localhost:8765/?test=1',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.NF_NEW!==undefined,null,{timeout:120000});
   if(!await page.evaluate(()=>NF_NEW.ready))throw Error('Audit scene failed to initialize');
   for(const entry of ledger.entries.slice(i,i+24)){
    const filename=String(entry.osmId)+'.jpg';
    try{
     const result=await page.evaluate(e=>NF_NEW.test.captureAuditFacade(e),entry);
     if(result.image){writeFileSync(path.join(root,filename),Buffer.from(result.image.split(',')[1],'base64'));delete result.image;result.file=filename;}
     report.push({...entry,...result,visualApproved:false});
    }catch(e){report.push({...entry,error:String(e),visualApproved:false})}
    console.log('Audit',report.length,'/',ledger.entries.length,entry.osmId,report.at(-1).status||report.at(-1).error);
    writeFileSync(path.join(root,'audit-results.json'),JSON.stringify(report,null,2));
   }
  }finally{await page.close()}
 }
}finally{await browser.close()}
if(report.length!==ledger.entries.length)throw Error('Incomplete review capture');
console.log('Captured',report.filter(x=>x.file).length,'/',report.length,'; visual approvals: 0. Individual reference comparison required.');
