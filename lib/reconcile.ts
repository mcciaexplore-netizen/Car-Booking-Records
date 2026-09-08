export type Cell = string | number | null;
export type SourceRow = {id:string;source:string;sheet:string;row:number;[key:string]:unknown};
export type SampleInput = {importedOn:string;sources:{file:string;sha256:string;sheets:{name:string;nonEmptyRows:number}[]}[];excluded:Record<string,number>;actual:SourceRow[];zoho:SourceRow[];imageBookings:SourceRow[];consolidated:SourceRow[]};
export type Candidate = {id:string;basis:'Exact name'|'Similar name'|'Date and vehicle only';similarity:number};
export type TripReview = SourceRow & {dateISO:string|null;returnISO:string|null;distance:number|null;issues:string[];dateUncertain:boolean;consolidatedRefs:string[];candidates:Candidate[];outcome:string;sharedCandidate:boolean};
export type BookingReview = SourceRow & {dateISO:string|null;issues:string[];imageRefs:string[];tripRefs:string[]};
export const outcomes=['Exact candidate','Similar-name candidate','Date / vehicle candidate','Multiple candidates','No candidate','Insufficient date'] as const;
export const normalize=(value:unknown)=>String(value??'').normalize('NFKC').toLowerCase().replace(/\b(mr|mrs|ms|dr|sir|shri)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
export function parseDate(value:unknown):string|null{
 if(typeof value!=='string'||!value.trim())return null;
 let y:number,m:number,d:number;let match=value.match(/^(\d{4})-(\d{2})-(\d{2})/);
 if(match){[,y,m,d]=match.map(Number)}else if((match=value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/))){d=Number(match[1]);m=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[2].toLowerCase())+1;y=Number(match[3]);if(y<100)y+=2000;}else if((match=value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})(?:\s|$)/))){d=Number(match[1]);m=Number(match[2]);y=Number(match[3]);if(y<100)y+=2000;}else return null;
 const dt=new Date(Date.UTC(y,m-1,d));if(dt.getUTCFullYear()!==y||dt.getUTCMonth()+1!==m||dt.getUTCDate()!==d)return null;
 return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
