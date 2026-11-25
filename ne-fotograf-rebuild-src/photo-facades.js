import * as T from 'three';
export async function loadPhotoFacades(base,loader){
 const response=await fetch(base+'facades/manifest.json');if(!response.ok)throw Error('Missing facade photo manifest');
 const manifest=await response.json(),result=new Map();
 await Promise.all(manifest.map(async p=>{
   const t=await loader.loadAsync(base+'facades/'+p.file);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;
   t.wrapS=T.ClampToEdgeWrapping;t.wrapT=T.ClampToEdgeWrapping;
   const material=new T.MeshStandardMaterial({map:t,roughness:.92,metalness:0,color:0xe7e7e7});
   result.set(p.id,{...p,material});
 }));
 return result;
}
