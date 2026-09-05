export type Vehicle = {id:string; name:string; capacity:number; odometer:number; fuel:number};
export type Booking = {id:string; name:string; department:string; vehicle:string; driver:string; destination:string; start:string; end:string; people:number; status:'Pending'|'Approved'|'Rejected'; approvedAt?:string; note?:string};
export type Permission = 'Authorized'|'Needs review'|'Unauthorized'|'Exception accepted';
export type Trip = {id:string; booking:string; vehicle:string; name:string; driver:string; destination:string; start:string; end?:string; startOdo:number; endOdo?:number; people:number; fuel:number; permission:Permission; originalPermission:Permission; reason:string; reviewNote?:string};
export type FuelEntry = {id:string; vehicle:string; date:string; name:string; litres:number; amount:number; odometer:number; receipt:string};
export const snapshot='2026-09-05T11:30:00+05:30';
export const vehicles:Vehicle[]=[{id:'Car 01',name:'MPV',capacity:6,odometer:42180,fuel:50},{id:'Car 02',name:'Sedan',capacity:4,odometer:18620,fuel:75}];
export const initialBookings:Booking[]=[
{id:'BK-1042',name:'Neha Sharma',department:'Sales',vehicle:'Car 01',driver:'Ravi Kumar',destination:'Client office, Gurugram',start:'2026-09-05T09:00',end:'2026-09-05T12:30',people:3,status:'Approved',approvedAt:'2026-09-04T17:00'},
{id:'BK-1043',name:'Arjun Mehta',department:'Operations',vehicle:'Car 02',driver:'Suresh Yadav',destination:'Warehouse, Okhla',start:'2026-09-05T11:00',end:'2026-09-05T14:00',people:2,status:'Pending'},
{id:'BK-1044',name:'Priya Kapoor',department:'HR',vehicle:'Car 01',driver:'Ravi Kumar',destination:'Airport pickup',start:'2026-09-05T15:00',end:'2026-09-05T18:00',people:4,status:'Pending'},
{id:'BK-1040',name:'Amit Verma',department:'Finance',vehicle:'Car 01',driver:'Ravi Kumar',destination:'Bank, Connaught Place',start:'2026-09-04T09:00',end:'2026-09-04T11:00',people:2,status:'Approved',approvedAt:'2026-09-03T15:00'},
{id:'BK-1041',name:'Kavya Rao',department:'HR',vehicle:'Car 02',driver:'Suresh Yadav',destination:'Training centre, Saket',start:'2026-09-04T12:00',end:'2026-09-04T16:00',people:3,status:'Approved',approvedAt:'2026-09-03T16:00'}];
export const initialTrips:Trip[]=[
{id:'TR-209',booking:'BK-1042',vehicle:'Car 01',name:'Neha Sharma',driver:'Ravi Kumar',destination:'Client office, Gurugram',start:'2026-09-05T09:05',startOdo:42180,people:3,fuel:50,permission:'Authorized',originalPermission:'Authorized',reason:'Booking approved before departure; vehicle, driver and start time match.'},
{id:'TR-208',booking:'',vehicle:'Car 02',name:'Rohan Singh',driver:'Suresh Yadav',destination:'Local office errand',start:'2026-09-05T08:00',end:'2026-09-05T08:45',startOdo:18602,endOdo:18620,people:1,fuel:75,permission:'Needs review',originalPermission:'Needs review',reason:'No booking reference was provided for this checkout.'},
{id:'TR-207',booking:'BK-1041',vehicle:'Car 02',name:'Kavya Rao',driver:'Suresh Yadav',destination:'Training centre, Saket',start:'2026-09-04T12:05',end:'2026-09-04T15:30',startOdo:18560,endOdo:18602,people:3,fuel:75,permission:'Authorized',originalPermission:'Authorized',reason:'Approved booking matched before departure.'},
{id:'TR-206',booking:'BK-1040',vehicle:'Car 01',name:'Amit Verma',driver:'Ravi Kumar',destination:'Bank, Connaught Place',start:'2026-09-04T09:10',end:'2026-09-04T10:45',startOdo:42150,endOdo:42180,people:2,fuel:50,permission:'Authorized',originalPermission:'Authorized',reason:'Approved booking matched before departure.'}];
export const initialFuel:FuelEntry[]=[{id:'FL-031',vehicle:'Car 01',date:'2026-09-04',name:'Ravi Kumar',litres:24,amount:2280,odometer:42150,receipt:'Sample receipt F-381'}, {id:'FL-032',vehicle:'Car 02',date:'2026-09-04',name:'Suresh Yadav',litres:21.05,amount:2000,odometer:18560,receipt:'Sample receipt F-382'}];
export const instant=(value:string)=>Date.parse(value.length===16?value+':00+05:30':value);
export function overlap(a:Pick<Booking,'start'|'end'>,b:Pick<Booking,'start'|'end'>){return instant(a.start)<instant(b.end)&&instant(a.end)>instant(b.start)}
export function validateBooking(b:Booking,bookings:Booking[]){
const vehicle=vehicles.find(v=>v.id===b.vehicle);
if(!vehicle||!b.name.trim()||!b.driver.trim()||!b.destination.trim())throw Error('Enter the employee, driver, destination and vehicle.');
if(!Number.isFinite(instant(b.start))||!Number.isFinite(instant(b.end))||instant(b.end)<=instant(b.start))throw Error('Return time must be after departure time.');
if(!Number.isInteger(b.people)||b.people<1||b.people>vehicle.capacity)throw Error('Passenger count exceeds the vehicle capacity or is invalid.');
if(bookings.some(x=>x.id!==b.id&&x.vehicle===b.vehicle&&x.status==='Approved'&&overlap(x,b)))throw Error('This vehicle already has an approved booking during that time.');
}
export function classifyTrip(t:Pick<Trip,'booking'|'vehicle'|'driver'|'name'|'start'|'people'>,bookings:Booking[]):{permission:Permission;reason:string}{
const b=bookings.find(b=>b.id===t.booking);
if(!b)return {permission:'Needs review',reason:'No matching booking reference was found.'};
if(b.status!=='Approved'||!b.approvedAt||instant(b.approvedAt)>instant(t.start))return {permission:'Needs review',reason:'No approval evidence exists before the recorded departure.'};
if(b.vehicle!==t.vehicle||b.driver.trim().toLowerCase()!==t.driver.trim().toLowerCase()||b.name.trim().toLowerCase()!==t.name.trim().toLowerCase())return {permission:'Needs review',reason:'Vehicle, driver or employee differs from the approval.'};
const delta=(instant(t.start)-instant(b.start))/60000;
if(delta< -30||delta>60||instant(t.start)>=instant(b.end)||t.people>b.people)return {permission:'Needs review',reason:'Departure time or passenger count is outside the approved request.'};
return {permission:'Authorized',reason:'Booking approved before departure; vehicle, driver, employee and time match.'};
}
export function validateTrip(t:Trip,trips:Trip[]){
const v=vehicles.find(v=>v.id===t.vehicle);if(!v)throw Error('Select a vehicle.');
if(trips.some(x=>x.vehicle===t.vehicle&&!x.end))throw Error('This vehicle already has an open trip. Record its return first.');
if(!t.name.trim()||!t.driver.trim()||!t.destination.trim()||!Number.isFinite(instant(t.start)))throw Error('Complete the trip details.');
const last=Math.max(v.odometer,...trips.filter(x=>x.vehicle===t.vehicle).map(x=>x.endOdo??x.startOdo));
if(!Number.isFinite(t.startOdo)||t.startOdo<last)throw Error('Starting odometer cannot be lower than the latest register reading.');
if(!Number.isInteger(t.people)||t.people<1||t.people>v.capacity)throw Error('Enter a valid passenger count within the vehicle capacity.');
if(!Number.isFinite(t.fuel)||t.fuel<0||t.fuel>100)throw Error('Fuel level must be between 0 and 100%.');
if(trips.some(x=>x.vehicle===t.vehicle&&x.end&&instant(x.end)>instant(t.start)))throw Error('Departure must follow the vehicle’s last recorded return.');
}
export function validateReturn(t:Trip,end:string,odo:number,fuel:number){if(!Number.isFinite(instant(end))||instant(end)<=instant(t.start))throw Error('Return must be after departure.');if(!Number.isFinite(odo)||odo<t.startOdo)throw Error('Return odometer must be at least the starting reading.');if(!Number.isFinite(fuel)||fuel<0||fuel>100)throw Error('Fuel must be between 0 and 100%.');}
export function csv(rows:Record<string,unknown>[]){const keys=Object.keys(rows[0]??{});const cell=(v:unknown)=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};return [keys.map(cell).join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n');}
