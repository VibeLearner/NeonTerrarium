/* matreg.js, smaller (tools/mobile/build.js) */
const MATREG={list:[],at:new Map,open:true};for(const t of Object.keys(THREE)){if(!/Material$/.test(t)||t==="Material"||typeof THREE[t]!=="function")continue;THREE[t]=new Proxy(THREE[t],{construct(t,e,n){const o=Reflect.construct(t,e,n);if(MATREG.open){MATREG.at.set(o,MATREG.list.length);MATREG.list.push(o)}return o}})}
