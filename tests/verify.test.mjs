// Test reguł weryfikacji: node tests/verify.test.mjs
import { normalize, bestStreetMatch, hasNumber, evaluate, haversine } from '../assets/js/verify.js';
const ok=(c,m)=>console.log(c?'OK  ':'FAIL',m);
ok(normalize('ul. Poznańska 20')==='poznanska 20','normalize');
ok(normalize('Aleja Łódzka')==='lodzka','ł + prefix');
ok(bestStreetMatch('UL. POZNANSKA 20\n62-800 KALISZ','Poznańska')===100,'street exact');
ok(bestStreetMatch('P0ZNANSKA 20','Poznańska')>=88,'street fuzzy '+bestStreetMatch('P0ZNANSKA 20','Poznańska'));
ok(bestStreetMatch('ul. Tadeusza Kościuszki 5','Kościuszki')===100,'street in longer name');
ok(hasNumber('POZNANSKA 20','20') && !hasNumber('POZNANSKA 200','20'),'number exact');
ok(hasNumber('Złota 20 A','20a'),'20 A → 20a');
ok(haversine(51.76,18.09,51.761,18.09)===111,'haversine '+haversine(51.76,18.09,51.761,18.09));
const p={street:'Poznańska',building:'20',unit:'16',lat:51.76,lng:18.09};
const now=Date.now();
const ph=[{type:'building',ocrText:'POZNAŃSKA 20',hash:'ffff000000000000',takenAt:now-60000,fileAge:0},{type:'unit',ocrText:'16',hash:'0000ffff00000000',takenAt:now,fileAge:0}];
let r=evaluate(p,{due:null},{gps:{lat:51.7601,lng:18.09,acc:10}},ph,[]); ok(r.status==='AUTO_VERIFIED','auto '+JSON.stringify(r.reasons));
r=evaluate(p,{due:null},{gps:{lat:51.762,lng:18.09,acc:10}},ph,[]); ok(r.reasons[0]?.code==='r_gps_far','gps far '+JSON.stringify(r.reasons));
r=evaluate(p,{due:null},{gps:{lat:51.7601,lng:18.09,acc:10}},ph,['ffff000000000001']); ok(r.reasons.some(x=>x.code==='r_duplicate'),'dup');
r=evaluate(p,{due:'2020-01-01'},{gps:{lat:51.7601,lng:18.09,acc:10}},ph,[]); ok(r.reasons.some(x=>x.code==='r_late'),'late');
r=evaluate(p,{due:null},{gps:null},[{...ph[0],fileAge:3600e3},{...ph[1],ocrText:'18'}],[]); ok(['r_unit_mismatch','r_no_gps','r_not_camera'].every(c=>r.reasons.some(x=>x.code===c)),'mismatch/nogps/camera');