export function nameSimilarity(a:unknown,b:unknown){const x=normalize(a),y=normalize(b);if(!x||!y)return 0;if(x===y)return 1;const row=Array.from({length:y.length+1},(_,i)=>i);for(let i=1;i<=x.length;i++){let prev=row[0];row[0]=i;for(let j=1;j<=y.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(x[i-1]===y[j-1]?0:1));prev=old}}const edit=1-row[y.length]/Math.max(x.length,y.length);const xt=x.split(' '),yt=y.split(' ');const subset=xt.every(t=>yt.includes(t))||yt.every(t=>xt.includes(t));return Math.max(edit,subset&&Math.min(x.length,y.length)>=5?0.84:0)}
const signature=(r:SourceRow)=>[normalize(r.vehicle),parseDate(r.date),normalize(r.employee),normalize(r.company)].join('|');
const actualSignature=(r:SourceRow)=>[normalize(r.vehicle),parseDate(r.date),r.reportedKm,normalize(r.employee),normalize(r.destination)].join('|');
function hasKey(r:SourceRow){return !!(parseDate(r.date)&&normalize(r.vehicle)&&normalize(r.employee)&&normalize(r.company))}
export function reconcile(input:SampleInput){
 const zoho:BookingReview[]=input.zoho.map(r=>({...r,dateISO:parseDate(r.date),issues:[...(!r.employee?['Employee missing']:[]),...(!parseDate(r.date)?['Travel date missing or invalid']:[]),...(!r.vehicle?['Vehicle missing']:[]),...(!r.driver?['Assigned driver missing']:[]),...(!r.status?['Status not supplied']:[]),...(!r.startTime?['Start time missing']:[]),...(r.vehicle==='TUV'?['Historical TUV record; outside the two-car fleet']:[])],imageRefs:input.imageBookings.filter(b=>hasKey(r)&&hasKey(b)&&signature(b)===signature(r)).map(b=>b.id),tripRefs:[]}));
 const actual:TripReview[]=input.actual.map(r=>{
 const dateISO=parseDate(r.date),returnISO=parseDate(r.returnDate);const issues:string[]=[];
 const sectionMonth=r.section==='june'?'06':r.section==='july'?'07':null;
 const sectionConflict=!!(sectionMonth&&dateISO&&dateISO.slice(5,7)!==sectionMonth);
 if(!dateISO)issues.push('Departure date missing or invalid');
 if(sectionConflict)issues.push(`Date conflicts with the ${r.section} section; possible day/month swap`);
 if(returnISO&&dateISO&&returnISO<dateISO)issues.push('Return date precedes departure');
 if(!r.employee)issues.push('Employee missing');if(!r.driver)issues.push('Driver missing');if(!r.destination)issues.push('Destination missing');
 const distance=typeof r.startKm==='number'&&typeof r.endKm==='number'&&r.startKm>=0&&r.endKm>=r.startKm?r.endKm-r.startKm:null;
 if(distance===null)issues.push('Valid odometer pair missing');
 else if(typeof r.reportedKm==='number'&&distance!==r.reportedKm)issues.push(`Reported ${r.reportedKm} km differs from odometer difference ${distance} km`);
 if(r.vehicleCell&&r.vehicleCell!==r.vehicle)issues.push('Vehicle column contains a helper value; sheet label used');
 const candidates:Candidate[]=!dateISO||sectionConflict?[]:zoho.filter(b=>b.dateISO===dateISO&&b.vehicle===r.vehicle).map(b=>{const similarity=nameSimilarity(r.employee,b.employee);return {id:b.id,similarity,basis:similarity===1?'Exact name' as const:similarity>=0.8?'Similar name' as const:'Date and vehicle only' as const}}).sort((a,b)=>b.similarity-a.similarity||a.id.localeCompare(b.id));
 const exact=candidates.filter(c=>c.basis==='Exact name'),similar=candidates.filter(c=>c.basis==='Similar name');
 const outcome=!dateISO||sectionConflict?'Insufficient date':exact.length>1?'Multiple candidates':exact.length===1?'Exact candidate':similar.length>1?'Multiple candidates':similar.length===1?'Similar-name candidate':candidates.length?'Date / vehicle candidate':'No candidate';
 const consolidatedRefs=input.consolidated.filter(c=>actualSignature(c)===actualSignature(r)).map(c=>`${c.sheet} row ${c.row}`);
 return {...r,dateISO,returnISO,distance,issues,dateUncertain:sectionConflict||!dateISO,consolidatedRefs,candidates,outcome,sharedCandidate:false};
 });
 for(const trip of actual){for(const c of trip.candidates.filter(c=>c.basis!=='Date and vehicle only'))zoho.find(b=>b.id===c.id)!.tripRefs.push(trip.id)}
 for(const trip of actual)trip.sharedCandidate=trip.candidates.some(c=>c.basis!=='Date and vehicle only'&&zoho.find(b=>b.id===c.id)!.tripRefs.length>1);
 const imageBookings:(SourceRow & {dateISO:string|null;zohoRefs:string[]})[]=input.imageBookings.map(r=>({...r,dateISO:parseDate(r.date),zohoRefs:zoho.filter(z=>hasKey(r)&&hasKey(z)&&signature(r)===signature(z)).map(z=>z.id)}));
 const missingConsolidated=input.consolidated.filter(c=>!actual.some(t=>t.consolidatedRefs.includes(`${c.sheet} row ${c.row}`)));
 return {actual,zoho,imageBookings,missingConsolidated};
}
export function summarize(actual:TripReview[]){return {rows:actual.length,distance:actual.reduce((n,t)=>n+(t.distance??0),0),distanceRows:actual.filter(t=>t.distance!==null).length,reportedDistance:actual.reduce((n,t)=>n+(typeof t.reportedKm==='number'?t.reportedKm:0),0),outcomes:Object.fromEntries(outcomes.map(o=>[o,actual.filter(t=>t.outcome===o).length])),missingDriver:actual.filter(t=>!t.driver).length,missingEmployee:actual.filter(t=>!t.employee).length,dateReview:actual.filter(t=>t.dateUncertain).length,odoDiscrepancies:actual.filter(t=>t.distance!==null&&typeof t.reportedKm==='number'&&t.distance!==t.reportedKm).length}}
